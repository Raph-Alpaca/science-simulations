import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {hash} from '../../packages/contracts/content-source.js';
import {prepareReleaseReview} from '../../automation/publish/prepare-review.mjs';
import {createReleaseReviewIssuer} from '../../automation/publish/review-issuer.mjs';
import {releaseFixture} from './release-approval-fixture.mjs';

async function fixture(){
 const f=await releaseFixture();try{
  await f.admin(()=>f.db.exec(awaitSql));
  const sourceId=randomUUID();
  await f.admin(()=>f.db.query('insert into studio.source_reviews(id,job_id,owner_id,candidate_hash,source_hash,education_text,education_hash) values($1,$2,$3,$4,$5,$6,$7)',[sourceId,f.jobId,f.ownerId,f.row.candidate_hash,f.row.source_hash,f.row.education_text,f.row.education_hash]));
  const sourceReview=(await f.db.query('select to_jsonb(s) row from studio.source_reviews s where id=$1',[sourceId])).rows[0].row;
  const snapshot=await f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId});
  const input={snapshot,sourceReview,baseline:{enabled:true,artifact_text:f.base.artifactText,artifact_hash:f.base.artifactHash,lock_hash:f.row.lock_hash,policy_version:f.row.policy_version},ownerId:f.ownerId,reviewId:randomUUID()};
  const prepared=prepareReleaseReview(input),client=randomUUID();
  const command=(record=prepared.record,requestId=client,source=sourceId)=>({p_owner:f.ownerId,p_job:f.jobId,p_client:requestId,p_source_review:source,p_record:record});
  const issue=(record=prepared.record,requestId=client,source=sourceId)=>f.admin(()=>f.rpc('issue_release_review',command(record,requestId,source)));
  return {...f,input,catalogPrepared:f.prepared,prepared,sourceId,issueClient:client,command,issuePrepared:issue};
 }catch(error){await f.db.close();throw error;}
}
const awaitSql=await readFile('supabase/proposals/studio_release_preparation_v1.sql','utf8');

test('trusted preparation uses stored source evidence and exact result bytes; idempotent issuance does not create teacher approval',async()=>{
 const f=await fixture();try{
  assert.equal((await f.release.read(f.jobId)).publicationReview.current,false); // legacy unlinked record
  const a=await f.issuePrepared(),b=await f.issuePrepared();assert.deepEqual(a,b);assert.equal(a.current,true);
  const r=(await f.release.read(f.jobId)).publicationReview;assert.equal(r.id,a.id);assert.equal(r.approvalAllowed,true);assert.equal(r.approval,null);
  assert.equal((await f.db.query('select count(*)::int n from studio.approvals')).rows[0].n,0);
  const approval=await f.release.approve(f.jobId,{...f.body(),reviewId:a.id,proposalHash:a.proposalHash});assert.equal(approval.approval.effective,true);
  assert.equal((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n,0);assert.equal(globalThis.RESULT_CODE_EXECUTED,undefined);
  assert.equal(f.prepared.record.artifact_hash,f.catalogPrepared.artifactHash);
  assert.equal(f.prepared.record.artifact_text,f.catalogPrepared.artifactText);
  const stored=(await f.db.query('select * from studio.release_reviews where id=$1',[a.id])).rows[0];assert.equal(stored.education_text,f.row.education_text);assert.equal(stored.artifact_text,f.prepared.record.artifact_text);
 }finally{await f.db.close();}
});

test('browser and worker service roles cannot write source authority or issue preparations',async()=>{
 const f=await fixture();try{
  for(const role of ['service_role','anon','authenticated']){
   await f.db.exec('reset role;set role '+role);
   await assert.rejects(f.rpc('issue_release_review',f.command()),e=>e.code==='42501');
   for(const sql of ['insert into studio.source_reviews default values','update studio.source_reviews set revoked_at=now()','delete from studio.source_reviews'])await assert.rejects(f.db.exec(sql),e=>e.code==='42501');
  }
  await f.db.exec('reset role;set role service_role');assert.equal((await f.db.query('select count(*)::int n from studio.release_reviews')).rows[0].n,1);
 }finally{await f.db.close();}
});

test('owner, candidate, source, original review and rights mismatches are rejected before preparation',async()=>{
 const f=await fixture();try{
  const changes=[x=>x.sourceReview.owner_id=randomUUID(),x=>x.sourceReview.job_id=randomUUID(),x=>x.sourceReview.candidate_hash=hash('other'),x=>x.sourceReview.source_hash=hash('other'),x=>x.sourceReview.revoked_at=new Date().toISOString(),x=>x.sourceReview.created_at='2999-01-01T00:00:00.000Z',x=>x.baseline.enabled=false,x=>x.baseline.artifact_hash=hash('other'),
   x=>{const e=JSON.parse(x.sourceReview.education_text);e.records[0].method='model_claim';x.sourceReview.education_text=JSON.stringify(e);x.sourceReview.education_hash=hash(x.sourceReview.education_text);},
   x=>{const e=JSON.parse(x.sourceReview.education_text);e.records[0].aiUseAllowed=false;x.sourceReview.education_text=JSON.stringify(e);x.sourceReview.education_hash=hash(x.sourceReview.education_text);}];
  for(const change of changes){const input=structuredClone(f.input);change(input);assert.throws(()=>prepareReleaseReview(input));}
 }finally{await f.db.close();}
});

test('source revocation invalidates issued approval immediately and immutable source records cannot be revived',async()=>{
 const f=await fixture();try{
  const issued=await f.issuePrepared();await f.release.approve(f.jobId,{...f.body(),reviewId:issued.id,proposalHash:issued.proposalHash});
  await f.admin(()=>f.db.query('update studio.source_reviews set revoked_at=clock_timestamp() where id=$1',[f.sourceId]));
  assert.equal((await f.release.read(f.jobId)).publicationReview.approval.effective,false);assert.equal((await f.issuePrepared()).current,false);
  await assert.rejects(f.issuePrepared(f.prepared.record,randomUUID()),e=>e.code==='PT404');
  await assert.rejects(f.admin(()=>f.db.query('update studio.source_reviews set revoked_at=null where id=$1',[f.sourceId])),e=>e.code==='PT409');
  await assert.rejects(f.admin(()=>f.db.query('delete from studio.source_reviews where id=$1',[f.sourceId])),e=>e.code==='PT409');
 }finally{await f.db.close();}
});

test('unresolved change requests block fresh preparation even if feedback hash is current',async()=>{
 const f=await fixture();try{
  const {result}=await f.service.read(f.jobId);await f.service.feedback(f.jobId,{version:result.version,decision:'request_changes',note:'Synthetic required change',clientRequestId:randomUUID()});
  const snapshot=await f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId});assert.throws(()=>prepareReleaseReview({...f.input,snapshot}),/RELEASE_CHANGES_REQUESTED/);
  const currentFeedback=hash(snapshot.feedback.map(f=>f.id).sort().join(','));
  await assert.rejects(f.issuePrepared({...f.prepared.record,feedback_hash:currentFeedback}),e=>e.code==='PT409');
  assert.equal((await f.db.query('select count(*)::int n from studio.release_reviews')).rows[0].n,1);
 }finally{await f.db.close();}
});

