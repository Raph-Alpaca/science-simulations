// Apply only the pinned source-preparation increment to a completed LOCAL restore.
// Reads no production credentials and never connects to the source database.
import {readFileSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess,PrivatePgSession} from './postgres-client.mjs';
import {fingerprint} from './studio-fingerprint.mjs';
import {backupScope} from './backup-scope.mjs';

const root=resolve(process.argv[2]||'INVALID'),expectedHash=process.argv[3];
const migration=fileURLToPath(new URL('../../supabase/migrations/20261015234634_studio_source_preparation.sql',import.meta.url));
const privateRoot=resolve('.local/studio-v1-backup-20260916'),data=join(root,'db','cluster');
const bin=resolve('.local/pg17-ad1839ec7ba749b4b13fbecf799f1e55/tools-native/pgsql/bin');
const resultPath=join(root,'preparation-migration-result.json'),password=process.env.STUDIO_RESTORE_PASSWORD;
assert.ok(dirname(root)===privateRoot&&root===realpathSync(root),'PRIVATE_RESTORE_REQUIRED');
assert.ok(!existsSync(resultPath)&&!existsSync(join(data,'postmaster.pid')),'UNUSED_STOPPED_RESTORE_REQUIRED');
const backup=JSON.parse(readFileSync(join(root,'backup-result.json'),'utf8'));
assert.ok(backup.result==='PASS'&&backup.restoreComplete&&backup.localServerStopped&&backup.schemaScope==='publication-foundation'&&backup.tableCount===26,'VERIFIED_RESTORE_REQUIRED');
assert.ok(password?.length>=32&&/^[a-f0-9]{64}$/.test(expectedHash),'PRIVATE_INPUTS_REQUIRED');
const sql=readFileSync(migration,'utf8').replaceAll('\r\n','\n');assert.equal(createHash('sha256').update(sql).digest('hex'),expectedHash,'MIGRATION_CHANGED');
assert.ok(Number.isInteger(backup.localPort)&&backup.localPort>=55442&&backup.localPort<55452,'LOCAL_PORT_REJECTED');
const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PGHOST:'127.0.0.1',PGPORT:String(backup.localPort),PGDATABASE:'studio_restore',PGUSER:'restore_admin',PGPASSWORD:password,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8',PGTZ:'UTC',PGOPTIONS:'-c statement_timeout=30000 -c lock_timeout=5000'};
const report={startedAt:new Date().toISOString(),migrationHash:expectedHash,remoteConnections:0},deadline=Date.now()+120000;
let stage='start_local',session,started=false;
const timer=setTimeout(()=>session?.child.kill(),120000);
try{
 const start=await runProcess(join(bin,'pg_ctl.exe'),['-D',data,'-l',join(root,'logs','preparation-postgres.log'),'-w','-t','20','start'],{env,timeout:25000});assert.equal(start.code,0,'LOCAL_START_FAILED');started=true;
 session=new PrivatePgSession(bin,env);
 const guard=await session.json("select json_build_object('host',host(inet_server_addr()),'port',inet_server_port(),'db',current_database(),'user',current_user,'major',current_setting('server_version_num')::int/10000)::text;");
 assert.deepEqual(guard,{host:'127.0.0.1',port:backup.localPort,db:'studio_restore',user:'restore_admin',major:17});
 stage='verify_restore';const tables=backupScope('publication-foundation');
 const before=await fingerprint(session,{tables}),saved=JSON.parse(readFileSync(join(root,'restored-fingerprint.json'),'utf8'));
 assert.equal(before.dataHash,saved.dataHash,'RESTORE_DATA_CHANGED');assert.equal(before.metadataHash,saved.metadataHash,'RESTORE_SCHEMA_CHANGED');
 assert.ok(Date.now()<deadline,'TOTAL_TIME_LIMIT');stage='apply_local';
 // Restored studio objects belong to postgres, as in production. Creating
 // new objects as restore_admin would make a correct production schema
 // falsely differ in ownership and ACL grantors during later verification.
 await session.sql('set role postgres;');await session.sql(sql);
 stage='verify_increment';const after=await fingerprint(session,{tables});assert.equal(after.dataHash,before.dataHash,'EXISTING_DATA_CHANGED');
 const known=new Set(before.metadata.functions.map(fn=>fn.name+'|'+fn.args));
 assert.deepEqual(after.metadata.functions.filter(fn=>known.has(fn.name+'|'+fn.args)),before.metadata.functions,'EXISTING_FUNCTION_CHANGED');
 assert.equal(after.metadata.functions.length-before.metadata.functions.length,10,'FUNCTION_COUNT_MISMATCH');
 const checks=await session.json("select json_build_object('tables',(select count(*) from pg_class where relnamespace='studio'::regnamespace and relkind='r'),'empty',(select count(*)=0 from studio.preparation_sources),'rls',(select relrowsecurity from pg_class where oid='studio.preparation_sources'::regclass),'reader',has_table_privilege('service_role','studio.preparation_sources','SELECT'),'writer',has_table_privilege('service_role','studio.preparation_sources','INSERT,UPDATE,DELETE'),'browser',has_table_privilege('authenticated','studio.preparation_sources','SELECT,INSERT,UPDATE,DELETE'),'anon',has_table_privilege('anon','studio.preparation_sources','SELECT,INSERT,UPDATE,DELETE'),'worker',studio.worker_execution_enabled(),'dispatch',studio.dispatch_execution_enabled(),'publication',studio.publication_dispatch_enabled(),'api',studio.publication_api_enabled(),'deploy',studio.publication_deploy_enabled(),'budget',(select enabled from studio.budget_policy where singleton))::text;");
 assert.deepEqual(checks,{tables:27,empty:true,rls:true,reader:true,writer:false,browser:false,anon:false,worker:false,dispatch:false,publication:false,api:false,deploy:false,budget:false});
 writeFileSync(join(root,'preparation-restored-fingerprint.json'),JSON.stringify(await fingerprint(session,{tables:backupScope('source-preparation')})),{flag:'wx'});
 report.result='PASS';report.existingDataPreserved=true;report.existingFunctionsPreserved=true;report.checks=checks;
}catch(error){report.result='FAIL';report.stage=stage;report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'LOCAL_REHEARSAL_FAILED';process.exitCode=1;}
finally{
 clearTimeout(timer);session?.close();
 if(started||existsSync(join(data,'postmaster.pid'))){try{const stop=await runProcess(join(bin,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','20','stop'],{env,timeout:25000});report.localServerStopped=stop.code===0;}catch{report.localServerStopped=false;}}
 if(!report.localServerStopped){report.result='FAIL';process.exitCode=1;}
 report.finishedAt=new Date().toISOString();writeFileSync(resultPath,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
}
