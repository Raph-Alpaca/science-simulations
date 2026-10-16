import {randomUUID} from 'node:crypto';
import {hash} from '../../packages/contracts/content-source.js';
import {parseCandidate} from './candidate.mjs';
import {RunnerError, CALL_LIMITS} from './bounded-responses.mjs';
import budget from '../../config/execution-budget.json' with {type:'json'};
import metadataSchema from '../../packages/contracts/meta.schema.json' with {type:'json'};
import {RUNTIME_CONTRACT} from '../../packages/contracts/runtime-spec.js';
import {inspectRevisionBase} from './revision.mjs';
import {instructionsForRole,roleReviewScope,ROLE_STAGES,ROLE_POLICY_VERSION} from './role-instructions.mjs';

import {screenshotSummary} from '../../packages/contracts/runtime-screenshot.js';

export function evidenceForModel(evidence){
 if(!evidence.details?.screenshots)return evidence;
 return {...evidence,details:{...evidence.details,screenshots:evidence.details.screenshots.map(screenshotSummary)}};
}
const need=(value,code)=>{if(!value)throw new RunnerError(code);};
const dimensions=['science','learning','curriculum','textbook'];
const statuses=['pass','fail','needs_evidence'];
const list=value=>Array.isArray(value)&&value.length<=30&&value.every(s=>typeof s==='string'&&s.length<=2000);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function parseRoleReport(text,role,candidateHash){
 let value;try{value=JSON.parse(text);}catch{throw new RunnerError('ROLE_JSON_INVALID');}
 need(value&&statuses.includes(value.status)&&list(value.blockingIssues),'ROLE_REPORT_INVALID');
 if(role==='design'){
  need(typeof value.plan==='string'&&value.plan.length>0&&Buffer.byteLength(value.plan)<=20000,'ROLE_REPORT_INVALID');
  return {status:value.status,plan:value.plan,blockingIssues:value.blockingIssues};
 }
 need(list(value.findings),'ROLE_REPORT_INVALID');
 const result={status:value.status,findings:value.findings,blockingIssues:value.blockingIssues};
 if(role==='reviewer'){
  need(value.candidateHash===candidateHash,'REVIEW_CANDIDATE_MISMATCH');
  need(dimensions.every(d=>statuses.includes(value.checks?.[d])),'ROLE_REPORT_INVALID');
  result.candidateHash=candidateHash;result.checks=Object.fromEntries(dimensions.map(d=>[d,value.checks[d]]));
 }
 return result;
}
const report=parseRoleReport;

