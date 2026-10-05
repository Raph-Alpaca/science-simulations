import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkerApiClient} from '../../automation/runner/worker-client.mjs';
import {createRemoteGeneration,runRemoteGeneration,RUNTIME_POLL} from '../../automation/runner/remote-generation.mjs';
import {PRICING} from '../../automation/runner/bounded-responses.mjs';
import {runtimeSubmission} from '../../packages/contracts/runtime-report.js';
import {setup,token,sha} from './worker-http-fixture.mjs';
import {runtimeFixture} from './runtime-fixture.mjs';
import {reportWorker} from '../../automation/runner/report-worker.mjs';
import {WORKER_TRUST} from '../../apps/studio/lib/worker-auth.mjs';
import {revisionFixture} from './revision-fixture.mjs';

const syntheticKey='sk-'+'fixture-only'.repeat(3);
const now=()=>Date.parse('2026-10-04T00:00:00Z');

test('signed revision worker receives the exact baseline, creates fresh evidence and advances the same content lineage',async()=>{
 const f=await revisionFixture();let modelCalls=0;
 try{
  const body=await f.body(),parent=await f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId});
  const {review}=await f.revision.prepare(f.jobId,body);await f.approve(review);const child=(await f.submit(review)).job;
  await f.rpc('bind_worker_run',{p_job:child.id,p_run:102,p_attempt:1});
  const api=createWorkerApiClient({jobId:child.id,getToken:async()=>(await token('generation','102')).slice(7),transport:f.transport});
  const reporter=createWorkerApiClient({jobId:child.id,getToken:async()=>(await token('report','102')).slice(7),transport:f.transport});
  const wrong=await f.request('input',{}, {jobId:child.id});assert.equal(wrong.status,403);
  await assert.rejects(reporter.post('input'),/WORKER_API_REJECTED/);
  const roles=['curriculum','subject','design','developer','reviewer'];
  const outcome=await runRemoteGeneration({api,jobId:child.id,baselineSha:sha,apiKey:syntheticKey,now,
   providerTransport:async(url,options)=>{
    if(url.endsWith('/input_tokens'))return Response.json({object:'response.input_tokens',input_tokens:100});
    const role=roles[modelCalls++],data=JSON.parse(JSON.parse(options.body).input[1].content);let value;
    assert.equal(data.input.requirements.length,2);assert.equal(data.context.contentId,f.context.contentId);
    if(role==='developer'||role==='reviewer')assert.deepEqual(data.previousCandidate,f.candidate);
    if(role==='developer')value={files:f.candidate.files.map(file=>file.path==='index.html'?{...file,content:'<!doctype html><h1>수정 결과</h1><p>초기화 설명</p>'}:file)};
    else if(role==='design')value={status:'pass',plan:'Synthetic revision plan.',blockingIssues:[]};
    else if(role==='reviewer')value={status:'pass',candidateHash:data.candidate.candidateHash,checks:{science:'pass',learning:'pass',curriculum:'pass',textbook:'pass'},findings:[],blockingIssues:[]};
    else value={status:'pass',findings:[],blockingIssues:[]};
    return Response.json({model:PRICING.model,service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:200},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
   },pollWait:async()=>{
    const {packet}=await reporter.post('verification',{attempt:0});
    assert.equal(packet.inputText.includes('baseCandidateText'),false);
    await reporter.post('runtime-report',reportFor({sourceSnapshotHash:review.sourceHash},packet.expected.candidateHash));
   },
  });
  assert.equal(outcome.job.state,'awaiting_approval');assert.equal(modelCalls,5);
  const {result}=await f.service.read(child.id);assert.equal(result.candidate.contentId,f.context.contentId);assert.notEqual(result.version.candidateHash,f.candidate.candidateHash);
  assert.deepEqual(result.revision,{parentJobId:f.jobId,candidateHash:f.candidate.candidateHash});assert.equal(result.publication.eligible,false);
  assert.deepEqual(await f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId}),parent);
  await assert.rejects(f.revision.prepare(f.jobId,await f.body()),/REVISION_CHANGED/);
  const feedback=(await f.service.feedback(child.id,{version:result.version,decision:'request_changes',note:'다음에는 관찰 안내를 보완해 주세요.',clientRequestId:randomUUID()})).feedback;
  const next=await f.revision.prepare(child.id,{version:result.version,feedbackId:feedback.id,clientRequestId:randomUUID()});
  assert.equal(next.review.contentId,f.context.contentId);assert.equal(next.review.requirementItems.length,3);assert.equal(next.review.revision.candidateHash,result.version.candidateHash);
  assert.equal((await f.db.query('select count(*)::int n from studio.approvals')).rows[0].n,0);
 }finally{await f.db.close();}
});
function clients(f){
 const actions=[];
 const generation=createWorkerApiClient({jobId:f.jobId,getToken:async()=>(await token()).slice(7),transport:(url,options)=>{actions.push(new URL(url).pathname.split('/').at(-1));return f.transport(url,options);}});
 const reporter=createWorkerApiClient({jobId:f.jobId,getToken:async()=>(await token('report')).slice(7),transport:f.transport});
 return {generation,reporter,actions};
}
function reportFor(f,candidateHash){
 const observations=[390,1440].map(width=>({width,controlChanged:true,outputChanged:true,viewChanged:true,resetRestored:true,initialViewHash:'a'.repeat(64),changedViewHash:'b'.repeat(64),webgl:{width:320,height:240,lost:false},cameraChanged:true,alternativeVisible:true}));
 observations.push({width:390,webglUnavailable:true,alternativeVisible:true});
 return runtimeSubmission({candidateHash,sourceSnapshotHash:f.sourceSnapshotHash,baselineSha:sha,attempt:0,checks:{contract:'pass',runtime:'pass'},checksExecuted:['contract','runtime'],issues:[],contractVersion:'browser-v1',browserVersion:'150.0.0.0',browserStopped:true,durationMs:100,requests:12,observations});
}

