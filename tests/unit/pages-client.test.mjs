import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPagesDeploymentClient,createPagesTokenProvider,PAGES_LIMITS} from '../../automation/publish/pages-client.mjs';
const sha='a'.repeat(40),root='https://api.github.com/repos/Raph-Alpaca/science-simulations',id=4321;
const metadata={id,name:'studio-pages-12345',expired:false,size_in_bytes:10240,workflow_run:{id:12345,head_sha:sha,repository_id:1368255570,head_repository_id:1368255570}};
const config={runId:12345,workflowSha:sha,artifactId:id,token:'synthetic-token-never-real',getIdToken:async()=>'e30.e30.c2ln',pollMs:1};
function fixture({transform,states=['succeed']}={}){
 const calls=[];let n=0;
 const transport=async(url,init)=>{
  calls.push({url,init});assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.ok(url.startsWith(root+'/'));
  const data=url.includes('/actions/artifacts/')?structuredClone(metadata):init.method==='POST'?{id:sha,page_url:'https://untrusted.invalid/never-follow'}:{status:states[Math.min(n++,states.length-1)]};
  return transform?transform(data,url,init):Response.json(data);
 };return {calls,transport};
}
test('fixed same-run artifact -> one create -> bounded provider status; no returned URL is followed',async()=>{
 const f=fixture({states:['deployment_in_progress','succeed']}),client=createPagesDeploymentClient({...config,transport:f.transport});
 const result=await client.deploy();assert.equal(result.status,'succeeded');assert.equal(result.createRequests,1);assert.equal(result.statusRequests,2);assert.equal(Object.hasOwn(result,'published'),false);
 const post=f.calls.find(c=>c.init.method==='POST');assert.deepEqual(JSON.parse(post.init.body),{artifact_id:id,environment:'github-pages',pages_build_version:sha,oidc_token:'e30.e30.c2ln'});assert.equal(post.url,root+'/pages/deployments');
 await assert.rejects(()=>client.deploy(),/PAGES_ALREADY_ATTEMPTED/);assert.equal(f.calls.length,4);
});
test('another run, commit, repository, name, expired or oversized artifact never receives a create POST',async()=>{
 for(const change of [m=>{m.workflow_run.id++;},m=>{m.workflow_run.head_sha='b'.repeat(40);},m=>{m.workflow_run.head_repository_id++;},m=>{m.name='other';},m=>{m.expired=true;},m=>{m.size_in_bytes=PAGES_LIMITS.artifactBytes+1;}]){
  const f=fixture({transform:data=>{change(data);return Response.json(data);}}),result=await createPagesDeploymentClient({...config,transport:f.transport}).deploy();
  assert.equal(result.status,'failed');assert.equal(result.errorCode,'PAGES_ARTIFACT_REJECTED');assert.equal(result.createRequests,0);assert.equal(f.calls.length,1);
 }
});
test('lost create responses and rejected HTTP stay uncertain and never resend or leak error text',async()=>{
 for(const lost of [false,true]){
  const f=fixture({transform:(data,url,init)=>{if(init.method==='POST'){if(lost)throw Error('SECRET_RESPONSE_BODY');return new Response('SECRET_RESPONSE_BODY',{status:503});}return Response.json(data);}});
  const client=createPagesDeploymentClient({...config,transport:f.transport}),result=await client.deploy();assert.equal(result.status,'uncertain');assert.equal(result.createRequests,1);assert.equal(result.deploymentId,null);assert.equal(JSON.stringify(result).includes('SECRET'),false);
  await assert.rejects(()=>client.deploy(),/PAGES_ALREADY_ATTEMPTED/);assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1);
 }
});
test('status reads stop at twelve or a terminal failure; unknown outcomes do not cancel or create again',async()=>{
 for(const status of ['deployment_in_progress','deployment_failed']){
  const f=fixture({states:[status]}),result=await createPagesDeploymentClient({...config,transport:f.transport}).deploy();
  assert.equal(result.status,status==='deployment_failed'?'failed':'uncertain');assert.equal(result.statusRequests,status==='deployment_failed'?1:12);assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1);
 }
});
test('stalled metadata/token/status and oversized or malformed responses remain bounded',async()=>{
 for(const kind of ['metadata','token','status','oversize','bad-json']){
  const f=fixture({transform:(data,url)=>{
   if(kind==='metadata'||kind==='status'&&url.endsWith('/'+sha))return new Promise(()=>{});
   if(kind==='oversize')return new Response('x'.repeat(PAGES_LIMITS.responseBytes+1),{headers:{'content-type':'application/json'}});
   if(kind==='bad-json')return new Response('{',{headers:{'content-type':'application/json'}});
   return Response.json(data);
  }});
  const result=await createPagesDeploymentClient({...config,transport:f.transport,totalMs:30,...(kind==='token'?{getIdToken:()=>new Promise(()=>{})}:{})}).deploy();
  assert.notEqual(result.status,'succeeded');assert.ok(result.createRequests<=1);
 }
});
test('Pages OIDC provider uses trusted runner origin and default audience, keeping studio tokens separate',async()=>{
 const env={GITHUB_ACTIONS:'true',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'synthetic',ACTIONS_ID_TOKEN_REQUEST_URL:'https://test.actions.githubusercontent.com/token?audience=must-be-removed&api-version=2'};
 let called;const get=createPagesTokenProvider(env,{transport:async(url,init)=>{called={url,init};return Response.json({value:'e30.e30.c2ln'});}});assert.equal(await get(),'e30.e30.c2ln');
 assert.equal(new URL(called.url).searchParams.has('audience'),false);assert.equal(new URL(called.url).searchParams.get('api-version'),'2');assert.equal(called.init.redirect,'error');
 assert.throws(()=>createPagesTokenProvider({...env,ACTIONS_ID_TOKEN_REQUEST_URL:'https://untrusted.invalid/token'}),/PAGES_OIDC_URL_REJECTED/);
});
