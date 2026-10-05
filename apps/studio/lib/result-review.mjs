// Inert, owner-scoped result projection. Candidate code is never evaluated here.
import {hash,relativeFile} from '../../../packages/contracts/content-source.js';
import {parseCandidate} from '../../../automation/runner/candidate.mjs';
import {parseRoleReport} from '../../../automation/runner/pipeline.mjs';
import {assertRuntimeReport} from '../../../packages/contracts/runtime-report.js';
import {StudioError,id,fields} from './domain.mjs';

const need=(ok,code='RESULT_RECORD_INVALID',status=503)=>{if(!ok)throw new StudioError(code,status);};
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const terminal=['needs_input','failed','cancelled','awaiting_approval'];
const text=(value,max=2000)=>typeof value==='string'?value.slice(0,max):'';
const names=['curriculum','subject','design','developer','reviewer'];
const sourceKinds=['curriculum','textbook','science'];
export function inspectWorkerResult(snapshot){
 need(snapshot&&snapshot.job&&snapshot.worker&&Array.isArray(snapshot.evidence)&&Array.isArray(snapshot.feedback));
 const {job,worker}=snapshot;
 need(sha(worker.source_hash)&&typeof worker.input_text==='string'&&Buffer.byteLength(worker.input_text)<=150000&&hash(worker.input_text)===worker.source_hash);
 let source;try{source=JSON.parse(worker.input_text);}catch{need(false);}
 need(source?.input&&source.context&&Array.isArray(source.context.sources));
 const evidence=snapshot.evidence;need(evidence.length<=40&&worker.event_count===evidence.length);
 let bytes=0;
 const events=evidence.map((row,index)=>{
  need(row.sequence===index+1&&typeof row.body==='string'&&sha(row.body_hash));bytes+=Buffer.byteLength(row.body);need(bytes<=16000000&&hash(row.body)===row.body_hash);
  let event;try{event=JSON.parse(row.body);}catch{need(false);}
  need(event.jobId===job.id&&event.sourceSnapshotHash===worker.source_hash&&event.kind===row.kind);
  return {sequence:row.sequence,createdAt:row.created_at,event};
 });
 const evidenceHash=hash(evidence.map(row=>row.sequence+':'+row.body_hash).join('\n'));need(evidenceHash===snapshot.evidence_hash);
 const outputs=events.filter(row=>row.event.kind==='role_output');
 for(const {event} of outputs)need(names.includes(event.role)&&event.executionMode==='separate_context'&&typeof event.output==='string'&&hash(event.output)===event.outputHash);
 const initialReviews=outputs.filter(row=>['curriculum','subject','design'].includes(row.event.role)).map(row=>{
  let report;try{report=parseRoleReport(row.event.output,row.event.role);}catch{report={status:'invalid',findings:[],blockingIssues:['ROLE_REPORT_INVALID']};}
  return {role:row.event.role,sequence:row.sequence,createdAt:row.createdAt,...report};
 });
 let latest=null;
 const attempts=events.filter(row=>row.event.kind==='candidate').map(version=>{
  const v=version.event;need(Number.isInteger(v.attempt)&&v.attempt>=0&&v.attempt<=2&&sha(v.candidateHash));
  const developer=outputs.findLast(row=>row.sequence<version.sequence&&row.event.role==='developer');need(developer);
  let candidate;try{candidate=parseCandidate(developer.event.output,source.context);}catch{need(false);}
  need(candidate.candidateHash===v.candidateHash&&JSON.stringify(candidate.manifest)===JSON.stringify(v.manifest));
  const next=events.find(row=>row.sequence>version.sequence&&row.event.kind==='candidate')?.sequence??Infinity;
  const runtime=events.find(row=>row.sequence>version.sequence&&row.sequence<next&&row.event.kind==='runtime_evidence');
  const review=events.find(row=>row.sequence>version.sequence&&row.sequence<next&&row.event.kind==='review');
  let runtimeReport=null,reviewReport=null;
  if(runtime){
   const e=runtime.event.evidence;need(runtime.event.attempt===v.attempt&&e.candidateHash===v.candidateHash&&e.sourceSnapshotHash===worker.source_hash&&e.baselineSha===worker.verified_sha);
   const report={candidateHash:e.candidateHash,sourceSnapshotHash:e.sourceSnapshotHash,baselineSha:e.baselineSha,attempt:runtime.event.attempt,checks:e.checks,checksExecuted:e.checksExecuted,issues:e.issues,details:e.details};
   try{assertRuntimeReport(report,source.input.generationKind);}catch{need(false);}
   need(hash(JSON.stringify(report))===e.checksHash);
   runtimeReport={checksHash:e.checksHash,checks:e.checks,checksExecuted:e.checksExecuted,issues:e.issues,details:e.details};
  }
  if(review){
   const reviewer=outputs.findLast(row=>row.sequence<review.sequence&&row.sequence>version.sequence&&row.event.role==='reviewer');
   need(runtime&&reviewer&&runtime.sequence<reviewer.sequence&&review.event.attempt===v.attempt&&review.event.checksHash===runtimeReport.checksHash);
   let parsed;try{parsed=parseRoleReport(reviewer.event.output,'reviewer',v.candidateHash);}catch{need(false);}
   need(JSON.stringify(parsed)===JSON.stringify(review.event.review));reviewReport=parsed;
  }
  latest=candidate;
  return {attempt:v.attempt,candidateHash:v.candidateHash,createdAt:version.createdAt,runtime:runtimeReport,review:reviewReport};
 });
 need(attempts.length<=3&&attempts.every((a,i)=>a.attempt===i));
 if(worker.candidate_hash!==null)need(latest?.candidateHash===worker.candidate_hash);
 const budget=snapshot.budget;
 need(budget&&['active','closed','uncertain'].includes(budget.state)&&['limit_usd_micros','held_usd_micros','spent_usd_micros','call_count'].every(k=>Number.isSafeInteger(budget[k])&&budget[k]>=0));
 // Until source attestations and the EXACT deploy artifact are connected,
 // neither an AI pass nor a teacher comment may grant publication authority.
 const publicationBlockers=['SOURCE_ORIGINALS_NOT_ATTESTED','DEPLOY_ARTIFACT_NOT_PREPARED','RELEASE_APPROVAL_NOT_RECORDED'];
 if(!source.context.curriculumRevision)publicationBlockers.unshift('CURRICULUM_CONTEXT_MISSING');
 if(job.state!=='awaiting_approval')publicationBlockers.unshift('RESULT_NOT_READY');
 if(!latest)publicationBlockers.unshift('CANDIDATE_NOT_AVAILABLE');
 const version={stateVersion:job.state_version,sourceHash:worker.source_hash,candidateHash:latest?.candidateHash??null,evidenceHash};
 const result={jobId:job.id,state:job.state,reason:job.error_code??worker.reason,runId:job.run_id,baselineSha:worker.verified_sha,version,
  revision:source.input.revision?{parentJobId:source.input.revision.parentJobId,candidateHash:source.input.revision.candidateHash}:null,
  input:{topic:text(source.input.topic,120),generationKind:source.input.generationKind,grade:source.context.grade,unit:text(source.context.unit,120),
   sources:source.context.sources.map(s=>({id:text(s.id,100),kind:sourceKinds.includes(s.kind)?s.kind:'science',title:text(s.title,150),verification:'not_independently_verified'}))},
  candidate:latest?{contentId:latest.contentId,title:latest.meta.title,summary:latest.meta.summary,assumptions:latest.meta.assumptions,entry:latest.meta.entry,files:latest.files.map(file=>({path:file.path,hash:hash(file.content),bytes:Buffer.byteLength(file.content)}))}:null,
  initialReviews,attempts,budget:{state:budget.state,limitUsdMicros:budget.limit_usd_micros,heldUsdMicros:budget.held_usd_micros,spentUsdMicros:budget.spent_usd_micros,calls:budget.call_count},
  feedback:snapshot.feedback,feedbackAllowed:terminal.includes(job.state)&&['finished','uncertain'].includes(worker.state),publication:{eligible:false,blockers:publicationBlockers},
 };
 need(snapshot.feedback.length<=20&&Buffer.byteLength(JSON.stringify(result))<=262144);
 return {result,candidate:latest};
}

