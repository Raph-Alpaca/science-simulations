import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {exportJWK,generateKeyPair,SignJWT} from 'jose';
import {WORKER_TRUST} from '../../apps/studio/lib/worker-auth.mjs';
import {checkOidcConnection,OIDC_CONNECTION_LIMITS} from '../../automation/runner/oidc-connection.mjs';

const now=new Date('2026-10-14T11:30:00Z'),second=now.getTime()/1000,sha='a'.repeat(40);
const {privateKey,publicKey}=await generateKeyPair('RS256');
const jwk={...await exportJWK(publicKey),kid:'synthetic-oidc-connection',alg:'RS256',use:'sig'};
const env=()=>({GITHUB_ACTIONS:'true',STUDIO_OIDC_CONNECTION:'true',GITHUB_REPOSITORY:WORKER_TRUST.repository,
 GITHUB_REPOSITORY_ID:WORKER_TRUST.repositoryId,GITHUB_REPOSITORY_OWNER_ID:WORKER_TRUST.ownerId,
 GITHUB_REF:WORKER_TRUST.ref,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'23456',
 GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha,GITHUB_WORKFLOW_REF:WORKER_TRUST.workflowRef,
 ACTIONS_ID_TOKEN_REQUEST_TOKEN:'synthetic-request-credential',ACTIONS_ID_TOKEN_REQUEST_URL:'https://test.actions.githubusercontent.com/oidc?id=synthetic'});
const claims=role=>({iss:WORKER_TRUST.issuer,aud:WORKER_TRUST.audience,sub:WORKER_TRUST.subject,
 iat:second,nbf:second-5,exp:second+300,jti:randomUUID(),repository:WORKER_TRUST.repository,
 repository_id:WORKER_TRUST.repositoryId,repository_owner:WORKER_TRUST.owner,repository_owner_id:WORKER_TRUST.ownerId,
 ref:WORKER_TRUST.ref,ref_type:'branch',sha,workflow_ref:WORKER_TRUST.workflowRef,workflow_sha:sha,
 job_workflow_ref:role==='generation'?WORKER_TRUST.generationWorkflow:WORKER_TRUST.reportWorkflow,job_workflow_sha:sha,
 run_id:'23456',run_attempt:'1',event_name:'workflow_dispatch',runner_environment:'github-hosted',repository_visibility:'public'});
async function fixture(role='generation',changes={}){
 const token=await new SignJWT({...claims(role),...changes}).setProtectedHeader({alg:'RS256',typ:'JWT',kid:jwk.kid}).sign(privateKey);
 const calls=[];
 const transport=async(url,options)=>{
  calls.push({url,options});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  const target=new URL(url),headers=new Headers(options.headers);
  if(target.hostname==='test.actions.githubusercontent.com'){
   assert.equal(target.searchParams.get('audience'),WORKER_TRUST.audience);
   assert.equal(headers.get('authorization'),'Bearer synthetic-request-credential');return Response.json({value:token});
  }
  assert.equal(url,WORKER_TRUST.jwks);assert.equal(headers.has('authorization'),false);return Response.json({keys:[jwk]});
 };
 return {token,calls,transport};
}
const check=(f,changes={})=>checkOidcConnection({env:env(),role:'generation',now:()=>now,transport:f.transport,...changes});

