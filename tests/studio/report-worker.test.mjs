import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {reportWorker,reportIdentity} from '../../automation/runner/report-worker.mjs';
import {runtimeFixture} from './runtime-fixture.mjs';
import {runtimeSubmission} from '../../packages/contracts/runtime-report.js';
import {WORKER_TRUST} from '../../apps/studio/lib/worker-auth.mjs';

const f=runtimeFixture(),packet={inputText:f.inputText,candidateText:f.candidateText,expected:f.expected};
const envFor=folder=>({GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:WORKER_TRUST.repository,GITHUB_REF:WORKER_TRUST.ref,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'101',GITHUB_SHA:f.expected.baselineSha,STUDIO_ATTEMPT:'0',STUDIO_JOB_ID:randomUUID(),STUDIO_TRANSFER_KEY:randomBytes(32).toString('base64'),RUNNER_TEMP:folder,GITHUB_OUTPUT:path.join(folder,'outputs'),STUDIO_CHECKER_IMAGE:'sha256:'+'a'.repeat(64)});
test('reporter checks deployment/run/attempt and verifier refuses inherited OIDC or provider credentials',async()=>{
 const env=envFor(os.tmpdir());assert.equal(reportIdentity(env).runId,101);
 for(const change of [{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_REF:'refs/pull/1/merge'},{STUDIO_ATTEMPT:'3'},{STUDIO_TRANSFER_KEY:'not-a-key'},{STUDIO_JOB_ID:'../../private'}])assert.throws(()=>reportIdentity({...env,...change}),/REPORT_WORKER_CONFIGURATION/);
 for(const key of ['OPENAI_API_KEY','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL'])await assert.rejects(reportWorker('verify',{env:{...env,[key]:'synthetic'}}),/REPORT_WORKER_CONFIGURATION/);
});
test('fetch writes only ciphertext and boolean output; stopped job emits no packet and stale report is not sent',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'studio-report-test-')),env=envFor(folder);
 try{
  const api={post:async()=>({state:'ready',packet})};
  assert.deepEqual(await reportWorker('fetch',{env,api}),{state:'ready'});
  const text=await readFile(path.join(folder,'studio-packet-0/candidate.sealed.json'),'utf8');assert.equal(text.includes('검사용 도형'),false);
  assert.equal(await readFile(env.GITHUB_OUTPUT,'utf8'),'ready=true\n');
  await assert.rejects(reportWorker('verify',{env:{...env,GITHUB_RUN_ID:'102'},verify:()=>{throw Error('must not run');}}),/REPORT_WORKER_CONFIGURATION/);
  const report=runtimeSubmission({...f.expected,contractVersion:'browser-v1',browserStopped:true,durationMs:0,requests:0,checks:{contract:'fail',runtime:'not_run'},checksExecuted:['contract'],issues:['RUNTIME_JS_SYNTAX'],observations:[]});
  await reportWorker('verify',{env,verify:async candidate=>{assert.deepEqual(candidate,packet);return report;}});
  let sends=0;
  await assert.rejects(reportWorker('report',{env,api:{post:async action=>{sends++;assert.equal(action,'verification');return {state:'ready',packet:{...packet,expected:{...packet.expected,attempt:1}}};}}}),/REPORT_WORKER_CONFIGURATION/);assert.equal(sends,1);
  const done=await reportWorker('fetch',{env:{...env,STUDIO_ATTEMPT:'1'},api:{post:async()=>({state:'done'})}});assert.equal(done.state,'done');
  await assert.rejects(readFile(path.join(folder,'studio-packet-1/candidate.sealed.json')),/ENOENT/);
 }finally{assert.ok(path.resolve(folder).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(folder,{recursive:true,force:true});}
});