export function createResultReviewService({db,ownerId,enabled=false}){
 id(ownerId);
 const rpc=async(name,args)=>{
  let response;try{response=await db.rpc(name,args).abortSignal(AbortSignal.timeout(10000));}catch{throw new StudioError('RESULT_UNAVAILABLE',503);}
  if(response.error){const c=response.error.code;throw new StudioError(({PT400:'INVALID_REQUEST',PT403:'TEACHER_NOT_ALLOWED',PT404:'NOT_FOUND',PT409:'RESULT_CHANGED',PT429:'RESULT_FEEDBACK_LIMIT'})[c]||'RESULT_UNAVAILABLE',({PT400:400,PT403:403,PT404:404,PT409:409,PT429:429})[c]||503);}
  return response.data;
 };
 const configured=()=>need(enabled,'RESULT_SETUP_REQUIRED',503);
 const inspect=async jobId=>{configured();id(jobId);const snapshot=await rpc('read_worker_result',{p_owner:ownerId,p_job:jobId});need(snapshot,'NOT_FOUND',404);return inspectWorkerResult(snapshot);};
 const matches=(expected,current)=>need(expected.stateVersion===current.stateVersion&&expected.sourceHash===current.sourceHash&&expected.candidateHash===current.candidateHash&&expected.evidenceHash===current.evidenceHash,'RESULT_CHANGED',409);
 return Object.freeze({
  async capability(){if(!enabled)return false;try{return await rpc('result_review_version',{})===1;}catch{return false;}},
  async read(jobId){return {result:(await inspect(jobId)).result};},
  async file(jobId,body){
   fields(body,['version','path']);fields(body.version,['stateVersion','sourceHash','candidateHash','evidenceHash']);
   try{relativeFile(body.path);}catch{throw new StudioError('INVALID_REQUEST');}
   const {result,candidate}=await inspect(jobId);matches(body.version,result.version);const file=candidate?.files.find(f=>f.path===body.path);need(file,'NOT_FOUND',404);
   return {file:{path:file.path,content:file.content,hash:hash(file.content)}};
  },
  async feedback(jobId,body){
   fields(body,['version','decision','note','clientRequestId']);fields(body.version,['stateVersion','sourceHash','candidateHash','evidenceHash']);id(body.clientRequestId);
   need(['note','request_changes'].includes(body.decision)&&typeof body.note==='string'&&body.note.trim().length>0&&body.note.length<=2000,'INVALID_REQUEST',400);
   // Known credential formats/local private paths must not become prompts later.
   need(!/-----BEGIN .*PRIVATE KEY-----|\b(?:sk-|gh[pousr]_|github_pat_|sb_secret_)[A-Za-z0-9_-]{20,}|[A-Za-z]:\\Users\\|(?:^|\s)\.local[\\/]/i.test(body.note),'INPUT_CONTAINS_PRIVATE_DATA',400);
   const {result}=await inspect(jobId);matches(body.version,result.version);need(result.feedbackAllowed,'RESULT_CHANGED',409);
   const v=result.version;
   return {feedback:await rpc('record_result_feedback',{p_owner:ownerId,p_job:jobId,p_client:body.clientRequestId,p_state_version:v.stateVersion,p_source:v.sourceHash,p_candidate:v.candidateHash,p_evidence:v.evidenceHash,p_decision:body.decision,p_note:body.note.trim()})};
  },
 });
}
