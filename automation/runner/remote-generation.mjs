import {hash} from '../../packages/contracts/content-source.js';
import {assertRuntimeReport} from '../../packages/contracts/runtime-report.js';
import {RunnerError,createBoundedResponses,CALL_LIMITS} from './bounded-responses.mjs';
import {executeStoredPipeline} from './worker-store.mjs';
import {inspectRevisionBase} from './revision.mjs';

const need=(value,code)=>{if(!value)throw new RunnerError(code);};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const RUNTIME_POLL=Object.freeze({attempts:40,intervalMs:10000});
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted){reject(new RunnerError('WORKER_CANCELLED'));return;}
 const cancel=()=>{clearTimeout(timer);reject(new RunnerError('WORKER_CANCELLED'));};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);signal?.addEventListener('abort',cancel,{once:true});
});

// Generation sends and reads inert data. It cannot run a candidate or report a
// runtime pass; only the separately authenticated reporter can persist that.
export async function createRemoteGeneration({api,jobId,baselineSha,signal,pollWait=sleep}){
 need(typeof api?.post==='function'&&/^[a-f0-9]{40}$/.test(baselineSha),'REMOTE_WORKER_CONFIGURATION');
 const response=await api.post('input',{}, {signal});
 need(response&&Object.keys(response).sort().join(',')===(response.input?.revision?'baseCandidateText,context,input,sourceSnapshotHash':'context,input,sourceSnapshotHash'),'WORKER_INPUT_MISMATCH');
 const inputText=JSON.stringify({input:response.input,context:response.context});
 need(Buffer.byteLength(inputText)<=CALL_LIMITS.promptBytes&&hash(inputText)===response.sourceSnapshotHash,'WORKER_INPUT_MISMATCH');
 const source=freeze(JSON.parse(inputText)),sourceHash=response.sourceSnapshotHash;let runtimeEvidence;
 inspectRevisionBase(source.input,source.context,response.baseCandidateText);
 const matches=(job,snapshot)=>need(job===jobId&&snapshot===sourceHash,'WORKER_INPUT_MISMATCH');
 const ledger=Object.freeze({
  async reserve({jobId:job,callId,requestHash,role,maxUsdMicros}){
   need(job===jobId,'WORKER_INPUT_MISMATCH');const r=await api.post('reserve',{callId,requestHash,role,maxUsdMicros});
   need(r?.job_id===jobId&&r.call_id===callId&&r.request_hash===requestHash&&r.role===role&&r.reserved_usd_micros===maxUsdMicros&&typeof r.newReservation==='boolean'&&(!r.newReservation||r.state==='reserved'),'WORKER_BUDGET_RECEIPT_INVALID');return r;
  },
  async settle({jobId:job,callId,chargedUsdMicros,uncertain}){
   need(job===jobId,'WORKER_INPUT_MISMATCH');const r=await api.post('settle',{callId,chargedUsdMicros,uncertain});
   need(r?.job_id===jobId&&r.call_id===callId&&((uncertain&&r.state==='uncertain')||(!uncertain&&r.state==='settled'&&r.charged_usd_micros===chargedUsdMicros)||(r.state==='uncertain'&&r.budgetBreach===true)),'WORKER_BUDGET_RECEIPT_INVALID');return r;
  },
 });
 const store=Object.freeze({
  async authorize({jobId:job,sourceSnapshotHash,input,context}){
   matches(job,sourceSnapshotHash);need(hash(JSON.stringify({input,context}))===sourceHash,'WORKER_INPUT_MISMATCH');
   // The signed input endpoint checked the immutable server-reviewed snapshot.
   return {sourceSnapshotHash,aiProcessingAllowed:true,publicInputApproved:true};
  },
  async claimRun({jobId:job,sourceSnapshotHash,signal}){matches(job,sourceSnapshotHash);const r=await api.post('claim',{}, {signal});need(typeof r?.claimed==='boolean','WORKER_RECEIPT_INVALID');return r.claimed;},
  async checkpoint({jobId:job,sourceSnapshotHash,signal}){matches(job,sourceSnapshotHash);const r=await api.post('checkpoint',{}, {signal});need(typeof r?.active==='boolean','WORKER_RECEIPT_INVALID');return r.active;},
  async record(event,{signal}={}){
   matches(event.jobId,event.sourceSnapshotHash);
   if(event.kind==='runtime_evidence'){
    need(runtimeEvidence?.attempt===event.attempt&&JSON.stringify(runtimeEvidence.evidence)===JSON.stringify(event.evidence),'WORKER_RUNTIME_NOT_REPORTED');return;
   }
   const r=await api.post('evidence',{event},{signal});need(r?.bodyHash===hash(JSON.stringify(event))&&Number.isInteger(r.sequence)&&r.sequence>=1&&r.sequence<=40,'WORKER_RECEIPT_INVALID');
  },
  async finish(result){
   const r=await api.post('finish',{kind:result.kind,candidateHash:result.candidate?.candidateHash??null,reason:result.reason??null});
   need(r?.id===jobId&&['needs_input','failed','cancelled','awaiting_approval'].includes(r.state)&&Number.isInteger(r.stateVersion),'WORKER_RECEIPT_INVALID');return r;
  },
 });
 async function verify({jobId:job,attempt,candidate,sourceSnapshotHash,signal}){
  matches(job,sourceSnapshotHash);runtimeEvidence=undefined;
  for(let poll=0;poll<RUNTIME_POLL.attempts;poll++){
   need(!signal?.aborted,'WORKER_CANCELLED');
   const r=await api.post('runtime',{candidateHash:candidate.candidateHash,attempt},{signal});
   need(r&&typeof r.pending==='boolean','WORKER_RUNTIME_RECEIPT_INVALID');
   if(!r.pending){
    const e=r.evidence;need(e?.candidateHash===candidate.candidateHash&&e.sourceSnapshotHash===sourceHash&&e.baselineSha===baselineSha&&/^[a-f0-9]{64}$/.test(e.checksHash),'WORKER_RUNTIME_RECEIPT_INVALID');
    try{assertRuntimeReport({candidateHash:e.candidateHash,sourceSnapshotHash:e.sourceSnapshotHash,baselineSha:e.baselineSha,attempt,checks:e.checks,checksExecuted:e.checksExecuted,issues:e.issues,details:e.details},source.input.generationKind);}catch{throw new RunnerError('WORKER_RUNTIME_RECEIPT_INVALID');}
    runtimeEvidence=freeze({attempt,evidence:JSON.parse(JSON.stringify(e))});return runtimeEvidence.evidence;
   }
   if(poll+1<RUNTIME_POLL.attempts)await pollWait(RUNTIME_POLL.intervalMs,signal);
  }
  throw new RunnerError('WORKER_RUNTIME_WAIT_LIMIT');
 }
 return Object.freeze({args:{jobId,...source,...(source.input.revision?{baseCandidateText:response.baseCandidateText}:{}),signal},store,ledger,verify});
}

export async function runRemoteGeneration({api,jobId,baselineSha,apiKey,signal,providerTransport,pollWait,now}){
 const remote=await createRemoteGeneration({api,jobId,baselineSha,signal,pollWait});
 const call=createBoundedResponses({apiKey,ledger:remote.ledger,transport:providerTransport,now});
 return executeStoredPipeline(remote.args,{store:remote.store,verify:remote.verify,call});
}
