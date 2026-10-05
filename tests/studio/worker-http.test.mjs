import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {WORKER_TRUST} from '../../apps/studio/lib/worker-auth.mjs';
import {createWorkerHttpHandler,WORKER_BODY_LIMIT} from '../../apps/studio/lib/worker-http.mjs';
import {createBoundedResponses,PRICING} from '../../automation/runner/bounded-responses.mjs';
import {executeStoredPipeline} from '../../automation/runner/worker-store.mjs';
import {runtimeSubmission} from '../../packages/contracts/runtime-report.js';
import {setup,token,sha} from './worker-http-fixture.mjs';
test('signed worker HTTP request binds to one job; replay/cross-job and browser requests fail',async()=>{
 const f=await setup();try{
  const auth=await token(),first=await f.request('input',{}, {token:auth});assert.equal(first.status,200);assert.equal(first.headers.get('Cache-Control'),'private, no-store');
  assert.equal((await first.json()).sourceSnapshotHash,f.sourceSnapshotHash);
  assert.equal((await f.request('input',{}, {token:auth})).status,409);
  assert.equal((await f.request('input',{}, {jobId:randomUUID()})).status,403);
  assert.equal((await f.request('input',{}, {headers:{cookie:'synthetic-session=x'}})).status,403);
  assert.equal((await f.request('input',{}, {headers:{origin:WORKER_TRUST.origin}})).status,403);
  const row=(await f.db.query('select count(*)::int n from studio.worker_oidc_receipts')).rows[0];assert.equal(row.n,1);
 }finally{await f.db.close();}
});
test('generation cannot report runtime results; reporter cannot reserve costs or finish a job',async()=>{
 const f=await setup();try{
  assert.equal((await f.request('runtime-report',{})).status,403);
  assert.equal((await f.request('verification',{attempt:0})).status,403);
  assert.equal((await f.request('reserve',{}, {role:'report'})).status,403);
  assert.equal((await f.request('finish',{}, {role:'report'})).status,403);
  assert.equal((await f.request('evidence',{event:{kind:'runtime_evidence'}})).status,403);
  assert.equal((await f.db.query('select count(*)::int n from studio.worker_oidc_receipts')).rows[0].n,0);
 }finally{await f.db.close();}
});
test('oversized/unknown fields and malformed requests cannot consume authenticated action receipts',async()=>{
 const f=await setup();try{
  assert.equal((await f.request('input',{serviceKey:'synthetic'})).status,400);
  assert.equal((await f.request('input',{}, {body:'not JSON'})).status,400);
  assert.equal((await f.request('input',{}, {body:' '.repeat(WORKER_BODY_LIMIT+1)})).status,413);
  assert.equal((await f.request('input',{}, {headers:{'content-length':String(WORKER_BODY_LIMIT+1)}})).status,413);
  assert.equal((await f.db.query('select count(*)::int n from studio.worker_oidc_receipts')).rows[0].n,0);
 }finally{await f.db.close();}
});
test('full synthetic pipeline uses signed HTTP for budget/evidence and a distinct reporter identity',async()=>{
 const f=await setup();try{
  const source=await f.post('input');let reported;
  const store={
   async authorize({sourceSnapshotHash}){assert.equal(sourceSnapshotHash,source.sourceSnapshotHash);return {sourceSnapshotHash,aiProcessingAllowed:true,publicInputApproved:true};},
   async claimRun(){return (await f.post('claim')).claimed;},async checkpoint(){return (await f.post('checkpoint')).active;},
   async record(event){if(event.kind==='runtime_evidence'){assert.deepEqual(event.evidence,reported);return;}return f.post('evidence',{event});},
   async finish(result){return f.post('finish',{kind:result.kind,candidateHash:result.candidate?.candidateHash??null,reason:result.reason??null});},
  };
  const ledger={reserve:({callId,requestHash,role,maxUsdMicros})=>f.post('reserve',{callId,requestHash,role,maxUsdMicros}),settle:({callId,chargedUsdMicros,uncertain})=>f.post('settle',{callId,chargedUsdMicros,uncertain})};
  const roles=['curriculum','subject','design','developer','reviewer'];let index=0,requests=0;
  const call=createBoundedResponses({apiKey:'sk-'+'fixture-only'.repeat(3),ledger,now:()=>Date.parse('2026-10-04T00:00:00Z'),transport:async(url,options)=>{
   requests++;if(url.endsWith('/input_tokens'))return Response.json({object:'response.input_tokens',input_tokens:100});
   const role=roles[index++],input=JSON.parse(JSON.parse(options.body).input[1].content);let value;
   if(role==='developer')value={files:[{path:'meta.json',content:JSON.stringify(f.meta)},{path:'index.html',content:'<!doctype html><canvas></canvas>'}]};
   else if(role==='design')value={status:'pass',plan:'Synthetic fixture.',blockingIssues:[]};
   else if(role==='reviewer')value={status:'pass',candidateHash:input.candidate.candidateHash,checks:{science:'pass',learning:'pass',curriculum:'pass',textbook:'pass'},findings:[],blockingIssues:[]};
   else value={status:'pass',findings:[],blockingIssues:[]};
   return Response.json({model:PRICING.model,service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:200},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
  }});
  const verify=async({candidate,attempt})=>{
   const info={candidateHash:candidate.candidateHash,attempt};
   assert.equal((await f.post('runtime',info)).pending,true);
   assert.deepEqual(await f.post('verification',{attempt:1},{role:'report'}),{state:'pending'});
   const packet=await f.post('verification',{attempt},{role:'report'});assert.equal(packet.state,'ready');
   assert.equal(packet.packet.expected.candidateHash,candidate.candidateHash);assert.equal(packet.packet.expected.sourceSnapshotHash,source.sourceSnapshotHash);
   assert.deepEqual(JSON.parse(packet.packet.candidateText).files,candidate.files);
   const snapshot=await f.post('candidate',info,{role:'report'});assert.deepEqual(snapshot.candidate,candidate);
   // Synthetic observations test transport/binding only, not an actual browser.
   const observations=[390,1440].map(width=>({width,controlChanged:true,outputChanged:true,viewChanged:true,resetRestored:true,initialViewHash:'a'.repeat(64),changedViewHash:'b'.repeat(64),webgl:{width:320,height:240,lost:false},cameraChanged:true,alternativeVisible:true}));
   observations.push({width:390,webglUnavailable:true,alternativeVisible:true});
   const report=runtimeSubmission({...info,sourceSnapshotHash:source.sourceSnapshotHash,baselineSha:sha,checks:{runtime:'pass',contract:'pass'},checksExecuted:['runtime','contract'],issues:[],contractVersion:'browser-v1',browserVersion:'150.0.0.0',browserStopped:true,durationMs:100,requests:12,observations});
   assert.equal((await f.request('runtime-report',{...report,sourceSnapshotHash:'b'.repeat(64)},{role:'report'})).status,403);
   assert.equal((await f.request('runtime-report',{...report,details:{...report.details,observations:[]}},{role:'report'})).status,400);
   await f.post('runtime-report',report,{role:'report'});
   assert.deepEqual(await f.post('verification',{attempt},{role:'report'}),{state:'done'});
   const result=await f.post('runtime',info);assert.equal(result.pending,false);reported=result.evidence;return reported;
  };
  const outcome=await executeStoredPipeline({jobId:f.jobId,input:source.input,context:source.context},{store,call,verify});
  assert.equal(outcome.job.state,'awaiting_approval');assert.equal(requests,10);
  assert.equal((await f.db.query('select count(*)::int n from studio.worker_evidence')).rows[0].n,8);
  const budget=(await f.db.query('select state,spent_usd_micros from studio.budget_jobs')).rows[0];assert.deepEqual(budget,{state:'closed',spent_usd_micros:4875});
  assert.equal((await f.db.query('select count(*)::int n from studio.approvals')).rows[0].n,0);
  const ended=await f.post('verification',{attempt:1},{role:'report'});assert.deepEqual(ended,{state:'done'});assert.equal(ended.packet,undefined);
 }finally{await f.db.close();}
});
test('a slow authenticated request body is cancelled at the five-second deadline',async()=>{
 let consumed=0,cancelled=false;
 const handler=createWorkerHttpHandler({verifyToken:async()=>({role:'generation'}),gateway:{consume:async()=>{consumed++;}}});
 const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});
 const request=new Request(WORKER_TRUST.origin+'/api/worker/input',{method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half'});
 const result=await handler(request,'input');assert.equal(result.status,408);assert.equal((await result.json()).error,'WORKER_BODY_TIMEOUT');assert.equal(consumed,0);assert.equal(cancelled,true);
});
