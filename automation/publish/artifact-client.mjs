import {createHash} from 'node:crypto';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
import {LIMITS} from '../../packages/contracts/content-source.js';
import {snapshotArtifactManifest} from './verify-artifact.mjs';
import {encodeArtifactBundle} from './artifact-bundle.mjs';
import {publicationInspection,preparePublicationBundle} from './publication-packet.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const tokenPattern=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export class PublicationClientError extends Error{constructor(code,status=0){super(code);this.code=code;this.status=status;}}
const need=(value,code='PUBLICATION_RESPONSE_INVALID')=>{if(!value)throw new PublicationClientError(code);};
const exact=(value,keys)=>need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','));
export const PUBLICATION_CLIENT_LIMITS=Object.freeze({requests:LIMITS.files+1,totalMs:180000,requestMs:20000,oidcMs:5000,responseBytes:3000000,parallelFiles:3});
async function timed(call,ms,parent,code){
 const controller=new AbortController(),signal=AbortSignal.any([controller.signal,...(parent?[parent]:[])]);let abort;
 const timer=setTimeout(()=>controller.abort(),ms);
 try{
  need(!signal.aborted,code);
  const cancelled=new Promise((_,reject)=>{abort=()=>reject(new PublicationClientError(code));signal.addEventListener('abort',abort,{once:true});});
  return await Promise.race([Promise.resolve().then(()=>call(signal)),cancelled]);
 }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);controller.abort();}
}
async function json(url,init,{transport,signal,ms,bytes}){
 return timed(async bounded=>{
  let reader;
  const cancel=()=>{void reader?.cancel().catch(()=>{});};bounded.addEventListener('abort',cancel,{once:true});
  try{
   const response=await transport(url,{...init,signal:bounded,redirect:'error',cache:'no-store'});
   if(response.status!==200){void response.body?.cancel().catch(()=>{});throw new PublicationClientError('PUBLICATION_HTTP_REJECTED',response.status);}
   need(response.body&&response.headers.get('content-type')?.split(';')[0].trim()==='application/json');
   reader=response.body.getReader();const chunks=[];let size=0;
   while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>bytes){cancel();throw new PublicationClientError('PUBLICATION_RESPONSE_LIMIT');}chunks.push(r.value);}
   need(!bounded.aborted,'PUBLICATION_REQUEST_TIMEOUT');
   try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new PublicationClientError('PUBLICATION_RESPONSE_INVALID');}
  }catch(error){throw error instanceof PublicationClientError?error:new PublicationClientError('PUBLICATION_HTTP_UNCERTAIN');}
  finally{bounded.removeEventListener('abort',cancel);try{reader?.releaseLock();}catch{}}
 },ms,signal,'PUBLICATION_REQUEST_TIMEOUT');
}

