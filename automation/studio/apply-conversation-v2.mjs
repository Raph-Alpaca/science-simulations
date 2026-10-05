// One reviewed rollout. Source credentials never enter argv, reports or SQL.
// Rehearsal uses the restored local cluster; apply requires its exact evidence.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {PrivatePgSession,runProcess} from './postgres-client.mjs';
import {fingerprint} from './studio-fingerprint.mjs';
const project=resolve('.'),root=join(project,'.local','studio-v1-backup-20260916');
const run=resolve(process.argv[2]||'INVALID'),mode=process.argv[3];
const bin=join(project,'.local','pg17-ad1839ec7ba749b4b13fbecf799f1e55','tools-native','pgsql','bin');
const cli=join(project,'.local','tools','supabase-2.119.0','supabase.exe');
const baseline='20261004111955',delta='20261004111958';
const file1=join(project,'supabase','migrations',baseline+'_studio_v1_baseline.sql');
const file2=join(project,'supabase','migrations',delta+'_studio_v2_conversations.sql');
const hash=value=>createHash('sha256').update(value).digest('hex');
// The reviewed SQL contains no multiline string literal. psql converts CRLF
// function source to LF; compare that known formatting difference only here.
const migrationMetadataHash=metadata=>hash(JSON.stringify({...metadata,functions:metadata.functions.map(fn=>({...fn,definition:fn.definition.replaceAll('\r\n','\n')}))}));
const check=(ok,code)=>{if(!ok)throw Error(code);};
const report={mode,startedAt:new Date().toISOString(),remoteSchemaChanged:false};
let stage='inputs',started=false;const sessions=[];
const env={...process.env};
for(const key of Object.keys(env))if(key.startsWith('PG')||key.startsWith('STUDIO_BACKUP')||key.startsWith('STUDIO_RESTORE'))delete env[key];
const common={...env,PGCLIENTENCODING:'UTF8',PGTZ:'UTC',PGCONNECT_TIMEOUT:'10'};
const session=e=>{const s=new PrivatePgSession(bin,e);sessions.push(s);return s;};
let localEnv;
async function checked(exe,args,options={}){
 const result=await runProcess(exe,args,options);
 if(result.code!==0){
  let output=result.stderr;
  for(const secret of [process.env.STUDIO_BACKUP_PASSWORD,process.env.STUDIO_RESTORE_PASSWORD])if(secret)output=output.replaceAll(secret,'[secret]');
  writeFileSync(join(run,mode+'-'+stage+'-error.txt'),output,{flag:'wx'});
  throw Error('OPERATION_FAILED');
 }return result;
}
async function oldData(s){
 const data={};
 for(const table of ['approvals','conversations','job_events','jobs','messages','releases','reviews','teachers']){
  const row=table==='conversations'?"to_jsonb(t)-'deleted_at'-'creation_request_id'":'to_jsonb(t)';
  data[table]=await s.json(`select json_build_object('rows',count(*),'md5',md5(coalesce(string_agg(row::text,E'\\n' order by row::text collate "C"),'[]')))::text from(select ${row} row from studio.${table} t)x;`);
 }return hash(JSON.stringify(data));
}
try{
 check(run.startsWith(root+sep)&&['rehearse','apply'].includes(mode),'INVALID_RUN');
 check(!existsSync(join(run,mode+'-v2-result.json')),'ALREADY_ATTEMPTED');
 const backup=JSON.parse(readFileSync(join(run,'backup-result.json'),'utf8'));
 const source=JSON.parse(readFileSync(join(run,'source-fingerprint.json'),'utf8'));
 check(backup.result==='PASS'&&backup.backupComplete&&backup.restoreComplete&&backup.localServerStopped,'BACKUP_REQUIRED');
 check(hash(readFileSync(join(run,'backups','studio-v1.dump')))===backup.backup.sha256,'BACKUP_CHANGED');
 check(hash(readFileSync(file1))==='6f55bd60c3af35a25564929623e585bc2e026d217de0848aa892cceab8273c67'&&hash(readFileSync(file2))==='9b79f5824dc8c3de3a8b4f2902175b8cffc997c68372646fb5160e880df0fcdb','SQL_CHANGED');
 report.baselineVersion=baseline;report.deltaVersion=delta;
 if(mode==='rehearse'){
  check(process.env.STUDIO_RESTORE_PASSWORD?.length>=32,'LOCAL_PASSWORD_REQUIRED');
  const cluster=join(run,'db','cluster');check(!existsSync(join(cluster,'postmaster.pid')),'CLUSTER_ALREADY_STARTED');
  localEnv={...common,PGHOST:'127.0.0.1',PGPORT:String(backup.localPort),PGDATABASE:'studio_restore',PGUSER:'restore_admin',PGPASSWORD:process.env.STUDIO_RESTORE_PASSWORD,PGSSLMODE:'disable',PGOPTIONS:'-c statement_timeout=30000 -c lock_timeout=5000'};
  stage='start_local';await checked(join(bin,'pg_ctl.exe'),['-D',cluster,'-l',join(run,'logs','v2-local.log'),'-w','-t','20','start'],{env:localEnv});started=true;
  const s=session(localEnv);
  const target=await s.json("select json_build_object('host',host(inet_server_addr()),'port',inet_server_port(),'db',current_database(),'user',current_user)::text;");
  check(target.host==='127.0.0.1'&&target.port===backup.localPort&&target.db==='studio_restore'&&target.user==='restore_admin','LOCAL_TARGET_MISMATCH');
  check(JSON.stringify(await fingerprint(s))===JSON.stringify(source),'RESTORED_SOURCE_CHANGED');
  stage='canonical_baseline';
  const existing=await s.sql("select count(*) from pg_database where datname='studio_baseline_reference';");
  if(existing==='0')await s.sql('create database studio_baseline_reference owner postgres template template0;');
  const canonical=session({...localEnv,PGDATABASE:'studio_baseline_reference'});
  if(existing==='0'){
   await canonical.sql("set role postgres;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;");
   await canonical.sql(readFileSync(file1,'utf8'));
  }
  const baselineFp=await fingerprint(canonical);
  check(migrationMetadataHash(baselineFp.metadata)===migrationMetadataHash(source.metadata),'BASELINE_SCHEMA_MISMATCH');report.canonicalBaselineMatches=true;report.functionLineEndingsNormalized=true;
  // The minimal restored auth stub belongs to restore_admin. Match the
  // migration owner's access to auth.uid without changing any studio grant.
  stage='local_v2';await s.sql('grant usage on schema auth to postgres;grant execute on function auth.uid() to postgres;set role postgres;');await s.sql(readFileSync(file2,'utf8'));
  check(await oldData(s)===source.dataHash,'EXISTING_DATA_CHANGED');
  check(await s.sql('select studio.conversation_delete_enabled_v2();')==='f','DELETE_GATE_OPEN');
  check(await s.sql('select studio.studio_capabilities_v2();')==='2','V2_CAPABILITIES_FAILED');
  const v2=await fingerprint(s);report.v2MetadataHash=migrationMetadataHash(v2.metadata);report.dataPreserved=true;report.deleteDisabled=true;
 }else{
  const rehearsal=JSON.parse(readFileSync(join(run,'rehearse-v2-result.json'),'utf8'));
  check(rehearsal.result==='PASS'&&rehearsal.canonicalBaselineMatches&&rehearsal.dataPreserved&&rehearsal.localServerStopped,'REHEARSAL_REQUIRED');
  check(Date.now()-Date.parse(backup.finishedAt)<3600000,'BACKUP_TOO_OLD');
  const config=JSON.parse(readFileSync(join(root,'connection.json'),'utf8').replace(/^\uFEFF/,''));
  check(config.projectRef==='wbcqazwryuarzolrrzny'&&config.projectName==='science-studio'&&/^aws-\d+-ap-northeast-2\.pooler\.supabase\.com$/.test(config.host)&&config.user==='postgres.wbcqazwryuarzolrrzny'&&Number(config.port)===5432&&config.database==='postgres'&&config.sslmode==='verify-full','SOURCE_TARGET_MISMATCH');
  check(process.env.STUDIO_BACKUP_PASSWORD,'DB_PASSWORD_REQUIRED');
  const ca=resolve(root,config.sslrootcert);check(ca.startsWith(root+sep),'CA_PATH_REJECTED');
  const remoteEnv={...common,PGHOST:config.host,PGPORT:'5432',PGDATABASE:'postgres',PGUSER:config.user,PGPASSWORD:process.env.STUDIO_BACKUP_PASSWORD,PGSSLMODE:'verify-full',PGSSLROOTCERT:ca,PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=5000'};
  stage='remote_preflight';const before=session(remoteEnv);
  await before.sql('begin isolation level repeatable read read only;');
  check(await before.sql("select current_database()='postgres' and current_setting('transaction_read_only')='on';")==='t','REMOTE_TARGET_FAILED');
  const now=await fingerprint(before);check(now.dataHash===source.dataHash&&now.metadataHash===source.metadataHash,'SOURCE_CHANGED_SINCE_BACKUP');
  check(await before.sql("select to_regclass('supabase_migrations.schema_migrations') is null;")==='t','HISTORY_ALREADY_EXISTS');
  await before.sql('rollback;');before.close();
  const url=new URL('postgresql://'+encodeURIComponent(config.user)+'@'+config.host+':5432/postgres');
  url.searchParams.set('sslmode','verify-full');url.searchParams.set('sslrootcert',ca);url.searchParams.set('connect_timeout','10');
  const cliEnv={...remoteEnv,SUPABASE_DB_PASSWORD:process.env.STUDIO_BACKUP_PASSWORD,PGOPTIONS:'-c statement_timeout=30000 -c lock_timeout=5000'};
  stage='baseline_history';await checked(cli,['migration','repair',baseline,'--status','applied','--db-url',url.href,'--yes'],{env:cliEnv,timeout:45000});report.baselineRecorded=true;
  stage='dry_run';const dry=await checked(cli,['db','push','--db-url',url.href,'--dry-run','--skip-vault','--yes'],{env:cliEnv,timeout:45000});
  const dryText=dry.stdout+dry.stderr;writeFileSync(join(run,'v2-dry-run.txt'),dryText,{flag:'wx'});
  check(dryText.includes(delta)&&!dryText.includes(baseline),'UNEXPECTED_PENDING_MIGRATION');report.onlyV2Pending=true;
  stage='apply_v2';await checked(cli,['db','push','--db-url',url.href,'--skip-vault','--yes'],{env:cliEnv,timeout:45000});report.remoteSchemaChanged=true;
  stage='verify_remote';const after=session(remoteEnv);await after.sql('begin isolation level repeatable read read only;');
  const fp=await fingerprint(after);check(migrationMetadataHash(fp.metadata)===rehearsal.v2MetadataHash,'REMOTE_METADATA_MISMATCH');
  check(await oldData(after)===source.dataHash,'REMOTE_DATA_CHANGED');
  const versions=await after.json('select json_agg(version order by version)::text from supabase_migrations.schema_migrations;');
  check(JSON.stringify(versions)===JSON.stringify([baseline,delta]),'MIGRATION_HISTORY_MISMATCH');
  check(await after.sql('select studio.conversation_delete_enabled_v2();')==='f','DELETE_GATE_OPEN');
  await after.sql('rollback;');after.close();report.dataPreserved=true;report.metadataMatchesRehearsal=true;report.deleteDisabled=true;report.migrationVersions=versions;
 }
 report.result='PASS';
}catch(error){report.result='FAIL';report.stage=stage;report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'OPERATION_FAILED';process.exitCode=1;}
finally{
 for(const s of sessions)s.close();
 if(started){try{await checked(join(bin,'pg_ctl.exe'),['-D',join(run,'db','cluster'),'-m','fast','-w','-t','20','stop'],{env:localEnv});report.localServerStopped=true;}catch{report.localServerStopped=false;report.result='FAIL';process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();
 if(run.startsWith(root+sep)&&existsSync(run))writeFileSync(join(run,mode+'-v2-result.json'),JSON.stringify(report,null,2),{flag:'wx'});
 console.log(JSON.stringify(report));
}
