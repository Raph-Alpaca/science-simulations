import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createLocalJWKSet,exportJWK,generateKeyPair,SignJWT} from 'jose';
import {WORKER_TRUST,WorkerAuthError,workerTrustConfig,createWorkerTokenVerifier,githubKeyResolver} from '../../apps/studio/lib/worker-auth.mjs';
const now=new Date('2026-10-04T12:00:00Z'),second=Math.floor(now.getTime()/1000),sha='a'.repeat(40);
const {privateKey,publicKey}=await generateKeyPair('RS256');
const jwk={...await exportJWK(publicKey),kid:'synthetic-signing-key',alg:'RS256',use:'sig'};
const config=workerTrustConfig({STUDIO_WORKER_API_ENABLED:'true',STUDIO_WORKER_TRUSTED_SHAS:sha});
const verifier=()=>createWorkerTokenVerifier(config,{keyResolver:createLocalJWKSet({keys:[jwk]}),now:()=>now});
const claims=()=>({iss:WORKER_TRUST.issuer,aud:WORKER_TRUST.audience,sub:WORKER_TRUST.subject,iat:second,nbf:second-5,exp:second+300,jti:randomUUID(),
 repository:WORKER_TRUST.repository,repository_id:WORKER_TRUST.repositoryId,repository_owner:WORKER_TRUST.owner,repository_owner_id:WORKER_TRUST.ownerId,
 ref:WORKER_TRUST.ref,ref_type:'branch',sha,workflow_ref:WORKER_TRUST.workflowRef,workflow_sha:sha,job_workflow_ref:WORKER_TRUST.generationWorkflow,job_workflow_sha:sha,
 run_id:'12345',run_attempt:'1',event_name:'workflow_dispatch',runner_environment:'github-hosted',repository_visibility:'public'});
const sign=async(extra={},header={})=>'Bearer '+await new SignJWT({...claims(),...extra}).setProtectedHeader({alg:'RS256',typ:'JWT',kid:jwk.kid,...header}).sign(privateKey);
test('real RSA signature verifies immutable repository subject, pinned workflow and bounded identity only',async()=>{
 const verify=verifier(),token=await sign(),identity=await verify(token);
 assert.equal(identity.runId,12345);assert.equal(identity.role,'generation');assert.equal(identity.workflowSha,sha);assert.equal(identity.repositoryId,1368255570);
 assert.match(identity.jtiHash,/^[a-f0-9]{64}$/);assert.ok(Object.isFrozen(identity));assert.equal(JSON.stringify(identity).includes(token),false);
 assert.equal((await verify(await sign({job_workflow_ref:WORKER_TRUST.reportWorkflow}))).role,'report');
});
test('configuration defaults closed and only allows one or two explicit commit SHAs',()=>{
 assert.throws(()=>workerTrustConfig({}),/WORKER_SETUP_REQUIRED/);
 for(const value of ['', 'main',sha+','+sha,[sha,'b'.repeat(40),'c'.repeat(40)].join(',')])assert.throws(()=>workerTrustConfig({STUDIO_WORKER_API_ENABLED:'true',STUDIO_WORKER_TRUSTED_SHAS:value}));
});
test('forged signatures, unsupported algorithms and header-provided key servers never authenticate',async()=>{
 const verify=verifier(),good=await sign();const parts=good.slice(7).split('.');parts[1]=Buffer.from(JSON.stringify({...claims(),run_id:'54321'})).toString('base64url');
 await assert.rejects(()=>verify('Bearer '+parts.join('.')),e=>e instanceof WorkerAuthError&&e.code==='WORKER_TOKEN_REJECTED');
 const hmac='Bearer '+await new SignJWT(claims()).setProtectedHeader({alg:'HS256',typ:'JWT',kid:jwk.kid}).sign(new TextEncoder().encode('synthetic-test-key'.repeat(4)));
 await assert.rejects(()=>verify(hmac));
 await assert.rejects(async()=>verify(await sign({}, {jku:'https://attacker.invalid/jwks'})));
 await assert.rejects(()=>verify('Bearer '+ 'x'.repeat(21000)),/WORKER_AUTH_REQUIRED/);
});
test('expired, old, not-yet-valid and wrong issuer/audience/subject tokens are rejected',async()=>{
 const verify=verifier();
 for(const extra of [{exp:second-10},{iat:second-130},{iat:second+30},{nbf:second+30},{exp:second+1201},{jti:null},
  {iss:'https://attacker.invalid'},{aud:'https://github.com/Raph-Alpaca'},{aud:[WORKER_TRUST.audience]},{sub:'repo:Raph-Alpaca/science-simulations:ref:refs/heads/main'}]){
  const token=await sign(extra);await assert.rejects(()=>verify(token),e=>e instanceof WorkerAuthError);
 }
});
test('forks, PR workflows, self-hosted runners, wrong jobs and unreviewed code are rejected',async()=>{
 const verify=verifier();
 for(const extra of [{repository_id:'1'},{repository_owner_id:'1'},{repository:'attacker/fork'},{ref:'refs/heads/other'},
  {event_name:'pull_request_target'},{runner_environment:'self-hosted'},{repository_visibility:'private'},
  {workflow_ref:WORKER_TRUST.workflowRef.replace('studio-worker','another')},{job_workflow_ref:null},{job_workflow_ref:WORKER_TRUST.workflowRef},
  {workflow_sha:'b'.repeat(40)},{job_workflow_sha:'b'.repeat(40)},{sha:'b'.repeat(40)},{run_attempt:'2'},{run_id:'9007199254740993'},{environment:'production'}]){
  const token=await sign(extra);await assert.rejects(()=>verify(token),e=>e instanceof WorkerAuthError&&e.status>=401);
 }
});
test('JWKS retrieval is fixed, bounded and cached, without leaking a bearer token',async()=>{
 let calls=0;const resolver=githubKeyResolver(async(url,options)=>{calls++;assert.equal(url,WORKER_TRUST.jwks);assert.equal(options.redirect,'error');assert.equal(new Headers(options.headers).has('Authorization'),false);return Response.json({keys:[jwk]});});
 const verify=createWorkerTokenVerifier(config,{keyResolver:resolver,now:()=>now});
 await verify(await sign());await verify(await sign());assert.equal(calls,1);
 const oversized=createWorkerTokenVerifier(config,{keyResolver:githubKeyResolver(async()=>new Response('x'.repeat(262145))),now:()=>now});
 await assert.rejects(async()=>oversized(await sign()),e=>e.code==='WORKER_JWKS_UNAVAILABLE');
});
