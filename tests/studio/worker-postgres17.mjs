// Physical-connection concurrency test in a NEW loopback PostgreSQL 17 cluster.
// No dotenv, production endpoints, operating-system service or paid provider.
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import net from 'node:net';
import {runProcess,PrivatePgSession,sqlString as q} from '../../automation/studio/postgres-client.mjs';
import {prepareInputReview,INPUT_CONSENT} from '../../apps/studio/lib/input-review.mjs';
import {prepareRevision} from '../../apps/studio/lib/revision.mjs';
import {inspectWorkerResult} from '../../apps/studio/lib/result-review.mjs';
import {parseCandidate} from '../../automation/runner/candidate.mjs';

const root=resolve(process.argv[2]||'INVALID'),local=resolve('.local');
assert.ok(root.startsWith(local+sep)&&root!==local,'NEW_LOCAL_ROOT_REQUIRED');
const bin=resolve('.local/pg17-ad1839ec7ba749b4b13fbecf799f1e55/tools-native/pgsql/bin');
const data=join(root,'cluster'),password=process.env.WORKER_TEST_PASSWORD;
assert.ok(password?.length>=32,'SYNTHETIC_PASSWORD_REQUIRED');assert.ok(!existsSync(data),'NEW_CLUSTER_REQUIRED');
const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('PG')||key==='WORKER_TEST_PASSWORD')delete env[key];
Object.assign(env,{PGHOST:'127.0.0.1',PGDATABASE:'worker_test',PGUSER:'worker_test_admin',PGPASSWORD:password,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8',PGTZ:'UTC',PGOPTIONS:'-c statement_timeout=15000 -c lock_timeout=10000'});
const files=['studio_v1','studio_v2','studio_runner_v1','studio_budget_v1','studio_worker_v1','studio_worker_auth_v1','studio_input_review_v1','studio_dispatch_v1','studio_result_review_v1','studio_revision_v1'].map(n=>'supabase/proposals/'+n+'.sql');
const digest=value=>createHash('sha256').update(value).digest('hex');
const report={startedAt:new Date().toISOString(),sql:files.map(file=>({file,hash:digest(readFileSync(file))})),cases:[]};
const sessions=[];let started=false,admin,service,activeDatabase='worker_test';const deadline=Date.now()+180000;
const timer=setTimeout(()=>{for(const s of sessions)s.child.kill();},180000);
async function native(name,args,timeout=30000){
 assert.ok(Date.now()<deadline,'TOTAL_TIME_LIMIT');const r=await runProcess(join(bin,name+'.exe'),args,{env,timeout:Math.min(timeout,deadline-Date.now())});assert.equal(r.code,0,'NATIVE_'+name.toUpperCase()+'_FAILED');return r.stdout;
}
async function port(){for(let n=55443;n<=55449;n++){const free=await new Promise(ok=>{const s=net.createServer();s.on('error',()=>ok(false));s.listen(n,'127.0.0.1',()=>s.close(()=>ok(true)));});if(free)return n;}throw Error('NO_TEST_PORT');}
async function session(user,db=activeDatabase){
 const s=new PrivatePgSession(bin,{...env,PGUSER:user,PGDATABASE:db});sessions.push(s);
 const info=await s.json("select json_build_object('host',host(inet_server_addr()),'port',inet_server_port(),'db',current_database(),'user',current_user,'pid',pg_backend_pid(),'super',(select rolsuper from pg_roles where rolname=current_user))::text;");
 assert.equal(info.host,'127.0.0.1');assert.equal(String(info.port),env.PGPORT);assert.equal(info.db,db);assert.equal(info.user,user);s.info=info;return s;
}
const rpc=(name,args)=>'select to_jsonb(studio.'+name+'('+args.map(value=>value===null?'null':q(typeof value==='object'?JSON.stringify(value):value)).join(',')+'))';
const testCallSql="create function public.test_call(p_sql text) returns jsonb language plpgsql security invoker set search_path='' as $$declare result jsonb;begin execute p_sql into result;return jsonb_build_object('state','00000','value',result);exception when others then return jsonb_build_object('state',sqlstate);end$$;revoke all on function public.test_call(text) from public;grant execute on function public.test_call(text) to service_role;";
async function attempt(s,sql){return s.json('select public.test_call('+q(sql)+')::text;');}
async function checked(s,sql,code='00000'){const value=await attempt(s,sql);assert.equal(value.state,code,'SQLSTATE_MISMATCH');return value.value;}
let runId=200;
async function fixture(submit=true,approve=true,withSource=false){
 const owner=randomUUID();await admin.sql('insert into auth.users values('+q(owner)+');insert into studio.teachers values('+q(owner)+',true);');
 const conv=await checked(service,rpc('new_conversation_v2',[owner,'Native synthetic fixture',randomUUID()]));
 const job=randomUUID(),run=++runId,client=randomUUID();
 const p=prepareInputReview({conversationId:conv.id,clientRequestId:client,topic:'Synthetic shapes',grade:3,unit:'Synthetic unit',requirements:'Synthetic concurrency fixture.',generationKind:'interactive_3d',sources:withSource?[{kind:'science',title:'Synthetic source',url:'https://example.org/fixture',location:'Fixture only',summary:'Not actual source verification.'}]:[]},owner);
 const review=await checked(service,rpc('prepare_worker_input',[owner,conv.id,client,p.request,p.inputText,p.sourceHash,p.contentId]));
 const approveSql=rpc('approve_worker_input',[owner,review.id,p.sourceHash,INPUT_CONSENT]);if(approve)await checked(service,approveSql);
 const submitSql=rpc('submit_worker_job',[owner,conv.id,client,job,randomUUID(),p.request,p.inputText,p.sourceHash,review.id]);
 const f={owner,job,run,review:review.id,conversation:conv.id,sourceHash:p.sourceHash,approveSql,submitSql,claim:rpc('claim_worker_run',[job,run,1,p.sourceHash]),cancel:version=>rpc('cancel_worker_job',[owner,job,version,randomUUID()]),finish:rpc('finish_worker_run',[job,run,1,'failed',null,'SYNTHETIC_END'])};
 if(submit){await checked(service,submitSql);await checked(service,rpc('bind_worker_run',[job,run,1]));}
 return f;
}
async function race(label,first,second,{firstCode='00000',secondCode='00000',check=()=>{}}={}){
 const left=await session('service_role'),right=await session('service_role');assert.notEqual(left.info.pid,right.info.pid);assert.equal(left.info.super,false);assert.equal(right.info.super,false);
 await left.sql('begin;');await right.sql('begin;');const a=await checked(left,first,firstCode);const pending=attempt(right,second);
 let observed;
 for(let i=0;i<60;i++){
  observed=await admin.json(`select json_build_object('pid',pid,'state',state,'wait',wait_event_type,'blockers',pg_blocking_pids(pid))::text from pg_stat_activity where pid=${right.info.pid};`);
  if(observed.wait==='Lock'&&observed.blockers.includes(left.info.pid))break;
  await new Promise(ok=>setTimeout(ok,25));
 }
 assert.equal(observed.wait,'Lock','PHYSICAL_LOCK_REQUIRED');assert.ok(observed.blockers.includes(left.info.pid));
 await left.sql('commit;');const b=await pending;assert.equal(b.state,secondCode,label);await right.sql('commit;');check(a,b.value);
 report.cases.push({label,database:left.info.db,firstPid:left.info.pid,secondPid:right.info.pid,role:'service_role',superuser:false,lockObserved:observed,firstResult:firstCode,secondResult:b.state});left.close();right.close();
}
async function clearBudget(f){const state=await admin.sql('select state from studio.jobs where id='+q(f.job)+';');if(state==='queued')await checked(service,f.cancel(0));else if(['running','cancel_requested'].includes(state))await checked(service,f.finish);}

// Native SQL fixtures carry real hashes and inert source, with synthetic model
// output and NO passing runtime/education claim. A failed candidate is revisable.
async function failedCandidate(f,finish=true){
 const source=JSON.parse(await admin.sql('select approved_input from studio.worker_runs where job_id='+q(f.job)+';'));
 const meta={...JSON.parse(readFileSync('content/simulations/mendel-inheritance/meta.json','utf8')),id:source.context.contentId,grade:source.context.grade,unit:source.context.unit,schoolYear:source.context.schoolYear,curriculumRevision:source.context.curriculumRevision,sourceIds:source.context.sources.map(s=>s.id)};
 const output=JSON.stringify({files:[{path:'meta.json',content:JSON.stringify(meta)},{path:'index.html',content:'<!doctype html><h1>Synthetic '+f.job+'</h1>'}]}),candidate=parseCandidate(output,source.context),call=randomUUID();
 await checked(service,rpc('reserve_ai_call',[f.job,call,digest(output),'developer',10000]));await checked(service,rpc('settle_ai_call',[f.job,call,1000,false]));
 for(const event of [{kind:'role_output',role:'developer',executionMode:'separate_context',callId:call,output,outputHash:digest(output)}, {kind:'candidate',attempt:0,candidateHash:candidate.candidateHash,manifest:candidate.manifest}]){
  const body=JSON.stringify({jobId:f.job,sourceSnapshotHash:f.sourceHash,...event});await checked(service,rpc('append_worker_evidence',[f.job,f.run,1,f.sourceHash,randomUUID(),body,digest(body)]));
 }
 if(finish)await checked(service,rpc('finish_worker_run',[f.job,f.run,1,'failed',null,'SYNTHETIC_STOP_BEFORE_REVIEW']));
}
async function revisionInput(f,{feedbackId=null,client=randomUUID(),prepare=true}={}){
 let snapshot=await checked(service,rpc('read_worker_result',[f.owner,f.job]));const {result}=inspectWorkerResult(snapshot),v=result.version;
 if(!feedbackId){const feedback=await checked(service,rpc('record_result_feedback',[f.owner,f.job,randomUUID(),v.stateVersion,v.sourceHash,v.candidateHash,v.evidenceHash,'request_changes','Synthetic revision '+client]));feedbackId=feedback.id;snapshot=await checked(service,rpc('read_worker_result',[f.owner,f.job]));}
 const lineage=await checked(service,rpc('read_revision_context',[f.owner,f.job,client])),p=prepareRevision(snapshot,lineage,{version:v,feedbackId,clientRequestId:client});
 const sql=rpc('prepare_worker_revision',[f.owner,f.job,feedbackId,client,p.reference.headJobId,p.request,p.inputText,p.sourceHash,p.baseCandidateText]);
 const review=prepare?await checked(service,sql):null;
 return {sql,feedbackId,review,sourceHash:p.sourceHash,approve:review?rpc('approve_worker_input',[f.owner,review.id,p.sourceHash,INPUT_CONSENT]):null,submit:review?rpc('submit_reviewed_worker_job',[f.owner,review.id,p.sourceHash]):null};
}
try{
 mkdirSync(root,{recursive:true});env.PGPORT=String(await port());report.port=Number(env.PGPORT);
 const passwordFile=join(root,'init-password.tmp');writeFileSync(passwordFile,password,{flag:'wx'});
 try{await native('initdb',['-D',data,'-U','worker_test_admin','--pwfile='+passwordFile,'--auth=scram-sha-256','--encoding=UTF8','--locale=C','--data-checksums']);}finally{unlinkSync(passwordFile);}
 writeFileSync(join(data,'pg_hba.conf'),'host all worker_test_admin 127.0.0.1/32 scram-sha-256\nhost worker_test service_role 127.0.0.1/32 scram-sha-256\nhost worker_input_test service_role 127.0.0.1/32 scram-sha-256\nhost worker_dispatch_test service_role 127.0.0.1/32 scram-sha-256\nhost worker_result_test service_role 127.0.0.1/32 scram-sha-256\nhost worker_revision_test service_role 127.0.0.1/32 scram-sha-256\n');
 writeFileSync(join(data,'postgresql.auto.conf'),`listen_addresses='127.0.0.1'\nport=${env.PGPORT}\npassword_encryption='scram-sha-256'\nlog_statement='none'\nlog_min_error_statement='panic'\nlog_parameter_max_length_on_error=0\nmax_connections=12\n`);
 await native('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-w','-t','20','start']);started=true;
 const control=await session('worker_test_admin','postgres');await control.sql('create database worker_test;');
 admin=await session('worker_test_admin');await admin.sql('create role anon;create role authenticated;create role service_role login bypassrls password '+q(password)+';create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;');
 for(const file of files)await admin.sql(readFileSync(file,'utf8'));
 await admin.sql(testCallSql);
 service=await session('service_role');assert.equal(await service.sql('select studio.worker_execution_enabled();'),'f');
 await admin.sql("create or replace function studio.worker_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;update studio.budget_policy set enabled=true;");
 // 1. Different owners still share one project-wide job budget slot.
 const a=await fixture(false),b=await fixture(false);await race('submit-vs-submit',a.submitSql,b.submitSql,{secondCode:'PT423'});await clearBudget(a);
 // 2. Only one physical connection may claim the same run.
 const c=await fixture();await race('claim-vs-claim',c.claim,c.claim,{check:(x,y)=>{assert.equal(x.claimed,true);assert.equal(y.claimed,false);}});await clearBudget(c);
 // 3/4. Both cancellation orderings prevent an extra generation start.
 const d=await fixture();await race('cancel-vs-claim',d.cancel(0),d.claim,{check:(x,y)=>{assert.equal(x.state,'cancelled');assert.equal(y.claimed,false);}});
 const e=await fixture();await race('claim-vs-stale-cancel',e.claim,e.cancel(0),{secondCode:'PT409'});await checked(service,e.cancel(1));await clearBudget(e);
 // Cancellation also wins if the pipeline had just returned a reviewed candidate.
 const completed=await fixture();await checked(service,completed.claim);
 await race('cancel-vs-complete',completed.cancel(1),rpc('finish_worker_run',[completed.job,completed.run,1,'candidate_for_human_review','a'.repeat(64),null]),{check:(_x,y)=>assert.equal(y.state,'cancelled')});
 // 5. A cancellation commits before a later API budget reservation.
 const f=await fixture();await checked(service,f.claim);
 await race('cancel-vs-api-reserve',f.cancel(1),rpc('reserve_ai_call',[f.job,randomUUID(),'a'.repeat(64),'developer',10000]),{secondCode:'PT409'});await clearBudget(f);
 // 6. A reserved call isn't refunded just because cancellation is accepted.
 const g=await fixture();await checked(service,g.claim);const call=randomUUID();
 await race('api-reserve-vs-cancel',rpc('reserve_ai_call',[g.job,call,'a'.repeat(64),'developer',10000]),g.cancel(1));
 const held=await admin.sql('select held_usd_micros from studio.budget_jobs where job_id='+q(g.job)+';');assert.equal(held,'10000');
 // 7. A known settlement commits before finish, releasing only unused reserve.
 await race('settle-vs-finish',rpc('settle_ai_call',[g.job,call,1250,false]),g.finish);
 assert.equal(await admin.sql('select spent_usd_micros from studio.budget_jobs where job_id='+q(g.job)+';'),'1250');
 // The server already verifies signatures; these cases test durable receipts
 // using synthetic identities across independent PostgreSQL connections.
 const replay=await fixture();await checked(service,replay.claim);
 const identityArgs=[replay.job,replay.run,1,'a'.repeat(40),digest(randomUUID()),new Date(Date.now()+300000).toISOString(),'generation','checkpoint','b'.repeat(64)];
 await race('oidc-consume-vs-replay',rpc('consume_worker_identity',identityArgs),rpc('consume_worker_identity',identityArgs),{secondCode:'PT409'});await clearBudget(replay);
 const versions=await fixture();await checked(service,versions.claim);
 const versionArgs=[versions.job,versions.run,1,'a'.repeat(40),digest(randomUUID()),new Date(Date.now()+300000).toISOString(),'generation','checkpoint','b'.repeat(64)];
 const wrongVersion=[...versionArgs];wrongVersion[3]='c'.repeat(40);wrongVersion[4]=digest(randomUUID());
 await race('oidc-sha-bind-vs-other-sha',rpc('consume_worker_identity',versionArgs),rpc('consume_worker_identity',wrongVersion),{secondCode:'PT403'});await clearBudget(versions);
 // An unknown finish keeps funds; a late response cannot silently refund it.
 const h=await fixture();await checked(service,h.claim);const lost=randomUUID();await checked(service,rpc('reserve_ai_call',[h.job,lost,'b'.repeat(64),'developer',10000]));
 await race('unknown-finish-vs-late-settle',h.finish,rpc('settle_ai_call',[h.job,lost,0,false]),{secondCode:'PT409'});
 assert.equal(await admin.sql('select state from studio.budget_jobs where job_id='+q(h.job)+';'),'uncertain');
 // A separate database for the next group keeps the original ten-job cap and
 // the preceding uncertain charge intact. No limit or failure is cleared.
 await control.sql('create database worker_input_test;');activeDatabase='worker_input_test';
 admin=await session('worker_test_admin');await admin.sql('create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;');
 for(const file of files)await admin.sql(readFileSync(file,'utf8'));await admin.sql(testCallSql);
 service=await session('service_role');
 await admin.sql("create or replace function studio.worker_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;update studio.budget_policy set enabled=true;");
 // Input review and its exact consent are serialized with submission/deletion.
 const approved=await fixture(false,false);await race('approve-input-vs-submit',approved.approveSql,approved.submitSql);await clearBudget(approved);
 const duplicate=await fixture(false);await race('reviewed-submit-vs-duplicate',duplicate.submitSql,rpc('submit_reviewed_worker_job',[duplicate.owner,duplicate.review,duplicate.sourceHash]),{check:(x,y)=>assert.equal(x.id,y.id)});await clearBudget(duplicate);
 const deleted=await fixture(false,false);
 await admin.sql("create or replace function studio.conversation_delete_enabled_v2() returns boolean language sql security invoker set search_path='' as $$select true$$;");
 await race('conversation-delete-vs-input-approval',rpc('edit_conversation_v2',[deleted.owner,deleted.conversation,'delete',null]),deleted.approveSql,{secondCode:'PT404'});
 // Dispatch group: independent connections and a fresh DB preserve all earlier
 // attempt caps and uncertain reservations. There is no GitHub network call.
 await control.sql('create database worker_dispatch_test;');activeDatabase='worker_dispatch_test';
 admin=await session('worker_test_admin');await admin.sql('create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;');
 for(const file of files)await admin.sql(readFileSync(file,'utf8'));await admin.sql(testCallSql);
 service=await session('service_role');assert.equal(await service.sql('select studio.dispatch_execution_enabled();'),'f');
 await admin.sql("create or replace function studio.worker_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;create or replace function studio.dispatch_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;update studio.budget_policy set enabled=true;");
 const dispatchClaim=(f,claim)=>rpc('claim_dispatch_intent',[f.owner,f.job,claim]);
 const dispatchFinish=(f,claim)=>rpc('finish_dispatch_intent',[f.owner,f.job,claim,'submitted',f.run,'a'.repeat(40),null]);
 const once=await fixture(false),onceClaim=randomUUID();await checked(service,once.submitSql);
 await race('dispatch-claim-vs-duplicate',dispatchClaim(once,onceClaim),dispatchClaim(once,randomUUID()),{check:(x,y)=>{assert.equal(x.claimed,true);assert.equal(y.claimed,false);}});await clearBudget(once);
 const cancelled=await fixture(false),cancelClaim=randomUUID();await checked(service,cancelled.submitSql);await checked(service,dispatchClaim(cancelled,cancelClaim));
 await race('cancel-vs-dispatch-bind',cancelled.cancel(0),dispatchFinish(cancelled,cancelClaim),{check:(_x,y)=>assert.equal(y.state,'cancelled')});
 assert.equal(await admin.sql('select workflow_run_id is null from studio.worker_runs where job_id='+q(cancelled.job)+';'),'t');
 const bound=await fixture(false),boundClaim=randomUUID();await checked(service,bound.submitSql);await checked(service,dispatchClaim(bound,boundClaim));
 await race('dispatch-bind-vs-cancel',dispatchFinish(bound,boundClaim),bound.cancel(0),{check:(x,y)=>{assert.equal(x.state,'submitted');assert.equal(y.state,'cancelled');}});
 assert.equal(await admin.sql('select state from studio.dispatch_intents where job_id='+q(bound.job)+';'),'cancelled');
 assert.equal((await checked(service,bound.claim)).claimed,false);
 const receipt=await fixture(false),receiptClaim=randomUUID();await checked(service,receipt.submitSql);await checked(service,dispatchClaim(receipt,receiptClaim));
 await race('dispatch-finish-vs-duplicate',dispatchFinish(receipt,receiptClaim),dispatchFinish(receipt,receiptClaim),{check:(x,y)=>assert.equal(x.run_id,y.run_id)});await clearBudget(receipt);
 // Close finished test connections before the next group, preserving their
 // databases and all evidence. Do not increase the connection/attempt budgets.
 admin.close();service.close();
 await control.sql('create database worker_result_test;');activeDatabase='worker_result_test';
 admin=await session('worker_test_admin');await admin.sql('create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;');
 for(const file of files)await admin.sql(readFileSync(file,'utf8'));await admin.sql(testCallSql);
 service=await session('service_role');await admin.sql("create or replace function studio.worker_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;create or replace function studio.conversation_delete_enabled_v2() returns boolean language sql security invoker set search_path='' as $$select true$$;update studio.budget_policy set enabled=true;");
 const resultCase=await fixture();await checked(service,resultCase.claim);await checked(service,rpc('finish_worker_run',[resultCase.job,resultCase.run,1,'needs_input',null,'CURRICULUM_EVIDENCE_REQUIRED']));
 const feedbackArgs=[resultCase.owner,resultCase.job,randomUUID(),2,resultCase.sourceHash,null,digest(''),'note','Synthetic result feedback'];
 await race('feedback-vs-duplicate',rpc('record_result_feedback',feedbackArgs),rpc('record_result_feedback',feedbackArgs),{check:(x,y)=>assert.equal(x.id,y.id)});
 const nextFeedback=[...feedbackArgs];nextFeedback[2]=randomUUID();const changedFeedback=[...nextFeedback];changedFeedback[8]='Changed same request';
 await race('feedback-vs-conflicting-reuse',rpc('record_result_feedback',nextFeedback),rpc('record_result_feedback',changedFeedback),{secondCode:'PT409'});
 const afterDelete=[...feedbackArgs];afterDelete[2]=randomUUID();
 await race('conversation-delete-vs-feedback',rpc('edit_conversation_v2',[resultCase.owner,resultCase.conversation,'delete',null]),rpc('record_result_feedback',afterDelete),{secondCode:'PT404'});
 // Revisions use a new database, preserving the previous ten-job/uncertain
 // budgets. Each race proves a real lock wait between non-superuser sessions.
 admin.close();service.close();await control.sql('create database worker_revision_test;');activeDatabase='worker_revision_test';
 admin=await session('worker_test_admin');await admin.sql('create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;');
 for(const file of files)await admin.sql(readFileSync(file,'utf8'));await admin.sql(testCallSql);
 service=await session('service_role');await admin.sql("create or replace function studio.worker_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;create or replace function studio.conversation_delete_enabled_v2() returns boolean language sql security invoker set search_path='' as $$select true$$;update studio.budget_policy set enabled=true;");
 const base=await fixture(true,true,true);await checked(service,base.claim);await failedCandidate(base);
 const firstRevision=await revisionInput(base,{prepare:false});let prepared;
 await race('revision-prepare-vs-duplicate',firstRevision.sql,firstRevision.sql,{check:(x,y)=>{assert.equal(x.id,y.id);prepared=x;}});
 const sameFeedback=await revisionInput(base,{feedbackId:firstRevision.feedbackId});
 const prepareA=rpc('approve_worker_input',[base.owner,prepared.id,prepared.source_hash,INPUT_CONSENT]),submitA=rpc('submit_reviewed_worker_job',[base.owner,prepared.id,prepared.source_hash]);
 await checked(service,sameFeedback.approve);let firstChild;
 await race('revision-approve-vs-submit',prepareA,submitA,{check:(_x,y)=>{firstChild=y;}});
 await race('revision-submit-vs-duplicate',submitA,submitA,{check:(x,y)=>assert.equal(x.id,y.id)});
 await race('revision-same-feedback-vs-other-client',submitA,sameFeedback.submit,{secondCode:'PT423'});
 await race('revision-cancel-vs-stale-approval',rpc('cancel_worker_job',[base.owner,firstChild.id,0,randomUUID()]),sameFeedback.approve,{secondCode:'PT409'});
 // New consent is required to retry from the unchanged base after no candidate.
 const differentA=await revisionInput(base),differentB=await revisionInput(base);await checked(service,differentA.approve);await checked(service,differentB.approve);let secondChild;
 await race('revision-distinct-feedback-vs-same-head',differentA.submit,differentB.submit,{secondCode:'PT423',check:x=>{secondChild=x;}});
 const childRun=++runId,child={...base,job:secondChild.id,run:childRun,sourceHash:differentA.sourceHash};await checked(service,rpc('bind_worker_run',[child.job,childRun,1]));await checked(service,rpc('claim_worker_run',[child.job,childRun,1,child.sourceHash]));await failedCandidate(child,false);
 const oldParent=await revisionInput(base,{prepare:false});
 await race('revision-child-finish-vs-old-parent',rpc('finish_worker_run',[child.job,child.run,1,'failed',null,'SYNTHETIC_STOP_BEFORE_REVIEW']),oldParent.sql,{secondCode:'PT409'});
 const nextRevision=await revisionInput(child);await race('revision-delete-vs-approval',rpc('edit_conversation_v2',[base.owner,base.conversation,'delete',null]),nextRevision.approve,{secondCode:'PT404'});
 assert.equal(await admin.sql('select generation from studio.content_heads where content_id='+q(prepared.content_id)+';'),'2');
 assert.equal(await admin.sql('select count(*) from studio.jobs;'),'3');assert.equal(await admin.sql('select count(*) from studio.approvals;'),'0');
 assert.deepEqual(files.map(file=>({file,hash:digest(readFileSync(file))})),report.sql);report.result='PASS';
}catch(error){report.result='FAIL';report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'REHEARSAL_ASSERTION_FAILED';process.exitCode=1;}
finally{
 clearTimeout(timer);for(const s of sessions)s.close();
 if(started){
  try{const stopped=await runProcess(join(bin,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','20','stop'],{env,timeout:25000});report.stopCommandExit=stopped.code;report.stopped=stopped.code===0;}catch{report.stopped=false;}
  // A timed-out observation is not proof that PostgreSQL is still running.
  // Recheck this exact cluster once; never restart it or hide the stop failure.
  if(!report.stopped){try{const status=await runProcess(join(bin,'pg_ctl.exe'),['-D',data,'status'],{env,timeout:5000});report.stopStatusExit=status.code;report.stopped=status.code===3&&!existsSync(join(data,'postmaster.pid'));}catch{report.stopStatusUnconfirmed=true;}}
 }
 if(started&&!report.stopped)process.exitCode=1;
 report.finishedAt=new Date().toISOString();writeFileSync(join(root,'result.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({result:report.result,cases:report.cases.length,stopped:report.stopped,port:report.port,error:report.error}));
}
