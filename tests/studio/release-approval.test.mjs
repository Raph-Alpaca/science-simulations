import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {hash} from '../../packages/contracts/content-source.js';
import {releaseFixture} from './release-approval-fixture.mjs';
import {createReleaseApprovalService,inspectReleaseReview} from '../../apps/studio/lib/release-approval.mjs';
const count=async(f,table)=>(await f.db.query('select count(*)::int n from studio.'+table)).rows[0].n;
const snapshot=f=>f.rpc('read_release_review',{p_owner:f.ownerId,p_job:f.jobId});

test('verified preparation stores one owner-bound approval and replays it without deploying, executing candidate code or paying again',async()=>{
 const f=await releaseFixture({repair:true});try{
  assert.equal(await f.release.capability(),true);
  const {publicationReview:r}=await f.release.read(f.jobId);assert.equal(r.approvalAllowed,true);assert.equal(r.current,true);assert.equal(r.approval,null);
  const body=f.body();const a=await f.release.approve(f.jobId,body),b=await f.release.approve(f.jobId,body);assert.deepEqual(a,b);assert.equal(a.approval.effective,true);assert.equal(a.published,false);
  const stored=(await f.db.query('select * from studio.approvals')).rows[0];assert.equal(stored.approver,f.ownerId);assert.equal(stored.release_review_id,f.row.id);assert.equal(stored.artifact_hash,f.prepared.artifactHash);
  assert.equal((await f.release.read(f.jobId)).publicationReview.approval.effective,true);
  assert.equal(await count(f,'approvals'),1);assert.equal(await count(f,'releases'),0);assert.equal(await count(f,'jobs'),1);assert.equal(await count(f,'budget_calls'),7);
  assert.equal((await f.service.read(f.jobId)).result.state,'awaiting_approval');assert.equal(globalThis.RESULT_CODE_EXECUTED,undefined);
  const projected=JSON.stringify(await f.release.read(f.jobId));for(const privateText of [f.ownerId,'<script>','education_text','artifact_text','reviewerId','synthetic-source-reviewer'])assert.equal(projected.includes(privateText),false);
 }finally{await f.db.close();}
});

test('browser-supplied actors, hashes, attestation bodies and missing explicit confirmation cannot authorize an approval',async()=>{
 const f=await releaseFixture();try{
  for(const patch of [{confirmPublication:false},{confirmPublication:undefined},{proposalHash:hash('stale')},{reviewId:randomUUID()},{ownerId:randomUUID()},{approval:{decision:'approve'}},{actorType:'teacher'},{educationEvidence:JSON.stringify(f.education)}]){
   await assert.rejects(f.release.approve(f.jobId,{...f.body(),...patch}),e=>['INVALID_REQUEST','RELEASE_CHANGED'].includes(e.code));
  }
  assert.equal(await count(f,'approvals'),0);
  const a=await f.release.approve(f.jobId,f.body());await assert.rejects(f.release.approve(f.jobId,f.body()),/RELEASE_CHANGED/);assert.ok(a.approval.id);
 }finally{await f.db.close();}
});

test('new feedback makes a prior receipt ineffective and blocks new approval while preserving history and budget',async()=>{
 const f=await releaseFixture();try{
  const body=f.body(),a=await f.release.approve(f.jobId,body);const {result}=await f.service.read(f.jobId);
  await f.service.feedback(f.jobId,{version:result.version,decision:'request_changes',note:'설명을 보완해 주세요.',clientRequestId:randomUUID()});
  const r=(await f.release.read(f.jobId)).publicationReview;assert.equal(r.current,false);assert.equal(r.approval.effective,false);assert.equal(r.approval.id,a.approval.id);
  const replay=await f.release.approve(f.jobId,body);assert.equal(replay.approval.id,a.approval.id);assert.equal(replay.approval.effective,false);
  await assert.rejects(f.release.approve(f.jobId,f.body()),/RELEASE_CHANGED/);assert.equal(await count(f,'approvals'),1);assert.equal(await count(f,'budget_calls'),5);
 }finally{await f.db.close();}
});

