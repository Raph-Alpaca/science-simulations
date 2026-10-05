import {WorkerAuthError} from './worker-auth.mjs';
import {exactKeys,workerNeed as need,workerHash as hash,workerUUID as uuid,workerSha as sha} from './worker-http.mjs';
import {parseCandidate} from '../../../automation/runner/candidate.mjs';
import {parseRoleReport} from '../../../automation/runner/pipeline.mjs';
import {PRICING} from '../../../automation/runner/bounded-responses.mjs';
import {assertRuntimeReport} from '../../../packages/contracts/runtime-report.js';
import {inspectRevisionBase} from '../../../automation/runner/revision.mjs';

export function createWorkerGateway(client){
 const studio=client.schema('studio');
 async function result(query){
  let response;try{response=await query.abortSignal(AbortSignal.timeout(10000));}catch{throw new WorkerAuthError('WORKER_DATABASE_UNCERTAIN',503);}
  if(response?.error){const code=response.error.code;throw new WorkerAuthError(code==='PT429'?'WORKER_LIMIT_REACHED':code==='PT409'?'WORKER_STATE_CONFLICT':code==='PT403'?'WORKER_BINDING_REJECTED':code==='PT412'?'WORKER_DISABLED':'WORKER_DATABASE_UNAVAILABLE',({'PT429':429,'PT409':409,'PT403':403,'PT412':503})[code]||503);}
  return response.data;
 }
 const rpc=(name,params)=>result(studio.rpc(name,params));
 const run=row=>({p_job:row.jobId,p_run:row.runId,p_attempt:row.runAttempt});
 async function input(binding){
  const row=await result(studio.from('worker_runs').select('approved_input').eq('job_id',binding.jobId).maybeSingle());
  need(row&&hash(row.approved_input)===binding.sourceSnapshotHash,'WORKER_INPUT_MISMATCH',409);
  let source;try{source=JSON.parse(row.approved_input);}catch{throw new WorkerAuthError('WORKER_INPUT_MISMATCH',409);}
  return {...source,sourceSnapshotHash:binding.sourceSnapshotHash};
 }
 async function history(binding){
  const rows=await result(studio.from('worker_evidence').select('sequence,kind,body').eq('job_id',binding.jobId).order('sequence',{ascending:false}).limit(40));
  need(Array.isArray(rows),'WORKER_EVIDENCE_UNAVAILABLE',503);
  try{return rows.map(row=>({...row,event:JSON.parse(row.body)}));}catch{throw new WorkerAuthError('WORKER_EVIDENCE_UNAVAILABLE',503);}
 }
 async function candidate(binding,payload,rows=undefined){
  rows??=await history(binding);const version=rows.find(row=>row.kind==='candidate');
  need(version?.event.candidateHash===payload.candidateHash&&version.event.attempt===payload.attempt,'WORKER_CANDIDATE_CHANGED',409);
  const output=rows.find(row=>row.sequence<version.sequence&&row.kind==='role_output'&&row.event.role==='developer');
  need(output,'WORKER_CANDIDATE_MISSING',409);const source=await input(binding);
  let parsed;try{parsed=parseCandidate(output.event.output,source.context);}catch{throw new WorkerAuthError('WORKER_CANDIDATE_INVALID',409);}
  need(parsed.candidateHash===payload.candidateHash,'WORKER_CANDIDATE_CHANGED',409);return parsed;
 }
 async function append(binding,requestId,event){
  const body=JSON.stringify(event),bodyHash=hash(body);
  return rpc('append_worker_evidence',{...run(binding),p_hash:binding.sourceSnapshotHash,p_event:requestId,p_body:body,p_body_hash:bodyHash});
 }
 async function evidence(binding,requestId,event){
  need(event.jobId===binding.jobId&&event.sourceSnapshotHash===binding.sourceSnapshotHash,'WORKER_BINDING_REJECTED',403);
  if(event.kind==='role_output'){
   exactKeys(event,['jobId','sourceSnapshotHash','kind','executionMode','role','callId','inputHash','outputHash','output','model','requestHash','usage','chargedUsdMicros']);
   exactKeys(event.usage,['inputTokens','outputTokens']);
   need(event.executionMode==='separate_context'&&['curriculum','subject','design','developer','reviewer'].includes(event.role)&&uuid(event.callId)&&sha(event.inputHash)&&sha(event.outputHash)&&sha(event.requestHash)&&
    typeof event.output==='string'&&Buffer.byteLength(event.output)<=2000000&&hash(event.output)===event.outputHash&&event.model===PRICING.model&&
    Number.isSafeInteger(event.chargedUsdMicros)&&event.chargedUsdMicros>=0&&Object.values(event.usage).every(n=>Number.isSafeInteger(n)&&n>=0));
   const charge=await result(studio.from('budget_calls').select('job_id,state,request_hash,role,charged_usd_micros').eq('call_id',event.callId).maybeSingle());
   need(charge?.job_id===binding.jobId&&charge.state==='settled'&&charge.request_hash===event.requestHash&&charge.role===event.role&&charge.charged_usd_micros===event.chargedUsdMicros,'WORKER_COST_RECEIPT_MISMATCH',409);
  }else if(event.kind==='candidate'){
   exactKeys(event,['jobId','sourceSnapshotHash','kind','attempt','candidateHash','manifest']);need(Number.isInteger(event.attempt)&&event.attempt>=0&&event.attempt<=2&&sha(event.candidateHash));
   const rows=await history(binding),output=rows.find(row=>row.kind==='role_output'&&row.event.role==='developer');need(output,'WORKER_CANDIDATE_MISSING',409);
   const source=await input(binding);let parsed;try{parsed=parseCandidate(output.event.output,source.context);}catch{throw new WorkerAuthError('WORKER_CANDIDATE_INVALID',409);}
   need(parsed.candidateHash===event.candidateHash&&JSON.stringify(parsed.manifest)===JSON.stringify(event.manifest),'WORKER_CANDIDATE_CHANGED',409);
  }else if(event.kind==='review'){
   exactKeys(event,['jobId','sourceSnapshotHash','kind','attempt','checksHash','review']);
   const rows=await history(binding),version=rows.find(row=>row.kind==='candidate'),runtime=rows.find(row=>row.kind==='runtime_evidence'),output=rows.find(row=>row.kind==='role_output'&&row.event.role==='reviewer');
   need(version&&runtime&&output&&output.sequence>runtime.sequence&&runtime.sequence>version.sequence&&event.attempt===version.event.attempt&&event.checksHash===runtime.event.evidence.checksHash,'WORKER_REVIEW_CHANGED',409);
   let parsed;try{parsed=parseRoleReport(output.event.output,'reviewer',version.event.candidateHash);}catch{throw new WorkerAuthError('WORKER_REVIEW_INVALID',409);}
   need(JSON.stringify(parsed)===JSON.stringify(event.review),'WORKER_REVIEW_CHANGED',409);
  }else throw new WorkerAuthError('WORKER_ROLE_REJECTED',403);
  return append(binding,requestId,event);
 }
 return Object.freeze({
  consume({identity,jobId,action,bodyHash}){return rpc('consume_worker_identity',{p_job:jobId,p_run:identity.runId,p_attempt:identity.runAttempt,p_sha:identity.workflowSha,p_jti_hash:identity.jtiHash,p_expires:identity.expiresAt,p_role:identity.role,p_action:action,p_body_hash:bodyHash});},
  async perform({identity,binding,action,requestId,payload}){
   if(action==='input'){
    const source=await input(binding);
    if(!source.input.revision)return source;
    const baseCandidateText=await rpc('read_revision_base',{...run(binding),p_source:binding.sourceSnapshotHash});
    try{inspectRevisionBase(source.input,source.context,baseCandidateText);}catch{throw new WorkerAuthError('WORKER_REVISION_CHANGED',409);}
    return {...source,baseCandidateText};
   }
   if(action==='claim')return rpc('claim_worker_run',{...run(binding),p_hash:binding.sourceSnapshotHash});
   if(action==='checkpoint')return {active:await rpc('worker_checkpoint',{...run(binding),p_hash:binding.sourceSnapshotHash})};
   if(action==='reserve')return rpc('reserve_ai_call',{p_job:binding.jobId,p_call:payload.callId,p_hash:payload.requestHash,p_role:payload.role,p_max_usd_micros:payload.maxUsdMicros});
   if(action==='settle')return rpc('settle_ai_call',{p_job:binding.jobId,p_call:payload.callId,p_charged_usd_micros:payload.chargedUsdMicros,p_uncertain:payload.uncertain});
   if(action==='evidence')return evidence(binding,requestId,payload.event);
   if(action==='verification'){
    const row=await result(studio.from('jobs').select('state').eq('id',binding.jobId).maybeSingle());
    need(row,'WORKER_BINDING_REJECTED',403);
    if(!['queued','running'].includes(row.state))return {state:'done'};
    const rows=await history(binding),version=rows.find(row=>row.kind==='candidate');
    if(!version||version.event.attempt<payload.attempt)return {state:'pending'};
    if(version.event.attempt>payload.attempt||rows.some(row=>row.kind==='runtime_evidence'&&row.event.attempt===payload.attempt&&row.event.evidence.candidateHash===version.event.candidateHash))return {state:'done'};
    const parsed=await candidate(binding,{candidateHash:version.event.candidateHash,attempt:payload.attempt},rows);
    const source=await result(studio.from('worker_runs').select('approved_input').eq('job_id',binding.jobId).maybeSingle());
    need(source&&hash(source.approved_input)===binding.sourceSnapshotHash,'WORKER_INPUT_MISMATCH',409);
    return {state:'ready',packet:{inputText:source.approved_input,candidateText:JSON.stringify({files:parsed.files}),expected:{sourceSnapshotHash:binding.sourceSnapshotHash,candidateHash:parsed.candidateHash,baselineSha:identity.workflowSha,attempt:payload.attempt}}};
   }
   if(action==='candidate')return {candidate:await candidate(binding,payload),sourceSnapshotHash:binding.sourceSnapshotHash};
   if(action==='runtime'){
    const rows=await history(binding);await candidate(binding,payload,rows);
    const runtime=rows.find(row=>row.kind==='runtime_evidence'&&row.event.attempt===payload.attempt&&row.event.evidence.candidateHash===payload.candidateHash);
    return runtime?{pending:false,evidence:runtime.event.evidence}:{pending:true};
   }
   if(action==='runtime-report'){
    need(identity.role==='report','WORKER_ROLE_REJECTED',403);
    need(payload.sourceSnapshotHash===binding.sourceSnapshotHash&&payload.baselineSha===identity.workflowSha,'WORKER_BINDING_REJECTED',403);
    await candidate(binding,payload);const source=await input(binding);
    try{assertRuntimeReport(payload,source.input.generationKind);}catch{throw new WorkerAuthError('WORKER_RUNTIME_REPORT_INVALID',400);}
    const evidence={candidateHash:payload.candidateHash,sourceSnapshotHash:binding.sourceSnapshotHash,baselineSha:identity.workflowSha,checksHash:hash(JSON.stringify(payload)),checks:payload.checks,checksExecuted:payload.checksExecuted,issues:payload.issues,details:payload.details};
    return append(binding,requestId,{jobId:binding.jobId,sourceSnapshotHash:binding.sourceSnapshotHash,kind:'runtime_evidence',attempt:payload.attempt,evidence});
   }
   if(action==='finish'){
    const job=await rpc('finish_worker_run',{...run(binding),p_outcome:payload.kind,p_candidate:payload.candidateHash,p_reason:payload.reason});
    return {id:job.id,state:job.state,stateVersion:job.state_version,errorCode:job.error_code};
   }
   throw new WorkerAuthError('WORKER_ACTION_REJECTED',404);
  },
 });
}
