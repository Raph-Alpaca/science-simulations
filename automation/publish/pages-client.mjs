import {setTimeout as pause} from 'node:timers/promises';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
const root='https://api.github.com/repos/'+PUBLICATION_TRUST.repository;
const jwt=value=>typeof value==='string'&&value.length<=20000&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
const numeric=value=>Number.isSafeInteger(value)&&value>0;
const need=(value,code)=>{if(!value)throw Error(code);};
export const PAGES_LIMITS=Object.freeze({totalMs:180000,requestMs:10000,oidcMs:5000,statusRequests:12,pollMs:10000,responseBytes:16384,artifactBytes:12*1024*1024});
async function bounded(call,ms,parent){
 const controller=new AbortController(),signal=AbortSignal.any([controller.signal,...(parent?[parent]:[])]);let abort;
 const timer=setTimeout(()=>controller.abort(),ms);
 try{
  need(!signal.aborted,'PAGES_TIMEOUT');
  const cancelled=new Promise((_,reject)=>{abort=()=>reject(Error('PAGES_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});});
  return await Promise.race([Promise.resolve().then(()=>call(signal)),cancelled]);
 }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);controller.abort();}
}
async function readJson(url,init,{transport,signal,ms,bytes=PAGES_LIMITS.responseBytes}){
 return bounded(async boundedSignal=>{
  let reader;const cancel=()=>{void reader?.cancel().catch(()=>{});};boundedSignal.addEventListener('abort',cancel,{once:true});
  try{
   const response=await transport(url,{...init,signal:boundedSignal,redirect:'error',cache:'no-store'});
   if(response.status!==200){void response.body?.cancel().catch(()=>{});throw Error('PAGES_HTTP_REJECTED');}
   need(!response.redirected&&(!response.url||response.url===url)&&response.headers.get('content-type')?.split(';')[0].trim()==='application/json'&&response.body,'PAGES_RESPONSE_INVALID');
   reader=response.body.getReader();const chunks=[];let size=0;
   while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;need(size<=bytes,'PAGES_RESPONSE_LIMIT');chunks.push(r.value);}
   need(!boundedSignal.aborted,'PAGES_TIMEOUT');
   try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw Error('PAGES_RESPONSE_INVALID');}
  }finally{boundedSignal.removeEventListener('abort',cancel);void reader?.cancel().catch(()=>{});try{reader?.releaseLock();}catch{}}
 },ms,signal);
}

// GitHub's Pages service expects the default Actions OIDC audience. The studio
// approval endpoint uses a different explicit audience and a different token.
export function createPagesTokenProvider(env,{transport=fetch}={}){
 need(env.GITHUB_ACTIONS==='true'&&typeof env.ACTIONS_ID_TOKEN_REQUEST_TOKEN==='string'&&env.ACTIONS_ID_TOKEN_REQUEST_TOKEN.length>0,'PAGES_OIDC_UNAVAILABLE');
 let url;try{url=new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);}catch{throw Error('PAGES_OIDC_URL_REJECTED');}
 need(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&/^[a-z0-9.-]+\.actions\.githubusercontent\.com$/.test(url.hostname),'PAGES_OIDC_URL_REJECTED');
 url.searchParams.delete('audience');const credential=env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
 return async({signal}={})=>{
  const data=await readJson(url.href,{method:'GET',headers:{Authorization:'Bearer '+credential,Accept:'application/json'}},{transport,signal,ms:PAGES_LIMITS.oidcMs,bytes:24000});
  need(jwt(data.value),'PAGES_OIDC_INVALID');return data.value;
 };
}