test('revocation is idempotent and available while new approvals are disabled, and never revives the old version',async()=>{
 const f=await releaseFixture();try{
  const body=f.body(),a=await f.release.approve(f.jobId,body);
  const disabled=createReleaseApprovalService({db:f.client.schema('studio'),ownerId:f.ownerId});assert.equal(await disabled.capability(),false);
  await assert.rejects(disabled.approve(f.jobId,body),/RELEASE_SETUP_REQUIRED/);
  assert.equal(await disabled.availability(),true);const history=(await disabled.read(f.jobId)).publicationReview;assert.equal(history.approvalAllowed,false);assert.equal(history.approvalPaused,true);assert.equal(history.approval.id,a.approval.id);
  const revoked=await disabled.revoke(a.approval.id,{}),again=await disabled.revoke(a.approval.id,{});assert.deepEqual(revoked,again);assert.equal(revoked.approval.effective,false);assert.ok(revoked.approval.invalidatedAt);
  assert.equal((await f.release.approve(f.jobId,body)).approval.effective,false);
  assert.equal((await f.release.read(f.jobId)).publicationReview.approvalAllowed,false);
  await assert.rejects(f.release.approve(f.jobId,f.body()),/RELEASE_CHANGED/);
 }finally{await f.db.close();}
});

test('baseline changes, review revocation, unsettled cost and a changed worker version invalidate preparation at the SQL boundary',async()=>{
 const f=await releaseFixture();try{
  const cases=[
   ["update studio.release_baseline set enabled=false","update studio.release_baseline set enabled=true"],
   ["update studio.release_baseline set artifact_hash=repeat('b',64)","update studio.release_baseline set artifact_hash='"+f.row.base_artifact_hash+"'"],
   ["update studio.release_baseline set lock_hash=repeat('b',64)","update studio.release_baseline set lock_hash='"+f.row.lock_hash+"'"],
   ["update studio.release_baseline set policy_version='changed'","update studio.release_baseline set policy_version='synthetic-release-v1'"],
   ["update studio.budget_jobs set state='uncertain'","update studio.budget_jobs set state='closed'"],
   ["update studio.jobs set state_version=state_version+1","update studio.jobs set state_version=state_version-1"],
  ];
  for(const [change,restore] of cases){
   await f.admin(()=>f.db.exec(change));assert.equal((await snapshot(f)).current,false);
   await assert.rejects(f.rpc('approve_release_review',{p_owner:f.ownerId,p_review:f.row.id,p_client:randomUUID(),p_proposal:f.row.proposal_hash}),e=>e.code==='PT409');
   await f.admin(()=>f.db.exec(restore));assert.equal((await snapshot(f)).current,true);
  }
  await f.admin(()=>f.db.query('update studio.release_reviews set revoked_at=now() where id=$1',[f.row.id]));assert.equal((await snapshot(f)).current,false);
  await assert.rejects(f.admin(()=>f.db.query('update studio.release_reviews set revoked_at=null where id=$1',[f.row.id])),e=>e.code==='PT409');
  assert.equal(await count(f,'approvals'),0);
 }finally{await f.db.close();}
});

test('a replacement preparation supersedes the old approval and request IDs cannot be reused for another review',async()=>{
 const f=await releaseFixture();try{
  const body=f.body(),a=await f.release.approve(f.jobId,body);const next=await f.issue({id:randomUUID()});
  assert.equal(await f.rpc('release_review_current',{p_owner:f.ownerId,p_review:f.row.id}),false);
  const r=(await f.release.read(f.jobId)).publicationReview;assert.equal(r.id,next.id);assert.equal(r.approval,null);
  await assert.rejects(f.release.approve(f.jobId,{...body,reviewId:next.id}),/RELEASE_CHANGED/);
  const b=await f.release.approve(f.jobId,{...f.body(),reviewId:next.id});assert.notEqual(a.approval.id,b.approval.id);assert.equal(await count(f,'approvals'),2);
 }finally{await f.db.close();}
});

