// Independent native PostgreSQL connections; fresh loopback-only synthetic DBs.
// Never loads dotenv, production credentials, original sources or a paid client.
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import net from 'node:net';
import {runProcess,PrivatePgSession,sqlString as q} from '../../automation/studio/postgres-client.mjs';
import {releaseFixture} from './release-approval-fixture.mjs';
import {prepareReleaseReview} from '../../automation/publish/prepare-review.mjs';
import {publicationFixture} from './publication-dispatch-fixture.mjs';
import {publicationApiFixture} from './publication-api-fixture.mjs';
import {publicationReportFixture} from './publication-report-fixture.mjs';

assert.ok(process.argv.length===2||(process.argv.length===3&&['--preparation','--publication','--publication-artifact','--publication-report'].includes(process.argv[2])),'INVALID_TEST_MODE');
const preparationMode=process.argv[2]==='--preparation';
const publicationMode=process.argv[2]==='--publication';
const artifactMode=process.argv[2]==='--publication-artifact';
const reportMode=process.argv[2]==='--publication-report';
const root=resolve('.local/release-postgres17-'+randomUUID()),data=join(root,'cluster');
const bin=resolve('.local/pg17-ad1839ec7ba749b4b13fbecf799f1e55/tools-native/pgsql/bin');
const password=randomBytes(36).toString('base64url'),env={...process.env};
for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
Object.assign(env,{PGHOST:'127.0.0.1',PGDATABASE:'postgres',PGUSER:'release_test_admin',PGPASSWORD:password,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8',PGTZ:'UTC',PGOPTIONS:'-c statement_timeout=15000 -c lock_timeout=10000'});
const files=['studio_v1','studio_v2','studio_runner_v1','studio_budget_v1','studio_worker_v1','studio_worker_auth_v1','studio_input_review_v1','studio_dispatch_v1','studio_result_review_v1','studio_revision_v1','studio_release_approval_v1'].map(n=>'supabase/proposals/'+n+'.sql');
if(preparationMode||publicationMode||artifactMode||reportMode)files.push('supabase/proposals/studio_release_preparation_v1.sql');
if(publicationMode||artifactMode||reportMode)files.push('supabase/proposals/studio_publication_dispatch_v1.sql');
if(artifactMode||reportMode)files.push('supabase/proposals/studio_publication_artifact_v1.sql');
if(reportMode)files.push('supabase/proposals/studio_publication_report_v1.sql');
const digest=value=>createHash('sha256').update(value).digest('hex');
const report={startedAt:new Date().toISOString(),mode:reportMode?'publication-report':artifactMode?'publication-artifact':publicationMode?'publication':preparationMode?'preparation':'approval',sql:files.map(file=>({file,hash:digest(readFileSync(file))})),cases:[]};
const sessions=[];let started=false,f;const deadline=Date.now()+180000;
const timer=setTimeout(()=>{for(const s of sessions)s.child.kill();},180000);
const native=async(name,args,timeout=30000)=>{assert.ok(Date.now()<deadline,'TOTAL_TIME_LIMIT');const r=await runProcess(join(bin,name+'.exe'),args,{env,timeout:Math.min(timeout,deadline-Date.now())});assert.equal(r.code,0,'NATIVE_'+name.toUpperCase()+'_FAILED');return r.stdout;};
const rpc=(name,args)=>'select to_jsonb(studio.'+name+'('+args.map(v=>v===null?'null':q(typeof v==='object'?JSON.stringify(v):v)).join(',')+'))';
const testCall="create function public.test_call(p_sql text) returns jsonb language plpgsql security invoker set search_path='' as $$declare result jsonb;begin execute p_sql into result;return jsonb_build_object('state','00000','value',result);exception when others then return jsonb_build_object('state',sqlstate);end$$;revoke all on function public.test_call(text) from public;grant execute on function public.test_call(text) to service_role;";
async function session(user,db){const s=new PrivatePgSession(bin,{...env,PGUSER:user,PGDATABASE:db});sessions.push(s);s.info=await s.json("select json_build_object('host',host(inet_server_addr()),'db',current_database(),'pid',pg_backend_pid(),'super',(select rolsuper from pg_roles where rolname=current_user))::text;");assert.equal(s.info.host,'127.0.0.1');assert.equal(s.info.db,db);return s;}
const attempt=(s,sql)=>s.json('select public.test_call('+q(sql)+')::text;');
const checked=async(s,sql)=>{const r=await attempt(s,sql);assert.equal(r.state,'00000');return r.value;};
async function freePort(){for(let port=55443;port<=55449;port++){if(await new Promise(ok=>{const server=net.createServer();server.on('error',()=>ok(false));server.listen(port,'127.0.0.1',()=>server.close(()=>ok(true)));}))return port;}throw Error('NO_TEST_PORT');}
async function race(label,first,second,{firstRole='service_role',secondRole='service_role',secondCode='00000',before,after}={}){
 report.activeCase=label;
 const db='release_case_'+(report.cases.length+1);await native('createdb',['-w','-T','release_template',db]);
 const admin=await session('release_test_admin',db);if(before)await before(admin);
 const left=await session(firstRole,db),right=await session(secondRole,db);
 assert.notEqual(left.info.pid,right.info.pid);assert.equal(right.info.super,secondRole==='release_test_admin');assert.equal(left.info.super,firstRole==='release_test_admin');
 assert.equal(await left.sql('show session_replication_role;'),'origin');assert.equal(await right.sql('show session_replication_role;'),'origin');
 await left.sql('begin;');await right.sql('begin;');const a=await checked(left,first),pending=attempt(right,second);
 let wait;
 for(let i=0;i<80;i++){
  wait=await admin.json(`select json_build_object('wait',wait_event_type,'blockers',pg_blocking_pids(pid))::text from pg_stat_activity where pid=${right.info.pid};`);
  if(wait.wait==='Lock'&&wait.blockers.includes(left.info.pid))break;
  await new Promise(ok=>setTimeout(ok,25));
 }
 assert.equal(wait.wait,'Lock','PHYSICAL_LOCK_REQUIRED');assert.ok(wait.blockers.includes(left.info.pid));
 await left.sql('commit;');const b=await pending;assert.equal(b.state,secondCode,label);await right.sql('commit;');
 if(after)await after(admin,a,b.value);
 report.cases.push({label,firstPid:left.info.pid,secondPid:right.info.pid,firstRole,secondRole,firstSuperuser:left.info.super,secondSuperuser:right.info.super,lockObserved:true,secondResult:b.state});
 left.close();right.close();admin.close();
}
try{
 mkdirSync(root,{recursive:true});env.PGPORT=String(await freePort());report.port=Number(env.PGPORT);
 f=reportMode?await publicationReportFixture():artifactMode?await publicationApiFixture():publicationMode?await publicationFixture():await releaseFixture();
 if(publicationMode)await f.enable();
 await f.db.exec('reset role');
 let sourceId,preparation;
 if(preparationMode){
  await f.db.exec(readFileSync(files.at(-1),'utf8'));sourceId=randomUUID();
  await f.db.query('insert into studio.source_reviews(id,job_id,owner_id,candidate_hash,source_hash,education_text,education_hash) values($1,$2,$3,$4,$5,$6,$7)',[sourceId,f.jobId,f.ownerId,f.row.candidate_hash,f.row.source_hash,f.row.education_text,f.row.education_hash]);
  const sourceReview=(await f.db.query('select to_jsonb(s) row from studio.source_reviews s where id=$1',[sourceId])).rows[0].row;
  preparation=prepareReleaseReview({snapshot:await f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId}),sourceReview,baseline:{enabled:true,artifact_text:f.base.artifactText,artifact_hash:f.base.artifactHash,lock_hash:f.row.lock_hash,policy_version:f.row.policy_version},ownerId:f.ownerId,reviewId:randomUUID()});
 }
 // Copy the signed synthetic fixture, ordered by actual FK dependencies.
 const tables=(await f.db.query("select tablename from pg_tables where schemaname='studio' order by tablename")).rows.map(r=>r.tablename);
 const deps=(await f.db.query("select c.relname child,p.relname parent from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_class p on p.oid=k.confrelid join pg_namespace n on n.oid=c.relnamespace join pg_namespace pn on pn.oid=p.relnamespace where k.contype='f' and n.nspname='studio' and pn.nspname='studio' and c.oid<>p.oid")).rows;
 const ordered=[];while(ordered.length<tables.length){const next=tables.find(t=>!ordered.includes(t)&&deps.filter(d=>d.child===t).every(d=>ordered.includes(d.parent)));assert.ok(next,'FIXTURE_FK_CYCLE');ordered.push(next);}
 let seed='truncate '+tables.map(t=>'studio.'+t).join(',')+' cascade;';
 seed+='insert into auth.users values('+q(f.ownerId)+');';
 for(const table of ordered){
  const rows=(await f.db.query('select to_jsonb(t) row from studio.'+table+' t')).rows;
  for(const {row} of rows){const columns=Object.keys(row).map(k=>'"'+k+'"').join(',');seed+='insert into studio.'+table+'('+columns+') overriding system value select '+columns+' from json_populate_record(null::studio.'+table+','+q(JSON.stringify(row))+'::json);';}
 }
 const owner=f.ownerId,job=f.jobId,review=f.row.id,proposal=f.row.proposal_hash,version=f.row;
 const publicationApproval=f.approval?.id,publicationSource=f.sourceId,publicationIntent=f.intent?.id,publicationMeasured=f.report;
 await f.db.close();f=null;
 const pwfile=join(root,'init-password.tmp');writeFileSync(pwfile,password,{flag:'wx'});
 try{await native('initdb',['-D',data,'-U','release_test_admin','--pwfile='+pwfile,'--auth=scram-sha-256','--encoding=UTF8','--locale=C','--data-checksums']);}finally{unlinkSync(pwfile);}
 writeFileSync(join(data,'pg_hba.conf'),'host all release_test_admin 127.0.0.1/32 scram-sha-256\nhost all service_role 127.0.0.1/32 scram-sha-256\n');
 writeFileSync(join(data,'postgresql.auto.conf'),`listen_addresses='127.0.0.1'\nport=${env.PGPORT}\npassword_encryption='scram-sha-256'\nlog_statement='none'\nlog_min_error_statement='panic'\nlog_parameter_max_length_on_error=0\nmax_connections=12\n`);
 await native('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-w','-t','20','start']);started=true;
 await native('createdb',['-w','release_template']);const base=await session('release_test_admin','release_template');
 await base.sql('create role anon;create role authenticated;create role service_role login bypassrls password '+q(password)+';create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;');
 for(const file of files){report.stage=file;await base.sql(readFileSync(file,'utf8'));}await base.sql(testCall);
 // Restore a completed synthetic snapshot, not new lifecycle commands. Its jobs
 // predate the input-review trigger in this fixture. Data-only restore bypasses
 // triggers here only; every tested connection below uses origin and real locks.
 report.stage='RESTORE_SYNTHETIC_SNAPSHOT';await base.sql('set session_replication_role=replica;'+seed+'set session_replication_role=origin;');
 await base.sql("create or replace function studio.conversation_delete_enabled_v2() returns boolean language sql security invoker set search_path='' as $$select true$$;");
 if(publicationMode)await base.sql("create or replace function studio.publication_dispatch_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;");
 if(artifactMode||reportMode)await base.sql("create or replace function studio.publication_api_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;");
 await new Promise(ok=>{base.child.once('exit',ok);base.close();});
 report.stage='CONCURRENT_COMMANDS';const client=randomUUID(),approve=rpc('approve_release_review',[owner,review,client,proposal]);
 const feedback=rpc('record_result_feedback',[owner,job,randomUUID(),version.state_version,version.source_hash,version.candidate_hash,version.evidence_hash,'request_changes','Synthetic concurrent feedback']);
 const current=rpc('release_review_current',[owner,review]);
 if(reportMode){
  const record=(value=publicationMeasured,jti=digest(randomUUID()))=>rpc('record_publication_check',[publicationIntent,12345,1,'a'.repeat(40),jti,new Date(Date.now()+300000).toISOString(),'b'.repeat(64),JSON.stringify(value)]);
  const once=record(),withdraw=rpc('revoke_release_approval',[owner,publicationApproval]),approvalCurrent=rpc('publication_approval_current',[owner,publicationApproval]);
  const count=admin=>checked(admin,'select to_jsonb(count(*)) from studio.publication_checks');
  await race('report-token-replay',once,once,{secondCode:'PT409',after:async admin=>assert.equal(await count(admin),1)});
  await race('report-identical-result',record(),record(),{after:async(admin,a,b)=>{assert.equal(a.reportHash,b.reportHash);assert.equal(await count(admin),1);}});
  const changed=structuredClone(publicationMeasured);changed.runtime.checks.runtime='fail';changed.runtime.issues=['RUNTIME_RESET_FAILED'];
  await race('report-conflicting-result',record(),record(changed),{secondCode:'PT409'});
  await race('report-after-withdraw',withdraw,record(),{after:async admin=>{assert.equal(await checked(admin,approvalCurrent),false);assert.equal(await count(admin),1);}});
  await race('report-before-withdraw',record(),withdraw,{after:async admin=>{assert.equal(await checked(admin,approvalCurrent),false);assert.equal(await count(admin),1);}});
  await race('report-last-receipt-slot',record(),record(),{secondCode:'PT429',before:admin=>admin.sql("insert into studio.publication_oidc_receipts(jti_hash,publication_id,run_id,run_attempt,workflow_sha,role,action,body_hash,expires_at) select lpad(to_hex(n),64,'0'),"+q(publicationIntent)+",12345,1,repeat('a',40),'prepare','file',repeat('b',64),clock_timestamp()+interval '5 minutes' from generate_series(1,255) n;"),after:async admin=>assert.equal(await count(admin),1)});
 }else if(artifactMode){
  const read=(jti=digest(randomUUID()))=>rpc('read_publication_artifact',[publicationIntent,12345,1,'a'.repeat(40),jti,new Date(Date.now()+300000).toISOString(),'prepare','file','b'.repeat(64),'index.html']);
  const once=read(),withdraw=rpc('revoke_release_approval',[owner,publicationApproval]);
  await race('artifact-token-replay',once,once,{secondCode:'PT409',after:async(admin,a)=>{assert.equal(a.file.path,'index.html');assert.equal(await checked(admin,'select to_jsonb(count(*)) from studio.publication_oidc_receipts'),1);}});
  await race('artifact-withdraw-before-read',withdraw,read(),{secondCode:'PT409'});
  await race('artifact-read-before-withdraw',read(),withdraw,{after:async(admin,a)=>{assert.equal(a.file.path,'index.html');const later=await session('service_role',admin.info.db);assert.equal((await attempt(later,read())).state,'PT409');later.close();}});
  const revokeSource="with changed as (update studio.source_reviews set revoked_at=clock_timestamp() where id="+q(publicationSource)+" returning id) select to_jsonb(count(*)) from changed";
  await race('artifact-source-revoke-before-read',revokeSource,read(),{firstRole:'release_test_admin',secondCode:'PT409'});
  await race('artifact-last-receipt-slot',read(),read(),{secondCode:'PT429',before:admin=>admin.sql("insert into studio.publication_oidc_receipts(jti_hash,publication_id,run_id,run_attempt,workflow_sha,role,action,body_hash,expires_at) select lpad(to_hex(n),64,'0'),"+q(publicationIntent)+",12345,1,repeat('a',40),'prepare','file',repeat('b',64),clock_timestamp()+interval '5 minutes' from generate_series(1,255) n;"),after:async admin=>assert.equal(await checked(admin,'select to_jsonb(count(*)) from studio.publication_oidc_receipts'),256)});
 }else if(publicationMode){
  const request=rpc('request_publication_dispatch',[owner,publicationApproval,randomUUID()]);
  const intent="(select id from studio.publication_dispatches where approval_id="+q(publicationApproval)+")";
  const claimId=randomUUID();
  const claim=other=>"select studio.claim_publication_dispatch("+q(owner)+","+intent+","+q(other)+")";
  const before=admin=>checked(admin,request);
  await race('publication-request-vs-duplicate',request,request,{after:async(_admin,a,b)=>assert.equal(a.id,b.id)});
  await race('publication-claim-vs-duplicate',claim(claimId),claim(randomUUID()),{before,after:async(_admin,a,b)=>{assert.equal(a.claimed,true);assert.equal(b.claimed,false);assert.equal(b.dispatch.state,'claimed');}});
  await race('publication-withdraw-vs-claim',rpc('revoke_release_approval',[owner,publicationApproval]),claim(claimId),{before,after:async(_admin,_a,b)=>{assert.equal(b.claimed,false);assert.equal(b.dispatch.state,'cancelled');}});
  const revokeSource="with changed as (update studio.source_reviews set revoked_at=clock_timestamp() where id="+q(publicationSource)+" returning id) select to_jsonb(count(*)) from changed";
  await race('publication-source-revoke-vs-request',revokeSource,request,{firstRole:'release_test_admin',secondCode:'PT409'});
  const finish="select studio.finish_publication_dispatch("+q(owner)+","+intent+","+q(claimId)+",'uncertain',null,null)";
  await race('publication-finish-vs-duplicate',finish,finish,{before:async admin=>{await before(admin);await checked(admin,claim(claimId));},after:async(_admin,a,b)=>{assert.deepEqual(a,b);assert.equal(a.state,'uncertain');}});
 }else if(preparationMode){
  const issue=rpc('issue_release_review',[owner,job,randomUUID(),sourceId,preparation.record]);
  const adminRole='release_test_admin';
  const revokeSource="with changed as (update studio.source_reviews set revoked_at=clock_timestamp() where id="+q(sourceId)+" returning id) select to_jsonb(count(*)) from changed";
  const latestCurrent="select to_jsonb(studio.release_review_current("+q(owner)+",(select id from studio.release_reviews where job_id="+q(job)+" order by created_at desc,id desc limit 1)))";
  await race('issuer-vs-duplicate',issue,issue,{firstRole:adminRole,secondRole:adminRole,after:async(_admin,a,b)=>assert.equal(a.id,b.id)});
  await race('issuer-vs-feedback',issue,feedback,{firstRole:adminRole,after:async admin=>assert.equal(await checked(admin,latestCurrent),false)});
  await race('feedback-vs-issuer',feedback,issue,{secondRole:adminRole,secondCode:'PT409'});
  await race('source-revoke-vs-issuer',revokeSource,issue,{firstRole:adminRole,secondRole:adminRole,secondCode:'PT404'});
  await race('issuer-vs-source-revoke',issue,revokeSource,{firstRole:adminRole,secondRole:adminRole,after:async admin=>assert.equal(await checked(admin,latestCurrent),false)});
  await race('baseline-change-vs-issuer',"with changed as (update studio.release_baseline set enabled=false returning singleton) select to_jsonb(count(*)) from changed",issue,{firstRole:adminRole,secondRole:adminRole,secondCode:'PT409'});
  const approveLatest="select studio.approve_release_review("+q(owner)+",(select id from studio.release_reviews where job_id="+q(job)+" order by created_at desc,id desc limit 1),"+q(randomUUID())+","+q(proposal)+")";
  await race('source-revoke-vs-teacher-approval',revokeSource,approveLatest,{firstRole:adminRole,secondCode:'PT409',before:admin=>checked(admin,issue)});
 }else{
 await race('approval-vs-duplicate',approve,approve,{after:async(_admin,a,b)=>assert.equal(a.approval.id,b.approval.id)});
 await race('approval-vs-new-request',approve,rpc('approve_release_review',[owner,review,randomUUID(),proposal]),{secondCode:'PT409'});
 await race('feedback-vs-approval',feedback,approve,{secondCode:'PT409'});
 await race('approval-vs-feedback',approve,feedback,{after:async admin=>assert.equal(await checked(admin,current),false)});
 let approvalId;const seedApproval=async admin=>{approvalId=(await checked(admin,approve)).approval.id;};
 // Use a fixed receipt query inside this statement so it is evaluated in the new DB.
 const revoke="select studio.revoke_release_approval("+q(owner)+",(select id from studio.approvals where release_review_id="+q(review)+"))";
 await race('revoke-vs-approval-replay',revoke,approve,{before:seedApproval,after:async(_admin,_a,b)=>{assert.equal(b.approval.id,approvalId);assert.equal(b.effective,false);}});
 await race('baseline-change-vs-approval',"with changed as (update studio.release_baseline set enabled=false returning singleton) select to_jsonb(count(*)) from changed",approve,{firstRole:'release_test_admin',secondCode:'PT409'});
 await race('review-revoke-vs-approval',"with changed as (update studio.release_reviews set revoked_at=clock_timestamp() where id="+q(review)+" returning id) select to_jsonb(count(*)) from changed",approve,{firstRole:'release_test_admin',secondCode:'PT409'});
 const columns=Object.keys(version),values=columns.map(k=>k==='id'?'gen_random_uuid()':'r.'+k).join(',');
 await race('replacement-review-vs-approval','with changed as (insert into studio.release_reviews('+columns.join(',')+') select '+values+' from studio.release_reviews r where id='+q(review)+' returning id) select to_jsonb(count(*)) from changed',approve,{firstRole:'release_test_admin',secondCode:'PT409'});
 const remove="select studio.edit_conversation_v2("+q(owner)+",(select conversation_id from studio.jobs where id="+q(job)+"),'delete',null)";
 await race('conversation-delete-vs-approval',remove,approve,{secondCode:'PT404'});
 }
 assert.deepEqual(files.map(file=>({file,hash:digest(readFileSync(file))})),report.sql);report.result='PASS';
}catch(error){report.result='FAIL';report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'REHEARSAL_ASSERTION_FAILED';report.errorCode=error.code??null;
 const safe=v=>['boolean','number'].includes(typeof v)?v:typeof v==='string'&&/^[A-Z0-9_]{1,50}$/.test(v)?v:undefined;
 report.assertion={actual:safe(error.actual),expected:safe(error.expected),operator:error.operator};process.exitCode=1;}
finally{
 clearTimeout(timer);if(f)await f.db.close();for(const s of sessions)s.close();
 // Nine cloned test databases can require a longer checkpoint on Windows.
 // Keep cleanup separately bounded; never force-kill PostgreSQL or hide failure.
 if(started){try{const stopped=await runProcess(join(bin,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','40','stop'],{env,timeout:45000});report.stopCommandExit=stopped.code;report.stopped=stopped.code===0;}catch{report.stopped=false;}}
 if(started&&!report.stopped){try{const status=await runProcess(join(bin,'pg_ctl.exe'),['-D',data,'status'],{env,timeout:5000});report.stopStatusExit=status.code;report.stopped=status.code===3&&!existsSync(join(data,'postmaster.pid'));}catch{report.stopStatusUnconfirmed=true;}}
 if(started&&!report.stopped)process.exitCode=1;
 report.finishedAt=new Date().toISOString();writeFileSync(join(root,'result.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({result:report.result,cases:report.cases.length,stopped:report.stopped,evidence:root,error:report.error}));
}