// Not wired to production. Every dependency must be supplied by a trusted host.
// authorize verifies the reviewed public input snapshot, claimRun atomically
// claims a run once and reserves its job budget, checkpoint verifies the
// live job/budget/cancellation state, record persists PRIVATE evidence, and
// verify runs in a separate sandbox with no API key, write token or OIDC access.
// No default permission grants, fake runtime checker, publisher or filesystem writer.
export async function runPipeline({jobId,input,context,baseCandidateText,signal},dependencies){
 need(typeof jobId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId),'INVALID_JOB_ID');
 for(const key of ['authorize','claimRun','checkpoint','record','call','verify'])need(typeof dependencies?.[key]==='function','PIPELINE_CONNECTION_REQUIRED');
 need(['interactive_2d','interactive_3d'].includes(input?.generationKind),'GENERATION_KIND_INVALID');
 const inputJson=JSON.stringify({input,context});
 need(Buffer.byteLength(inputJson)<=CALL_LIMITS.promptBytes,'PROMPT_TOO_LARGE');
 // Copy before the first await; mutation of caller-owned objects cannot change a
 // source snapshot or catalog identity after authorization.
 const snapshot=freeze(JSON.parse(inputJson)),sourceSnapshotHash=hash(inputJson);
 const controller=new AbortController(),started=Date.now();
 const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
 let calls=0,timer;const attempts=[];
 const stopped=()=>{need(!controller.signal.aborted,'JOB_CANCELLED');need(Date.now()-started<budget.maxJobSeconds*1000,'JOB_TIME_LIMIT');};
 async function checkpoint(){stopped();need(await dependencies.checkpoint({jobId,sourceSnapshotHash,signal:controller.signal})===true,'JOB_NOT_ACTIVE');stopped();}
 async function record(value){stopped();await dependencies.record({jobId,sourceSnapshotHash,...value},{signal:controller.signal});stopped();}
 async function ask(role,data){
  await checkpoint();need(calls<budget.maxCallsPerJob,'JOB_CALL_LIMIT');calls++;
  const callId=randomUUID(),input=JSON.stringify(data),inputHash=hash(input);
  const instructions=instructionsForRole(role,snapshot.context);
  const result=await dependencies.call({jobId,callId,role,instructions,input,signal:controller.signal});
  // Persist raw role output for audit before attempting to interpret it.
  need(typeof result?.text==='string'&&Buffer.byteLength(result.text)<=CALL_LIMITS.responseBytes,'ROLE_OUTPUT_INVALID');
  await record({kind:'role_output',executionMode:'separate_context',role,callId,inputHash,outputHash:hash(result.text),output:result.text,
   rolePolicyVersion:ROLE_POLICY_VERSION,reviewStage:ROLE_STAGES[role],reviewScope:roleReviewScope(snapshot.context),instructionsHash:hash(instructions),
   model:result.model,requestHash:result.requestHash,usage:result.usage,chargedUsdMicros:result.chargedUsdMicros});
  return result.text;
 }
 const held=(reason)=>({kind:'needs_input',reason,calls,sourceSnapshotHash,attempts});
 async function work(){
  stopped();
  const permission=await dependencies.authorize({jobId,sourceSnapshotHash,input:snapshot.input,context:snapshot.context,signal:controller.signal});
  need(permission?.sourceSnapshotHash===sourceSnapshotHash&&permission.aiProcessingAllowed===true&&permission.publicInputApproved===true,'INPUT_PERMISSION_REQUIRED');
  stopped();need(await dependencies.claimRun({jobId,sourceSnapshotHash,signal:controller.signal})===true,'RUN_ALREADY_CLAIMED');
  await checkpoint();
  roleReviewScope(snapshot.context);
  const original={sourceSnapshotHash,input:snapshot.input,context:snapshot.context};
  const revisionBase=freeze(inspectRevisionBase(snapshot.input,snapshot.context,baseCandidateText));
  // The first two reviews have separate contexts and neither sees the other's verdict.
  const curriculum=report(await ask('curriculum',original),'curriculum');
  if(curriculum.status!=='pass'||curriculum.blockingIssues.length)return held('CURRICULUM_EVIDENCE_REQUIRED');
  const subject=report(await ask('subject',original),'subject');
  if(subject.status!=='pass'||subject.blockingIssues.length)return held('SUBJECT_EVIDENCE_REQUIRED');
  const design=report(await ask('design',{...original,curriculum,subject}),'design');
  if(design.status!=='pass'||design.blockingIssues.length)return held('DESIGN_REVIEW_REQUIRED');
  let candidate,repair;
  for(let attempt=0;attempt<=budget.maxRepairAttempts;attempt++){
   const candidateText=await ask('developer',{...original,metadataSchema,runtimeContract:RUNTIME_CONTRACT,design,...(repair?{previousCandidate:candidate,repair}:revisionBase?{previousCandidate:revisionBase,revisionRequest:snapshot.input.revision}:{})});
   candidate=parseCandidate(candidateText,snapshot.context);
   await record({kind:'candidate',attempt,candidateHash:candidate.candidateHash,manifest:candidate.manifest});
   await checkpoint();
   const evidence=await dependencies.verify({jobId,attempt,candidate,sourceSnapshotHash,signal:controller.signal});
   need(evidence?.candidateHash===candidate.candidateHash&&evidence?.sourceSnapshotHash===sourceSnapshotHash&&
    /^[a-f0-9]{64}$/.test(evidence?.checksHash)&&['pass','fail','not_run'].includes(evidence?.checks?.runtime)&&
    ['pass','fail','not_run'].includes(evidence?.checks?.contract)&&list(evidence?.issues),'RUNTIME_EVIDENCE_INVALID');
   freeze(evidence);await record({kind:'runtime_evidence',attempt,evidence});
   const review=report(await ask('reviewer',{...original,design,candidate,evidence:evidenceForModel(evidence),...(revisionBase?{previousCandidate:revisionBase}:{})}),'reviewer',candidate.candidateHash);
   attempts.push({attempt,candidateHash:candidate.candidateHash,evidence,review});
   await record({kind:'review',attempt,checksHash:evidence.checksHash,review});
   // A known source-contract failure is repairable even though its unsafe code
   // was not launched. A missing checker or other unexecuted test stays on hold.
   if((evidence.checks.runtime==='not_run'&&evidence.checks.contract!=='fail')||evidence.checks.contract==='not_run')return held('RUNTIME_NOT_VERIFIED');
   if(review.status==='needs_evidence'||dimensions.some(d=>review.checks[d]==='needs_evidence'))return held('REVIEW_EVIDENCE_REQUIRED');
   if(evidence.checks.runtime==='pass'&&evidence.checks.contract==='pass'&&!evidence.issues.length&&
    review.status==='pass'&&!review.blockingIssues.length&&dimensions.every(d=>review.checks[d]==='pass')){
    await checkpoint();
    // Human/policy approval and publication are separate trusted steps.
    return {kind:'candidate_for_human_review',calls,sourceSnapshotHash,candidate,attempts};
   }
   repair={runtime:evidenceForModel(evidence),review};
  }
  return held('REPAIR_LIMIT_REACHED');
 }
 try{
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new RunnerError('JOB_TIME_LIMIT'));},budget.maxJobSeconds*1000);});
  return await Promise.race([work(),timeout]);
 }catch(error){throw error instanceof RunnerError?error:new RunnerError('RUNNER_DEPENDENCY_FAILED');
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.abort();}
}
