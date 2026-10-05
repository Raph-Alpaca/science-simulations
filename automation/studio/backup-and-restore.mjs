// Approved studio-only backup. Private credentials arrive through process env;
// restoration is restricted to a new loopback-only cluster, never the source.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync,statSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {randomUUID,createHash,X509Certificate} from 'node:crypto';
import net from 'node:net';
import {assessBackupConnection} from './backup-checks.mjs';

const project=resolve('.'), privateRoot=join(project,'.local','studio-v1-backup-20260916');
const run=resolve(process.argv[2]||'INVALID');
const bin=join(project,'.local','pg17-ad1839ec7ba749b4b13fbecf799f1e55','tools-native','pgsql','bin');
const tables=['approvals','conversations','job_events','jobs','messages','releases','reviews','teachers'];
const remotePassword=process.env.STUDIO_BACKUP_PASSWORD;
const localPassword=process.env.STUDIO_RESTORE_PASSWORD;
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const digest=value=>createHash('sha256').update(value).digest('hex');
const started=Date.now(),deadline=started+300000;
const report={schemaVersion:1,startedAt:new Date(started).toISOString(),maxDurationMs:300000,sourceScope:'studio',remoteReadOnly:true,remoteConnections:0,backupComplete:false,restoreComplete:false};
let stage='private_inputs',remote,local,serverStarted=false,port;
const sessions=[];
const baseEnv={...process.env};
for(const key of Object.keys(baseEnv)) if(key.startsWith('PG')||key.startsWith('STUDIO_BACKUP')||key.startsWith('STUDIO_RESTORE')) delete baseEnv[key];
const basePg={...baseEnv,PGCLIENTENCODING:'UTF8',PGCONNECT_TIMEOUT:'10',PGTZ:'UTC'};
let remoteEnv,localEnv;
function requireCheck(condition,code){if(!condition)throw Error(code);}
function safeError(error){return /^[A-Z0-9_]+$/.test(error.message)?error.message:'OPERATION_FAILED';}
function remaining(maximum){requireCheck(Date.now()<deadline,'TOTAL_TIME_LIMIT');return Math.min(maximum,deadline-Date.now());}
function native(name,args,{env=localEnv,input,timeout=30000,allowFailure=false,cleanup=false}={}){
  timeout=cleanup?timeout:remaining(timeout);
  return new Promise((ok,fail)=>{
    const proc=spawn(join(bin,name+'.exe'),args,{env,windowsHide:true});
    let out='',err='',done=false;
    const timer=setTimeout(()=>{proc.kill();finish(Error('NATIVE_PROCESS_TIMEOUT'));},timeout);
    function finish(error,code){if(done)return;done=true;clearTimeout(timer);if(error)return fail(error);if(code!==0&&!allowFailure){
      const category=/password authentication failed/i.test(err)?'DATABASE_AUTHENTICATION_FAILED':/certificate|SSL/i.test(err)?'DATABASE_TLS_FAILED':'NATIVE_'+name.toUpperCase()+'_FAILED';
      const redacted=err.replaceAll(remotePassword||'\0','[secret]').replaceAll(localPassword||'\0','[secret]');
      writeFileSync(join(run,'logs',stage+'-native-error.txt'),redacted,{flag:'wx'});
      return fail(Error(category));
    }ok({out,err,code});}
    proc.stdout?.on('data',chunk=>{out+=chunk;if(out.length>12_000_000){proc.kill();finish(Error('OUTPUT_LIMIT_EXCEEDED'));}});
    proc.stderr?.on('data',chunk=>{err+=chunk;if(err.length>1_000_000){proc.kill();finish(Error('ERROR_OUTPUT_LIMIT_EXCEEDED'));}});
    proc.on('error',()=>finish(Error('NATIVE_PROCESS_START_FAILED')));
    proc.on(name==='pg_ctl'?'exit':'close',code=>finish(null,code));
    proc.stdin?.end(input);
  });
}
class Session {
  constructor(env){
    this.pending=null;this.buffer='';this.exited=false;this.closed=false;
    this.proc=spawn(join(bin,'psql.exe'),['-X','-qAt','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{env,windowsHide:true});
    this.proc.stdout.on('data',chunk=>{this.buffer+=chunk;if(this.buffer.length>12_000_000)this.proc.kill();else this.consume();});
    this.proc.stderr.on('data',()=>{});
    const died=()=>{this.exited=true;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('PSQL_SESSION_FAILED'));this.pending=null;}};
    this.proc.on('error',died);this.proc.on('exit',died);sessions.push(this);
    this.proc.stdin.on('error',died);
  }
  consume(){
    if(!this.pending)return;
    const at=this.buffer.indexOf(this.pending.marker);if(at<0)return;
    const end=this.buffer.indexOf('\n',at);if(end<0)return;
    const pending=this.pending;this.pending=null;clearTimeout(pending.timer);
    const text=this.buffer.slice(0,at).trim();this.buffer=this.buffer.slice(end+1);pending.resolve(text);
  }
  sql(sql){
    requireCheck(!this.pending&&!this.exited&&!this.closed,'SESSION_NOT_AVAILABLE');
    const timeout=remaining(30000);
    return new Promise((resolve,reject)=>{
      const marker='DONE_'+randomUUID().replaceAll('-','');
      const timer=setTimeout(()=>{this.proc.kill();this.pending=null;reject(Error('SQL_TIMEOUT'));},timeout);
      this.pending={marker,timer,resolve,reject};this.proc.stdin.write(sql+'\n\\echo '+marker+'\n');
    });
  }
  async json(sql){return JSON.parse(await this.sql(sql));}
  close(){if(!this.exited&&!this.closed){this.closed=true;this.proc.stdin.end('\\q\n');}}
}
const checkSql="select json_build_object('database_ok',current_database()='postgres','read_only',current_setting('transaction_read_only')='on','tls',(select ssl from pg_stat_ssl where pid=pg_backend_pid()),'tls_version',(select version from pg_stat_ssl where pid=pg_backend_pid()),'server_major',current_setting('server_version_num')::int/10000,'studio_exists',to_regnamespace('studio') is not null)::text;";
import {fingerprint} from './studio-fingerprint.mjs';
async function freePort(){for(let value=55442;value<55452;value++)if(await new Promise(resolve=>{const s=net.createServer();s.on('error',()=>resolve(false));s.listen(value,'127.0.0.1',()=>s.close(()=>resolve(true)));}))return value;throw Error('NO_LOCAL_PORT');}
async function localGuard(session){
  const check=await session.json("select json_build_object('host',host(inet_server_addr()),'port',inet_server_port(),'database',current_database(),'user',current_user,'studioAbsent',to_regnamespace('studio') is null)::text;");
  requireCheck(check.host==='127.0.0.1'&&check.port===port&&['postgres','studio_restore'].includes(check.database)&&check.user==='restore_admin','LOCAL_TARGET_MISMATCH');return check;
}
try {
  requireCheck(run.startsWith(privateRoot+sep)&&!existsSync(join(run,'backup-result.json')),'INVALID_PRIVATE_RUN');
  requireCheck(remotePassword&&localPassword?.length>=32,'MISSING_PRIVATE_PASSWORD');
  for(const sub of ['db','backups','logs'])mkdirSync(join(run,sub),{recursive:false});
  const config=JSON.parse(readFileSync(join(privateRoot,'connection.json'),'utf8').replace(/^\uFEFF/,''));
  const ref='wbcqazwryuarzolrrzny';
  requireCheck(config.projectName==='science-studio'&&config.projectRef===ref&&/^aws-\d+-ap-northeast-2\.pooler\.supabase\.com$/.test(config.host)&&config.user===`postgres.${ref}`&&Number(config.port)===5432&&config.database==='postgres'&&config.sslmode==='verify-full'&&['','session'].includes(String(config.connectionMode||'')),'UNAPPROVED_SOURCE');
  const caPath=resolve(privateRoot,config.sslrootcert);requireCheck(caPath.startsWith(privateRoot+sep),'UNAPPROVED_CA_PATH');
  const ca=new X509Certificate(readFileSync(caPath));requireCheck(ca.ca&&Date.now()>=Date.parse(ca.validFrom)&&Date.now()<=Date.parse(ca.validTo),'INVALID_CA');
  remoteEnv={...basePg,PGHOST:config.host,PGPORT:'5432',PGDATABASE:'postgres',PGUSER:config.user,PGPASSWORD:remotePassword,PGSSLMODE:'verify-full',PGSSLROOTCERT:caPath,PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=180000'};
  stage='remote_snapshot';remote=new Session(remoteEnv);report.remoteConnections++;
  await remote.sql('begin isolation level repeatable read read only;');
  report.connection=assessBackupConnection(await remote.json(checkSql),{mode:'session',clientVerifyFull:true});
  requireCheck(report.connection.accepted,'SOURCE_CONNECTION_CHECK_FAILED');
  const actualTables=await remote.json("select json_agg(relname order by relname)::text from pg_class where relnamespace='studio'::regnamespace and relkind='r';");
  requireCheck(JSON.stringify(actualTables)===JSON.stringify(tables),'SOURCE_TABLES_CHANGED');
  const snapshot=await remote.sql('select pg_export_snapshot();');requireCheck(/^[0-9A-F]+-[0-9A-F]+-[0-9]+$/.test(snapshot),'INVALID_SNAPSHOT');
  const before=await fingerprint(remote);writeFileSync(join(run,'source-fingerprint.json'),JSON.stringify(before),{flag:'wx'});
  const ownerRefs=await remote.json("select coalesce(json_agg(id order by id),'[]')::text from(select owner_id id from studio.teachers union select approver id from studio.approvals)x;");
  requireCheck(ownerRefs.every(id=>/^[0-9a-f-]{36}$/.test(id)),'INVALID_LOCAL_AUTH_REFERENCE');
  const activeOwner=await remote.sql('select owner_id from studio.teachers where active order by owner_id limit 1;');
  const archive=join(run,'backups','studio-v1.dump');stage='remote_dump';report.remoteConnections++;
  await native('pg_dump',['-w','-Fc','--schema=studio','--snapshot='+snapshot,'--lock-wait-timeout=5s','-f',archive],{env:remoteEnv,timeout:120000});
  await remote.sql('rollback;');remote.close();remote=null;
  report.backup={bytes:statSync(archive).size,sha256:digest(readFileSync(archive))};requireCheck(report.backup.bytes>0,'EMPTY_BACKUP');report.backupComplete=true;
  stage='local_cluster';port=await freePort();report.localPort=port;
  localEnv={...basePg,PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:'restore_admin',PGDATABASE:'postgres',PGPASSWORD:localPassword,PGSSLMODE:'disable',PGOPTIONS:'-c statement_timeout=30000 -c lock_timeout=5000'};
  const data=join(run,'db','cluster'),pwfile=join(run,'db','init-password.tmp');
  writeFileSync(pwfile,localPassword,{flag:'wx'});
  try{await native('initdb',['-D',data,'-U','restore_admin','--pwfile='+pwfile,'--auth=scram-sha-256','--encoding=UTF8','--locale=C','--data-checksums']);}finally{unlinkSync(pwfile);}
  writeFileSync(join(data,'pg_hba.conf'),'host all restore_admin 127.0.0.1/32 scram-sha-256\n');
  writeFileSync(join(data,'postgresql.auto.conf'),`listen_addresses='127.0.0.1'\nport=${port}\npassword_encryption='scram-sha-256'\nlog_statement='none'\nlog_min_error_statement='panic'\nlog_parameter_max_length_on_error=0\nmax_connections=8\n`);
  await native('pg_ctl',['-D',data,'-l',join(run,'logs','postgres.log'),'-w','-t','20','start']);serverStarted=true;
  const control=new Session(localEnv);await localGuard(control);
  await control.sql('create role postgres nologin bypassrls;create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role supabase_admin nologin superuser bypassrls;create role authenticator nologin noinherit;');
  await control.sql('create database studio_restore template template0;');control.close();
  localEnv={...localEnv,PGDATABASE:'studio_restore'};local=new Session(localEnv);requireCheck((await localGuard(local)).studioAbsent,'RESTORE_DATABASE_NOT_EMPTY');
  await local.sql("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;");
  if(ownerRefs.length)await local.sql('insert into auth.users(id) values '+ownerRefs.map(id=>'('+q(id)+')').join(',')+';');
  stage='restore';await localGuard(local);
  await native('pg_restore',['-w','--exit-on-error','--single-transaction','-d','studio_restore',archive],{timeout:120000});
  stage='verify_restoration';const after=await fingerprint(local);writeFileSync(join(run,'restored-fingerprint.json'),JSON.stringify(after),{flag:'wx'});
  requireCheck(before.dataHash===after.dataHash,'RESTORE_DATA_MISMATCH');requireCheck(before.metadataHash===after.metadataHash,'RESTORE_METADATA_MISMATCH');
  report.dataMatch=true;report.metadataMatch=true;report.authDataCopied=false;report.authReferencesOnly=true;
  if(activeOwner){
    requireCheck(/^[0-9a-f-]{36}$/.test(activeOwner),'INVALID_LOCAL_OWNER');
    await local.sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub',${q(activeOwner)},true);`);
    for(const table of tables)requireCheck(await local.sql(`select count(*) from studio.${table} where owner_id<>${q(activeOwner)};`)==='0','RESTORED_RLS_ISOLATION_FAILED');
    await local.sql('rollback;');report.restoredRlsIsolation=true;
    await local.sql('begin;set local role service_role;');
    const created=await local.json(`select json_build_object('created',length(studio.new_conversation(${q(activeOwner)},'Local restore verification only')->>'id')=36)::text;`);
    requireCheck(created.created,'RESTORED_RPC_FAILED');await local.sql('rollback;');report.restoredRpc=true;
  }
  const denied=await native('psql',['-X','-qAt','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{input:'begin;set local role authenticated;update studio.conversations set title=title where false;rollback;\n',allowFailure:true});
  requireCheck(denied.code!==0&&/42501/.test(denied.err),'RESTORED_DIRECT_WRITE_NOT_DENIED');report.restoredWriteDenied=true;
  const final=await fingerprint(local);requireCheck(final.dataHash===before.dataHash,'RESTORE_CHECK_CHANGED_DATA');
  report.restoreComplete=true;report.result='PASS';
} catch(error){report.result='FAIL';report.stage=stage;report.error=safeError(error);process.exitCode=1;}
finally {
  for(const session of sessions)session.close();
  if(serverStarted||existsSync(join(run,'db','cluster','postmaster.pid'))){try{await native('pg_ctl',['-D',join(run,'db','cluster'),'-m','fast','-w','-t','20','stop'],{cleanup:true});report.localServerStopped=true;}catch{report.localServerStopped=false;report.result='FAIL';report.stopError='LOCAL_SERVER_STOP_FAILED';process.exitCode=1;}}
  report.finishedAt=new Date().toISOString();
  if(run.startsWith(privateRoot+sep)&&existsSync(run))writeFileSync(join(run,'backup-result.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({result:report.result,stage:report.stage,error:report.error,backupComplete:report.backupComplete,restoreComplete:report.restoreComplete,dataMatch:report.dataMatch,metadataMatch:report.metadataMatch,restoredRlsIsolation:report.restoredRlsIsolation,restoredRpc:report.restoredRpc,restoredWriteDenied:report.restoredWriteDenied,localServerStopped:report.localServerStopped,remoteConnections:report.remoteConnections}));
}
