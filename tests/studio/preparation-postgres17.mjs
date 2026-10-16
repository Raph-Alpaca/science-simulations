// Synthetic multi-connection rehearsal in a NEW loopback-only PostgreSQL cluster.
// No dotenv, remote DB, provider calls, production data or existing clusters.
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import net from 'node:net';
import {runProcess,PrivatePgSession,sqlString as q} from '../../automation/studio/postgres-client.mjs';
import {prepareInputReview,attachSourcePreparation,INPUT_CONSENT} from '../../apps/studio/lib/input-review.mjs';
import {prepareSourceEvidence} from '../../packages/contracts/preparation-evidence.js';
import {preparationFixture} from './preparation-fixture.mjs';

const root=resolve(process.argv[2]||'INVALID'),local=resolve('.local');
assert.ok(root.startsWith(local+sep)&&root!==local&&!existsSync(root),'NEW_LOCAL_ROOT_REQUIRED');
const bin=resolve(process.argv[3]||'INVALID');assert.ok(bin.endsWith(join('tools-native','pgsql','bin'))&&existsSync(join(bin,'postgres.exe')),'NATIVE_PG_REQUIRED');
const data=join(root,'cluster'),password=randomBytes(32).toString('hex');
const files=['studio_v1','studio_v2','studio_budget_v1','studio_worker_v1','studio_input_review_v1','studio_preparation_sources_v1','studio_preparation_admission_v1'].map(n=>'supabase/proposals/'+n+'.sql');
const report={startedAt:new Date().toISOString(),sql:files.map(path=>({path,hash:createHash('sha256').update(readFileSync(path)).digest('hex')})),cases:[]};
const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
Object.assign(env,{PGHOST:'127.0.0.1',PGDATABASE:'preparation_test',PGUSER:'source_test_admin',PGPASSWORD:password,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8',PGTZ:'UTC',PGOPTIONS:'-c statement_timeout=12000 -c lock_timeout=8000'});
const sessions=[];let started=false,admin,service;const deadline=Date.now()+120000;
const timer=setTimeout(()=>{for(const s of sessions)s.child.kill();},120000);
const native=async(name,args)=>{assert.ok(Date.now()<deadline,'TOTAL_TIME_LIMIT');const r=await runProcess(join(bin,name+'.exe'),args,{env,timeout:Math.min(25000,deadline-Date.now())});report.native??=[];report.native.push({name,exitCode:r.code});if(r.code!==0)throw Error('NATIVE_'+name.toUpperCase()+'_FAILED');return r.stdout;};
async function freePort(){for(let p=55451;p<=55455;p++){const free=await new Promise(ok=>{const s=net.createServer();s.once('error',()=>ok(false));s.listen(p,'127.0.0.1',()=>s.close(()=>ok(true)));});if(free)return p;}throw Error('NO_TEST_PORT');}
async function session(user,db='preparation_test'){
 const s=new PrivatePgSession(bin,{...env,PGUSER:user,PGDATABASE:db});sessions.push(s);
 s.info=await s.json("select json_build_object('host',host(inet_server_addr()),'port',inet_server_port(),'db',current_database(),'user',current_user,'pid',pg_backend_pid(),'super',(select rolsuper from pg_roles where rolname=current_user))::text;");
 assert.equal(s.info.host,'127.0.0.1');assert.equal(String(s.info.port),env.PGPORT);assert.equal(s.info.db,db);assert.equal(s.info.user,user);if(user==='service_role')assert.equal(s.info.super,false);return s;
}
const rpc=(name,args)=>'select to_jsonb(studio.'+name+'('+args.map(v=>v===null?'null':q(typeof v==='object'?JSON.stringify(v):v)).join(',')+'))';
const attempt=(s,sql)=>s.json('select public.test_call('+q(sql)+')::text;');
async function checked(s,sql,expected='00000'){const r=await attempt(s,sql);assert.equal(r.state,expected,'SQLSTATE_MISMATCH');return r.value;}
async function fixture(){
 const owner=randomUUID();await admin.sql('insert into auth.users values('+q(owner)+');insert into studio.teachers values('+q(owner)+',true);');
 const conversation=await checked(service,rpc('new_conversation_v2',[owner,'Synthetic source test',randomUUID()]));
 const evidence=preparationFixture(owner);
 for(let i=0;i<3;i++){const r=evidence.records[i],{id,...source}=evidence.scope.sources[i];await admin.sql('insert into studio.preparation_sources(id,owner_id,source_fingerprint,review_scope,curriculum_revision,source_identity,record) values('+[r.recordId,owner,r.sourceFingerprint,r.reviewScope,r.curriculumRevision,JSON.stringify(source),JSON.stringify(r)].map(q).join(',')+');');}
 const p=attachSourcePreparation(prepareInputReview({conversationId:conversation.id,clientRequestId:randomUUID(),topic:'Synthetic test',grade:3,unit:'Synthetic unit',requirements:'Not real evidence.',generationKind:'interactive_2d',sources:evidence.scope.sources.map(({id,...s})=>s)},owner),prepareSourceEvidence(evidence.scope,evidence.records));
 const review=await checked(service,rpc('prepare_worker_input',[owner,conversation.id,p.clientRequestId,p.request,p.inputText,p.sourceHash,p.contentId]));
 await checked(service,rpc('approve_worker_input',[owner,review.id,p.sourceHash,INPUT_CONSENT]));
 return {owner,review,submit:rpc('submit_reviewed_worker_job',[owner,review.id,p.sourceHash]),revoke:'with changed as (update studio.preparation_sources set revoked_at=clock_timestamp() where id='+q(evidence.records[0].recordId)+' returning id) select to_jsonb(changed) from changed'};
}
async function race(label,leftRole,leftSql,rightRole,rightSql,rightCode='00000'){
 const left=await session(leftRole),right=await session(rightRole);
 await left.sql('begin;');const first=await checked(left,leftSql);await right.sql('begin;');
 const pending=attempt(right,rightSql);let lock;
 for(let i=0;i<20;i++){
  lock=await admin.json("select json_build_object('wait',wait_event_type,'blockers',pg_blocking_pids(pid))::text from pg_stat_activity where pid="+right.info.pid+';');
  if(lock.wait==='Lock')break;await new Promise(r=>setTimeout(r,25));
 }
 assert.equal(lock.wait,'Lock','PHYSICAL_LOCK_REQUIRED');assert.ok(lock.blockers.includes(left.info.pid));
 await left.sql('commit;');const second=await pending;assert.equal(second.state,rightCode,label);await right.sql('commit;');left.close();right.close();
 report.cases.push({label,lockObserved:true,firstRole:leftRole,secondRole:rightRole,secondState:second.state});return [first,second.value];
}
try{
 mkdirSync(root,{recursive:true});env.PGPORT=String(await freePort());report.port=Number(env.PGPORT);
 const passwordFile=join(root,'synthetic-password.tmp');writeFileSync(passwordFile,password,{flag:'wx'});
 try{await native('initdb',['-D',data,'-U','source_test_admin','--pwfile='+passwordFile,'--auth=scram-sha-256','--encoding=UTF8','--locale=C','--data-checksums']);}finally{unlinkSync(passwordFile);}
 writeFileSync(join(data,'pg_hba.conf'),'host all source_test_admin 127.0.0.1/32 scram-sha-256\nhost preparation_test service_role 127.0.0.1/32 scram-sha-256\n');
 writeFileSync(join(data,'postgresql.auto.conf'),`listen_addresses='127.0.0.1'\nport=${env.PGPORT}\npassword_encryption='scram-sha-256'\nlog_statement='none'\nlog_min_error_statement='panic'\nlog_parameter_max_length_on_error=0\nmax_connections=10\n`);
 await native('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-w','-t','20','start']);started=true;
 const control=await session('source_test_admin','postgres');await control.sql('create database preparation_test;');control.close();
 admin=await session('source_test_admin');await admin.sql('create role anon;create role authenticated;create role service_role login bypassrls password '+q(password)+';create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;');
 for(const file of files)await admin.sql(readFileSync(file,'utf8'));
 await admin.sql("create function public.test_call(p_sql text) returns jsonb language plpgsql security invoker set search_path='' as $$declare result jsonb;begin execute p_sql into result;return jsonb_build_object('state','00000','value',result);exception when others then return jsonb_build_object('state',sqlstate);end$$;revoke all on function public.test_call(text) from public;grant execute on function public.test_call(text) to service_role;");
 service=await session('service_role');assert.equal(await service.sql('select studio.worker_execution_enabled();'),'f');
 await admin.sql("create or replace function studio.worker_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;update studio.budget_policy set enabled=true;");
 const revoked=await fixture();await race('revocation-before-admission','source_test_admin',revoked.revoke,'service_role',revoked.submit,'PT422');
 assert.equal(await admin.sql('select count(*) from studio.jobs;'),'0');assert.equal(await admin.sql('select count(*) from studio.budget_jobs;'),'0');
 const admitted=await fixture();const [job]=await race('admission-before-revocation','service_role',admitted.submit,'source_test_admin',admitted.revoke);
 assert.equal((await checked(service,admitted.submit)).id,job.id);await checked(service,rpc('cancel_worker_job',[admitted.owner,job.id,0,randomUUID()]));
 const stale=await fixture(),rr=await session('service_role');await rr.sql('begin isolation level repeatable read;select count(*) from studio.preparation_sources;');await checked(admin,stale.revoke);
 await checked(rr,stale.submit,'40001');await rr.sql('rollback;');rr.close();report.cases.push({label:'stale-repeatable-read-admission',state:'40001'});
 const duplicate=await fixture();const [a,b]=await race('concurrent-duplicate-admission','service_role',duplicate.submit,'service_role',duplicate.submit);assert.equal(a.id,b.id);await checked(service,rpc('cancel_worker_job',[duplicate.owner,a.id,0,randomUUID()]));
 const held=await fixture(),heldJob=await checked(service,held.submit);
 const heldCall=rpc('reserve_ai_call',[heldJob.id,randomUUID(),'b'.repeat(64),'curriculum',100]);
 await race('revocation-before-provider-reservation','source_test_admin',held.revoke,'service_role',heldCall,'PT422');
 await checked(service,rpc('cancel_worker_job',[held.owner,heldJob.id,0,randomUUID()]));
 const called=await fixture(),calledJob=await checked(service,called.submit),callId=randomUUID();
 const reserve=rpc('reserve_ai_call',[calledJob.id,callId,'c'.repeat(64),'curriculum',100]);
 const [receipt]=await race('provider-reservation-before-revocation','service_role',reserve,'source_test_admin',called.revoke);
 assert.equal(receipt.newReservation,true);assert.equal((await checked(service,reserve)).newReservation,false);
 await checked(service,rpc('settle_ai_call',[calledJob.id,callId,20,false]));
 await checked(service,rpc('reserve_ai_call',[calledJob.id,randomUUID(),'d'.repeat(64),'curriculum',100]),'PT422');
 await checked(service,rpc('cancel_worker_job',[called.owner,calledJob.id,0,randomUUID()]));
 assert.equal(await admin.sql('select count(*) from studio.jobs;'),'4');assert.equal(await admin.sql('select count(*) from studio.budget_calls;'),'1');
 assert.equal(await admin.sql("select count(*) from studio.budget_calls where state='settled';"),'1');
 report.result='PASS';
}catch(error){report.result='FAIL';report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'REHEARSAL_ASSERTION_FAILED';process.exitCode=1;}
finally{
 clearTimeout(timer);for(const s of sessions)s.close();
 if(started){try{const stopped=await runProcess(join(bin,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','20','stop'],{env,timeout:25000});report.stopped=stopped.code===0;}catch{report.stopped=false;}}
 if(started&&!report.stopped)process.exitCode=1;
 report.finishedAt=new Date().toISOString();if(existsSync(root))writeFileSync(join(root,'result.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({result:report.result,cases:report.cases,stopped:report.stopped,error:report.error}));
}
