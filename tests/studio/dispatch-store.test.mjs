import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {workerFixture} from './worker-fixture.mjs';
import {createInputReviewService} from '../../apps/studio/lib/input-review.mjs';
import {createDispatchService} from '../../apps/studio/lib/dispatch-service.mjs';
import {syntheticDispatchEnv,syntheticGitHub} from './github-dispatch-fixture.mjs';
async function fixture(options={}){
 const f=await workerFixture({auth:true});
 await f.db.exec('reset role');
 for(const n of ['studio_runner_v1','studio_input_review_v1','studio_dispatch_v1'])await f.db.exec(readFileSync('supabase/proposals/'+n+'.sql','utf8'));
 await f.db.exec('set role service_role');
 const db=f.client.schema('studio'),input=createInputReviewService({db,ownerId:f.ownerId,enabled:true});
 const {review}=await input.prepare({conversationId:f.submission.p_conversation,clientRequestId:randomUUID(),topic:'Synthetic shapes',grade:3,unit:'Synthetic unit',requirements:'Synthetic dispatch only, no actual model.',generationKind:'interactive_3d',sources:[]});
 await input.approve(review.id,{sourceHash:review.sourceHash,rightsConfirmed:true,budgetAccepted:true});
 const provider=syntheticGitHub(options),dispatch=createDispatchService({db,ownerId:f.ownerId,env:syntheticDispatchEnv,transport:provider.transport});
 const activate=async()=>{await f.enable();await f.db.exec("reset role;create or replace function studio.dispatch_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;set role service_role;");};
 return {...f,dbClient:db,input,review,provider,dispatch,activate,start:()=>dispatch.start(review.id,{sourceHash:review.sourceHash})};
}
const countPosts=f=>f.provider.calls.filter(c=>c.endpoint.endsWith('/dispatches')).length;
const one=async(f,table)=>(await f.db.query('select * from studio.'+table)).rows[0];
test('dispatch default closed; approved input remains unconsumed and no budget/network exists',async()=>{
 const f=await fixture();try{
  assert.equal(await f.dispatch.capability(),false);await assert.rejects(f.start(),/REAL_EXECUTION_UNAVAILABLE/);
  assert.equal((await one(f,'input_reviews')).state,'approved');assert.equal(await one(f,'budget_jobs'),undefined);assert.equal(f.provider.calls.length,0);
  for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(f.db.query('select * from studio.dispatch_intents'),e=>e.code==='42501');await assert.rejects(f.rpc('dispatch_execution_enabled',{}),e=>e.code==='42501');}
 }finally{await f.db.close();}
});
test('review submission, durable claim, scoped GitHub dispatch and verified run binding complete once across simultaneous clicks',async()=>{
 const f=await fixture();try{
  await f.activate();const results=await Promise.all([f.start(),f.start()]);assert.equal(countPosts(f),1);assert.equal(results[0].jobId,results[1].jobId);
  const d=await one(f,'dispatch_intents'),w=await one(f,'worker_runs');assert.equal(d.state,'submitted');assert.equal(String(d.run_id),'12345');assert.equal(String(w.workflow_run_id),'12345');assert.equal(w.verified_sha,'a'.repeat(40));assert.equal(d.source_snapshot_hash,f.review.sourceHash);
  await f.start();assert.equal(countPosts(f),1);assert.equal((await f.db.query('select count(*)::int n from studio.budget_jobs')).rows[0].n,1);
  const visible=await f.dispatch.read(results[0].jobId);assert.equal('claim_id' in visible.dispatch,false);assert.equal('owner_id' in visible.dispatch,false);
 }finally{await f.db.close();}
});
test('definite pre-POST failure closes unused budget, but counts the attempt and cannot be silently resent',async()=>{
 const f=await fixture({change:(e,r)=>e.endsWith('/heads/main')?{status:503,body:{}}:r});try{
  await f.activate();const result=await f.start();assert.equal(result.dispatch.state,'failed');assert.equal(countPosts(f),0);assert.equal((await one(f,'jobs')).state,'failed');assert.equal((await one(f,'budget_jobs')).state,'closed');assert.equal((await one(f,'budget_jobs')).spent_usd_micros,0);
  await f.start();assert.equal(f.provider.calls.filter(c=>c.endpoint.endsWith('/access_tokens')).length,1);
 }finally{await f.db.close();}
});
test('ambiguous dispatch is held even after lease expiry, preserves reservation and permits explicit queued cancellation',async()=>{
 const f=await fixture({fail:'/repos/Raph-Alpaca/science-simulations/actions/workflows/studio-worker.yml/dispatches'});try{
  await f.activate();const result=await f.start();assert.equal(result.dispatch.state,'uncertain');assert.equal(countPosts(f),1);assert.equal((await one(f,'budget_jobs')).state,'active');assert.equal((await one(f,'worker_runs')).workflow_run_id,null);
  await f.db.exec("update studio.dispatch_intents set lease_until=now()-interval '1 day'");await f.start();assert.equal(countPosts(f),1);
  await f.rpc('cancel_worker_job',{p_owner:f.ownerId,p_job:result.jobId,p_expected:0,p_command:randomUUID()});
  assert.equal((await one(f,'dispatch_intents')).state,'cancelled');assert.equal((await one(f,'budget_jobs')).state,'closed');await f.start();assert.equal(countPosts(f),1);
 }finally{await f.db.close();}
});
test('cancellation during POST wins over a later verified response and leaves no input-capable worker binding',async()=>{
 let f;f=await fixture({afterPost:async()=>{const j=await one(f,'jobs');await f.rpc('cancel_worker_job',{p_owner:f.ownerId,p_job:j.id,p_expected:0,p_command:randomUUID()});}});try{
  await f.activate();const result=await f.start();assert.equal(result.dispatch.state,'cancelled');assert.equal(String(result.dispatch.run_id),'12345');assert.equal((await one(f,'worker_runs')).workflow_run_id,null);assert.equal((await one(f,'jobs')).state,'cancelled');assert.equal((await one(f,'budget_jobs')).state,'closed');
  await assert.rejects(f.rpc('claim_worker_run',{p_job:result.jobId,p_run:12345,p_attempt:1,p_hash:f.review.sourceHash}),e=>e.code==='PT403');
 }finally{await f.db.close();}
});
test('lost DB finish acknowledgement cannot resend; owner isolation, forged claim and different duplicate receipt fail',async()=>{
 const f=await fixture();try{
  await f.activate();const original=f.dbClient.rpc;
  f.dbClient.rpc=function(name,args){const call=original(name,args);if(name!=='finish_dispatch_intent')return call;return {async abortSignal(signal){await call.abortSignal(signal);throw Error('synthetic lost acknowledgement');}};};
  const service=createDispatchService({db:f.dbClient,ownerId:f.ownerId,env:syntheticDispatchEnv,transport:f.provider.transport});
  await assert.rejects(service.start(f.review.id,{sourceHash:f.review.sourceHash}),/DISPATCH_UNAVAILABLE/);const d=await one(f,'dispatch_intents');assert.equal(d.state,'submitted');
  await f.start();assert.equal(countPosts(f),1);
  const params={p_owner:f.ownerId,p_job:d.job_id,p_claim:d.claim_id,p_state:'submitted',p_run:12345,p_sha:'a'.repeat(40),p_observed:null};
  assert.equal((await f.rpc('finish_dispatch_intent',params)).state,'submitted');
  await assert.rejects(f.rpc('finish_dispatch_intent',{...params,p_claim:randomUUID()}),e=>e.code==='PT403');
  await assert.rejects(f.rpc('finish_dispatch_intent',{...params,p_run:999}),e=>e.code==='PT409');
  await assert.rejects(f.rpc('read_dispatch_intent',{p_owner:randomUUID(),p_job:d.job_id}),e=>e.code==='PT403');
 }finally{await f.db.close();}
});
