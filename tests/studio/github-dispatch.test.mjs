import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {githubDispatchConfig,createGitHubDispatcher} from '../../apps/studio/lib/github-dispatch.mjs';
import {TARGET} from '../../apps/studio/lib/dispatcher.mjs';
import {syntheticDispatchEnv,syntheticGitHub} from './github-dispatch-fixture.mjs';
const config=githubDispatchConfig(syntheticDispatchEnv);
test('GitHub App transport signs scoped JWT, verifies exact repo/workflow/ref/run, sends only UUID once, revokes token',async()=>{
 const provider=syntheticGitHub(),job=randomUUID();const result=await createGitHubDispatcher(config,provider).dispatch(job);
 assert.deepEqual(result,{state:'submitted',runId:'12345',trustedSha:'a'.repeat(40)});assert.equal(provider.calls.length,7);
 assert.deepEqual(provider.calls[0].body,{repository_ids:[1368255570],permissions:{actions:'write',contents:'read'}});
 assert.deepEqual(provider.calls.find(c=>c.endpoint.endsWith('/dispatches')).body,{ref:'main',inputs:{mode:'generate',job_id:job}});
 assert.equal(provider.calls.at(-1).method,'DELETE');assert.equal(JSON.stringify(result).includes('token'),false);
});
test('missing gates/key/trusted SHA fails without any provider request',()=>{
 for(const changes of [{STUDIO_DISPATCH_ENABLED:'false'},{STUDIO_GITHUB_APP_PRIVATE_KEY:'invalid'},{STUDIO_WORKER_TRUSTED_SHAS:'main'},{STUDIO_GITHUB_INSTALLATION_ID:'1/../../x'},{STUDIO_INPUT_REVIEW_ENABLED:'false'}])assert.throws(()=>githubDispatchConfig({...syntheticDispatchEnv,...changes}),/RUNNER_CONNECTION_REQUIRED/);
});
test('excess token privilege, repository transfer, missing workflow, unreviewed main and preflight outage never dispatch',async()=>{
 const cases=[
  [e=>e.endsWith('/access_tokens'),r=>{r.body.permissions.contents='write';}],
  [e=>e.endsWith('/access_tokens'),r=>{r.body.repositories.push(structuredClone(r.body.repositories[0]));}],
  [e=>e.endsWith('/science-simulations'),r=>{r.body.owner.id=1;}],
  [e=>e.endsWith('/studio-worker.yml'),r=>{r.status=404;}],
  [e=>e.endsWith('/heads/main'),r=>{r.body.object.sha='b'.repeat(40);}]
 ];
 for(const [match,mutate] of cases){const p=syntheticGitHub({change:(e,r)=>{if(match(e))mutate(r);return r;}});assert.equal((await createGitHubDispatcher(config,p).dispatch(randomUUID())).state,'failed');assert.equal(p.calls.some(c=>c.endpoint.endsWith('/dispatches')),false);assert.equal(p.calls.at(-1).method,'DELETE');}
 const p=syntheticGitHub({fail:'/repos/'+TARGET.repository});assert.equal((await createGitHubDispatcher(config,p).dispatch(randomUUID())).state,'failed');
});
test('POST loss, provider rejection, wrong run SHA/attempt/repository and post-dispatch read failure retain uncertainty',async()=>{
 const prefix='/repos/'+TARGET.repository;
 const cases=[{fail:prefix+'/actions/workflows/studio-worker.yml/dispatches'},
  {change:(e,r)=>e.endsWith('/dispatches')?{status:503,body:{}}:r},
  ...[v=>{v.head_sha='b'.repeat(40);},v=>{v.run_attempt=2;},v=>{v.head_repository.id=1;},v=>{v.event='push';},v=>{v.path='.github/workflows/other.yml';}].map(mutate=>({change:(e,r)=>{if(e.includes('/actions/runs/'))mutate(r.body);return r;}})),
  {fail:prefix+'/actions/runs/12345'}];
 for(const options of cases){const p=syntheticGitHub(options),r=await createGitHubDispatcher(config,p).dispatch(randomUUID());assert.equal(r.state,'uncertain');assert.equal(r.code,'DISPATCH_UNCERTAIN');assert.equal('runId' in r,false);assert.equal(p.calls.filter(c=>c.endpoint.endsWith('/dispatches')).length,1);assert.equal(p.calls.at(-1).method,'DELETE');}
});
test('abort during a stalled dispatch is bounded and does not retry or expose upstream data',async()=>{
 const p=syntheticGitHub(),controller=new AbortController();
 const transport=(url,options)=>{if(url.endsWith('/dispatches')){setTimeout(()=>controller.abort(),20);return new Promise(()=>{});}return p.transport(url,options);};
 const started=Date.now(),result=await createGitHubDispatcher(config,{transport}).dispatch(randomUUID(),{signal:controller.signal});
 assert.ok(Date.now()-started<2000);assert.deepEqual(result,{state:'uncertain',code:'DISPATCH_UNCERTAIN'});assert.equal(p.calls.at(-1).endpoint,'/installation/token');
});
