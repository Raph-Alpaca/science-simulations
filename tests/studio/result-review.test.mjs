import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resultFixture} from './result-review-fixture.mjs';
import {inspectWorkerResult,createResultReviewService} from '../../apps/studio/lib/result-review.mjs';
const feedback=(version,more={})=>({version,decision:'request_changes',note:'초기화와 변수 설명을 더 분명하게 해 주세요.',clientRequestId:randomUUID(),...more});

test('result projects exact candidate, separate model reviews, actual report shape and all failed repair attempts, without granting publication',async()=>{
 const f=await resultFixture({repair:true});try{
  const {result}=await f.service.read(f.jobId);assert.equal(result.state,'awaiting_approval');assert.equal(result.attempts.length,2);
  assert.equal(result.attempts[0].runtime.checks.runtime,'fail');assert.equal(result.attempts[1].runtime.checks.runtime,'pass');assert.equal(result.initialReviews.length,3);
  assert.equal(result.version.candidateHash,f.candidate.candidateHash);assert.equal(result.budget.calls,7);assert.equal(result.budget.spentUsdMicros,7000);assert.equal(result.feedbackAllowed,true);
  assert.equal(result.publication.eligible,false);assert.ok(result.publication.blockers.includes('SOURCE_ORIGINALS_NOT_ATTESTED'));assert.ok(result.publication.blockers.includes('DEPLOY_ARTIFACT_NOT_PREPARED'));
  assert.equal(JSON.stringify(result).includes('<script>'),false);assert.equal('owner_id' in result,false);
  const file=await f.service.file(f.jobId,{version:result.version,path:'index.html'});assert.ok(file.file.content.includes('<script>'));assert.equal(file.file.hash,result.candidate.files.find(f=>f.path==='index.html').hash);
  for(const changed of [{...result.version,candidateHash:'b'.repeat(64)},{...result.version,evidenceHash:'b'.repeat(64)}])await assert.rejects(f.service.file(f.jobId,{version:changed,path:'index.html'}),/RESULT_CHANGED/);
  await assert.rejects(f.service.file(f.jobId,{version:result.version,path:'../.env.local'}),/INVALID_REQUEST/);
 }finally{await f.db.close();}
});
test('source hold with no candidate shows the missing evidence and permits a note, never a change request or approval',async()=>{
 const f=await resultFixture({missing:true});try{
  const {result}=await f.service.read(f.jobId);assert.equal(result.candidate,null);assert.equal(result.reason,'CURRICULUM_EVIDENCE_REQUIRED');assert.equal(result.initialReviews[0].status,'needs_evidence');
  await assert.rejects(f.service.feedback(f.jobId,feedback(result.version)),/INVALID_REQUEST/);
  const saved=await f.service.feedback(f.jobId,feedback(result.version,{decision:'note'}));assert.equal(saved.feedback.candidate_hash,null);
  await assert.rejects(f.service.feedback(f.jobId,feedback(result.version,{decision:'approve'})),/INVALID_REQUEST/);
  assert.equal((await f.db.query('select count(*)::int n from studio.approvals')).rows[0].n,0);
 }finally{await f.db.close();}
});
test('feedback deduplicates simultaneous submissions, binds every version dimension, stays immutable and makes no new paid job',async()=>{
 const f=await resultFixture();try{
  const {result}=await f.service.read(f.jobId),body=feedback(result.version);
  const [a,b]=await Promise.all([f.service.feedback(f.jobId,body),f.service.feedback(f.jobId,body)]);assert.equal(a.feedback.id,b.feedback.id);
  assert.equal((await f.service.feedback(f.jobId,body)).feedback.id,a.feedback.id);
  await assert.rejects(f.service.feedback(f.jobId,{...body,note:'다른 내용'}),/RESULT_CHANGED/);
  for(const changed of [{stateVersion:99},{sourceHash:'b'.repeat(64)},{candidateHash:'b'.repeat(64)},{evidenceHash:'b'.repeat(64)}])await assert.rejects(f.service.feedback(f.jobId,feedback({...result.version,...changed})),/RESULT_CHANGED/);
  await assert.rejects(f.service.feedback(f.jobId,feedback(result.version,{note:'sk-'+'a'.repeat(40)})),/INPUT_CONTAINS_PRIVATE_DATA/);
  const read=await f.service.read(f.jobId);assert.equal(read.result.feedback.length,1);assert.equal(read.result.state,'awaiting_approval');assert.equal(read.result.budget.calls,5);
  assert.equal((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n,1);
  await assert.rejects(f.db.query("update studio.result_feedback set note='changed'"),e=>e.code==='42501');await assert.rejects(f.db.query('delete from studio.result_feedback'),e=>e.code==='42501');
  for(let n=1;n<20;n++)await f.service.feedback(f.jobId,feedback(result.version,{note:'합성 메모 '+n,decision:'note'}));
  await assert.rejects(f.service.feedback(f.jobId,feedback(result.version)),/RESULT_FEEDBACK_LIMIT/);
  assert.equal((await f.service.feedback(f.jobId,body)).feedback.id,a.feedback.id);
 }finally{await f.db.close();}
});
test('owner isolation, disabled capability, active worker, browser roles and deleted conversation cannot write result decisions',async()=>{
 const f=await resultFixture({finish:false});try{
  const {result}=await f.service.read(f.jobId);assert.equal(result.feedbackAllowed,false);await assert.rejects(f.service.feedback(f.jobId,feedback(result.version)),/RESULT_CHANGED/);
  const disabled=createResultReviewService({db:{rpc(){throw Error('MUST_NOT_QUERY');}},ownerId:f.ownerId});assert.equal(await disabled.capability(),false);await assert.rejects(disabled.read(f.jobId),/RESULT_SETUP_REQUIRED/);
  assert.equal(await f.rpc('read_worker_result',{p_owner:randomUUID(),p_job:f.jobId}),null);
  for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(f.db.query('select * from studio.result_feedback'),e=>e.code==='42501');await assert.rejects(f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId}),e=>e.code==='42501');}
  await f.db.exec('reset role');await f.db.query('update studio.conversations set deleted_at=now() where id=$1',[f.submission.p_conversation]);await f.db.exec('set role service_role');await assert.rejects(f.service.read(f.jobId),/NOT_FOUND/);
 }finally{await f.db.close();}
});
test('inert result validation detects rewritten bytes, different source and stale checks instead of trusting a pass flag',async()=>{
 const f=await resultFixture();try{
  const snapshot=await f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId});
  for(const mutate of [s=>{s.evidence[0].body+=' ';},s=>{s.worker.source_hash='b'.repeat(64);},s=>{s.evidence_hash='b'.repeat(64);},s=>{s.worker.verified_sha='b'.repeat(40);},s=>{s.worker.candidate_hash='b'.repeat(64);}]){const value=structuredClone(snapshot);mutate(value);assert.throws(()=>inspectWorkerResult(value),/RESULT_RECORD_INVALID/);}
 }finally{await f.db.close();}
});
