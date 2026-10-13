// Apply a pinned migration ONLY to a completed, private loopback restore.
// No production configuration or production password is loaded by this tool.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fingerprint} from './studio-fingerprint.mjs';

const root=resolve(process.argv[2]||'INVALID'),migration=resolve(process.argv[3]||'INVALID'),expectedHash=process.argv[4];
const privateRoot=resolve('.local/studio-v1-backup-20260916'),data=join(root,'db','cluster');
const bin=resolve('.local/pg17-ad1839ec7ba749b4b13fbecf799f1e55/tools-native/pgsql/bin');
const password=process.env.STUDIO_RESTORE_PASSWORD,hash=v=>createHash('sha256').update(v).digest('hex');
const need=(v,code)=>{if(!v)throw Error(code);},q=v=>"'"+String(v).replaceAll("'","''")+"'";
const resultFile=join(root,'worker-migration-result.json');
need(dirname(root)===privateRoot&&root===realpathSync(root),'PRIVATE_RESTORE_PATH_REQUIRED');
need(dirname(migration)===resolve('supabase/migrations')&&migration===realpathSync(migration),'MIGRATION_PATH_REQUIRED');
need(!existsSync(resultFile)&&!existsSync(join(data,'postmaster.pid')),'RESTORE_ALREADY_USED_OR_RUNNING');
const backup=JSON.parse(readFileSync(join(root,'backup-result.json'),'utf8'));
need(backup.result==='PASS'&&backup.restoreComplete&&backup.localServerStopped,'VERIFIED_RESTORE_REQUIRED');
need(password?.length>=32&&/^[a-f0-9]{64}$/.test(expectedHash),'PRIVATE_INPUTS_REQUIRED');
const sql=readFileSync(migration,'utf8').replaceAll('\r\n','\n');
need(hash(sql)===expectedHash,'MIGRATION_CHANGED');
const port=backup.localPort;
need(Number.isInteger(port)&&port>=55442&&port<55452,'LOCAL_PORT_REJECTED');
const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,
 PGHOST:'127.0.0.1',PGPORT:String(port),PGDATABASE:'studio_restore',PGUSER:'restore_admin',PGPASSWORD:password,
 PGCONNECT_TIMEOUT:'5',PGSSLMODE:'disable',PGCLIENTENCODING:'UTF8',PGTZ:'UTC',PGOPTIONS:'-c statement_timeout=30000 -c lock_timeout=5000'};
