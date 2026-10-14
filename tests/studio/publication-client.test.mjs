import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {publicationApiFixture} from './publication-api-fixture.mjs';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
import {createPublicationApiClient,createPublicationTokenProvider,downloadPublicationArtifact,PublicationClientError,PUBLICATION_CLIENT_LIMITS} from '../../automation/publish/artifact-client.mjs';
import {encodeArtifactBundle,openArtifactBundle} from '../../automation/publish/artifact-bundle.mjs';
const run={publicationId:randomUUID(),runId:12345,workflowSha:'a'.repeat(40)};
const fakeToken=()=>['synthetic',Buffer.from(randomUUID()).toString('base64url'),'signature'].join('.');
const simple=encodeArtifactBundle(['catalog.json','index.html'].map(path=>({path,bytesBase64:Buffer.from(path==='index.html'?'<!doctype html>':'{}').toString('base64')})));
const opened=openArtifactBundle(simple.artifactText,simple.artifactHash);
const proposalText=JSON.stringify({schemaVersion:1,jobId:randomUUID(),contentId:'synthetic',candidateHash:'b'.repeat(64),sourceSnapshotHash:'c'.repeat(64),baselineSha:run.workflowSha,attempt:0,baseArtifactHash:'d'.repeat(64),artifactHash:simple.artifactHash,entry:'index.html'});
const binding={...run,approvalId:randomUUID(),reviewId:randomUUID(),runAttempt:1,proposalHash:createHash('sha256').update(proposalText).digest('hex'),artifactHash:simple.artifactHash};
const manifest={binding,manifest:opened.manifest,bytes:opened.bytes,inspection:{proposalText,generationKind:'interactive_2d'},published:false};

test('bounded client downloads all exact bytes through RSA-authenticated HTTP and SQL receipts',async()=>{
 const f=await publicationApiFixture();try{
  await f.enableApi();let active=0,maxActive=0;
  const client=createPublicationApiClient({publicationId:f.intent.id,runId:12345,workflowSha:f.sha,getToken:async()=> (await f.sign()).slice(7),transport:async(url,init)=>{
   assert.equal(new URL(url).origin,PUBLICATION_TRUST.origin);assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.ok(init.signal instanceof AbortSignal);
   active++;maxActive=Math.max(maxActive,active);try{return await f.handler(new Request(url,init),new URL(url).pathname.split('/').at(-1));}finally{active--;}
  }});
  const result=await downloadPublicationArtifact(client);const packet=openArtifactBundle(result.artifactText,result.artifactHash);
  assert.equal(result.artifactHash,f.intent.artifact_hash);assert.equal(result.binding.approvalId,f.approval.id);assert.equal(result.published,false);
  assert.equal(client.requests,packet.files.length+1);assert.ok(maxActive<=3);
  assert.equal((await f.db.query('select count(*)::int n from studio.publication_oidc_receipts')).rows[0].n,client.requests);
  assert.equal((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n,0);
 }finally{await f.db.close();}
});

test('changed bytes or approval binding cannot produce a complete artifact',async()=>{
 for(const corrupt of ['bytes','binding']){
  const client=createPublicationApiClient({...run,getToken:async()=>fakeToken(),transport:async(_url,init)=>{
   const {payload}=JSON.parse(init.body);if(!payload.path)return Response.json(manifest);
   const stored=opened.files.find(f=>f.path===payload.path),expected=opened.manifest.find(f=>f.path===payload.path);
   return Response.json({binding:corrupt==='binding'?{...binding,approvalId:randomUUID()}:binding,file:{...stored,hash:expected.hash,...(corrupt==='bytes'?{bytesBase64:Buffer.from('tampered').toString('base64')}:{})},published:false});
  }});
  await assert.rejects(()=>downloadPublicationArtifact(client),/PUBLICATION_FILE_CHANGED/);assert.ok(client.requests<=3);
 }
});

test('token reuse, response bounds, unavailable service and stalled transport never retry',async()=>{
 const token=fakeToken();let requests=0;
 const reuse=createPublicationApiClient({...run,getToken:async()=>token,transport:async()=>{requests++;return Response.json(manifest);}});
 await reuse.post('manifest');await assert.rejects(()=>reuse.post('manifest'),/PUBLICATION_TOKEN_REUSED/);assert.equal(requests,1);
 for(const [transport,code] of [[async()=>new Response('x'.repeat(3000001),{headers:{'content-type':'application/json'}}),'PUBLICATION_RESPONSE_LIMIT'],[async()=>new Response(null,{status:503}),'PUBLICATION_HTTP_REJECTED'],[()=>new Promise(()=>{}),'PUBLICATION_REQUEST_TIMEOUT']]){
  let calls=0;const client=createPublicationApiClient({...run,totalMs:100,getToken:async()=>fakeToken(),transport:(...args)=>{calls++;return transport(...args);}});
  const start=Date.now();await assert.rejects(()=>client.post('manifest'),e=>e instanceof PublicationClientError&&e.code===code);assert.ok(Date.now()-start<3000);assert.equal(calls,1);
 }
 const unavailable=createPublicationApiClient({...run,totalMs:100,getToken:()=>new Promise(()=>{}),transport:()=>assert.fail('must not reach HTTP')});await assert.rejects(()=>unavailable.post('manifest'),/PUBLICATION_OIDC_TIMEOUT/);
});

test('request count and abort limits apply before additional network access',async()=>{
 let count=0;const client=createPublicationApiClient({...run,getToken:async()=>fakeToken(),transport:async()=>{count++;return Response.json(manifest);}});
 for(let i=0;i<PUBLICATION_CLIENT_LIMITS.requests;i++)await client.post('manifest');
 await assert.rejects(()=>client.post('manifest'),/PUBLICATION_REQUEST_LIMIT/);assert.equal(count,101);
 const controller=new AbortController();controller.abort();
 const stopped=createPublicationApiClient({...run,getToken:async()=>assert.fail('must not request identity'),transport:()=>assert.fail('must not reach HTTP')});
 await assert.rejects(()=>stopped.post('manifest',{}, {signal:controller.signal}),PublicationClientError);
});

test('GitHub identity provider uses only the fixed publication audience and validated runner URL',async()=>{
 const env={GITHUB_ACTIONS:'true',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'synthetic-runner-secret',ACTIONS_ID_TOKEN_REQUEST_URL:'https://example.actions.githubusercontent.com/token'};
 const expected=fakeToken();let calls=0;
 const provider=createPublicationTokenProvider(env,{transport:async(url,init)=>{calls++;assert.equal(new URL(url).searchParams.get('audience'),PUBLICATION_TRUST.audience);assert.equal(init.headers.Authorization,'Bearer synthetic-runner-secret');assert.equal(init.redirect,'error');return Response.json({value:expected});}});
 assert.equal(await provider(),expected);assert.equal(calls,1);
 const credentials=new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);credentials.username='synthetic';credentials.password='synthetic';
 for(const url of ['http://example.actions.githubusercontent.com/token','https://attacker.invalid/token','https://example.actions.githubusercontent.com.attacker.invalid/token',credentials.href])assert.throws(()=>createPublicationTokenProvider({...env,ACTIONS_ID_TOKEN_REQUEST_URL:url}),/PUBLICATION_OIDC_URL_REJECTED/);
});
