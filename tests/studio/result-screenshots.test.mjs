import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {captureRecord} from '../../packages/contracts/runtime-screenshot.js';
import {createResultReviewService} from '../../apps/studio/lib/result-review.mjs';
import {resultFixture} from './result-review-fixture.mjs';

const screenshots=[390,1440].map(width=>captureRecord(readFileSync(`tests/fixtures/runtime-screenshots/${width}.jpg`),width));
// Real fixture JPEGs inside a synthetic signed worker result. This does not
// assert that the synthetic candidate's unsafe HTML was executed or reviewed.
test('signed report stores raster evidence; owner reads only the exact version, attempt and image',async()=>{
 const f=await resultFixture({screenshots,repair:true});
 try{
  const {result}=await f.service.read(f.jobId);
  assert.equal(JSON.stringify(result).includes('bytesBase64'),false);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<262144);
  assert.equal(result.attempts.length,2);
  for(const attempt of result.attempts)for(const frame of attempt.screenshots){
   const body={version:result.version,attempt:attempt.attempt,width:frame.width,hash:frame.hash};
   const {screenshot}=await f.service.screenshot(f.jobId,body);
   assert.equal(screenshot.candidateHash,attempt.candidateHash);
   assert.equal(screenshot.bytesBase64,screenshots.find(s=>s.width===frame.width).bytesBase64);
   assert.equal(screenshot.mimeType,'image/jpeg');
  }
  const body={version:result.version,attempt:0,width:390,hash:screenshots[0].hash};
  for(const update of [{stateVersion:99},{sourceHash:'b'.repeat(64)},{candidateHash:'b'.repeat(64)},{evidenceHash:'b'.repeat(64)}])await assert.rejects(f.service.screenshot(f.jobId,{...body,version:{...body.version,...update}}),/RESULT_CHANGED/);
  await assert.rejects(f.service.screenshot(f.jobId,{...body,width:1440}),/NOT_FOUND/);
  await assert.rejects(f.service.screenshot(f.jobId,{...body,attempt:2}),/NOT_FOUND/);
  await assert.rejects(f.service.screenshot(f.jobId,{...body,url:'https://example.invalid/'}),/INVALID_REQUEST/);
  await assert.rejects(f.service.screenshot(f.jobId,{...body,width:400}),/INVALID_REQUEST/);
  const other=createResultReviewService({db:f.client.schema('studio'),ownerId:randomUUID(),enabled:true});
  await assert.rejects(other.screenshot(f.jobId,body),/NOT_FOUND|TEACHER_NOT_ALLOWED/);
  assert.equal((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n,1);
  assert.equal((await f.db.query('select count(*)::int n from studio.approvals')).rows[0].n,0);
  await f.db.exec('reset role');await f.db.query('update studio.conversations set deleted_at=now() where id=$1',[f.submission.p_conversation]);await f.db.exec('set role service_role');
  await assert.rejects(f.service.screenshot(f.jobId,body),/NOT_FOUND/);
 }finally{await f.db.close();}
});

test('legacy results remain readable and cannot invent an image',async()=>{
 const f=await resultFixture();try{
  const {result}=await f.service.read(f.jobId);assert.deepEqual(result.attempts[0].screenshots,[]);
  await assert.rejects(f.service.screenshot(f.jobId,{version:result.version,attempt:0,width:390,hash:screenshots[0].hash}),/NOT_FOUND/);
 }finally{await f.db.close();}
});