test('both reusable roles verify signed identity through two GETs without any Studio/provider request',async()=>{
 for(const role of ['generation','report']){
  const f=await fixture(role),result=await check(f,{role});
  assert.equal(result.status,'verified');assert.equal(result.code,'OIDC_CONNECTION_VERIFIED');assert.equal(result.role,role);
  assert.equal(result.runId,23456);assert.equal(result.workflowSha,sha);assert.equal(result.requests,2);
  assert.equal(result.executionReady,false);assert.equal(f.calls.length,2);
  for(const privateValue of [f.token,'synthetic-request-credential','synthetic-oidc-connection'])assert.equal(JSON.stringify(result).includes(privateValue),false);
 }
});
test('credentials, production jobs, non-main refs and reruns are rejected before requesting a token',async()=>{
 const f=await fixture();
 for(const changes of [{OPENAI_API_KEY:'sk-synthetic'},{STUDIO_TRANSFER_KEY:'synthetic'},{SUPABASE_SECRET_KEY:'synthetic'},
  {STUDIO_GITHUB_APP_PRIVATE_KEY:'synthetic'},{STUDIO_JOB_ID:randomUUID()},{STUDIO_GENERATION_ENABLED:'true'},
  {GITHUB_ACTIONS:'false'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_REF:'refs/heads/feature'},{GITHUB_EVENT_NAME:'pull_request'},
  {GITHUB_WORKFLOW_SHA:'b'.repeat(40)},{GITHUB_REPOSITORY_ID:'123'},{GITHUB_RUN_ID:'9007199254740993'}]){
  assert.equal((await check(f,{env:{...env(),...changes}})).code,'OIDC_CONNECTION_CONFIGURATION');
 }
 assert.equal((await check(f,{role:'admin'})).code,'OIDC_CONNECTION_CONFIGURATION');assert.equal(f.calls.length,0);
});
test('a correctly signed token from the other role or run cannot satisfy this connection check',async()=>{
 for(const f of [await fixture('report'),await fixture('generation',{run_id:'23457'})]){
  const result=await check(f);assert.equal(result.code,'OIDC_CONNECTION_IDENTITY_MISMATCH');assert.equal(result.status,'blocked');
 }
});
test('the real verifier rejects forged, stale and mismatched claims without leaking token material',async()=>{
 for(const changes of [{aud:'https://attacker.invalid'},{sub:'repo:wrong:ref:refs/heads/main'},{workflow_sha:'b'.repeat(40)},
  {job_workflow_sha:'b'.repeat(40)},{job_workflow_ref:WORKER_TRUST.workflowRef},{iat:second-200},{runner_environment:'self-hosted'}]){
  const f=await fixture('generation',changes),result=await check(f);
  assert.equal(result.status,'blocked');assert.equal(result.executionReady,false);assert.equal(JSON.stringify(result).includes(f.token),false);
 }
 const f=await fixture(),parts=f.token.split('.');parts[1]=Buffer.from(JSON.stringify({...claims('generation'),run_id:'99999'})).toString('base64url');
 const result=await check(f,{transport:async(url,options)=>new URL(url).hostname==='test.actions.githubusercontent.com'?Response.json({value:parts.join('.')}):f.transport(url,options)});
 assert.equal(result.code,'WORKER_TOKEN_REJECTED');
});
test('provider response errors are bounded, redacted and never retried',async()=>{
 for(const response of [()=>new Response('private-response',{status:403}),()=>Response.json({value:'private-invalid-token'}),()=>Response.json({value:'x'.repeat(25000)})]){
  let calls=0;const result=await check({transport:async()=>{calls++;return response();}});
  assert.equal(result.status,'blocked');assert.equal(calls,1);assert.equal(result.requests,1);assert.equal(JSON.stringify(result).includes('private'),false);
 }
 const result=await check({transport:async()=>{throw Error('raw-secret-provider-error');}});
 assert.equal(result.code,'GITHUB_OIDC_UNCERTAIN');assert.equal(JSON.stringify(result).includes('raw-secret'),false);
});
test('token destination validation rejects attacker endpoints before sending the request credential',async()=>{
 const f=await fixture();
 for(const url of ['https://attacker.invalid/oidc','http://test.actions.githubusercontent.com/oidc','https://test.actions.githubusercontent.com@attacker.invalid/oidc']){
  assert.equal((await check(f,{env:{...env(),ACTIONS_ID_TOKEN_REQUEST_URL:url}})).code,'GITHUB_OIDC_URL_REJECTED');
 }
 assert.equal(f.calls.length,0);
});
test('an unresponsive key server reaches the whole-check deadline and aborts without retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const f=await fixture();let entered,signal;
 const waiting=new Promise(resolve=>{entered=resolve;});
 const running=check(f,{transport:async(url,options)=>{
  if(url!==WORKER_TRUST.jwks)return f.transport(url,options);
  signal=options.signal;entered();return new Promise(()=>{});
 }});
 await waiting;t.mock.timers.tick(OIDC_CONNECTION_LIMITS.totalMs+1);
 const result=await running;assert.equal(result.code,'OIDC_CONNECTION_TIMEOUT');assert.equal(result.requests,2);assert.equal(signal.aborted,true);
});