// One immutable Actions artifact, one create POST, bounded status reads. A
// success is only the provider's deployment status, never proof of public bytes.
// The caller must hold a durable, version-bound studio approval claim first.
export function createPagesDeploymentClient({runId,workflowSha,artifactId,token,getIdToken,transport=fetch,totalMs=PAGES_LIMITS.totalMs,pollMs=PAGES_LIMITS.pollMs}){
 need(numeric(runId)&&numeric(artifactId)&&typeof workflowSha==='string'&&/^[a-f0-9]{40}$/.test(workflowSha)&&typeof token==='string'&&token.length>=20&&token.length<=10000&&typeof getIdToken==='function','PAGES_CONFIGURATION');
 need(Number.isInteger(totalMs)&&totalMs>0&&totalMs<=PAGES_LIMITS.totalMs&&Number.isInteger(pollMs)&&pollMs>0&&pollMs<=PAGES_LIMITS.pollMs,'PAGES_CONFIGURATION');
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'};let used=false;
 return Object.freeze({async deploy({signal}={}){
  need(!used,'PAGES_ALREADY_ATTEMPTED');used=true;const deadline=Date.now()+totalMs;
  const result={version:'pages-deployment-v1',runId,workflowSha,artifactId,deploymentId:null,status:'uncertain',errorCode:null,createRequests:0,statusRequests:0};
  const request=(suffix,init={method:'GET'})=>{need(Date.now()<deadline,'PAGES_TIMEOUT');return readJson(root+suffix,{...init,headers:{...headers,...init.headers}},{transport,signal,ms:Math.min(PAGES_LIMITS.requestMs,deadline-Date.now())});};
  try{
   const artifact=await request('/actions/artifacts/'+artifactId),run=artifact.workflow_run;
   need(artifact.id===artifactId&&artifact.name==='studio-pages-'+runId&&artifact.expired===false&&numeric(artifact.size_in_bytes)&&artifact.size_in_bytes<=PAGES_LIMITS.artifactBytes&&run?.id===runId&&run.head_sha===workflowSha&&run.repository_id===Number(PUBLICATION_TRUST.repositoryId)&&run.head_repository_id===Number(PUBLICATION_TRUST.repositoryId),'PAGES_ARTIFACT_REJECTED');
   need(Date.now()<deadline,'PAGES_TIMEOUT');const idToken=await bounded(s=>getIdToken({signal:s}),Math.min(PAGES_LIMITS.oidcMs,deadline-Date.now()),signal);need(jwt(idToken),'PAGES_OIDC_INVALID');
   need(Date.now()<deadline&&!signal?.aborted,'PAGES_TIMEOUT');result.createRequests=1;
   const created=await request('/pages/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({artifact_id:artifactId,environment:'github-pages',pages_build_version:workflowSha,oidc_token:idToken})});
   const id=String(created.id??'');need(/^[A-Za-z0-9_-]{1,128}$/.test(id),'PAGES_DEPLOYMENT_INVALID');result.deploymentId=id;
   while(result.statusRequests<PAGES_LIMITS.statusRequests){
    if(result.statusRequests){need(Date.now()<deadline,'PAGES_TIMEOUT');await bounded(s=>pause(Math.min(pollMs,deadline-Date.now()),undefined,{signal:s}),Math.min(pollMs+100,deadline-Date.now()),signal);}
    result.statusRequests++;const status=await request('/pages/deployments/'+id);
    need(typeof status.status==='string'&&/^[a-z_]{1,64}$/.test(status.status),'PAGES_STATUS_INVALID');
    if(status.status==='succeed'){result.status='succeeded';return Object.freeze(result);}
    if(['deployment_failed','deployment_content_failed','deployment_cancelled','deployment_lost'].includes(status.status)){result.status='failed';result.errorCode='PAGES_DEPLOYMENT_FAILED';return Object.freeze(result);}
   }
   result.errorCode='PAGES_STATUS_UNCONFIRMED';
  }catch(error){
   result.status=result.createRequests?'uncertain':'failed';
   const codes=['PAGES_TIMEOUT','PAGES_HTTP_REJECTED','PAGES_RESPONSE_INVALID','PAGES_RESPONSE_LIMIT','PAGES_ARTIFACT_REJECTED','PAGES_OIDC_INVALID','PAGES_DEPLOYMENT_INVALID','PAGES_STATUS_INVALID'];
   result.errorCode=codes.includes(error?.message)?error.message:'PAGES_TRANSPORT_UNCERTAIN';
  }
  return Object.freeze(result);
 }});
}