test('remote generation uses fresh signed requests for all budget/evidence steps and waits for a separate reporter',async()=>{
 const f=await setup(),c=clients(f),folder=await mkdtemp(path.join(os.tmpdir(),'studio-remote-test-'));let modelCalls=0,waits=0;
 try{
  const roles=['curriculum','subject','design','developer','reviewer'];
  const outcome=await runRemoteGeneration({api:c.generation,jobId:f.jobId,baselineSha:sha,apiKey:syntheticKey,now,
   providerTransport:async(url,options)=>{
    if(url.endsWith('/input_tokens'))return Response.json({object:'response.input_tokens',input_tokens:100});
    const role=roles[modelCalls++],data=JSON.parse(JSON.parse(options.body).input[1].content);let value;
    if(role==='developer')value={files:[{path:'meta.json',content:JSON.stringify(f.meta)},{path:'index.html',content:'<!doctype html><canvas></canvas>'}]};
    else if(role==='design')value={status:'pass',plan:'Synthetic transport check.',blockingIssues:[]};
    else if(role==='reviewer')value={status:'pass',candidateHash:data.candidate.candidateHash,checks:{science:'pass',learning:'pass',curriculum:'pass',textbook:'pass'},findings:[],blockingIssues:[]};
    else value={status:'pass',findings:[],blockingIssues:[]};
    return Response.json({model:PRICING.model,service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:200},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
   },
   pollWait:async ms=>{
    assert.equal(ms,RUNTIME_POLL.intervalMs);waits++;
    const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:WORKER_TRUST.repository,GITHUB_REF:WORKER_TRUST.ref,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'101',GITHUB_SHA:sha,STUDIO_ATTEMPT:'0',STUDIO_JOB_ID:f.jobId,STUDIO_TRANSFER_KEY:randomBytes(32).toString('base64'),RUNNER_TEMP:folder,GITHUB_OUTPUT:path.join(folder,'outputs'),STUDIO_CHECKER_IMAGE:'sha256:'+'a'.repeat(64)};
    assert.equal((await reportWorker('fetch',{env,api:c.reporter})).state,'ready');
    const encrypted=await readFile(path.join(folder,'studio-packet-0/candidate.sealed.json'),'utf8');assert.equal(encrypted.includes('<canvas'),false);
    assert.equal((await reportWorker('verify',{env,verify:async packet=>reportFor(f,packet.expected.candidateHash)})).state,'verified');
    assert.equal((await reportWorker('report',{env,api:c.reporter})).state,'reported');
   },
  });
  assert.equal(outcome.job.state,'awaiting_approval');assert.equal(outcome.result.calls,5);assert.equal(modelCalls,5);assert.equal(waits,1);
  assert.equal(c.actions.filter(a=>a==='runtime').length,2);assert.equal(c.actions.includes('runtime-report'),false);
  const budget=(await f.db.query('select state,spent_usd_micros from studio.budget_jobs')).rows[0];assert.deepEqual(budget,{state:'closed',spent_usd_micros:4875});
  assert.equal((await f.db.query('select count(*)::int n from studio.worker_evidence')).rows[0].n,8);
  assert.equal((await f.db.query('select count(*)::int n from studio.approvals')).rows[0].n,0);
  assert.ok(c.generation.requests<200);
 }finally{await f.db.close();assert.ok(path.resolve(folder).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(folder,{recursive:true,force:true});}
});
test('cancellation after provider generation still settles known use and acknowledges cancellation',async()=>{
 const f=await setup(),c=clients(f),controller=new AbortController();let sent=0;
 try{
  const outcome=await runRemoteGeneration({api:c.generation,jobId:f.jobId,baselineSha:sha,apiKey:syntheticKey,now,signal:controller.signal,
   providerTransport:async url=>{
    if(url.endsWith('/input_tokens'))return Response.json({object:'response.input_tokens',input_tokens:100});
    sent++;controller.abort();return Response.json({model:PRICING.model,service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:200},output:[{type:'message',content:[{type:'output_text',text:'{"status":"pass","findings":[],"blockingIssues":[]}'}]}]});
   },
  });
  assert.equal(outcome.job.state,'cancelled');assert.equal(sent,1);assert.ok(c.actions.includes('settle'));assert.equal(c.actions.at(-1),'finish');
  assert.deepEqual((await f.db.query('select state,spent_usd_micros from studio.budget_jobs')).rows[0],{state:'closed',spent_usd_micros:975});
 }finally{await f.db.close();}
});
test('a lost provider response is sent once and retains the uncertain charge and global slot',async()=>{
 const f=await setup(),c=clients(f);let sent=0;
 try{
  const outcome=await runRemoteGeneration({api:c.generation,jobId:f.jobId,baselineSha:sha,apiKey:syntheticKey,now,providerTransport:async url=>{
   if(url.endsWith('/input_tokens'))return Response.json({object:'response.input_tokens',input_tokens:100});sent++;throw Error('UNTRUSTED_PRIVATE_ERROR');
  }});
  assert.equal(outcome.job.state,'failed');assert.equal(outcome.job.errorCode,'COST_UNCERTAIN');assert.equal(sent,1);
  const budget=(await f.db.query('select state,held_usd_micros from studio.budget_jobs')).rows[0];assert.equal(budget.state,'uncertain');assert.ok(budget.held_usd_micros>0);
  assert.equal(JSON.stringify(outcome).includes('UNTRUSTED_PRIVATE_ERROR'),false);
 }finally{await f.db.close();}
});
test('runtime polling stops at its fixed count, cancellation or first transport error; generation cannot invent a report',async()=>{
 const f=runtimeFixture(),source=JSON.parse(f.inputText),jobId=randomUUID();
 for(const mode of ['limit','cancel','error']){
  let polls=0,waits=0;const controller=new AbortController();
  const api={async post(action){if(action==='input')return {...source,sourceSnapshotHash:f.expected.sourceSnapshotHash};assert.equal(action,'runtime');polls++;if(mode==='error')throw Error('TRANSPORT_FAILED');return {pending:true};}};
  const remote=await createRemoteGeneration({api,jobId,baselineSha:sha,pollWait:async ms=>{assert.equal(ms,RUNTIME_POLL.intervalMs);waits++;if(mode==='cancel')controller.abort();}});
  await assert.rejects(remote.verify({jobId,attempt:0,candidate:f.bundle.candidate,sourceSnapshotHash:f.expected.sourceSnapshotHash,signal:controller.signal}),new RegExp(mode==='limit'?'WORKER_RUNTIME_WAIT_LIMIT':mode==='cancel'?'WORKER_CANCELLED':'TRANSPORT_FAILED'));
  assert.equal(polls,mode==='limit'?40:1);assert.equal(waits,mode==='limit'?39:mode==='cancel'?1:0);
  await assert.rejects(remote.store.record({jobId,sourceSnapshotHash:f.expected.sourceSnapshotHash,kind:'runtime_evidence',attempt:0,evidence:{checks:{runtime:'pass'}}}),/WORKER_RUNTIME_NOT_REPORTED/);
 }
});
