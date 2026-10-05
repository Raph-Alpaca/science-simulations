import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {revisionFixture} from './revision-fixture.mjs';
import {createRevisionService,prepareRevision} from '../../apps/studio/lib/revision.mjs';
import {inspectRevisionBase} from '../../automation/runner/revision.mjs';
import {hash} from '../../packages/contracts/content-source.js';

test('revision preparation preserves identity, shows all instructions, binds parent bytes and creates no paid job',async()=>{
 const f=await revisionFixture();try{
  const body=await f.body(),{review}=await f.revision.prepare(f.jobId,body),again=await f.revision.prepare(f.jobId,body);
  assert.equal(await f.revision.capability(),true);assert.equal(review.id,again.review.id);assert.equal(review.contentId,f.context.contentId);
  assert.equal(review.requirementItems.length,2);assert.ok(review.requirements.includes(f.input.requirements[0].text));assert.ok(review.requirements.includes('초기화 설명'));
  assert.equal(review.revision.candidateHash,f.candidate.candidateHash);assert.equal(review.revision.parentJobId,f.jobId);
  assert.equal(JSON.stringify(review).includes('RESULT_CODE_EXECUTED'),false);
  assert.equal((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n,1);
  assert.equal((await f.db.query('select count(*)::int n from studio.budget_jobs')).rows[0].n,1);
  await assert.rejects(f.submit(review),/INPUT_REVIEW_CHANGED/);
  await f.approve(review);assert.equal((await f.inputs.read(review.id)).review.state,'approved');
  const row=(await f.db.query('select input_text,base_candidate from studio.input_reviews where id=$1',[review.id])).rows[0],source=JSON.parse(row.input_text);
  assert.equal(hash(row.input_text),review.sourceHash);assert.deepEqual(source.context,f.context);
  assert.equal(inspectRevisionBase(source.input,source.context,row.base_candidate).candidateHash,f.candidate.candidateHash);
  assert.throws(()=>inspectRevisionBase(source.input,source.context,row.base_candidate+' '),/REVISION_BASE_CHANGED/);
 }finally{await f.db.close();}
});

test('confirmed revision submits exactly one child and retains original result, budget and evidence',async()=>{
 const f=await revisionFixture();try{
  const body=await f.body(),before=await f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId});
  const {review}=await f.revision.prepare(f.jobId,body);await f.approve(review);
  const [a,b]=await Promise.all([f.submit(review),f.submit(review)]);assert.equal(a.job.id,b.job.id);assert.notEqual(a.job.id,f.jobId);
  assert.equal(a.job.target_content_id,f.context.contentId);assert.equal(a.job.expected_version,f.candidate.candidateHash);
  assert.equal((await f.revision.prepare(f.jobId,body)).review.jobId,a.job.id);
  assert.equal((await f.inputs.read(review.id)).review.state,'consumed');
  const head=(await f.db.query('select * from studio.content_heads')).rows[0];assert.equal(head.head_job_id,a.job.id);assert.equal(head.generation,1);
  assert.equal((await f.db.query('select count(*)::int n from studio.dispatch_intents')).rows[0].n,1);
  assert.equal((await f.db.query('select count(*)::int n from studio.budget_jobs')).rows[0].n,2);
  assert.deepEqual(await f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId}),before);
  assert.equal(await f.rpc('read_revision_base',{p_job:a.job.id,p_run:102,p_attempt:1,p_source:review.sourceHash}),null);
  await f.rpc('bind_worker_run',{p_job:a.job.id,p_run:102,p_attempt:1});
  const base=await f.rpc('read_revision_base',{p_job:a.job.id,p_run:102,p_attempt:1,p_source:review.sourceHash});assert.equal(hash(base),review.revision.candidateTextHash);
  assert.equal(await f.rpc('read_revision_base',{p_job:a.job.id,p_run:101,p_attempt:1,p_source:review.sourceHash}),null);
 }finally{await f.db.close();}
});

