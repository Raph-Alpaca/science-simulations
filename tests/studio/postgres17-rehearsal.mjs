// Native PostgreSQL 17 rehearsal. No dotenv, production network, or runner SQL.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import net from 'node:net';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'INVALID');
assert.ok(root.startsWith(resolve('.local')+'\\'));
const toolsRoot=resolve(process.argv[3]||root);
assert.ok(toolsRoot.startsWith(resolve('.local')+'\\'));
const bin=join(toolsRoot,'tools-native','pgsql','bin'), data=join(root,'db','cluster');
const password=process.env.PG_REHEARSAL_PASSWORD;
assert.ok(password?.length>=32,'Missing isolated test password');
const env={...process.env,PGPASSWORD:password,PGCONNECT_TIMEOUT:'5',PGSSLMODE:'disable',PGCLIENTENCODING:'UTF8'};
delete env.PGSERVICE;delete env.PGSERVICEFILE;delete env.PGOPTIONS;delete env.PG_REHEARSAL_PASSWORD;
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const hash=b=>createHash('sha256').update(b).digest('hex');
const sqlFiles=['supabase/proposals/studio_v1.sql','supabase/proposals/studio_v2.sql'];
const versions=sqlFiles.map(path=>({path,sha256:hash(readFileSync(path))}));
const report={sqlBefore:versions,cases:[],startedAt:new Date().toISOString()};
const sessions=[];let started=false,port;
function tool(name,args,extra={}){return new Promise((ok,fail)=>{const p=spawn(join(bin,name+'.exe'),args,{env,windowsHide:true,...extra});let out='',err='';p.stdout?.on('data',d=>out+=d);p.stderr?.on('data',d=>err+=d);p.on('error',fail);p.on(name==='pg_ctl'?'exit':'close',code=>code===0?ok(out):fail(new Error(`${name} exit ${code}: ${err.replaceAll(password,'[redacted]').slice(0,1500)}`)));});}
async function freePort(){for(let n=55432;n<55442;n++){if(await new Promise(r=>{const s=net.createServer();s.on('error',()=>r(false));s.listen(n,'127.0.0.1',()=>s.close(()=>r(true)));}))return n;}throw Error('No free isolated port');}
class Session{
 constructor(db,user){assert.ok(['postgres','studio_v2_test','studio_v2_restore'].includes(db));this.db=db;this.user=user;this.buffer='';this.pending=null;this.proc=spawn(join(bin,'psql.exe'),['-X','-qAt','-w','-h','127.0.0.1','-p',String(port),'-U',user,'-d',db,'-v','VERBOSITY=sqlstate'],{env,windowsHide:true});this.proc.stdout.on('data',d=>{this.buffer+=d;this.consume();});this.proc.stderr.on('data',()=>{});this.proc.on('error',e=>this.pending?.reject(e));this.proc.on('exit',code=>this.pending?.reject(Error('psql exited '+code)));sessions.push(this);}
 consume(){if(!this.pending)return;const {marker}=this.pending;const index=this.buffer.indexOf(marker+' ');if(index<0)return;const end=this.buffer.indexOf('\n',index);if(end<0)return;const state=this.buffer.slice(index+marker.length+1,end).trim();const output=this.buffer.slice(0,index).trim();this.buffer=this.buffer.slice(end+1);const p=this.pending;this.pending=null;clearTimeout(p.timer);p.resolve({state,output});}
 raw(sql){assert.equal(this.pending,null,'One in-flight query per physical connection');return new Promise((resolve,reject)=>{const marker='END_'+randomUUID().replaceAll('-','');const timer=setTimeout(()=>{this.proc.kill();reject(Error('Bounded psql timeout'));},25000);this.pending={marker,resolve,reject,timer};this.proc.stdin.write(sql+'\n\\echo '+marker+' :SQLSTATE\n');});}
 async guard(){const r=await this.raw(`select json_build_object('host',host(inet_server_addr()),'port',inet_server_port(),'db',current_database(),'pid',pg_backend_pid(),'user',current_user,'super',(select rolsuper from pg_roles where rolname=current_user))::text;`);assert.equal(r.state,'00000');const x=JSON.parse(r.output);assert.equal(x.host,'127.0.0.1');assert.equal(x.port,port);assert.equal(x.db,this.db);assert.equal(x.user,this.user);return x;}
 async run(sql,expected='00000'){await this.guard();const r=await this.raw(sql);assert.equal(r.state,expected,`SQLSTATE expected ${expected}, got ${r.state}`);return r.output;}
 async json(sql){return JSON.parse(await this.run(sql));}
 close(){if(this.closed)return;this.closed=true;this.proc.stdin.end('\\q\n');}
}
const rpc=(fn,args)=>`select studio.${fn}(${args.map(v=>v===null?'null':q(typeof v==='object'?JSON.stringify(v):v)).join(',')})::text;`;
let admin,service;
async function fixture(label){
 const owner=randomUUID();await admin.run(`insert into auth.users values(${q(owner)});insert into studio.teachers values(${q(owner)},true);`);
 const conv=JSON.parse(await service.run(rpc('new_conversation_v2',[owner,label,randomUUID()])));
 const job=randomUUID(),request=randomUUID();const snapshot={schemaVersion:2,payload:{topic:'Fixture',grade:3,unit:'Fixture',requirements:'Synthetic specification only'}};
 await service.run(rpc('submit_job_v2',[owner,conv.id,request,'a'.repeat(64),snapshot,job,randomUUID()]));
 await service.run(rpc('transition_mock_job',[owner,job,0,randomUUID(),'simulate_error','failed',null,'MOCK_SIMULATED_FAILURE']));
 const approval=randomUUID();
 await admin.run(`insert into studio.reviews(job_id,owner_id,role,candidate_hash,evidence_version,result) values(${q(job)},${q(owner)},'fixture','h','v1','{}');insert into studio.approvals(id,job_id,owner_id,content_id,candidate_hash,artifact_hash,policy_version,checks_version,approver,approved_at) values(${q(approval)},${q(job)},${q(owner)},'fixture-content','h','a','v1','v1',${q(owner)},now());insert into studio.releases(job_id,owner_id,content_id,action,approval_id,candidate_hash,artifact_hash,release_commit,run_id,run_attempt,public_url,verification_state) values(${q(job)},${q(owner)},'fixture-content','fixture',${q(approval)},'h','a','fixture','fixture',1,'https://example.invalid/fixture','fixture');`);
 return {owner,conv:conv.id,job,snapshot};
}
async function history(f){return admin.json(`select json_build_object('job',(select to_jsonb(j) from studio.jobs j where id=${q(f.job)}),'events',(select json_agg(e order by sequence) from studio.job_events e where job_id=${q(f.job)}),'reviews',(select json_agg(r order by id) from studio.reviews r where job_id=${q(f.job)}),'approvals',(select json_agg(a order by id) from studio.approvals a where job_id=${q(f.job)}),'releases',(select json_agg(r order by id) from studio.releases r where job_id=${q(f.job)}))::text;`);}
function operation(f,kind){if(kind==='delete'||kind==='rename')return rpc('edit_conversation_v2',[f.owner,f.conv,kind,kind==='rename'?'Renamed fixture':null]);const args=[f.owner,f.conv,randomUUID(),'b'.repeat(64),f.snapshot,randomUUID(),randomUUID()];if(kind==='retry')args.push(f.job,1);return rpc('submit_job_v2',args);}
async function race(firstKind,secondKind,expected,reverse=false){
 const f=await fixture(`${firstKind}-${secondKind}`), before=await history(f);
 const pair=[new Session('studio_v2_test','service_role'),new Session('studio_v2_test','service_role')];
 const left=pair[reverse?1:0],right=pair[reverse?0:1];
 const l=await left.guard(),r=await right.guard();assert.notEqual(l.pid,r.pid);assert.equal(l.super,false);assert.equal(r.super,false);
 await left.run("set statement_timeout='15s';set lock_timeout='10s';begin;");
 await right.run("set statement_timeout='15s';set lock_timeout='10s';begin;");
 await left.run(operation(f,firstKind));
 await right.guard();const pending=right.raw(operation(f,secondKind));
 let observed;
 for(let i=0;i<40;i++){
  observed=await admin.json(`select json_build_object('pid',pid,'state',state,'wait',wait_event_type,'event',wait_event,'blockers',pg_blocking_pids(pid),'transaction_started',xact_start,'query_started',query_start,'observed_at',clock_timestamp())::text from pg_stat_activity where pid=${r.pid};`);
  if(observed.wait==='Lock'&&observed.blockers.includes(l.pid))break;
  await new Promise(r=>setTimeout(r,50));
 }
 assert.equal(observed.wait,'Lock');assert.ok(observed.blockers.includes(l.pid));
 const releaseAt=new Date().toISOString();await left.run('commit;');const outcome=await pending;
 assert.equal(outcome.state,expected);await right.raw(expected==='00000'?'commit;':'rollback;');
 assert.deepEqual(await history(f),before,'Independent specification/history changed');
 const state=await admin.json(`select json_build_object('deleted',deleted_at is not null,'title',title,'messages',(select count(*) from studio.messages where conversation_id=c.id),'jobs',(select count(*) from studio.jobs where conversation_id=c.id),'bad_owner',(select count(*) from studio.jobs where conversation_id=c.id and owner_id<>c.owner_id))::text from studio.conversations c where id=${q(f.conv)};`);
 const deleted=firstKind==='delete'||secondKind==='delete'&&expected==='00000';
 assert.equal(state.deleted,deleted);assert.equal(state.bad_owner,0);assert.equal(state.jobs,deleted?1:2);if(deleted){assert.equal(state.title,'[deleted]');assert.equal(state.messages,0);}
 if(!deleted&&firstKind==='retry')assert.equal(await admin.run(`select count(*) from studio.jobs where conversation_id=${q(f.conv)} and retry_of=${q(f.job)} and run_attempt=2;`),'1');
 const evidence={first:firstKind,second:secondKind,firstPid:l.pid,secondPid:r.pid,role:'service_role',superuser:false,firstResult:'00000',secondResult:outcome.state,waiting:observed,firstCommitSentAt:releaseAt,deleted,historyPreserved:true};
 report.cases.push(evidence);console.log(JSON.stringify(evidence));left.close();right.close();
}
async function fingerprint(s){
 const data={};for(const table of ['auth.users','studio.teachers','studio.conversations','studio.messages','studio.jobs','studio.job_events','studio.reviews','studio.approvals','studio.releases'])data[table]=await s.json(`select coalesce(json_agg(x.row order by x.row::text),'[]')::text from (select to_jsonb(t) row from ${table} t)x;`);
 const meta=await s.json(`select json_build_object('tables',(select json_agg(x order by relname) from(select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,pg_get_userbyid(c.relowner) owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('studio','auth') and c.relkind='r')x),'columns',(select json_agg(x order by table_schema,table_name,ordinal_position) from(select table_schema,table_name,column_name,ordinal_position,data_type,is_nullable,column_default from information_schema.columns where table_schema in ('studio','auth'))x),'constraints',(select json_agg(x order by conrelid_name,conname) from(select conrelid::regclass::text conrelid_name,conname,pg_get_constraintdef(oid) def from pg_constraint where connamespace in ('studio'::regnamespace,'auth'::regnamespace))x),'policies',(select json_agg(x order by tablename,policyname) from(select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='studio')x),'functions',(select json_agg(x order by proname,args) from(select p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) def,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('studio','auth'))x),'grants',(select json_agg(x order by table_name,column_name,grantee,privilege_type) from(select table_name,column_name,grantee,privilege_type from information_schema.column_privileges where table_schema='studio')x),'indexes',(select json_agg(x order by indexname) from(select indexname,indexdef from pg_indexes where schemaname in ('studio','auth'))x))::text;`);
 return {data:hash(JSON.stringify(data)),metadata:hash(JSON.stringify(meta))};
}
try{
 assert.ok(!existsSync(data),'Never overwrite an existing cluster');port=await freePort();report.port=port;
 const pwfile=join(root,'db','init-password.tmp');writeFileSync(pwfile,password,{flag:'wx'});
 try{report.initdb=await tool('initdb',['-D',data,'-U','rehearsal_admin','--pwfile='+pwfile,'--auth=scram-sha-256','--encoding=UTF8','--locale=C','--data-checksums']);}finally{unlinkSync(pwfile);}
 writeFileSync(join(data,'pg_hba.conf'),'host all rehearsal_admin 127.0.0.1/32 scram-sha-256\nhost studio_v2_test,studio_v2_restore service_role,authenticated 127.0.0.1/32 scram-sha-256\n');
 writeFileSync(join(data,'postgresql.auto.conf'),`listen_addresses='127.0.0.1'\nport=${port}\npassword_encryption='scram-sha-256'\nlog_statement='none'\nlog_min_error_statement='panic'\nlog_parameter_max_length_on_error=0\nmax_connections=12\n`);
 await tool('pg_ctl',['-D',data,'-l',join(root,'logs','postgres.log'),'-w','-t','20','start']);started=true;
 const control=new Session('postgres','rehearsal_admin');await control.guard();
 await control.run(`create role anon nologin;create role authenticated login password ${q(password)};create role service_role login bypassrls password ${q(password)};`);
 await control.run('create database studio_v2_test template template0;');await control.run('create database studio_v2_restore template template0;');
 admin=new Session('studio_v2_test','rehearsal_admin');service=new Session('studio_v2_test','service_role');
 assert.equal(await admin.run("select to_regnamespace('studio') is null;"),'t');
 await admin.run("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;");
 for(const path of sqlFiles)await admin.run(readFileSync(path,'utf8'));
 assert.equal(await service.run('select studio.conversation_delete_enabled_v2();'),'f');
 assert.equal(await admin.run("select to_regclass('studio.dispatch_intents') is null;"),'t');report.baselineThenV2=true;
 // Test cluster only. Source proposal and remote deletion gate remain false.
 await admin.run("create or replace function studio.conversation_delete_enabled_v2() returns boolean language sql security invoker set search_path='' as $$select true$$;");
 await race('delete','submit','PT404');await race('submit','delete','PT423');
 await race('delete','retry','PT404');await race('retry','delete','PT423');
 await race('delete','delete','PT404');await race('delete','delete','PT404',true);
 await race('rename','delete','00000');await race('delete','rename','PT404');
 await admin.run("create or replace function studio.conversation_delete_enabled_v2() returns boolean language sql security invoker set search_path='' as $$select false$$;");
 report.beforeRestore=await fingerprint(admin);
 const backup=join(root,'backups','studio-v2.dump');await admin.guard();
 await tool('pg_dump',['-h','127.0.0.1','-p',String(port),'-U','rehearsal_admin','-d','studio_v2_test','-w','-Fc','-f',backup]);
 const restore=new Session('studio_v2_restore','rehearsal_admin');await restore.guard();assert.equal(await restore.run("select to_regnamespace('studio') is null;"),'t');
 await tool('pg_restore',['-h','127.0.0.1','-p',String(port),'-U','rehearsal_admin','-d','studio_v2_restore','-w','--exit-on-error','--single-transaction',backup]);
 report.afterRestore=await fingerprint(restore);assert.deepEqual(report.afterRestore,report.beforeRestore);
 const restoredService=new Session('studio_v2_restore','service_role');const owner=await restore.run('select owner_id from studio.teachers order by owner_id limit 1;');
 const c=JSON.parse(await restoredService.run(rpc('new_conversation_v2',[owner,'Restore RPC only',randomUUID()])));
 await restoredService.run(rpc('edit_conversation_v2',[owner,c.id,'rename','Restored rename']));
 await restoredService.run(rpc('edit_conversation_v2',[owner,c.id,'delete',null]),'PT412');
 const auth=new Session('studio_v2_restore','authenticated');await auth.run(`select set_config('request.jwt.claim.sub',${q(owner)},false);`);
 assert.equal(await auth.run(`select count(*) from studio.conversations where id=${q(c.id)};`),'1');
 assert.equal(await auth.run(`select count(*) from studio.conversations where owner_id<>${q(owner)};`),'0');
 await auth.run("update studio.conversations set title='forged';",'42501');await auth.run(rpc('new_conversation_v2',[owner,'forged',randomUUID()]),'42501');
 report.backup={path:backup,sha256:hash(readFileSync(backup)),restore:'PASS',rpc:'PASS',authenticatedReadIsolationAndWriteDenial:'PASS',roles:'cluster-level roles pre-created; not part of pg_dump'};
 report.sqlAfter=sqlFiles.map(path=>({path,sha256:hash(readFileSync(path))}));assert.deepEqual(report.sqlAfter,versions);report.result='PASS';
}catch(error){report.result='FAIL';report.error=String(error.message).replaceAll(password,'[redacted]');console.error(report.error);process.exitCode=1;}
finally{
 for(const s of sessions){try{s.close();}catch{}}
 if(started){try{await tool('pg_ctl',['-D',data,'-m','fast','-w','-t','20','stop']);report.stopped=true;}catch(e){report.stopped=false;report.stopError=String(e.message).replaceAll(password,'[redacted]');process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();writeFileSync(join(root,'logs','rehearsal-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({result:report.result,cases:report.cases.length,backup:report.backup?.restore,stopped:report.stopped,port,sql:versions}));
}
