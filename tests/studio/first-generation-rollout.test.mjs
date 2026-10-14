import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {workerFixture} from './worker-fixture.mjs';
import {createInputReviewService} from '../../apps/studio/lib/input-review.mjs';
import {firstGenerationSql,STOP_FIRST_GENERATION_SQL} from '../../automation/studio/first-generation-rollout.mjs';
import {backupScope,FOUNDATION_TABLES,PUBLICATION_TABLES} from '../../automation/studio/backup-scope.mjs';

test('first-run SQL rejects unbounded times and untrusted identifiers; backup covers all 26 tables',()=>{
 const now=Date.now(),base={reviewId:randomUUID(),sourceHash:'a'.repeat(64),admitUntil:new Date(now+1800000).toISOString()};
 for(const delta of [{reviewId:"');select 1;--"},{sourceHash:'a'.repeat(63)},{admitUntil:new Date(now-1).toISOString()},{admitUntil:new Date(now+3600001).toISOString()}])assert.throws(()=>firstGenerationSql({...base,...delta},now),/SCOPE_INVALID/);
 assert.deepEqual([...backupScope('publication-foundation')],[...FOUNDATION_TABLES,...PUBLICATION_TABLES].sort());
 assert.equal(backupScope('publication-foundation').length,26);
});

test('first-run activation requires consent, admits exact input once, and stop preserves settlement',async()=>{
 const f=await workerFixture({auth:true});
 try{
  await f.db.exec('reset role');
  for(const name of ['studio_runner_v1','studio_input_review_v1','studio_dispatch_v1'])await f.db.exec(readFileSync('supabase/proposals/'+name+'.sql','utf8'));
  await f.db.exec('set role service_role');
  const input=createInputReviewService({db:f.client.schema('studio'),ownerId:f.ownerId,enabled:true});
  const prepare=async()=> (await input.prepare({conversationId:f.submission.p_conversation,clientRequestId:randomUUID(),topic:'Synthetic first job',grade:3,unit:'Synthetic unit',requirements:'Synthetic only. No paid model or real source review.',generationKind:'interactive_2d',sources:[]})).review;
  const target=await prepare(),other=await prepare();
  const sql=firstGenerationSql({reviewId:target.id,sourceHash:target.sourceHash,admitUntil:new Date(Date.now()+1800000).toISOString()});
  await f.db.exec('reset role');
  await assert.rejects(f.db.exec(sql),/CONSENT_REQUIRED/);await f.db.exec('rollback;set role service_role');
  for(const r of [target,other])await input.approve(r.id,{sourceHash:r.sourceHash,rightsConfirmed:true,budgetAccepted:true});
  await f.db.exec('reset role');await f.db.exec(sql);await f.db.exec('set role service_role');
  await assert.rejects(input.submit(other.id,other.sourceHash),e=>e.code==='REAL_EXECUTION_UNAVAILABLE');
  const {job}=await input.submit(target.id,target.sourceHash);
  assert.equal((await input.submit(target.id,target.sourceHash)).job.id,job.id);
  assert.equal((await f.db.query('select count(*)::integer n from studio.worker_runs')).rows[0].n,1);
  await f.rpc('bind_worker_run',{p_job:job.id,p_run:101,p_attempt:1});
  await f.rpc('claim_worker_run',{p_job:job.id,p_run:101,p_attempt:1,p_hash:target.sourceHash});
  const call=randomUUID(),reserve={p_job:job.id,p_call:call,p_hash:'b'.repeat(64),p_role:'curriculum',p_max_usd_micros:1000};
  await f.rpc('reserve_ai_call',reserve);
  await f.db.exec('reset role');await f.db.exec(STOP_FIRST_GENERATION_SQL);await f.db.exec('set role service_role');
  assert.equal(await f.rpc('worker_execution_enabled',{}),false);
  assert.equal(await f.rpc('dispatch_execution_enabled',{}),false);
  await assert.rejects(f.rpc('reserve_ai_call',{...reserve,p_call:randomUUID()}),e=>e.code==='PT412');
  const settled=await f.rpc('settle_ai_call',{p_job:job.id,p_call:call,p_charged_usd_micros:400,p_uncertain:false});
  assert.equal(settled.state,'settled');
  await f.rpc('finish_worker_run',{p_job:job.id,p_run:101,p_attempt:1,p_outcome:'needs_input',p_candidate:null,p_reason:'SYNTHETIC_END'});
  // Even after the first job closes, reopening switches cannot admit job two.
  await f.enable();
  await assert.rejects(input.submit(other.id,other.sourceHash),e=>e.code==='REAL_EXECUTION_UNAVAILABLE');
  assert.equal((await f.db.query('select count(*)::integer n from studio.worker_runs')).rows[0].n,1);
  await f.db.exec('reset role');await assert.rejects(f.db.exec(sql),/PREFLIGHT_FAILED/);await f.db.exec('rollback');
 }finally{await f.db.close();}
});