test('two reviewed requests cannot fork the same head; cancellation permits an explicit new retry without reusing feedback',async()=>{
 const f=await revisionFixture();try{
  const bodyA=await f.body(),bodyB=await f.body();
  const {review:a}=await f.revision.prepare(f.jobId,bodyA),{review:b}=await f.revision.prepare(f.jobId,bodyB);
  await f.approve(a);await f.approve(b);const child=(await f.submit(a)).job;
  await assert.rejects(f.submit(b),/CONVERSATION_BUSY/);assert.equal((await f.inputs.read(b.id)).review.state,'approved');
  await f.rpc('cancel_worker_job',{p_owner:f.ownerId,p_job:child.id,p_expected:0,p_command:randomUUID()});
  await assert.rejects(f.submit(b),/INPUT_REVIEW_CHANGED/);
  await assert.rejects(f.revision.prepare(f.jobId,{...bodyA,clientRequestId:randomUUID()}),/REVISION_CHANGED/);
  const {review:next}=await f.revision.prepare(f.jobId,await f.body());assert.equal(next.revision.headJobId,child.id);await f.approve(next);
  const retry=(await f.submit(next)).job;assert.notEqual(retry.id,child.id);assert.equal(retry.target_content_id,child.target_content_id);
  assert.equal((await f.db.query('select generation from studio.content_heads')).rows[0].generation,2);
 }finally{await f.db.close();}
});

test('budget rejection rolls back input consumption, head advancement and dispatch intent',async()=>{
 const f=await revisionFixture();try{
  const {review}=await f.revision.prepare(f.jobId,await f.body());await f.approve(review);
  await f.db.exec('reset role;update studio.budget_policy set monthly_usd_micros=1;set role service_role');
  await assert.rejects(f.submit(review));assert.equal((await f.inputs.read(review.id)).review.state,'approved');
  assert.equal((await f.db.query('select head_job_id from studio.content_heads')).rows[0].head_job_id,f.jobId);
  assert.equal((await f.db.query('select count(*)::int n from studio.dispatch_intents')).rows[0].n,0);
 }finally{await f.db.close();}
});

test('owner, exact version, immutable bytes, browser grants and conversation deletion remain enforced',async()=>{
 const f=await revisionFixture();try{
  const body=await f.body();
  const disabled=createRevisionService({db:{rpc(){throw Error('MUST_NOT_QUERY');}},ownerId:f.ownerId});assert.equal(await disabled.capability(),false);await assert.rejects(disabled.prepare(f.jobId,body),/REVISION_SETUP_REQUIRED/);
  const other=createRevisionService({db:f.client.schema('studio'),ownerId:randomUUID(),enabled:true});await assert.rejects(other.prepare(f.jobId,body),/NOT_FOUND/);
  for(const part of [{stateVersion:99},{sourceHash:'b'.repeat(64)},{candidateHash:'b'.repeat(64)},{evidenceHash:'b'.repeat(64)}])await assert.rejects(f.revision.prepare(f.jobId,{...body,version:{...body.version,...part}}),/REVISION_CHANGED/);
  const {review}=await f.revision.prepare(f.jobId,body);
  await assert.rejects(f.db.query("update studio.input_reviews set base_candidate='{}' where id=$1",[review.id]),e=>e.code==='42501');
  for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(f.db.query('select * from studio.content_heads'),e=>e.code==='42501');await assert.rejects(f.rpc('read_revision_context',{p_owner:f.ownerId,p_job:f.jobId,p_client:body.clientRequestId}),e=>e.code==='42501');}
  await f.db.exec('reset role');await f.db.query('update studio.conversations set deleted_at=now() where id=$1',[f.submission.p_conversation]);await f.db.exec('set role service_role');await assert.rejects(f.approve(review),/NOT_FOUND/);
 }finally{await f.db.close();}
});

