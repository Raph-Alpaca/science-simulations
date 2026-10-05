import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createGitHubTokenProvider,createWorkerApiClient,WORKER_CLIENT_LIMITS} from '../../automation/runner/worker-client.mjs';
import {WORKER_TRUST} from '../../apps/studio/lib/worker-auth.mjs';
import {setup,token} from './worker-http-fixture.mjs';
const syntheticToken=()=>Buffer.from('{"alg":"RS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({jti:randomUUID()})).toString('base64url')+'.synthetic';

test('OIDC requests use the fixed audience and GitHub host, without redirects or token caching',async()=>{
 const calls=[],env={GITHUB_ACTIONS:'true',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'synthetic-request-token',ACTIONS_ID_TOKEN_REQUEST_URL:'https://vstoken.actions.githubusercontent.com/fixture?api-version=2.0'};
 const get=createGitHubTokenProvider(env,{transport:async(url,options)=>{calls.push({url,options});return Response.json({value:syntheticToken()});}});
 const a=await get(),b=await get();assert.notEqual(a,b);assert.equal(calls.length,2);
 for(const call of calls){assert.equal(new URL(call.url).searchParams.get('audience'),WORKER_TRUST.audience);assert.equal(call.options.redirect,'error');assert.equal(call.options.headers.Authorization,'Bearer synthetic-request-token');}
 for(const url of ['http://vstoken.actions.githubusercontent.com/fixture','https://evil.invalid/','https://vstoken.actions.githubusercontent.com.evil.invalid/','https://user@vstoken.actions.githubusercontent.com/','https://vstoken.actions.githubusercontent.com:444/'])assert.throws(()=>createGitHubTokenProvider({...env,ACTIONS_ID_TOKEN_REQUEST_URL:url}),/GITHUB_OIDC_URL_REJECTED/);
 assert.throws(()=>createGitHubTokenProvider({}),/GITHUB_OIDC_UNAVAILABLE/);
});
test('client validates before sending and rejects a reused token without another API request',async()=>{
 const minted=syntheticToken(),calls=[];const api=createWorkerApiClient({jobId:randomUUID(),getToken:async()=>minted,transport:async(url,options)=>{calls.push({url,options});return Response.json({active:true});}});
 await assert.rejects(api.post('input',{secret:'synthetic'}),/WORKER_REQUEST_INVALID/);assert.equal(calls.length,0);
 await api.post('checkpoint');await assert.rejects(api.post('checkpoint'),/GITHUB_OIDC_TOKEN_REUSED/);assert.equal(calls.length,1);
 assert.equal(calls[0].url,WORKER_TRUST.origin+'/api/worker/checkpoint');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.headers.Cookie,undefined);
});
test('ambiguous transport, hostile error bodies and oversized responses are not retried or exposed',async()=>{
 for(const behavior of ['lost','denied','large']){
  let calls=0;const api=createWorkerApiClient({jobId:randomUUID(),getToken:async()=>syntheticToken(),transport:async()=>{calls++;if(behavior==='lost')throw Error('PRIVATE_RESPONSE');if(behavior==='denied')return new Response('PRIVATE_RESPONSE',{status:403});return Response.json({data:'x'.repeat(WORKER_CLIENT_LIMITS.responseBytes)});}});
  await assert.rejects(api.post('input'),e=>!e.message.includes('PRIVATE_RESPONSE')&&e.code.startsWith('WORKER_API_'));assert.equal(calls,1);
 }
});
test('request count and job deadline are finite; aborted work never mints a token',async()=>{
 let now=0,minted=0;const api=createWorkerApiClient({jobId:randomUUID(),getToken:async()=>{minted++;return syntheticToken();},now:()=>now,transport:async()=>Response.json({active:true})});
 await assert.rejects(api.post('input',{}, {signal:AbortSignal.abort()}),/WORKER_CANCELLED/);assert.equal(minted,0);
 now=WORKER_CLIENT_LIMITS.jobMs;await assert.rejects(api.post('input'),/WORKER_JOB_TIME_LIMIT/);
 await api.post('finish',{kind:'failed',candidateHash:null,reason:'SYNTHETIC_STOP'});assert.equal(minted,1);
 now+=WORKER_CLIENT_LIMITS.cleanupMs;await assert.rejects(api.post('finish',{kind:'failed',candidateHash:null,reason:'SYNTHETIC_STOP'}),/WORKER_JOB_TIME_LIMIT/);
 const limited=createWorkerApiClient({jobId:randomUUID(),getToken:async()=>syntheticToken(),transport:async()=>Response.json({})});
 for(let i=0;i<WORKER_CLIENT_LIMITS.requests-3;i++)await limited.post('input');
 await assert.rejects(limited.post('input'),/WORKER_REQUEST_COUNT_LIMIT/);
 await limited.post('finish',{kind:'failed',candidateHash:null,reason:'SYNTHETIC_STOP'});
});
test('actual signed HTTP and SQL claim is not resent when its response is lost',async()=>{
 const f=await setup();let requests=0;
 try{
  const api=createWorkerApiClient({jobId:f.jobId,getToken:async()=>(await token()).slice(7),transport:async(url,options)=>{requests++;await f.transport(url,options);throw Error('LOST_AFTER_SERVER_COMMIT');}});
  await assert.rejects(api.post('claim'),/WORKER_API_UNCERTAIN/);assert.equal(requests,1);
  const row=(await f.db.query('select state from studio.jobs where id=$1',[f.jobId])).rows[0];assert.equal(row.state,'running');
  assert.equal((await f.db.query('select count(*)::int n from studio.worker_oidc_receipts')).rows[0].n,1);
 }finally{await f.db.close();}
});
test('cancellation interrupts a stalled token provider without sending a worker request',async()=>{
 const controller=new AbortController();let tokenSignal,called=0;
 const api=createWorkerApiClient({jobId:randomUUID(),getToken:({signal})=>{tokenSignal=signal;return new Promise(()=>{});},transport:async()=>{called++;return Response.json({});}});
 const waiting=api.post('input',{}, {signal:controller.signal});controller.abort();
 await assert.rejects(waiting,/WORKER_CANCELLED/);assert.equal(tokenSignal.aborted,true);assert.equal(called,0);
});
test('cancellation stops a stalled response body and does not retry its request',async()=>{
 const controller=new AbortController();let cancelled=false,called=0,started;
 const ready=new Promise(resolve=>{started=resolve;});
 const api=createWorkerApiClient({jobId:randomUUID(),getToken:async()=>syntheticToken(),transport:async()=>{
  called++;const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});
  setTimeout(started,0);return new Response(stream,{headers:{'content-type':'application/json'}});
 }});
 const waiting=api.post('input',{}, {signal:controller.signal});await ready;controller.abort();
 await assert.rejects(waiting,/WORKER_CANCELLED/);assert.equal(cancelled,true);assert.equal(called,1);
});
