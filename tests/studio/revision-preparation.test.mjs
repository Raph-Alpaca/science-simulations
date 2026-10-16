import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {revisionPreparationFixture} from './revision-preparation-fixture.mjs';
import {insertPreparation} from './preparation-fixture.mjs';
import {hash} from '../../packages/contracts/content-source.js';
import {inspectRevisionBase} from '../../automation/runner/revision.mjs';

test('expired parent authority is renewed only in a new immutable revision, with fresh consent and preserved lineage',async()=>{
 const f=await revisionPreparationFixture({expiredParent:true});try{
  const body=await f.body(),before=await f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId});
  const {review}=await f.revision.prepare(f.jobId,body);assert.equal(await f.revision.capability(),true);
  assert.equal(review.sourceReadiness.state,'ready');assert.equal(review.state,'prepared');assert.equal(review.contentId,f.context.contentId);
  assert.notDeepEqual(review.sourcePreparation,f.context.sourcePreparation);assert.equal(review.revision.candidateHash,f.candidate.candidateHash);
  const row=(await f.db.query('select * from studio.input_reviews where id=$1',[review.id])).rows[0],source=JSON.parse(row.input_text);
  assert.equal(row.consent,null);assert.deepEqual({...source.context,sourcePreparation:f.context.sourcePreparation},f.context);
  assert.equal(source.input.evidenceNotice,f.input.evidenceNotice);assert.deepEqual(source.input.requirements.slice(0,-1),f.input.requirements);
  assert.equal(inspectRevisionBase(source.input,source.context,row.base_candidate).candidateHash,f.candidate.candidateHash);
  await assert.rejects(f.submit(review),/INPUT_REVIEW_CHANGED/);await f.approve(review);
  const [a,b]=await Promise.all([f.submit(review),f.submit(review)]);assert.equal(a.job.id,b.job.id);assert.notEqual(a.job.id,f.jobId);
  assert.deepEqual(await f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId}),before);
  assert.equal((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n,2);
  assert.equal((await f.db.query('select generation from studio.content_heads')).rows[0].generation,1);
 }finally{await f.db.close();}
});

