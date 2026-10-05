// Private inputs are consumed internally. Never print libpq errors or input values.
import fs from 'node:fs';
import path from 'node:path';
import {X509Certificate} from 'node:crypto';
import {spawn} from 'node:child_process';
import {redactConnectionChecks,assessBackupConnection} from './backup-checks.mjs';
const folder=path.resolve('.local/studio-v1-backup-20260916');
const bin=path.resolve('.local/pg17-ad1839ec7ba749b4b13fbecf799f1e55/tools-native/pgsql/bin');
let stage='input_format';
let remoteChecks;
try {
 const c=JSON.parse(fs.readFileSync(path.join(folder,'connection.json'),'utf8').replace(/^\uFEFF/,''));
 const ref='wbcqazwryuarzolrrzny';
 // An omitted UI label can be inferred only from the exact approved endpoint/user pair.
 if(!String(c.connectionMode??'').trim()&&c.host===`db.${ref}.supabase.co`&&c.user==='postgres')c.connectionMode='direct';
 if(!String(c.connectionMode??'').trim()&&/^aws-\d+-ap-northeast-2\.pooler\.supabase\.com$/.test(c.host)&&c.user===`postgres.${ref}`)c.connectionMode='session';
 if(c.projectName!=='science-studio'||c.projectRef!==ref||!['direct','session'].includes(c.connectionMode)||c.database!=='postgres'||Number(c.port)!==5432||c.sslmode!=='verify-full')throw Error('INVALID_CONNECTION_FIELDS');
 if(c.connectionMode==='direct'?(c.host!==`db.${ref}.supabase.co`||c.user!=='postgres'):(!/^aws-\d+-ap-northeast-2\.pooler\.supabase\.com$/.test(c.host)||c.user!==`postgres.${ref}`))throw Error('PROJECT_TARGET_MISMATCH');
 const certPath=path.resolve(folder,c.sslrootcert);
 if(!certPath.startsWith(folder+path.sep))throw Error('CERTIFICATE_PATH_OUTSIDE_PRIVATE_FOLDER');
 stage='certificate_format';const certBytes=fs.readFileSync(certPath);const cert=new X509Certificate(certBytes);
 if(!cert.ca||Date.now()<Date.parse(cert.validFrom)||Date.now()>Date.parse(cert.validTo))throw Error('CA_INVALID_OR_EXPIRED');
 if(!process.env.STUDIO_BACKUP_PASSWORD)throw Error('PASSWORD_NOT_LOADED');
 stage='tls_database_connection';
 const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('PG'))delete env[k];delete env.STUDIO_BACKUP_PASSWORD;
 Object.assign(env,{PGHOST:c.host,PGPORT:String(c.port),PGDATABASE:c.database,PGUSER:c.user,PGPASSWORD:process.env.STUDIO_BACKUP_PASSWORD,PGSSLMODE:'verify-full',PGSSLROOTCERT:certPath,PGCONNECT_TIMEOUT:'10',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=15000',PGCLIENTENCODING:'UTF8'});
 const output=await new Promise((resolve,reject)=>{const p=spawn(path.join(bin,'psql.exe'),['-X','-qAt','-w','-v','ON_ERROR_STOP=1'],{env,windowsHide:true});let out='',err='';const timer=setTimeout(()=>{p.kill();reject(Error('CONNECTION_TIMEOUT'));},20000);p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',()=>{clearTimeout(timer);reject(Error('CLIENT_PROCESS_FAILURE'));});p.on('close',code=>{clearTimeout(timer);if(code===0)return resolve(out);const category=/certificate verify failed|certificate.*verify|root certificate|SSL certificate/i.test(err)?'TLS_CERTIFICATE_VERIFICATION_FAILED':/does not match host|hostname mismatch/i.test(err)?'TLS_HOSTNAME_MISMATCH':/password authentication failed/i.test(err)?'DATABASE_PASSWORD_AUTHENTICATION_FAILED':/could not translate host|Name or service not known|getaddrinfo/i.test(err)?'DNS_RESOLUTION_FAILED':/timeout|timed out/i.test(err)?'CONNECTION_TIMEOUT':/Network is unreachable|No route to host/i.test(err)?'NETWORK_UNREACHABLE':/refused/i.test(err)?'CONNECTION_REFUSED':'DATABASE_CONNECTION_FAILED';reject(Error(category));});p.stdin.end("begin read only; select json_build_object('database_ok',current_database()='postgres','read_only',current_setting('transaction_read_only')='on','tls',(select ssl from pg_stat_ssl where pid=pg_backend_pid()),'tls_version',(select version from pg_stat_ssl where pid=pg_backend_pid()),'server_major',current_setting('server_version_num')::int/10000,'studio_exists',to_regnamespace('studio') is not null)::text; rollback;\n");});
 const r=JSON.parse(output.trim());remoteChecks=redactConnectionChecks(r);const assessment=assessBackupConnection(r,{mode:c.connectionMode,clientVerifyFull:true});if(!assessment.accepted)throw Error('REMOTE_TARGET_OR_TLS_CHECK_FAILED');
 console.log(JSON.stringify({result:'PASS',stage,format:true,caValid:true,verifyFull:true,...remoteChecks,connectionMode:assessment.connectionMode,clientTlsVerified:assessment.clientTlsVerified,databaseSideTls:assessment.databaseSideTls}));
} catch(e) {const allowed=/^[A-Z_]+$/;console.log(JSON.stringify({result:'FAIL',stage,error:allowed.test(e.message)?e.message:'INPUT_OR_CERTIFICATE_PARSE_FAILED',...(remoteChecks?{queryCompleted:true,clientVerifyFull:true,checks:remoteChecks}:{})}));process.exitCode=1;}
