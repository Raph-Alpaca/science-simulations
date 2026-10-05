import {randomUUID} from 'node:crypto';
import {hash} from '../../packages/contracts/content-source.js';
import {RunnerError} from './bounded-responses.mjs';
import {runPipeline} from './pipeline.mjs';

// Trusted server process only. A future worker-facing HTTP API must independently
// verify GitHub OIDC and bind its run/attempt to this job before calling this store.
// Passing run IDs here is not authentication and is never sufficient on its own.
export function createWorkerStore(client,{jobId,runId,runAttempt,sourceSnapshotHash}){
 if(typeof client?.schema!=='function'||!Number.isSafeInteger(runId)||runId<1||runAttempt!==1||!/^[a-f0-9]{64}$/.test(sourceSnapshotHash))throw new RunnerError('WORKER_BINDING_REQUIRED');
 const studio=client.schema('studio');
 const identity={p_job:jobId,p_run:runId,p_attempt:runAttempt};
 async function rpc(name,params,signal){
  let result;
  const combined=signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000);
  try{result=await studio.rpc(name,params).abortSignal(combined);}catch{throw new RunnerError('WORKER_DATABASE_UNCERTAIN');}
  if(result?.error||result?.data===null||result?.data===undefined)throw new RunnerError('WORKER_DATABASE_REJECTED');
  return result.data;
 }
 const matches=hash=>{if(hash!==sourceSnapshotHash)throw new RunnerError('WORKER_INPUT_MISMATCH');};
 return Object.freeze({
  async authorize({jobId:job,sourceSnapshotHash:inputHash,input,context,signal}){
   matches(inputHash);if(job!==jobId||hash(JSON.stringify({input,context}))!==sourceSnapshotHash)throw new RunnerError('WORKER_INPUT_MISMATCH');
   let result;
   try{result=await studio.from('worker_runs').select('job_id,source_snapshot_hash,input_review_id,workflow_run_id,workflow_run_attempt').eq('job_id',jobId).maybeSingle().abortSignal(signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000));}
   catch{throw new RunnerError('WORKER_DATABASE_UNCERTAIN');}
   const row=result?.data;
   if(result?.error||row?.job_id!==jobId||row.source_snapshot_hash!==sourceSnapshotHash||!row.input_review_id||row.workflow_run_id!==runId||row.workflow_run_attempt!==runAttempt)throw new RunnerError('INPUT_PERMISSION_REQUIRED');
   // This relies on the server's reviewed-input submission path. It does not
   // infer source rights from model output, a browser field, or a public URL.
   return {sourceSnapshotHash,aiProcessingAllowed:true,publicInputApproved:true};
  },
  async claimRun({jobId:job,sourceSnapshotHash:inputHash,signal}){
   matches(inputHash);if(job!==jobId)throw new RunnerError('WORKER_BINDING_REQUIRED');
   const value=await rpc('claim_worker_run',{...identity,p_hash:sourceSnapshotHash},signal);
   if(typeof value?.claimed!=='boolean')throw new RunnerError('WORKER_RECEIPT_INVALID');
   return value.claimed;
  },
  async checkpoint({jobId:job,sourceSnapshotHash:inputHash,signal}){
   matches(inputHash);if(job!==jobId)throw new RunnerError('WORKER_BINDING_REQUIRED');
   const value=await rpc('worker_checkpoint',{...identity,p_hash:sourceSnapshotHash},signal);
   if(typeof value!=='boolean')throw new RunnerError('WORKER_RECEIPT_INVALID');
   return value;
  },
  async record(event,{signal}={}){
   matches(event.sourceSnapshotHash);if(event.jobId!==jobId)throw new RunnerError('WORKER_BINDING_REQUIRED');
   const body=JSON.stringify(event),bodyHash=hash(body);
   const value=await rpc('append_worker_evidence',{...identity,p_hash:sourceSnapshotHash,p_event:randomUUID(),p_body:body,p_body_hash:bodyHash},signal);
   if(value?.bodyHash!==bodyHash||!Number.isInteger(value.sequence)||value.sequence<1||value.sequence>40)throw new RunnerError('WORKER_RECEIPT_INVALID');
   return value;
  },
  async finish(result){
   const value=await rpc('finish_worker_run',{...identity,p_outcome:result.kind,p_candidate:result.candidate?.candidateHash??null,p_reason:result.reason??null});
   if(value?.id!==jobId||!['needs_input','failed','cancelled','awaiting_approval'].includes(value.state))throw new RunnerError('WORKER_RECEIPT_INVALID');
   return value;
  },
 });
}

export async function executeStoredPipeline(args,{store,call,verify}){
 let claimed=false,result;
 try{
  result=await runPipeline(args,{authorize:store.authorize,checkpoint:store.checkpoint,record:store.record,call,verify,
   async claimRun(input){const value=await store.claimRun(input);claimed=value;return value;}});
 }catch(error){
  // An unknown claim response cannot start the provider and cannot be retried
  // here. A trusted reconciliation step must inspect the persisted run.
  if(!claimed)throw error;
  result={kind:args.signal?.aborted?'cancelled':'failed',reason:error instanceof RunnerError?error.code:'RUNNER_DEPENDENCY_FAILED'};
 }
 // Completion/reconciliation is deliberately outside the aborted job signal.
 // Reserved calls are retained as uncertain by SQL if usage was not settled.
 const job=await store.finish(result);
 if(job.state==='cancelled')result={kind:'cancelled',reason:'JOB_CANCELLED'};
 return {result,job};
}