test('missing authority holds the old draft; lost-response retry preserves it and a new request renews it',async()=>{
 const f=await revisionPreparationFixture({seed:false,expiredParent:true});try{
  const body=await f.body(),{review:old}=await f.revision.prepare(f.jobId,body);
  assert.equal(old.sourceReadiness.state,'needs_evidence');assert.deepEqual(old.sourcePreparation,f.context.sourcePreparation);
  await assert.rejects(f.approve(old),/SOURCE_EVIDENCE_REQUIRED/);await f.seedRecords();
  const replay=(await f.revision.prepare(f.jobId,body)).review;assert.equal(replay.id,old.id);assert.equal(replay.sourceHash,old.sourceHash);assert.equal(replay.sourceReadiness.state,'needs_evidence');
  const freshBody={...body,clientRequestId:randomUUID()},fresh=(await f.revision.prepare(f.jobId,freshBody)).review;
  assert.notEqual(fresh.id,old.id);assert.notEqual(fresh.sourceHash,old.sourceHash);assert.equal(fresh.sourceReadiness.state,'ready');assert.equal(fresh.state,'prepared');
  assert.deepEqual(fresh.revision,old.revision);assert.deepEqual(fresh.sources,old.sources);assert.equal(fresh.requirements,old.requirements);
  await f.approve(fresh);
  await f.db.exec('reset role');await f.db.query('update studio.preparation_sources set revoked_at=now() where id=$1',[f.records[0].recordId]);await f.db.exec('set role service_role');
  const revoked=(await f.revision.prepare(f.jobId,freshBody)).review;assert.equal(revoked.id,fresh.id);assert.equal(revoked.sourceHash,fresh.sourceHash);assert.equal(revoked.sourceReadiness.state,'needs_evidence');
  await assert.rejects(f.submit(revoked),/SOURCE_EVIDENCE_REQUIRED/);
  await assert.rejects(f.rpc('submit_reviewed_worker_job',{p_owner:f.ownerId,p_review:fresh.id,p_hash:fresh.sourceHash}),e=>e.code==='PT422');
  assert.equal((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n,1);
 }finally{await f.db.close();}
});

test('consumed replay survives authority replacement and never creates a second paid child',async()=>{
 const f=await revisionPreparationFixture();try{
  const body=await f.body(),{review}=await f.revision.prepare(f.jobId,body);await f.approve(review);const first=await f.submit(review);
  await f.db.exec('reset role');await f.db.query('update studio.preparation_sources set revoked_at=now() where id=$1',[f.records[0].recordId]);await insertPreparation(f.db,f.scope.sources[0],{...f.records[0],recordId:randomUUID()});await f.db.exec('set role service_role');
  const replay=(await f.revision.prepare(f.jobId,body)).review;assert.equal(replay.id,review.id);assert.equal(replay.sourceHash,review.sourceHash);assert.equal(replay.state,'consumed');
  assert.equal(replay.sourceReadiness.state,'needs_evidence');assert.equal((await f.submit(replay)).job.id,first.job.id);
  await assert.rejects(f.revision.prepare(f.jobId,{...body,clientRequestId:randomUUID()}),/REVISION_CHANGED/);
  assert.equal((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n,2);
 }finally{await f.db.close();}
});

test('renewal cannot change original sources, curriculum, scope, requirements or invent authority',async()=>{
 const f=await revisionPreparationFixture({expiredParent:true});try{
  const body=await f.body(),{review}=await f.revision.prepare(f.jobId,body);
  const row=(await f.db.query('select * from studio.input_reviews where id=$1',[review.id])).rows[0];
  for(const change of [s=>s.context.sources[0].summary='Changed summary',s=>s.context.sources[0].url='https://example.org/different',s=>s.context.grade=1,s=>s.context.curriculumRevision='2015',s=>s.context.sourcePreparation.reviewScope='selected_textbook',s=>s.input.requirements[0].text='Different',s=>s.context.sourcePreparation.records[0].checkedScope='Forged broad finding',s=>delete s.context.sourcePreparation,s=>s.context.sourcePreparation=null]){
   const value=JSON.parse(row.input_text),client=randomUUID();change(value);const input=JSON.stringify(value);
   await assert.rejects(f.rpc('prepare_worker_revision',{p_owner:f.ownerId,p_parent:f.jobId,p_feedback:body.feedbackId,p_client:client,p_head:row.head_job_id,p_request:{...row.request_snapshot,clientRequestId:client},p_input:input,p_hash:hash(input),p_candidate:row.base_candidate}),e=>['PT409','PT422'].includes(e.code));
  }
  assert.equal((await f.db.query('select count(*)::int n from studio.input_reviews')).rows[0].n,1);
  for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(f.rpc('revision_preparation_version',{}),e=>e.code==='42501');await assert.rejects(f.rpc('read_revision_context',{p_owner:f.ownerId,p_job:f.jobId,p_client:body.clientRequestId}),e=>e.code==='42501');}
 }finally{await f.db.close();}
});

test('source-enabled revisions stay unavailable until the renewal SQL is installed',async()=>{
 const f=await revisionPreparationFixture({install:false});try{
  assert.equal(await f.revision.capability(),false);await assert.rejects(f.revision.prepare(f.jobId,await f.body()),/REVISION_SETUP_REQUIRED/);
  assert.equal((await f.db.query('select count(*)::int n from studio.input_reviews')).rows[0].n,0);
  await f.db.exec('reset role');await f.db.exec(await readFile('supabase/proposals/studio_revision_preparation_v1.sql','utf8'));await f.db.exec('set role service_role');assert.equal(await f.revision.capability(),true);
 }finally{await f.db.close();}
});
