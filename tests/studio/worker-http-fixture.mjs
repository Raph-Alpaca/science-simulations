import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createLocalJWKSet,exportJWK,generateKeyPair,SignJWT} from 'jose';
import {workerFixture} from './worker-fixture.mjs';
import {WORKER_TRUST,createWorkerTokenVerifier,workerTrustConfig} from '../../apps/studio/lib/worker-auth.mjs';
import {createWorkerGateway} from '../../apps/studio/lib/worker-gateway.mjs';
import {createWorkerHttpHandler} from '../../apps/studio/lib/worker-http.mjs';

const {privateKey,publicKey}=await generateKeyPair('RS256');
export const sha='a'.repeat(40);
const jwk={...await exportJWK(publicKey),kid:'synthetic-worker-http',alg:'RS256',use:'sig'};
const config=workerTrustConfig({STUDIO_WORKER_API_ENABLED:'true',STUDIO_WORKER_TRUSTED_SHAS:sha});
export async function token(role='generation',runId='101'){
 const now=Math.floor(Date.now()/1000);return 'Bearer '+await new SignJWT({iss:WORKER_TRUST.issuer,aud:WORKER_TRUST.audience,sub:WORKER_TRUST.subject,iat:now,nbf:now,exp:now+300,jti:randomUUID(),
  repository:WORKER_TRUST.repository,repository_id:WORKER_TRUST.repositoryId,repository_owner:WORKER_TRUST.owner,repository_owner_id:WORKER_TRUST.ownerId,ref:WORKER_TRUST.ref,ref_type:'branch',sha,
  workflow_ref:WORKER_TRUST.workflowRef,workflow_sha:sha,job_workflow_ref:role==='generation'?WORKER_TRUST.generationWorkflow:WORKER_TRUST.reportWorkflow,job_workflow_sha:sha,
  run_id:runId,run_attempt:'1',event_name:'workflow_dispatch',runner_environment:'github-hosted',repository_visibility:'public'}).setProtectedHeader({alg:'RS256',typ:'JWT',kid:jwk.kid}).sign(privateKey);
}
export async function setup(){
 const f=await workerFixture({auth:true});await f.enable();await f.submit();await f.bind();
 const handler=createWorkerHttpHandler({verifyToken:createWorkerTokenVerifier(config,{keyResolver:createLocalJWKSet({keys:[jwk]})}),gateway:createWorkerGateway(f.client)});
 const request=async(action,payload={},options={})=>{
  const auth=options.token??await token(options.role),body=options.body??JSON.stringify({jobId:options.jobId??f.jobId,requestId:options.requestId??randomUUID(),payload});
  return handler(new Request(WORKER_TRUST.origin+'/api/worker/'+action,{method:'POST',headers:{authorization:auth,'content-type':'application/json',...options.headers},body}),action);
 };
 const post=async(action,payload={},options={})=>{const response=await request(action,payload,options),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;};
 const transport=(url,options)=>handler(new Request(url,options),new URL(url).pathname.split('/').at(-1));
 return {...f,handler,request,post,transport};
}