const deadline=Date.now()+180000,report={startedAt:new Date().toISOString(),migration:process.argv[3],migrationSha256:expectedHash,remoteConnections:0,checks:[]};
let started=false,stage='start_local',session;
function native(name,args,{input,timeout=30000,cleanup=false,allowFailure=false}={}){
 return new Promise((ok,fail)=>{
  const duration=cleanup?timeout:Math.min(timeout,deadline-Date.now());if(duration<=0)return fail(Error('TOTAL_TIME_LIMIT'));
  const p=spawn(join(bin,name+'.exe'),args,{env,windowsHide:true});let out='',err='',failed=false;
  const timer=setTimeout(()=>{failed=true;p.kill();},duration);
  p.stdout.on('data',chunk=>{out+=chunk;if(out.length>2000000){failed=true;p.kill();}});
  p.stderr.on('data',chunk=>{err+=chunk;if(err.length>1000000){failed=true;p.kill();}});
  p.once('error',()=>{clearTimeout(timer);fail(Error('NATIVE_START_FAILED'));});
  p.once(name==='pg_ctl'?'exit':'close',code=>{clearTimeout(timer);if(failed)return fail(Error('NATIVE_LIMIT'));
   if(code!==0&&!allowFailure){writeFileSync(join(root,'logs','worker-'+stage+'-error.txt'),err.replaceAll(password,'[secret]'),{flag:'wx'});return fail(Error('NATIVE_'+name.toUpperCase()+'_FAILED'));}ok({out,err,code});});
  p.stdin.on('error',()=>{});p.stdin.end(input);
 });
}
class Session{
 constructor(){
  this.buffer='';this.pending=null;this.closed=false;
  this.p=spawn(join(bin,'psql.exe'),['-X','-qAt','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{env,windowsHide:true});
  this.p.stdout.on('data',chunk=>{this.buffer+=chunk;if(this.buffer.length>2000000){this.p.kill();return;}
   if(!this.pending)return;const at=this.buffer.indexOf(this.pending.marker),end=this.buffer.indexOf('\n',at);
   if(at<0||end<0)return;const current=this.pending;this.pending=null;clearTimeout(current.timer);const value=this.buffer.slice(0,at).trim();this.buffer=this.buffer.slice(end+1);current.ok(value);});
  this.p.stderr.on('data',()=>{});this.p.stdin.on('error',()=>{});
  const died=()=>{this.closed=true;if(this.pending){clearTimeout(this.pending.timer);this.pending.fail(Error('LOCAL_SQL_FAILED'));this.pending=null;}};
  this.p.once('error',died);this.p.once('exit',died);
 }
 sql(text){need(!this.closed&&!this.pending,'SESSION_UNAVAILABLE');return new Promise((ok,fail)=>{
  const duration=Math.min(30000,deadline-Date.now());if(duration<=0)return fail(Error('TOTAL_TIME_LIMIT'));
  const marker='DONE_'+randomUUID().replaceAll('-',''),timer=setTimeout(()=>{this.p.kill();fail(Error('SQL_TIME_LIMIT'));},duration);
  this.pending={ok,fail,marker,timer};this.p.stdin.write(text+'\n\\echo '+marker+'\n');
 });}
 async json(text){return JSON.parse(await this.sql(text));}
 close(){if(!this.closed){this.closed=true;this.p.stdin.end('\\q\n');}}
}
const newTables=['dispatch_intents','budget_policy','budget_jobs','budget_calls','worker_runs','worker_evidence','worker_oidc_receipts','input_reviews','result_feedback','content_heads'];
const functionSnapshot="select coalesce(json_agg(json_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) order by p.proname,pg_get_function_identity_arguments(p.oid)),'[]')::text from pg_proc p where p.pronamespace='studio'::regnamespace";
const check=(value,name)=>{need(value,name);report.checks.push(name);};
try{
 await native('pg_ctl',['-D',data,'-l',join(root,'logs','postgres-worker.log'),'-w','-t','20','start']);started=true;
 session=new Session();
 const identity=await session.json("select json_build_object('host',host(inet_server_addr()),'port',inet_server_port(),'database',current_database(),'user',current_user,'data',current_setting('data_directory'))::text;");
 check(identity.host==='127.0.0.1'&&identity.port===port&&identity.database==='studio_restore'&&identity.user==='restore_admin'&&resolve(identity.data)===data,'LOCAL_TARGET_CONFIRMED');
 const before=await fingerprint(session),source=JSON.parse(readFileSync(join(root,'source-fingerprint.json'),'utf8'));
 check(before.dataHash===source.dataHash&&before.metadataHash===source.metadataHash,'RESTORE_BASELINE_UNCHANGED');
 const originalFunctions=await session.json(functionSnapshot+';');
 stage='apply_pinned_migration';
 await native('psql',['-X','-qAt','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{input:'set role postgres;\n'+sql,timeout:60000});
 check(true,'ATOMIC_MIGRATION_APPLIED_LOCALLY');
 stage='verify_migration';
 const after=await fingerprint(session);check(before.dataHash===after.dataHash,'ALL_EXISTING_ROWS_PRESERVED');
 const allFunctions=await session.json(functionSnapshot+';');
 check(originalFunctions.every(old=>allFunctions.some(current=>JSON.stringify(old)===JSON.stringify(current))),'EXISTING_FUNCTIONS_UNCHANGED');
 const security=await session.json(`select json_build_object('tables',(select json_agg(json_build_object('name',c.relname,'rls',c.relrowsecurity,'anon',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE'),'authenticated',has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')) order by c.relname) from pg_class c where c.relnamespace='studio'::regnamespace and c.relkind='r' and c.relname in (${newTables.map(q).join(',')})),'bad_functions',(select count(*) from pg_proc p where p.pronamespace='studio'::regnamespace and (p.prosecdef or not coalesce('search_path=""'=any(p.proconfig),false) or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))))::text;`);
 check(security.tables?.length===10&&security.tables.every(t=>t.rls&&!t.anon&&!t.authenticated),'NEW_TABLE_RLS_AND_GRANTS');
 check(Number(security.bad_functions)===0,'INVOKER_ONLY_RESTRICTED_FUNCTIONS');
 const gates=await session.json("select json_build_object('worker',studio.worker_execution_enabled(),'dispatch',studio.dispatch_execution_enabled(),'budget',(select enabled from studio.budget_policy where singleton),'delete',studio.conversation_delete_enabled_v2(),'capability',studio.studio_capabilities_v2(),'input',studio.input_review_version(),'result',studio.result_review_version(),'revision',studio.revision_version())::text;");
 check(gates.worker===false&&gates.dispatch===false&&gates.budget===false&&gates.delete===false&&gates.capability===2&&gates.input===1&&gates.result===1&&gates.revision===1,'ALL_PAID_AND_DELETE_GATES_CLOSED');
 const newCounts=await session.json('select json_build_object('+newTables.map(t=>q(t)+',(select count(*) from studio.'+t+')').join(',')+')::text;');
 check(newTables.every(t=>Number(newCounts[t])===(t==='budget_policy'?1:0)),'NO_JOB_OR_CONTENT_BACKFILL');
 stage='compatibility';
 await session.sql("begin;set local role service_role;select studio.new_conversation_v2((select owner_id from studio.teachers where active order by owner_id limit 1),'Local worker migration compatibility',gen_random_uuid());rollback;");
 check(true,'LEGACY_CONVERSATION_RPC_WORKS');
 const denied=await native('psql',['-X','-qAt','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{input:"begin;set local role service_role;select studio.reserve_job_budget((select owner_id from studio.teachers limit 1),gen_random_uuid());rollback;",allowFailure:true});
 check(denied.code!==0&&/PT412/.test(denied.err),'PAID_JOB_REJECTED_WHEN_DISABLED');
 const replay=await native('psql',['-X','-qAt','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{input:'set role postgres;\n'+sql,allowFailure:true});
 check(replay.code!==0&&/42P07/.test(replay.err),'DUPLICATE_MIGRATION_REJECTED');
 const final=await fingerprint(session);check(final.dataHash===before.dataHash&&final.metadataHash===after.metadataHash,'CHECKS_AND_REPLAY_PRESERVE_DATABASE');
 report.baselineDataHash=before.dataHash;report.afterMetadataHash=after.metadataHash;report.gates=gates;report.result='PASS';
}catch(error){report.result='FAIL';report.stage=stage;report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'LOCAL_REHEARSAL_FAILED';process.exitCode=1;}
finally{
 session?.close();
 if(started||existsSync(join(data,'postmaster.pid')))try{await native('pg_ctl',['-D',data,'-m','fast','-w','-t','20','stop'],{cleanup:true});report.localServerStopped=true;}catch{report.localServerStopped=false;report.result='FAIL';process.exitCode=1;}
 report.finishedAt=new Date().toISOString();writeFileSync(resultFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));
}