test('DB does not accept a differently written parent candidate or edited original requirements',async()=>{
 const f=await revisionFixture();try{
  const body=await f.body(),snapshot=await f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId});
  const lineage=await f.rpc('read_revision_context',{p_owner:f.ownerId,p_job:f.jobId,p_client:body.clientRequestId});
  const p=prepareRevision(snapshot,lineage,body),args={p_owner:f.ownerId,p_parent:f.jobId,p_feedback:body.feedbackId,p_client:body.clientRequestId,p_head:p.reference.headJobId,p_request:p.request,p_input:p.inputText,p_hash:p.sourceHash,p_candidate:p.baseCandidateText};
  const value=JSON.parse(p.inputText);value.input.requirements[0].text='Silently changed';
  await assert.rejects(f.rpc('prepare_worker_revision',{...args,p_input:JSON.stringify(value),p_hash:hash(JSON.stringify(value))}),e=>e.code==='PT409');
  const changed=JSON.parse(p.inputText);changed.input.revision.candidateTextHash=hash(p.baseCandidateText+' ');
  await assert.rejects(f.rpc('prepare_worker_revision',{...args,p_input:JSON.stringify(changed),p_hash:hash(JSON.stringify(changed)),p_candidate:p.baseCandidateText+' '}),e=>e.code==='PT409');
  assert.equal((await f.db.query('select count(*)::int n from studio.input_reviews')).rows[0].n,0);
 }finally{await f.db.close();}
});

test('revision consent expiry, teacher revocation and execution policy cannot consume a new job',async()=>{
 const f=await revisionFixture();try{
  const {review}=await f.revision.prepare(f.jobId,await f.body());await f.approve(review);
  await f.db.exec('reset role');await f.db.query("update studio.input_reviews set expires_at=now()-interval '1 second' where id=$1",[review.id]);await f.db.exec('set role service_role');
  await assert.rejects(f.approve(review),/INPUT_REVIEW_EXPIRED/);await assert.rejects(f.submit(review),/INPUT_REVIEW_EXPIRED/);
  const {review:second}=await f.revision.prepare(f.jobId,await f.body());await f.approve(second);
  await f.db.exec('reset role');await f.db.query('update studio.teachers set active=false where owner_id=$1',[f.ownerId]);await f.db.exec('set role service_role');
  await assert.rejects(f.approve(second),/TEACHER_NOT_ALLOWED/);await assert.rejects(f.submit(second),/TEACHER_NOT_ALLOWED/);
  await f.db.exec('reset role');await f.db.query('update studio.teachers set active=true where owner_id=$1',[f.ownerId]);await f.db.exec('update studio.budget_policy set enabled=false;set role service_role');
  await assert.rejects(f.submit(second),/REAL_EXECUTION_UNAVAILABLE/);
  assert.equal((await f.inputs.read(second.id)).review.state,'approved');assert.equal((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n,1);
 }finally{await f.db.close();}
});

test('uncertain parent charges block revision preparation and the chain cap preserves existing receipts',async()=>{
 const f=await revisionFixture();try{
  const body=await f.body();
  await f.db.exec('reset role');await f.db.query("update studio.budget_jobs set state='uncertain' where job_id=$1",[f.jobId]);await f.db.exec('set role service_role');
  await assert.rejects(f.revision.prepare(f.jobId,body),/REVISION_CHANGED/);
  await f.db.exec('reset role');await f.db.query("update studio.budget_jobs set state='closed' where job_id=$1",[f.jobId]);await f.db.exec('set role service_role');
  const {review}=await f.revision.prepare(f.jobId,body);await f.approve(review);const child=(await f.submit(review)).job;
  await f.rpc('cancel_worker_job',{p_owner:f.ownerId,p_job:child.id,p_expected:0,p_command:randomUUID()});
  // Seed only the boundary counter; no budget/attempt limit is raised or erased.
  await f.db.exec('reset role;update studio.content_heads set generation=20;set role service_role');
  assert.equal((await f.revision.prepare(f.jobId,body)).review.jobId,child.id);
  await assert.rejects(f.revision.prepare(f.jobId,await f.body()),/REVISION_LIMIT/);
  assert.equal((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n,2);
 }finally{await f.db.close();}
});
