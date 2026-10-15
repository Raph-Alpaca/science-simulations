import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {workerFixture} from './worker-fixture.mjs';
import {preparationFixture,insertPreparation} from './preparation-fixture.mjs';
import {createInputReviewService,INPUT_CONSENT,prepareInputReview,attachSourcePreparation} from '../../apps/studio/lib/input-review.mjs';
import {prepareSourceEvidence} from '../../packages/contracts/preparation-evidence.js';
import {hash} from '../../packages/contracts/content-source.js';

async function fixture({seed=true}={}){
 const f=await workerFixture();await f.db.exec('reset role');
 for(const name of ['studio_input_review_v1','studio_preparation_sources_v1','studio_preparation_admission_v1'])await f.db.exec(readFileSync('supabase/proposals/'+name+'.sql','utf8'));
 const evidence=preparationFixture(f.ownerId);
 if(seed)for(let i=0;i<3;i++)await insertPreparation(f.db,evidence.scope.sources[i],evidence.records[i]);
 await f.db.exec('set role service_role');
 const service=createInputReviewService({db:f.client.schema('studio'),ownerId:f.ownerId,enabled:true,preparationEnabled:true});
 const body={conversationId:f.submission.p_conversation,clientRequestId:randomUUID(),topic:'합성 유전 과제',grade:3,unit:'합성 단원',requirements:'합성 검사이며 실제 근거로 사용하지 않습니다.',generationKind:'interactive_2d',sources:evidence.scope.sources.map(({id,...s})=>s)};
 const consent=r=>f.rpc('approve_worker_input',{p_owner:f.ownerId,p_review:r.id,p_hash:r.sourceHash,p_consent:INPUT_CONSENT});
 const submit=r=>f.rpc('submit_reviewed_worker_job',{p_owner:f.ownerId,p_review:r.id,p_hash:r.sourceHash});
 return {...f,...evidence,service,body,consent,submit};
}
async function assertNoReservation(f){for(const table of ['jobs','worker_runs','budget_jobs','budget_calls'])assert.equal((await f.db.query('select count(*)::int n from studio.'+table)).rows[0].n,0,table);}

