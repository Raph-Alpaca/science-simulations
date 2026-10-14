import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicationCompletionFixture} from './publication-completion-fixture.mjs';
import {publicationAuthorityFixture} from './publication-authority-fixture.mjs';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRevisionService} from '../../apps/studio/lib/revision.mjs';
import {createInputReviewService} from '../../apps/studio/lib/input-review.mjs';
const count=async(f,table)=>(await f.db.query('select count(*)::int n from studio.'+table)).rows[0].n;
test('verified public files atomically record one release, advance catalog, publish job and release the global slot',async()=>{
 const f=await publicationCompletionFixture();try{
  const token=await f.deployToken(),response=await f.complete(undefined,token);assert.equal(response.status,200);const result=await response.json();assert.equal(result.published,true);assert.ok(result.releaseId);
  assert.equal(await count(f,'releases'),1);assert.equal((await f.db.query('select state from studio.jobs where id=$1',[f.jobId])).rows[0].state,'published');
  assert.equal((await f.db.query('select artifact_hash from studio.release_baseline')).rows[0].artifact_hash,f.intent.artifact_hash);
  const dispatch=await f.rpc('read_publication_dispatch',{p_owner:f.ownerId,p_approval:f.approval.id});assert.equal(dispatch.resolution,'verified');assert.ok(dispatch.completed_at);assert.equal(dispatch.publication.state,'published');assert.ok(dispatch.publication.publicUrl.startsWith('https://raph-alpaca.github.io/science-simulations/simulations/'));
  assert.equal((await f.complete(undefined,token)).status,409);const repeat=await f.complete();assert.equal(repeat.status,200);assert.deepEqual(await repeat.json(),result);assert.equal(await count(f,'releases'),1);
  assert.equal((await f.db.query("select count(*)::int n from studio.publication_dispatches where state in ('ready','claimed','submitted','uncertain') and completed_at is null")).rows[0].n,0);
  await assert.rejects(f.db.exec('delete from studio.releases'));await assert.rejects(f.db.exec('update studio.publication_outcomes set verified=false'));
 }finally{await f.db.close();}
});
test('published result supports a new teacher revision with fresh consent and preserves its verified release',async()=>{
 const f=await publicationCompletionFixture();try{
  assert.equal((await f.complete()).status,200);const {result}=await f.service.read(f.jobId);assert.equal(result.state,'published');assert.equal(result.feedbackAllowed,true);
  const {feedback}=await f.service.feedback(f.jobId,{version:result.version,decision:'request_changes',note:'검증 후 표시 설명을 보완해 주세요.',clientRequestId:randomUUID()});
  const db=f.client.schema('studio'),revision=createRevisionService({db,ownerId:f.ownerId,enabled:true}),inputs=createInputReviewService({db,ownerId:f.ownerId,enabled:true});
  const {review}=await revision.prepare(f.jobId,{version:result.version,feedbackId:feedback.id,clientRequestId:randomUUID()});
  assert.equal(await count(f,'jobs'),1);await inputs.approve(review.id,{sourceHash:review.sourceHash,rightsConfirmed:true,budgetAccepted:true});await inputs.submit(review.id,review.sourceHash);
  assert.equal(await count(f,'jobs'),2);assert.equal(await count(f,'releases'),1);assert.equal((await f.db.query('select state from studio.jobs where id=$1',[f.jobId])).rows[0].state,'published');
 }finally{await f.db.close();}
});
test('failed immutable runtime check releases a request that never consumed public authority',async()=>{
 const f=await publicationAuthorityFixture({passed:false,record:false});try{
  await f.admin(async()=>f.db.exec(await readFile('supabase/proposals/studio_publication_completion_v1.sql','utf8')));
  assert.equal((await f.send(f.report)).status,200);const dispatch=await f.rpc('read_publication_dispatch',{p_owner:f.ownerId,p_approval:f.approval.id});assert.equal(dispatch.resolution,'check_failed');assert.ok(dispatch.completed_at);assert.equal(dispatch.publication.state,'check_failed');
  await f.enableDeploy();assert.equal((await f.authorize()).status,409);assert.equal(await count(f,'releases'),0);assert.equal(await count(f,'publication_authorizations'),0);
 }finally{await f.db.close();}
});
test('uncertain deployment holds the slot; later matching observation can verify once without a new authority claim',async()=>{
 const f=await publicationCompletionFixture();try{
  const uncertain=structuredClone(f.outcome);Object.assign(uncertain.deployment,{status:'uncertain',errorCode:'PAGES_TRANSPORT_UNCERTAIN',statusRequests:0,deploymentId:null});uncertain.verification=null;
  const first=await f.complete(uncertain);assert.equal(first.status,200);assert.equal((await first.json()).published,false);assert.equal(await count(f,'releases'),0);
  assert.equal((await f.db.query('select completed_at from studio.publication_dispatches')).rows[0].completed_at,null);
  assert.equal((await f.complete()).status,200);assert.equal(await count(f,'publication_outcomes'),2);assert.equal(await count(f,'publication_authorizations'),1);assert.equal(await count(f,'releases'),1);
 }finally{await f.db.close();}
});
test('wrong role, claim and incomplete public-byte receipt cannot claim publication success',async()=>{
 const f=await publicationCompletionFixture();try{
  assert.equal((await f.request('complete',{outcome:f.outcome})).status,403);
  for(const change of [o=>{o.claimId='00000000-0000-0000-0000-000000000000';},o=>{o.verification.filesVerified--;},o=>{o.verification.bytesRead--;},o=>{o.verification.publicUrl='https://untrusted.invalid/';},o=>{o.verification.failureCode='raw private error';}]){const value=structuredClone(f.outcome);change(value);assert.equal((await f.complete(value)).status,409);}
  assert.equal(await count(f,'releases'),0);assert.equal(await count(f,'publication_outcomes'),0);
 }finally{await f.db.close();}
});
test('source withdrawal after authority consumption does not erase measured historical publication',async()=>{
 const f=await publicationCompletionFixture();try{
  await f.admin(()=>f.db.exec("update studio.source_reviews set revoked_at=clock_timestamp() where id='"+f.sourceId+"'"));
  assert.equal((await f.complete()).status,200);assert.equal(await count(f,'releases'),1);
  assert.equal(await f.rpc('release_review_current',{p_owner:f.ownerId,p_review:f.row.id}),false);
 }finally{await f.db.close();}
});
