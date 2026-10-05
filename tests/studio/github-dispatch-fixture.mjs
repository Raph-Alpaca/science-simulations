import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {jwtVerify} from 'jose';
import {TARGET} from '../../apps/studio/lib/dispatcher.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
export const syntheticDispatchEnv=Object.freeze({STUDIO_DISPATCH_ENABLED:'true',STUDIO_INPUT_REVIEW_ENABLED:'true',STUDIO_WORKER_API_ENABLED:'true',STUDIO_WORKER_TRUSTED_SHAS:'a'.repeat(40),STUDIO_GITHUB_APP_CLIENT_ID:'synthetic-client',STUDIO_GITHUB_INSTALLATION_ID:'123',STUDIO_GITHUB_APP_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})});
const repo={id:1368255570,full_name:TARGET.repository,owner:{id:248908443,login:'Raph-Alpaca'},default_branch:'main',archived:false,disabled:false};
const path='.github/workflows/studio-worker.yml';
export function syntheticGitHub({change,fail,afterPost}={}){
 const calls=[];const transport=async(url,options)=>{
  const endpoint=new URL(url).pathname;calls.push({endpoint,method:options.method,body:options.body&&JSON.parse(options.body)});
  assert.equal(new URL(url).origin,'https://api.github.com');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);
  if(fail===endpoint)throw Error('synthetic private upstream message');
  let status=200,body;
  if(endpoint.endsWith('/access_tokens')){
   const jwt=await jwtVerify(options.headers.Authorization.slice(7),publicKey,{algorithms:['RS256'],issuer:'synthetic-client'});
   assert.ok(jwt.payload.exp-jwt.payload.iat<=600);assert.ok(jwt.payload.iat*1000<Date.now());
   body={token:'synthetic-token',expires_at:new Date(Date.now()+3600000).toISOString(),permissions:{actions:'write',contents:'read',metadata:'read'},repositories:[structuredClone(repo)]};status=201;
  }else if(endpoint==='/installation/token'){return new Response(null,{status:204});}
  else {
   assert.equal(options.headers.Authorization,'Bearer synthetic-token');
   if(endpoint.endsWith('/dispatches')){body={workflow_run_id:12345};await afterPost?.();}
   else if(endpoint.endsWith('/actions/runs/12345'))body={id:12345,repository:structuredClone(repo),head_repository:structuredClone(repo),workflow_id:42,path,head_sha:'a'.repeat(40),head_branch:'main',event:'workflow_dispatch',run_attempt:1};
   else if(endpoint.endsWith('/actions/workflows/studio-worker.yml'))body={id:42,path,state:'active'};
   else if(endpoint.endsWith('/git/ref/heads/main'))body={ref:'refs/heads/main',object:{type:'commit',sha:'a'.repeat(40)}};
   else body=structuredClone(repo);
  }
  const result=change?.(endpoint,{status,body})??{status,body};return Response.json(result.body,{status:result.status});
 };return {transport,calls};
}
