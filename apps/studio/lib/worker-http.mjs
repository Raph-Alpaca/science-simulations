import {createHash} from 'node:crypto';
import {WorkerAuthError,WORKER_TRUST} from './worker-auth.mjs';
import {assertRuntimeReport} from '../../../packages/contracts/runtime-report.js';

export const WORKER_BODY_LIMIT=2_200_000;
export const workerHash=value=>createHash('sha256').update(value).digest('hex');
export const workerUUID=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const workerSha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function workerNeed(value,code='WORKER_REQUEST_INVALID',status=400){if(!value)throw new WorkerAuthError(code,status);}
export function exactKeys(value,keys){workerNeed(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','));}
const actions={generation:new Set(['input','claim','checkpoint','reserve','settle','evidence','runtime','finish']),report:new Set(['verification','candidate','runtime-report'])};
export function validateWorkerPayload(action,payload){
 if(['input','claim','checkpoint'].includes(action))exactKeys(payload,[]);
 else if(action==='verification'){exactKeys(payload,['attempt']);workerNeed(Number.isInteger(payload.attempt)&&payload.attempt>=0&&payload.attempt<=2);}
 else if(action==='reserve'){
  exactKeys(payload,['callId','requestHash','role','maxUsdMicros']);workerNeed(workerUUID(payload.callId)&&workerSha(payload.requestHash)&&['curriculum','subject','design','developer','reviewer'].includes(payload.role)&&Number.isInteger(payload.maxUsdMicros)&&payload.maxUsdMicros>0&&payload.maxUsdMicros<=500000);
 }else if(action==='settle'){
  exactKeys(payload,['callId','chargedUsdMicros','uncertain']);workerNeed(workerUUID(payload.callId)&&typeof payload.uncertain==='boolean'&&(payload.uncertain?payload.chargedUsdMicros===null:Number.isSafeInteger(payload.chargedUsdMicros)&&payload.chargedUsdMicros>=0&&payload.chargedUsdMicros<=1000000));
 }else if(action==='evidence'){
  exactKeys(payload,['event']);workerNeed(payload.event&&['role_output','candidate','review'].includes(payload.event.kind),'WORKER_ROLE_REJECTED',403);
 }else if(['runtime','candidate'].includes(action)){
  exactKeys(payload,['candidateHash','attempt']);workerNeed(workerSha(payload.candidateHash)&&Number.isInteger(payload.attempt)&&payload.attempt>=0&&payload.attempt<=2);
 }else if(action==='runtime-report'){
  try{assertRuntimeReport(payload);}catch{throw new WorkerAuthError('WORKER_RUNTIME_REPORT_INVALID',400);}
 }else if(action==='finish'){
  exactKeys(payload,['kind','candidateHash','reason']);workerNeed(['needs_input','failed','cancelled','candidate_for_human_review'].includes(payload.kind)&&
   (payload.kind==='candidate_for_human_review'?workerSha(payload.candidateHash)&&payload.reason===null:payload.candidateHash===null&&typeof payload.reason==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(payload.reason)));
 }else throw new WorkerAuthError('WORKER_ACTION_REJECTED',404);
}
const response=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
async function bodyText(request){
 workerNeed(request.headers.get('content-type')?.split(';')[0].trim()==='application/json');
 workerNeed(!request.headers.get('content-encoding'));const length=request.headers.get('content-length');
 workerNeed(length===null||/^\d+$/.test(length)&&Number(length)<=WORKER_BODY_LIMIT,'WORKER_REQUEST_TOO_LARGE',413);
 const reader=request.body?.getReader();workerNeed(reader);let size=0,timer;const chunks=[];
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new WorkerAuthError('WORKER_BODY_TIMEOUT',408));},5000);});
 try{return await Promise.race([timeout,(async()=>{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>WORKER_BODY_LIMIT){void reader.cancel().catch(()=>{});throw new WorkerAuthError('WORKER_REQUEST_TOO_LARGE',413);}chunks.push(part.value);}try{return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}catch{throw new WorkerAuthError('WORKER_REQUEST_INVALID',400);}})()]);}
 finally{clearTimeout(timer);try{reader.releaseLock();}catch{/* Pending read was cancelled at the bounded deadline. */}}
}
export function createWorkerHttpHandler({verifyToken,gateway}){
 return async(request,action)=>{
  try{
   workerNeed(request.method==='POST','METHOD_NOT_ALLOWED',405);
   const url=new URL(request.url);workerNeed(url.origin===WORKER_TRUST.origin&&!url.search&&!url.hash,'WORKER_ORIGIN_REJECTED',403);
   workerNeed(!request.headers.has('cookie')&&!request.headers.has('origin'),'WORKER_BROWSER_REJECTED',403);
   const identity=await verifyToken(request.headers.get('authorization'));
   workerNeed(actions[identity.role]?.has(action),'WORKER_ROLE_REJECTED',403);
   const text=await bodyText(request);let body;try{body=JSON.parse(text);}catch{throw new WorkerAuthError('WORKER_REQUEST_INVALID',400);}
   exactKeys(body,['jobId','requestId','payload']);workerNeed(workerUUID(body.jobId)&&workerUUID(body.requestId));validateWorkerPayload(action,body.payload);
   // Atomic receipt consumption precedes any action, including reads. It binds
   // this authenticated run to one DB job. No body-supplied authority is used.
   const binding=await gateway.consume({identity,jobId:body.jobId,action,bodyHash:workerHash(text)});
   workerNeed(binding?.jobId===body.jobId&&binding.runId===identity.runId&&binding.runAttempt===identity.runAttempt&&binding.workflowSha===identity.workflowSha&&binding.role===identity.role&&workerSha(binding.sourceSnapshotHash),'WORKER_BINDING_REJECTED',403);
   return response(await gateway.perform({identity,binding,action,requestId:body.requestId,payload:body.payload}));
  }catch(error){return response({error:error instanceof WorkerAuthError?error.code:'WORKER_SERVICE_UNAVAILABLE'},error instanceof WorkerAuthError?error.status:503);}
 };
}
