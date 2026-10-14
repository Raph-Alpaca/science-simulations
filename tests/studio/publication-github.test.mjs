import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PUBLICATION_TARGET,publicationGitHubDispatchConfig,createGitHubPublicationDispatcher} from '../../apps/studio/lib/github-dispatch.mjs';
import {syntheticDispatchEnv,syntheticGitHub} from './github-dispatch-fixture.mjs';
const env={...syntheticDispatchEnv,STUDIO_PUBLICATION_DISPATCH_ENABLED:'true',STUDIO_PUBLICATION_TRUSTED_SHAS:'a'.repeat(40)};
const config=publicationGitHubDispatchConfig(env);

test('publication transport sends only the intent UUID to the fixed verifier workflow with narrow App token',async()=>{
 const p=syntheticGitHub({publication:true}),intent=randomUUID();
 const r=await createGitHubPublicationDispatcher(config,p).dispatch(intent);
 assert.deepEqual(r,{state:'submitted',runId:'12345',trustedSha:'a'.repeat(40)});
 assert.equal(PUBLICATION_TARGET.workflow,'studio-publication.yml');
 const writes=p.calls.filter(c=>c.endpoint.endsWith('/dispatches'));assert.equal(writes.length,1);
 assert.equal(writes[0].endpoint,'/repos/Raph-Alpaca/science-simulations/actions/workflows/studio-publication.yml/dispatches');
 assert.deepEqual(writes[0].body,{ref:'main',inputs:{publication_id:intent}});
 assert.deepEqual(p.calls[0].body.permissions,{actions:'write',contents:'read'});
 assert.equal(p.calls.at(-1).method,'DELETE');
});

test('publication gate and reviewed SHAs are independent and never default to generation settings',()=>{
 assert.throws(()=>publicationGitHubDispatchConfig(syntheticDispatchEnv));
 for(const patch of [{STUDIO_PUBLICATION_DISPATCH_ENABLED:'false'},{STUDIO_PUBLICATION_TRUSTED_SHAS:''},{STUDIO_PUBLICATION_TRUSTED_SHAS:'main'},{STUDIO_PUBLICATION_TRUSTED_SHAS:['a'.repeat(40),'a'.repeat(40)].join(',')}])assert.throws(()=>publicationGitHubDispatchConfig({...env,...patch}));
 const isolated=publicationGitHubDispatchConfig({...env,STUDIO_WORKER_API_ENABLED:'false',STUDIO_DISPATCH_ENABLED:'false'});
 assert.deepEqual(isolated.trustedShas,['a'.repeat(40)]);
});

test('wrong publication workflow, privilege or main is rejected before dispatch; mismatched returned run stays uncertain',async()=>{
 for(const [endpoint,change,posted] of [
  ['/access_tokens',r=>{r.body.permissions.pages='write';},false],
  ['/studio-publication.yml',r=>{r.body.path='.github/workflows/studio-worker.yml';},false],
  ['/heads/main',r=>{r.body.object.sha='b'.repeat(40);},false],
  ['/runs/12345',r=>{r.body.path='.github/workflows/studio-worker.yml';},true],
  ['/dispatches',r=>{r.status=503;r.body={};},true]
 ]){
  const p=syntheticGitHub({publication:true,change:(e,r)=>{if(e.endsWith(endpoint))change(r);return r;}});
  const r=await createGitHubPublicationDispatcher(config,p).dispatch(randomUUID());
  assert.equal(r.state,posted?'uncertain':'failed');assert.equal(p.calls.filter(c=>c.endpoint.endsWith('/dispatches')).length,posted?1:0);
  assert.equal(p.calls.at(-1).method,'DELETE');
 }
});