test('changed review snapshot, baseline, owner and conflicting retries never issue a new current preparation',async()=>{
 const f=await fixture();try{
  for(const patch of [{state_version:f.prepared.record.state_version+1},{feedback_hash:hash('other')},{evidence_hash:hash('other')},{base_artifact_hash:hash('other')},{lock_hash:hash('other')},{policy_version:'changed'},{source_hash:hash('other')},{teacherApproval:true}])await assert.rejects(f.issuePrepared({...f.prepared.record,...patch}),e=>['PT400','PT409','23514'].includes(e.code));
  const issued=await f.issuePrepared();await assert.rejects(f.issuePrepared({...f.prepared.record,policy_version:'changed'}),e=>e.code==='PT409');
  await assert.rejects(f.admin(()=>f.rpc('issue_release_review',{...f.command(),p_owner:randomUUID()})),e=>e.code==='PT403');
  assert.equal((await f.release.read(f.jobId)).publicationReview.id,issued.id);
  await f.admin(()=>f.db.exec('update studio.release_baseline set enabled=false'));assert.equal((await f.issuePrepared()).current,false);
 }finally{await f.db.close();}
});

test('per-job preparation limit is enforced without deleting prior evidence',async()=>{
 const f=await fixture();try{
  for(let n=0;n<19;n++)await f.issuePrepared(f.prepared.record,randomUUID());
  await assert.rejects(f.issuePrepared(f.prepared.record,randomUUID()),e=>e.code==='PT429');
  assert.equal((await f.db.query('select count(*)::int n from studio.release_reviews')).rows[0].n,20);
 }finally{await f.db.close();}
});

test('trusted adapter reads the stored ledger and cannot turn a model or app credential into an issuer',async()=>{
 const f=await fixture();try{
  const args={ownerId:f.ownerId,jobId:f.jobId,sourceReviewId:f.sourceId,requestId:randomUUID(),baselineArtifactText:f.base.artifactText};
  const app=createReleaseReviewIssuer({db:f.client.schema('studio')});await assert.rejects(app.issue(args),/RELEASE_ISSUER_FORBIDDEN/);
  // The privileged synthetic operator connection is separate from the app role.
  const authority={rpc(name,params){return {async abortSignal(signal){assert.ok(signal instanceof AbortSignal);try{return {data:await f.admin(()=>f.rpc(name,params)),error:null};}catch(error){return {data:null,error};}}};}};
  const issuer=createReleaseReviewIssuer({db:authority});
  await assert.rejects(issuer.issue({...args,baselineArtifactText:'{}'}));
  const a=await issuer.issue(args),b=await issuer.issue(args);assert.deepEqual(a,b);assert.equal(a.approved,false);assert.equal(a.published,false);
  await assert.rejects(issuer.issue({...args,sourceReviewId:randomUUID()}),/RELEASE_SOURCE_REVIEW_REQUIRED/);
  assert.equal((await f.db.query('select count(*)::int n from studio.approvals')).rows[0].n,0);
 }finally{await f.db.close();}
});