// Only trusted runner environment values supply the GitHub OIDC service token.
// No model/client-selected URL, audience, redirects, logging or token reuse.
export function createPublicationTokenProvider(env,{transport=fetch}={}){
 need(env.GITHUB_ACTIONS==='true'&&typeof env.ACTIONS_ID_TOKEN_REQUEST_TOKEN==='string'&&env.ACTIONS_ID_TOKEN_REQUEST_TOKEN.length>0,'PUBLICATION_OIDC_UNAVAILABLE');
 let url;try{url=new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);}catch{throw new PublicationClientError('PUBLICATION_OIDC_URL_REJECTED');}
 need(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&/^[a-z0-9.-]+\.actions\.githubusercontent\.com$/.test(url.hostname),'PUBLICATION_OIDC_URL_REJECTED');
 url.searchParams.set('audience',PUBLICATION_TRUST.audience);const credential=env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
 return async({signal}={})=>{
  const data=await json(url.href,{method:'GET',headers:{Authorization:'Bearer '+credential,Accept:'application/json'}},{transport,signal,ms:5000,bytes:24000});
  need(typeof data.value==='string'&&data.value.length<=20000&&tokenPattern.test(data.value),'PUBLICATION_OIDC_INVALID');return data.value;
 };
}
export function createPublicationApiClient({publicationId,runId,workflowSha,getToken,transport=fetch,totalMs=PUBLICATION_CLIENT_LIMITS.totalMs}){
 need(uuid(publicationId)&&Number.isSafeInteger(runId)&&runId>0&&sha(workflowSha)&&typeof getToken==='function'&&Number.isInteger(totalMs)&&totalMs>0&&totalMs<=PUBLICATION_CLIENT_LIMITS.totalMs,'PUBLICATION_CLIENT_INVALID');
 const deadline=Date.now()+totalMs,tokens=new Set();let requests=0;
 return Object.freeze({get requests(){return requests;},async post(action,payload={}, {signal}={}){
  need(['manifest','file'].includes(action),'PUBLICATION_ACTION_REJECTED');exact(payload,action==='file'?['path']:[]);
  const body=JSON.stringify({publicationId,payload});need(Buffer.byteLength(body)<=4096,'PUBLICATION_REQUEST_LIMIT');
  need(Date.now()<deadline,'PUBLICATION_TIME_LIMIT');need(requests<PUBLICATION_CLIENT_LIMITS.requests,'PUBLICATION_REQUEST_LIMIT');requests++;
  const token=await timed(s=>getToken({signal:s}),Math.min(5000,deadline-Date.now()),signal,'PUBLICATION_OIDC_TIMEOUT');
  need(typeof token==='string'&&token.length<=20000&&tokenPattern.test(token),'PUBLICATION_OIDC_INVALID');
  const fingerprint=hash(token);need(!tokens.has(fingerprint),'PUBLICATION_TOKEN_REUSED');tokens.add(fingerprint);
  need(Date.now()<deadline,'PUBLICATION_TIME_LIMIT');
  const result=await json(PUBLICATION_TRUST.origin+'/api/publication/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body},
   {transport,signal,ms:Math.min(PUBLICATION_CLIENT_LIMITS.requestMs,deadline-Date.now()),bytes:PUBLICATION_CLIENT_LIMITS.responseBytes});
  const b=result.binding;need(result.published===false&&b?.publicationId===publicationId&&b.runId===runId&&b.runAttempt===1&&b.workflowSha===workflowSha,'PUBLICATION_BINDING_CHANGED');
  exact(b,['publicationId','approvalId','reviewId','runId','runAttempt','workflowSha','proposalHash','artifactHash']);
  need(uuid(b.approvalId)&&uuid(b.reviewId)&&/^[a-f0-9]{64}$/.test(b.proposalHash)&&/^[a-f0-9]{64}$/.test(b.artifactHash));return result;
 }});
}

// Only returns a complete, hash-verified bundle. It does not execute, write or
// publish any candidate files and does not infer deployment approval from reads.
export async function downloadPublicationArtifact(client,{signal}={}){
 const controller=new AbortController(),bounded=AbortSignal.any([controller.signal,...(signal?[signal]:[])]);
 try{
  const info=await client.post('manifest',{}, {signal:bounded});exact(info,['binding','manifest','bytes','inspection','published']);publicationInspection(info.inspection,info.binding);
  const manifest=snapshotArtifactManifest(info.manifest,info.binding.artifactHash);
  need(Number.isSafeInteger(info.bytes)&&info.bytes>=0&&info.bytes<=LIMITS.bytes);const files=Array(manifest.length);let next=0,total=0;
  await Promise.all(Array.from({length:Math.min(PUBLICATION_CLIENT_LIMITS.parallelFiles,manifest.length)},async()=>{
   while(next<manifest.length){const i=next++,expected=manifest[i];
    const data=await client.post('file',{path:expected.path},{signal:bounded});exact(data,['binding','file','published']);exact(data.file,['path','hash','bytesBase64']);
    need(Object.keys(info.binding).every(key=>data.binding[key]===info.binding[key])&&data.file.path===expected.path&&data.file.hash===expected.hash,'PUBLICATION_FILE_CHANGED');
    need(typeof data.file.bytesBase64==='string'&&data.file.bytesBase64.length<=Math.ceil(LIMITS.fileBytes/3)*4);
    const bytes=Buffer.from(data.file.bytesBase64,'base64');total+=bytes.length;
    need(total<=LIMITS.bytes&&bytes.length<=LIMITS.fileBytes&&bytes.toString('base64')===data.file.bytesBase64&&hash(bytes)===expected.hash,'PUBLICATION_FILE_CHANGED');
    files[i]={path:expected.path,bytesBase64:data.file.bytesBase64};
   }
  }));
  need(total===info.bytes,'PUBLICATION_SIZE_CHANGED');const bundle=encodeArtifactBundle(files);need(bundle.artifactHash===info.binding.artifactHash,'PUBLICATION_ARTIFACT_CHANGED');
  const packet={artifactText:bundle.artifactText,binding:info.binding,inspection:info.inspection};preparePublicationBundle(packet);
  return Object.freeze({...bundle,binding:Object.freeze(info.binding),inspection:Object.freeze(info.inspection),published:false});
 }finally{controller.abort();}
}
