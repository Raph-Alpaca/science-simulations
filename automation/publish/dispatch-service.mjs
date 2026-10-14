// Trusted server adapter: dispatches a verifier workflow, never publishes files.
// Owner is supplied by server authentication, not the model/browser request.
// The injected dispatcher must target the fixed publication verifier workflow
// and report `failed` only when it can prove no HTTP dispatch POST was attempted.
import {randomUUID} from 'node:crypto';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const need=(v,c)=>{if(!v)throw Error(c);};
// Bound even a dependency that ignores AbortSignal. A timed-out dispatch can
// still complete remotely, so the durable outcome must remain uncertain.
async function bounded(call,ms,parent){
 const controller=new AbortController(),signal=AbortSignal.any([controller.signal,...(parent?[parent]:[])]);
 const timer=setTimeout(()=>controller.abort(),ms);let abort;
 try{
  signal.throwIfAborted();
  const stopped=new Promise((_,reject)=>{abort=()=>reject(Error('PUBLICATION_DISPATCH_UNAVAILABLE'));signal.addEventListener('abort',abort,{once:true});});
  return await Promise.race([Promise.resolve().then(()=>call(signal)),stopped]);
 }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);controller.abort();}
}

export function createPublicationDispatchService({db,ownerId,enabled=false,dispatcher,totalMs=45000,rpcMs=5000}){
 need(uuid(ownerId),'PUBLICATION_REQUEST_INVALID');
 need(Number.isInteger(totalMs)&&totalMs>0&&totalMs<=45000&&Number.isInteger(rpcMs)&&rpcMs>0&&rpcMs<=5000,'PUBLICATION_OPTIONS_INVALID');
 const rpc=async(name,args,signal)=>{
  let r;try{r=await bounded(s=>db.rpc(name,args).abortSignal(s),rpcMs,signal);}catch{throw Error('PUBLICATION_DISPATCH_UNAVAILABLE');}
  if(r.error)throw Error(({PT400:'PUBLICATION_REQUEST_INVALID',PT403:'PUBLICATION_FORBIDDEN',PT404:'PUBLICATION_NOT_FOUND',PT409:'PUBLICATION_CHANGED',PT412:'PUBLICATION_DISABLED',PT423:'PUBLICATION_BUSY',PT429:'PUBLICATION_LIMIT'})[r.error.code]||'PUBLICATION_DISPATCH_UNAVAILABLE');
  return r.data;
 };
 return Object.freeze({async start({approvalId,requestId}){
  need(uuid(approvalId)&&uuid(requestId),'PUBLICATION_REQUEST_INVALID');
  need(enabled===true&&typeof dispatcher?.dispatch==='function','PUBLICATION_DISABLED');
  const controller=new AbortController(),signal=controller.signal,timer=setTimeout(()=>controller.abort(),totalMs);
  try{
  const intent=await rpc('request_publication_dispatch',{p_owner:ownerId,p_approval:approvalId,p_client:requestId},signal);
  need(uuid(intent?.id),'PUBLICATION_DISPATCH_UNAVAILABLE');
  const claimId=randomUUID(),claimed=await rpc('claim_publication_dispatch',{p_owner:ownerId,p_intent:intent.id,p_claim:claimId},signal);
  if(claimed?.claimed!==true)return {dispatch:claimed.dispatch,published:false};
  // Any unexpected exception is ambiguous. No retry, no automatic claim reset.
  // A lost finish acknowledgement likewise leaves the durable claim in place.
  let result;
  try{result=await bounded(s=>dispatcher.dispatch(intent.id,{signal:s}),totalMs,signal);}catch{result={state:'uncertain'};}
  if(!result||!['submitted','uncertain','failed'].includes(result.state))result={state:'uncertain'};
  const dispatch=await rpc('finish_publication_dispatch',{p_owner:ownerId,p_intent:intent.id,p_claim:claimId,p_state:result.state,p_run:result.runId??null,p_sha:result.trustedSha??null});
  return {dispatch,published:false};
  }finally{clearTimeout(timer);controller.abort();}
 }});
}
