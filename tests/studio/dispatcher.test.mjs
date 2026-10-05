import {test} from 'node:test';import assert from 'node:assert/strict';
import {Dispatcher,GitHubActionsAdapter,MockAdapter,TARGET,githubRequest,independentSpecification} from '../../apps/studio/lib/dispatcher.mjs';
import {requestEnvelope,conversationTitle} from '../../apps/studio/lib/domain.mjs';
const id='00000000-0000-4000-8000-000000000001';const config={...TARGET,appClientId:'fixture',installationId:'1',repositoryId:'2'};
test('v1 preserved, v2 excludes year; independent spec never includes schoolYear',()=>{
 const v1={schemaVersion:1,conversationId:id,clientRequestId:id,operation:'create_simulation',payload:{topic:'T',grade:3,unit:'U',requirements:'R',schoolYear:2025,targetContentId:null,expectedVersion:null}};
 assert.deepEqual(requestEnvelope(v1),v1);const v2=structuredClone(v1);v2.schemaVersion=2;assert.throws(()=>requestEnvelope(v2));delete v2.payload.schoolYear;assert.deepEqual(requestEnvelope(v2),v2);assert.equal(independentSpecification(v1).schoolYear,undefined);assert.equal(independentSpecification(v2).curriculum.revision,'2022');for(const title of ['', '   ', 'x'.repeat(121)])assert.throws(()=>conversationTitle(title));assert.equal(conversationTitle(' A '),'A');
});
test('fixed generation dispatch contains only its mode and job ID; unconfigured/mode mismatch fail closed',async()=>{
 assert.deepEqual(JSON.parse(githubRequest(id,config).body),{ref:'main',inputs:{mode:'generate',job_id:id}});
 assert.throws(()=>githubRequest(id,{...config,repository:'other/repo'}));
 await assert.rejects(()=>new GitHubActionsAdapter(config).dispatch({id,execution_mode:'real'}),/RUNNER_CONNECTION_REQUIRED/);
 await assert.rejects(()=>new GitHubActionsAdapter(config).dispatch({id,execution_mode:'mock'}),/MODE_MISMATCH/);
 assert.equal((await new MockAdapter().dispatch({id,execution_mode:'mock'})).state,'mock');
});
test('atomic store contract prevents duplicate send; network uncertainty retained, never blind retry',async()=>{
 const claims=new Set();let calls=0,receipt;const store={async claim(id){if(claims.has(id))return false;claims.add(id);return true;},async finish(id,r){receipt=r;}};
 const adapter=new GitHubActionsAdapter(config,async()=>{calls++;throw new Error('private upstream diagnostic');});
 const d=new Dispatcher(store,adapter),job={id,execution_mode:'real'};const results=await Promise.allSettled([d.dispatch(job),d.dispatch(job)]);assert.equal(calls,1);assert.equal(results.every(r=>r.status==='rejected'),true);assert.equal(receipt.code,'DISPATCH_UNCERTAIN');assert.equal(JSON.stringify(receipt).includes('private'),false);
});

test('GitHub response status mapping and accepted run are distinct from completion',async()=>{
 const job={id,execution_mode:'real'};
 for(const [status,code] of [[403,'RUNNER_PERMISSION_DENIED'],[429,'RUNNER_RATE_LIMITED'],[500,'DISPATCH_UNCERTAIN']])await assert.rejects(()=>new GitHubActionsAdapter(config,async()=>({status})).dispatch(job),e=>e.code===code);
 assert.deepEqual(await new GitHubActionsAdapter(config,async()=>({status:200,body:{workflow_run_id:12}})).dispatch(job),{state:'submitted',runId:'12'});
 await assert.rejects(()=>new GitHubActionsAdapter(config,async()=>({status:200,body:{}})).dispatch(job),/DISPATCH_UNCERTAIN/);
});
