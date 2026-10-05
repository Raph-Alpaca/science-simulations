import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepareInputReview,createInputReviewService,INPUT_CONSENT} from '../../apps/studio/lib/input-review.mjs';
import {hash} from '../../packages/contracts/content-source.js';
import {workerFixture} from './worker-fixture.mjs';

const draft=(conversationId=randomUUID())=>({conversationId,clientRequestId:randomUUID(),topic:'도형의 크기와 움직임',grade:3,unit:'검사용 단원',requirements:'반지름을 바꾸고 결과를 비교하는 합성 검사입니다.',generationKind:'interactive_3d',sources:[{kind:'science',title:'Synthetic reference',url:'https://example.org/reference',location:'Synthetic section',summary:'직접 작성한 검사용 요약이며 실제 과학 근거가 아닙니다.'}]});
async function fixture(){
 const f=await workerFixture();await f.db.exec('reset role');await f.db.exec(readFileSync('supabase/proposals/studio_input_review_v1.sql','utf8'));await f.db.exec('set role service_role');
 const db=f.client.schema('studio'),service=createInputReviewService({db,ownerId:f.ownerId,enabled:true});
 const body=draft(f.submission.p_conversation);
 const prepare=()=>service.prepare(body),approve=review=>service.approve(review.id,{sourceHash:review.sourceHash,rightsConfirmed:true,budgetAccepted:true});
 return {...f,service,body,prepare,approve};
}
test('preparation uses only chosen request and authored summaries, stable ID and explicit unverified evidence',()=>{
 const ownerId=randomUUID(),body=draft(),p=prepareInputReview(body,ownerId),again=prepareInputReview(body,ownerId),source=JSON.parse(p.inputText);
 assert.deepEqual(again,p);assert.match(p.contentId,/^sim-[a-f0-9]{28}$/);assert.equal(p.sourceHash,hash(p.inputText));
 assert.equal(source.context.schoolYear,null);assert.equal(source.context.curriculumRevision,'2022');assert.deepEqual(source.context.curriculumSelection,{revision:'2022',verification:'unverified',sourceRefs:[]});assert.equal(source.input.generationKind,'interactive_3d');
 assert.equal('schoolYear' in p.request.payload,false);
 assert.equal(source.context.sources[0].verification,'not_independently_verified');assert.equal(source.context.sources[0].summaryAuthorship,'teacher_supplied');
 assert.equal('conversationTitle' in source,false);assert.equal('messages' in source,false);
 assert.notEqual(prepareInputReview({...body,requirements:'바뀐 과제'},ownerId).sourceHash,p.sourceHash);
 assert.notEqual(prepareInputReview(body,randomUUID()).contentId,p.contentId);
 const credentialUrl=new URL('https://example.org/');credentialUrl.username='synthetic-user';credentialUrl.password='synthetic-password';
 for(const changed of [{...body,approved:true},{...body,generationKind:'shell'},{...body,sources:[{...body.sources[0],verified:true}]},{...body,sources:[{...body.sources[0],url:credentialUrl.href}]},{...body,sources:[{...body.sources[0],url:'https://127.0.0.1/'}]},{...body,requirements:'private sk-'+ 'a'.repeat(40)},{...body,sources:Array(7).fill(body.sources[0])}])assert.throws(()=>prepareInputReview(changed,ownerId));
});
test('disabled service does not query DB; enabled preparation and consent do not reserve money or create a job',async()=>{
 const f=await fixture();try{
  const disabled=createInputReviewService({ownerId:f.ownerId,db:{rpc(){throw Error('MUST_NOT_QUERY');}}});assert.equal(await disabled.capability(),false);await assert.rejects(disabled.prepare(f.body),/INPUT_REVIEW_SETUP_REQUIRED/);
  assert.equal(await f.service.capability(),true);const {review}=await f.prepare();assert.equal(review.state,'prepared');assert.equal(review.generationKind,'interactive_3d');
  const again=await f.prepare();assert.equal(again.review.id,review.id);
  assert.equal((await f.approve(review)).review.state,'approved');assert.equal((await f.approve(review)).review.state,'approved');
  assert.equal((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n,0);assert.equal((await f.db.query('select count(*)::int n from studio.budget_jobs')).rows[0].n,0);
  await assert.rejects(f.service.submit(review.id,review.sourceHash),/REAL_EXECUTION_UNAVAILABLE/);
 }finally{await f.db.close();}
});
test('the reviewed bytes, consent and paid submission bind atomically; duplicate submit returns the same single job',async()=>{
 const f=await fixture();try{
  await f.enable();const {review}=await f.prepare();
  await assert.rejects(f.service.submit(review.id,review.sourceHash),/INPUT_REVIEW_CHANGED/);
  await assert.rejects(f.service.approve(review.id,{sourceHash:review.sourceHash,rightsConfirmed:true,budgetAccepted:false}),/INPUT_PERMISSION_REQUIRED/);
  await assert.rejects(f.service.approve(review.id,{sourceHash:'a'.repeat(64),rightsConfirmed:true,budgetAccepted:true}),/INPUT_REVIEW_CHANGED/);
  await f.approve(review);const a=await f.service.submit(review.id,review.sourceHash),b=await f.service.submit(review.id,review.sourceHash);assert.equal(a.job.id,b.job.id);
  assert.equal(a.job.execution_mode,'real');assert.equal(a.job.target_content_id,review.contentId);
  const row=(await f.db.query('select * from studio.input_reviews')).rows[0];assert.equal(row.state,'consumed');assert.equal(row.job_id,a.job.id);assert.deepEqual(row.consent,INPUT_CONSENT);
  const run=(await f.db.query('select * from studio.worker_runs')).rows[0];assert.equal(run.input_review_id,review.id);assert.equal(run.source_snapshot_hash,review.sourceHash);assert.equal(run.approved_input,row.input_text);
  assert.equal((await f.db.query('select count(*)::int n from studio.budget_jobs')).rows[0].n,1);
  await assert.rejects(f.service.prepare({...f.body,requirements:'changed under same client ID'}),/INPUT_REVIEW_CHANGED/);
  await assert.rejects(f.db.query('update studio.input_reviews set input_text=$1,source_hash=$2 where id=$3',[row.input_text+' ',hash(row.input_text+' '),review.id]),e=>e.code==='42501');
  await assert.rejects(f.db.query('update studio.input_reviews set consent=$1 where id=$2',[{...INPUT_CONSENT,publicInputAllowed:false},review.id]),e=>e.code==='23514');
 }finally{await f.db.close();}
});
test('invented approval IDs and mismatched reviewed bytes roll back the entire worker submission',async()=>{
 const f=await fixture();try{
  await f.enable();const p=prepareInputReview(f.body,f.ownerId),{review}=await f.prepare();await f.approve(review);
  const args={p_owner:f.ownerId,p_conversation:f.body.conversationId,p_client:f.body.clientRequestId,p_job:randomUUID(),p_idempotency:randomUUID(),p_request:p.request,p_input:p.inputText,p_hash:p.sourceHash,p_input_review:randomUUID()};
  await assert.rejects(f.rpc('submit_worker_job',args),e=>e.code==='PT409');
  await assert.rejects(f.rpc('submit_worker_job',{...args,p_input_review:review.id,p_input:p.inputText+' ',p_hash:hash(p.inputText+' ')}),e=>e.code==='PT409');
  assert.equal((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n,0);assert.equal((await f.service.read(review.id)).review.state,'approved');
 }finally{await f.db.close();}
});
test('cross-owner, revoked teacher, deleted conversation and expired review cannot approve or submit',async()=>{
 const f=await fixture();try{
  const {review}=await f.prepare(),other=randomUUID();await f.db.exec('reset role');await f.db.query('insert into auth.users values($1)',[other]);await f.db.query('insert into studio.teachers values($1,true)',[other]);await f.db.exec('set role service_role');
  const service=createInputReviewService({db:f.client.schema('studio'),ownerId:other,enabled:true});await assert.rejects(service.read(review.id),/NOT_FOUND/);await assert.rejects(service.approve(review.id,{sourceHash:review.sourceHash,rightsConfirmed:true,budgetAccepted:true}),/NOT_FOUND/);
  await f.db.exec('reset role');await f.db.query("update studio.input_reviews set expires_at=now()-interval '1 second' where id=$1",[review.id]);await f.db.exec('set role service_role');await assert.rejects(f.approve(review),/INPUT_REVIEW_EXPIRED/);
  await f.db.exec('reset role');await f.db.query('update studio.teachers set active=false where owner_id=$1',[f.ownerId]);await f.db.exec('set role service_role');await assert.rejects(f.service.read(review.id),/TEACHER_NOT_ALLOWED/);
  await f.db.exec('reset role');await f.db.query('update studio.teachers set active=true where owner_id=$1',[f.ownerId]);await f.db.query('update studio.conversations set deleted_at=now() where id=$1',[f.body.conversationId]);await f.db.exec('set role service_role');await assert.rejects(f.service.read(review.id),/NOT_FOUND/);
 }finally{await f.db.close();}
});
test('browser roles have no review table/RPC access and budget rejection leaves confirmed input reusable',async()=>{
 const f=await fixture();try{
  for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(f.db.query('select * from studio.input_reviews'),e=>e.code==='42501');await assert.rejects(f.rpc('read_worker_input',{p_owner:f.ownerId,p_review:randomUUID()}),e=>e.code==='42501');}
  await f.enable();const {review}=await f.prepare();await f.approve(review);
  await f.db.exec('reset role');await f.db.exec('update studio.budget_policy set monthly_usd_micros=1');await f.db.exec('set role service_role');
  await assert.rejects(f.service.submit(review.id,review.sourceHash));assert.equal((await f.service.read(review.id)).review.state,'approved');assert.equal((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n,0);
 }finally{await f.db.close();}
});
