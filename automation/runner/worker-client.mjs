import {randomUUID} from 'node:crypto';
import {hash} from '../../packages/contracts/content-source.js';
import {WORKER_TRUST} from '../../apps/studio/lib/worker-auth.mjs';
import {validateWorkerPayload,workerUUID,WORKER_BODY_LIMIT} from '../../apps/studio/lib/worker-http.mjs';
import {RunnerError} from './bounded-responses.mjs';

export class WorkerClientError extends RunnerError{constructor(code,status=0){super(code);this.status=status;}}
const need=(value,code)=>{if(!value)throw new WorkerClientError(code);};
const tokenPattern=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export const WORKER_CLIENT_LIMITS=Object.freeze({requests:200,jobMs:1_200_000,cleanupMs:30_000,requestMs:20_000,oidcMs:5000,responseBytes:2_300_000});

async function boundedJson(url,options,{transport,timeout,limit,signal,kind}){
 const controller=new AbortController();let timer,reader,abortReject;
 const aborted=new Promise((_,reject)=>{abortReject=reject;});
 const cancel=()=>{controller.abort();void reader?.cancel().catch(()=>{});abortReject(new WorkerClientError('WORKER_CANCELLED'));};
 signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)controller.abort();
 try{
  need(!controller.signal.aborted,'WORKER_CANCELLED');
  const expiry=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();void reader?.cancel().catch(()=>{});reject(new WorkerClientError(kind+'_TIMEOUT'));},timeout);});
  return await Promise.race([expiry,aborted,(async()=>{
   let response;try{response=await transport(url,{...options,redirect:'error',signal:controller.signal,cache:'no-store'});}catch{throw new WorkerClientError(signal?.aborted?'WORKER_CANCELLED':kind+'_UNCERTAIN');}
   if(response.status!==200){void response.body?.cancel().catch(()=>{});throw new WorkerClientError(kind+'_REJECTED',response.status);}
   need(response.headers.get('content-type')?.split(';')[0].trim()==='application/json'&&response.body,kind+'_INVALID_RESPONSE');
   reader=response.body.getReader();const chunks=[];let size=0;
   while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>limit){void reader.cancel().catch(()=>{});throw new WorkerClientError(kind+'_RESPONSE_LIMIT');}chunks.push(item.value);}
   need(!controller.signal.aborted,'WORKER_CANCELLED');
   try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new WorkerClientError(kind+'_INVALID_RESPONSE');}
  })()]);
 }catch(error){throw error instanceof WorkerClientError?error:new WorkerClientError(kind+'_UNCERTAIN');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);try{reader?.releaseLock();}catch{}controller.abort();}
}

async function boundedToken(getToken,signal,timeout){
 const controller=new AbortController();let timer,abortReject;
 const aborted=new Promise((_,reject)=>{abortReject=reject;});
 const cancel=()=>{controller.abort();abortReject(new WorkerClientError('WORKER_CANCELLED'));};
 signal?.addEventListener('abort',cancel,{once:true});
 try{
  need(!signal?.aborted,'WORKER_CANCELLED');
  const expiry=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new WorkerClientError('GITHUB_OIDC_TIMEOUT'));},timeout);});
  return await Promise.race([getToken({signal:controller.signal}),expiry,aborted]);
 }catch(error){throw error instanceof WorkerClientError?error:new WorkerClientError('GITHUB_OIDC_UNAVAILABLE');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.abort();}
}

// Only the trusted Actions environment supplies this URL/token. The requested
// audience is fixed, redirects are forbidden, and nothing is logged or cached.
export function createGitHubTokenProvider(env,{transport=fetch}={}){
 need(env.GITHUB_ACTIONS==='true'&&typeof env.ACTIONS_ID_TOKEN_REQUEST_TOKEN==='string'&&env.ACTIONS_ID_TOKEN_REQUEST_TOKEN.length>0,'GITHUB_OIDC_UNAVAILABLE');
 let url;try{url=new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);}catch{throw new WorkerClientError('GITHUB_OIDC_URL_REJECTED');}
 need(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&/^[a-z0-9.-]+\.actions\.githubusercontent\.com$/.test(url.hostname),'GITHUB_OIDC_URL_REJECTED');
 url.searchParams.set('audience',WORKER_TRUST.audience);const endpoint=url.href,credential=env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
 return async({signal}={})=>{
  const body=await boundedJson(endpoint,{method:'GET',headers:{Authorization:'Bearer '+credential,Accept:'application/json'}},{transport,timeout:WORKER_CLIENT_LIMITS.oidcMs,limit:24000,signal,kind:'GITHUB_OIDC'});
  need(typeof body?.value==='string'&&body.value.length<=20000&&tokenPattern.test(body.value),'GITHUB_OIDC_INVALID_RESPONSE');
  return body.value;
 };
}

export function createWorkerApiClient({jobId,getToken,transport=fetch,now=Date.now}){
 need(workerUUID(jobId)&&typeof getToken==='function','WORKER_CLIENT_CONFIGURATION');
 const started=now(),tokens=new Set();let count=0,cleanupCount=0;
 return Object.freeze({
  get requests(){return count;},
  async post(action,payload={}, {signal,requestId=randomUUID()}={}){
   need(workerUUID(requestId),'WORKER_REQUEST_INVALID');
   try{validateWorkerPayload(action,payload);}catch{throw new WorkerClientError('WORKER_REQUEST_INVALID');}
   const body=JSON.stringify({jobId,requestId,payload});need(Buffer.byteLength(body)<=WORKER_BODY_LIMIT,'WORKER_REQUEST_LIMIT');
   need(!signal?.aborted,'WORKER_CANCELLED');
   const cleanup=['settle','finish'].includes(action),elapsed=now()-started;
   need(elapsed>=0&&elapsed<WORKER_CLIENT_LIMITS.jobMs+(cleanup?WORKER_CLIENT_LIMITS.cleanupMs:0),'WORKER_JOB_TIME_LIMIT');
   // Keep three final slots for settlement and failure acknowledgement.
   need(count<WORKER_CLIENT_LIMITS.requests-(cleanup?0:3),'WORKER_REQUEST_COUNT_LIMIT');
   if(elapsed>=WORKER_CLIENT_LIMITS.jobMs){need(cleanupCount<3,'WORKER_CLEANUP_LIMIT');cleanupCount++;}
   count++;
   const deadline=started+WORKER_CLIENT_LIMITS.jobMs+(cleanup?WORKER_CLIENT_LIMITS.cleanupMs:0);
   const token=await boundedToken(getToken,signal,Math.min(WORKER_CLIENT_LIMITS.oidcMs,deadline-now()));
   need(typeof token==='string'&&token.length<=20000&&tokenPattern.test(token),'GITHUB_OIDC_INVALID_RESPONSE');
   const fingerprint=hash(token);need(!tokens.has(fingerprint),'GITHUB_OIDC_TOKEN_REUSED');tokens.add(fingerprint);
   need(!signal?.aborted,'WORKER_CANCELLED');
   const remaining=deadline-now();need(remaining>0,'WORKER_JOB_TIME_LIMIT');
   return boundedJson(WORKER_TRUST.origin+'/api/worker/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body},
    {transport,timeout:Math.min(WORKER_CLIENT_LIMITS.requestMs,remaining),limit:WORKER_CLIENT_LIMITS.responseBytes,signal,kind:'WORKER_API'});
  },
 });
}