test('other owners, inactive teachers, deleted conversations, anonymous and browser roles cannot approve or issue trusted preparations',async()=>{
 const f=await releaseFixture();try{
  const other=createReleaseApprovalService({db:f.client.schema('studio'),ownerId:randomUUID(),enabled:true});
  await assert.rejects(other.read(f.jobId),/NOT_FOUND/);await assert.rejects(other.approve(f.jobId,f.body()),/NOT_FOUND/);
  const a=await f.release.approve(f.jobId,f.body());await assert.rejects(other.revoke(a.approval.id,{}),/NOT_FOUND/);
  for(const sql of ["insert into studio.release_baseline default values","update studio.release_baseline set enabled=true","delete from studio.release_baseline","insert into studio.release_reviews default values","update studio.release_reviews set revoked_at=now()","delete from studio.release_reviews","delete from studio.approvals"]){await assert.rejects(f.db.exec(sql),e=>e.code==='42501');}
  for(const role of ['anon','authenticated']){
   await f.db.exec('reset role;set role '+role);
   for(const table of ['release_reviews','release_baseline'])await assert.rejects(f.db.query('select * from studio.'+table),e=>e.code==='42501');
   await assert.rejects(f.rpc('approve_release_review',{p_owner:f.ownerId,p_review:f.row.id,p_client:randomUUID(),p_proposal:f.row.proposal_hash}),e=>e.code==='42501');
  }
  await f.db.exec('reset role');await f.db.query('update studio.teachers set active=false where owner_id=$1',[f.ownerId]);await f.db.exec('set role service_role');await assert.rejects(f.release.read(f.jobId),/NOT_FOUND/);await assert.rejects(f.release.revoke(a.approval.id,{}),/TEACHER_NOT_ALLOWED/);
  await f.admin(async()=>{await f.db.query('update studio.teachers set active=true where owner_id=$1',[f.ownerId]);await f.db.query('update studio.conversations set deleted_at=now() where id=$1',[f.submission.p_conversation]);});
  await assert.rejects(f.release.read(f.jobId),/NOT_FOUND/);await assert.rejects(f.release.revoke(a.approval.id,{}),/NOT_FOUND/);
 }finally{await f.db.close();}
});

test('full server validation rejects corrupt artifacts, source claims, evidence and forged approvers without executing them',async()=>{
 const f=await releaseFixture();try{
  await f.release.approve(f.jobId,f.body());const original=await snapshot(f);
  const changes=[s=>{s.review.artifact_text+='garbage';},s=>{s.review.education_text+=' ';},s=>{s.review.checks_hash=hash('other');},s=>{s.result.evidence[0].body+=' ';},s=>{s.approval.approver=randomUUID();},s=>{s.approval.artifact_hash=hash('other');},s=>{s.approval.checks_version=hash('other');},s=>{s.review.state_version++;},
   s=>{const e=JSON.parse(s.review.education_text);e.records[0].method='model_claim';s.review.education_text=JSON.stringify(e);s.review.education_hash=hash(s.review.education_text);},
   s=>{const e=JSON.parse(s.review.education_text);e.records[0].summaryPublicAllowed=false;s.review.education_text=JSON.stringify(e);s.review.education_hash=hash(s.review.education_text);}];
  for(const change of changes){const value=structuredClone(original);change(value);assert.throws(()=>inspectReleaseReview(value,f.ownerId),e=>['RELEASE_RECORD_INVALID','RESULT_RECORD_INVALID'].includes(e.code));}
  assert.equal(globalThis.RESULT_CODE_EXECUTED,undefined);
  await assert.rejects(f.admin(()=>f.db.query("update studio.release_reviews set checks_hash=$1 where id=$2",[hash('rewritten'),f.row.id])),e=>e.code==='PT409');
  await assert.rejects(f.admin(()=>f.db.query('delete from studio.release_reviews where id=$1',[f.row.id])),e=>e.code==='PT409');
 }finally{await f.db.close();}
});