test('missing evidence is visible before consent; even direct SQL admission rolls back every reservation',async()=>{
 const f=await fixture({seed:false});try{
  assert.equal(await f.service.capability(),true);const {review}=await f.service.prepare(f.body);
  assert.equal(review.sourceReadiness.state,'needs_evidence');assert.equal(review.sourceReadiness.missingSourceIds.length,3);
  await assert.rejects(f.service.approve(review.id,{sourceHash:review.sourceHash,rightsConfirmed:true,budgetAccepted:true}),/SOURCE_EVIDENCE_REQUIRED/);
  await f.enable();await f.consent(review);await assert.rejects(f.submit(review),e=>e.code==='PT422');await assertNoReservation(f);
  assert.equal((await f.service.read(review.id)).review.state,'approved');
 }finally{await f.db.close();}
});
test('consented source packet is delivered exactly; revoked records cannot create another job, consumed retries stay idempotent',async()=>{
 const f=await fixture();try{
  const {review}=await f.service.prepare(f.body);assert.equal(review.sourceReadiness.state,'ready');
  assert.equal(review.sourcePreparation.reviewScope,'general_concepts');
  await f.service.approve(review.id,{sourceHash:review.sourceHash,rightsConfirmed:true,budgetAccepted:true});await f.enable();
  const first=await f.service.submit(review.id,review.sourceHash);
  const row=(await f.db.query('select approved_input,source_snapshot_hash from studio.worker_runs')).rows[0];
  assert.equal(row.source_snapshot_hash,review.sourceHash);assert.equal(hash(row.approved_input),review.sourceHash);
  assert.deepEqual(JSON.parse(row.approved_input).context.sourcePreparation,review.sourcePreparation);
  await f.db.exec('reset role');await f.db.query('update studio.preparation_sources set revoked_at=now() where id=$1',[f.records[0].recordId]);await f.db.exec('set role service_role');
  assert.equal((await f.service.read(review.id)).review.sourceReadiness.state,'needs_evidence');
  assert.equal((await f.service.submit(review.id,review.sourceHash)).job.id,first.job.id);
  assert.equal((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n,1);
 }finally{await f.db.close();}
});
test('revocation or replacement after consent blocks both application and direct SQL without consuming input',async()=>{
 const f=await fixture();try{
  const {review}=await f.service.prepare(f.body);await f.consent(review);await f.enable();
  await f.db.exec('reset role');await f.db.query('update studio.preparation_sources set revoked_at=now() where id=$1',[f.records[0].recordId]);
  await insertPreparation(f.db,f.scope.sources[0],{...f.records[0],recordId:randomUUID()});await f.db.exec('set role service_role');
  const current=(await f.service.read(review.id)).review;assert.equal(current.sourceReadiness.changed,true);
  await assert.rejects(f.service.submit(review.id,review.sourceHash),/SOURCE_EVIDENCE_REQUIRED/);
  await assert.rejects(f.submit(review),e=>e.code==='PT422');await assertNoReservation(f);
  assert.equal((await f.service.read(review.id)).review.state,'approved');
 }finally{await f.db.close();}
});
test('revocation after admission blocks a new provider reservation while preserving settlement and duplicate receipts',async()=>{
 const f=await fixture();try{
  const {review}=await f.service.prepare(f.body);await f.consent(review);await f.enable();
  const job=await f.submit(review),callId=randomUUID();
  const args={p_job:job.id,p_call:callId,p_hash:'b'.repeat(64),p_role:'curriculum',p_max_usd_micros:100};
  assert.equal((await f.rpc('reserve_ai_call',args)).newReservation,true);
  await f.db.exec('reset role');await f.db.query('update studio.preparation_sources set revoked_at=now() where id=$1',[f.records[0].recordId]);await f.db.exec('set role service_role');
  assert.equal((await f.rpc('reserve_ai_call',args)).newReservation,false);
  await f.rpc('settle_ai_call',{p_job:job.id,p_call:callId,p_charged_usd_micros:20,p_uncertain:false});
  await assert.rejects(f.rpc('reserve_ai_call',{...args,p_call:randomUUID()}),e=>e.code==='PT422');
  const budget=(await f.db.query('select call_count,held_usd_micros,spent_usd_micros from studio.budget_jobs where job_id=$1',[job.id])).rows[0];
  assert.equal(Number(budget.call_count),1);assert.equal(Number(budget.held_usd_micros),0);assert.equal(Number(budget.spent_usd_micros),20);
  assert.equal((await f.db.query('select count(*)::int n from studio.budget_calls')).rows[0].n,1);
 }finally{await f.db.close();}
});
test('forged scope, broader findings, expired record and legacy packet cannot bypass the DB guard',async()=>{
 const f=await fixture();try{
  const p=prepareInputReview(f.body,f.ownerId),e=prepareSourceEvidence(f.scope,f.records);
  const valid=JSON.parse(attachSourcePreparation(p,e).inputText);
  for(const change of [s=>delete s.context.sourcePreparation,s=>s.context.sourcePreparation.reviewScope='selected_textbook',s=>s.context.sourcePreparation.records[0].checkedScope='Forged broad verification',s=>s.context.sources[0].summary='different',s=>s.context.sourcePreparation.records[0].recordId=randomUUID()]){
   const invalid=structuredClone(valid);change(invalid);await assert.rejects(f.rpc('assert_preparation_input',{p_owner:f.ownerId,p_input:JSON.stringify(invalid)}),e=>e.code==='PT422');
  }
  const old=preparationFixture(f.ownerId,Date.now()-172800000);old.scope.sources[0].summary='expired source';
  const {preparationSourceFingerprint}=await import('../../packages/contracts/preparation-evidence.js');old.records[0].sourceFingerprint=preparationSourceFingerprint(old.scope.sources[0]);
  await f.db.exec('reset role');await insertPreparation(f.db,old.scope.sources[0],old.records[0]);await f.db.exec('set role service_role');
  const mixed=prepareSourceEvidence({...f.scope,sources:[old.scope.sources[0],...f.scope.sources.slice(1)]},[old.records[0],...f.records.slice(1)],{now:Date.now()-172800000});
  // Build the exact expired authority packet independently of the ready filter.
  const expired=structuredClone(valid);expired.context.sources[0]=old.scope.sources[0];expired.context.sourcePreparation.records[0]={...valid.context.sourcePreparation.records[0],...Object.fromEntries(Object.entries(old.records[0]).filter(([k])=>k in valid.context.sourcePreparation.records[0]))};
  assert.equal(mixed.state,'needs_evidence');await assert.rejects(f.rpc('assert_preparation_input',{p_owner:f.ownerId,p_input:JSON.stringify(expired)}),e=>e.code==='PT422');
  await assertNoReservation(f);
 }finally{await f.db.close();}
});
