import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {workerFixture} from './worker-fixture.mjs';
import {createWorkerStore,executeStoredPipeline} from '../../automation/runner/worker-store.mjs';
import {createBudgetLedger} from '../../automation/runner/budget-ledger.mjs';
import {createBoundedResponses,PRICING} from '../../automation/runner/bounded-responses.mjs';
const sqlstate=code=>e=>e.code===code;

test('worker gate is disabled; new tables and RPCs deny browser/anonymous access',async()=>{
 const f=await workerFixture();try{
  await assert.rejects(()=>f.submit(),sqlstate('PT412'));
  for(const role of ['anon','authenticated']){
   await f.db.exec('reset role;set role '+role);
   for(const table of ['worker_runs','worker_evidence'])await assert.rejects(()=>f.db.query('select * from studio.'+table),sqlstate('42501'));
   await assert.rejects(()=>f.claim(),sqlstate('42501'));
  }
 }finally{await f.db.close();}
});
test('submission reserves budget atomically and binds immutable reviewed input',async()=>{
 const f=await workerFixture();try{
  await f.enable();const job=await f.submit();assert.equal(job.execution_mode,'real');assert.equal(job.state,'queued');
  assert.deepEqual(await f.submit(),job);assert.equal((await f.db.query('select count(*)::int n from studio.budget_jobs')).rows[0].n,1);
  await assert.rejects(()=>f.rpc('submit_worker_job',{...f.submission,p_input_review:randomUUID()}),sqlstate('PT409'));
  await assert.rejects(()=>f.rpc('submit_worker_job',{...f.submission,p_input:f.submission.p_input+'x'}),sqlstate('PT400'));
  const next={...f.submission,p_client:randomUUID(),p_job:randomUUID(),p_idempotency:randomUUID()};
  await assert.rejects(()=>f.rpc('submit_worker_job',next),sqlstate('PT423'));
  const counts=(await f.db.query('select (select count(*) from studio.jobs)::int jobs,(select count(*) from studio.messages)::int messages')).rows[0];assert.deepEqual(counts,{jobs:1,messages:1});
 }finally{await f.db.close();}
});
test('pre-migration mock request remains byte-for-byte equivalent and advances through its existing RPC',async()=>{
 const f=await workerFixture({legacy:true});try{
  assert.deepEqual(f.preserved.after,f.preserved.before);
  const job=await f.rpc('transition_mock_job',{p_owner:f.preserved.ownerId,p_job:f.preserved.jobId,p_expected:0,p_command_id:randomUUID(),p_command:'advance',p_state:'running',p_phase:'source_review',p_error:null});
  assert.equal(job.execution_mode,'mock');assert.equal(job.state,'running');assert.equal(job.run_id,'mock:'+job.id);
  assert.equal((await f.db.query('select count(*)::int n from studio.worker_runs')).rows[0].n,0);
 }finally{await f.db.close();}
});
test('one verified run binding, no rerun attempt or duplicate claim, live cancellation invalidates checkpoint',async()=>{
 const f=await workerFixture();try{
  await f.enable();await f.submit();await f.bind();await f.bind();
  await assert.rejects(()=>f.rpc('bind_worker_run',{...f.identity,p_run:102}),sqlstate('PT409'));
  await assert.rejects(()=>f.rpc('bind_worker_run',{...f.identity,p_attempt:2}),sqlstate('PT400'));
  await assert.rejects(()=>f.rpc('claim_worker_run',{...f.identity,p_hash:'b'.repeat(64)}),sqlstate('PT403'));
  assert.equal((await f.claim()).claimed,true);assert.equal((await f.claim()).claimed,false);assert.equal(await f.checkpoint(),true);
  const cancel={p_owner:f.ownerId,p_job:f.jobId,p_expected:1,p_command:randomUUID()};
  await assert.rejects(()=>f.rpc('cancel_worker_job',{...cancel,p_owner:randomUUID()}),sqlstate('PT404'));
  assert.equal((await f.rpc('cancel_worker_job',cancel)).state,'cancel_requested');await f.rpc('cancel_worker_job',cancel);
  assert.equal(await f.checkpoint(),false);await assert.rejects(()=>f.append({kind:'candidate',candidateHash:'a'.repeat(64),attempt:0}),sqlstate('PT409'));
  assert.equal((await f.finish('failed',null,'JOB_NOT_ACTIVE')).state,'cancelled');
  assert.equal((await f.db.query('select state from studio.budget_jobs')).rows[0].state,'closed');
 }finally{await f.db.close();}
});
test('queued cancellation closes unused budget; unknown charged calls retain money and block the next job',async()=>{
 const f=await workerFixture();try{
  await f.enable();await f.submit();await f.bind();
  const result=await f.rpc('cancel_worker_job',{p_owner:f.ownerId,p_job:f.jobId,p_expected:0,p_command:randomUUID()});assert.equal(result.state,'cancelled');
  assert.equal((await f.claim()).claimed,false);assert.equal((await f.db.query('select state from studio.budget_jobs')).rows[0].state,'closed');
 }finally{await f.db.close();}
 const g=await workerFixture();try{
  await g.enable();await g.submit();await g.bind();await g.claim();const call=randomUUID();
  await g.rpc('reserve_ai_call',{p_job:g.jobId,p_call:call,p_hash:'a'.repeat(64),p_role:'developer',p_max_usd_micros:10000});
  const result=await g.finish('failed',null,'PROVIDER_CONNECTION_UNCERTAIN');assert.equal(result.error_code,'COST_UNCERTAIN');
  const budget=(await g.db.query('select state,held_usd_micros from studio.budget_jobs')).rows[0];assert.deepEqual(budget,{state:'uncertain',held_usd_micros:10000});
  await assert.rejects(()=>g.rpc('submit_worker_job',{...g.submission,p_client:randomUUID(),p_job:randomUUID(),p_idempotency:randomUUID()}),sqlstate('PT423'));
  assert.equal((await g.db.query('select count(*)::int n from studio.jobs')).rows[0].n,1);
 }finally{await g.db.close();}
});
test('evidence receipts are immutable and replay-safe; uncharged role output is rejected',async()=>{
 const f=await workerFixture();try{
  await f.enable();await f.submit();await f.bind();await f.claim();
  const id=randomUUID(),body={kind:'candidate',candidateHash:'a'.repeat(64),attempt:0};
  assert.equal((await f.append(body,id)).newEvent,true);assert.equal((await f.append(body,id)).newEvent,false);
  await assert.rejects(()=>f.append({...body,candidateHash:'b'.repeat(64)},id),sqlstate('PT409'));
  await assert.rejects(()=>f.append({kind:'role_output',role:'developer',callId:randomUUID(),output:'unpaid'}),sqlstate('PT409'));
  assert.equal((await f.db.query('select event_count from studio.worker_runs')).rows[0].event_count,1);
  await f.db.exec('reset role;update studio.worker_runs set event_count=40;set role service_role;');
  await assert.rejects(()=>f.append(body),sqlstate('PT429'));
 }finally{await f.db.close();}
});
test('human-review transition requires ordered evidence for the same candidate and checks version',async()=>{
 const f=await workerFixture();try{
  await f.enable();await f.submit();await f.bind();await f.claim();const candidateHash='a'.repeat(64),checksHash='b'.repeat(64);
  await assert.rejects(()=>f.finish('candidate_for_human_review',candidateHash,null),sqlstate('PT409'));
  await f.append({kind:'candidate',candidateHash,attempt:0});
  const evidence={candidateHash,sourceSnapshotHash:f.sourceSnapshotHash,checksHash,checks:{runtime:'pass',contract:'pass'},issues:[]};
  await f.append({kind:'runtime_evidence',attempt:0,evidence});
  const review={candidateHash,status:'pass',checks:{science:'pass',learning:'pass',curriculum:'pass',textbook:'pass'},blockingIssues:[]};
  await f.append({kind:'review',attempt:0,checksHash:'c'.repeat(64),review});
  await assert.rejects(()=>f.finish('candidate_for_human_review',candidateHash,null),sqlstate('PT409'));
  await f.append({kind:'review',attempt:0,checksHash,review});
  const finished=await f.finish('candidate_for_human_review',candidateHash,null);assert.equal(finished.state,'awaiting_approval');
  assert.deepEqual(await f.finish('candidate_for_human_review',candidateHash,null),finished);
  assert.equal((await f.db.query('select count(*)::int n from studio.approvals')).rows[0].n,0);
  assert.equal((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n,0);
 }finally{await f.db.close();}
});
test('stored pipeline integrates five stateless provider calls with SQL budgets, private evidence and finish',async()=>{
 const f=await workerFixture();try{
  await f.enable();await f.submit();await f.bind();
  const store=createWorkerStore(f.client,{jobId:f.jobId,runId:101,runAttempt:1,sourceSnapshotHash:f.sourceSnapshotHash});
  const roles=['curriculum','subject','design','developer','reviewer'];let index=0,requests=0;
  const call=createBoundedResponses({apiKey:'sk-'+'fixture-only'.repeat(3),ledger:createBudgetLedger(f.client),now:()=>Date.parse('2026-10-04T00:00:00Z'),transport:async(url,options)=>{
   requests++;if(url.endsWith('/input_tokens'))return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:100}));
   const role=roles[index++],input=JSON.parse(JSON.parse(options.body).input[1].content);let value;
   if(role==='developer')value={files:[{path:'meta.json',content:JSON.stringify(f.meta)},{path:'index.html',content:'<!doctype html><canvas></canvas>'}]};
   else if(role==='design')value={status:'pass',plan:'Synthetic design.',blockingIssues:[]};
   else if(role==='reviewer')value={status:'pass',candidateHash:input.candidate.candidateHash,checks:{science:'pass',learning:'pass',curriculum:'pass',textbook:'pass'},findings:[],blockingIssues:[]};
   else value={status:'pass',findings:[],blockingIssues:[]};
   return new Response(JSON.stringify({model:PRICING.model,service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:200},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
  }});
  const args={jobId:f.jobId,input:f.input,context:f.context};
  const verify=async({candidate,sourceSnapshotHash})=>({candidateHash:candidate.candidateHash,sourceSnapshotHash,checksHash:'a'.repeat(64),checks:{runtime:'pass',contract:'pass'},issues:[]});
  const result=await executeStoredPipeline(args,{store,call,verify});assert.equal(result.job.state,'awaiting_approval');assert.equal(requests,10);assert.equal(result.result.calls,5);
  const budget=(await f.db.query('select state,call_count,spent_usd_micros,held_usd_micros from studio.budget_jobs')).rows[0];assert.deepEqual(budget,{state:'closed',call_count:5,spent_usd_micros:4875,held_usd_micros:0});
  assert.equal((await f.db.query('select count(*)::int n from studio.worker_evidence')).rows[0].n,8);
  await assert.rejects(()=>executeStoredPipeline(args,{store,call,verify}));assert.equal(requests,10);
 }finally{await f.db.close();}
});
test('missing attempt cannot satisfy review evidence and a last-moment cancellation wins over completion',async()=>{
 const f=await workerFixture();try{
  await f.enable();await f.submit();await f.bind();await f.claim();const candidateHash='a'.repeat(64),checksHash='b'.repeat(64);
  await f.append({kind:'candidate',candidateHash});
  await f.append({kind:'runtime_evidence',evidence:{candidateHash,sourceSnapshotHash:f.sourceSnapshotHash,checksHash,checks:{runtime:'pass',contract:'pass'},issues:[]}});
  await f.append({kind:'review',checksHash,review:{candidateHash,status:'pass',checks:{science:'pass',learning:'pass',curriculum:'pass',textbook:'pass'},blockingIssues:[]}});
  await assert.rejects(()=>f.finish('candidate_for_human_review',candidateHash,null),sqlstate('PT409'));
  await f.rpc('cancel_worker_job',{p_owner:f.ownerId,p_job:f.jobId,p_expected:1,p_command:randomUUID()});
  assert.equal((await f.finish('candidate_for_human_review',candidateHash,null)).state,'cancelled');
  assert.equal((await f.db.query('select state from studio.budget_jobs')).rows[0].state,'closed');
 }finally{await f.db.close();}
});
