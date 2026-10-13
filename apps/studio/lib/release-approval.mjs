// Server-only through service.ts. No source issuer, candidate execution or deploy.
import {hash} from '../../../packages/contracts/content-source.js';
import {assertEducationEvidence} from '../../../packages/contracts/education-evidence.js';
import {openArtifactBundle,assertCatalogReleaseApproval} from '../../../automation/publish/artifact-bundle.mjs';
import {inspectWorkerResult} from './result-review.mjs';
import {StudioError,id,fields} from './domain.mjs';

const need=(ok,code='RELEASE_RECORD_INVALID',status=503)=>{if(!ok)throw new StudioError(code,status);};
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const proposalKeys=['schemaVersion','jobId','contentId','candidateHash','sourceSnapshotHash','baselineSha','attempt','baseArtifactHash','artifactHash','entry'];
const evidenceFor=r=>({sourceSnapshotHash:r.source_hash,checksHash:r.checks_hash,educationHash:r.education_hash,lockHash:r.lock_hash,policyVersion:r.policy_version,
 checks:Object.fromEntries(['curriculum','textbook','rights','science','learning','runtime'].map(k=>[k,'pass']))});
const approvalFor=(r,a)=>({schemaVersion:2,jobId:a.job_id,contentId:a.content_id,candidateHash:a.candidate_hash,artifactHash:a.artifact_hash,
 proposalHash:r.proposal_hash,approvalId:a.id,approvedAt:a.approved_at,approverId:a.approver,actorType:'teacher',decision:'approve',invalidatedAt:a.invalidated_at,
 educationEvidence:r.education_text,evidenceVersion:{...evidenceFor(r),checksHash:a.checks_version,policyVersion:a.policy_version}});
const receipt=(a,effective)=>a?{id:a.id,approvedAt:a.approved_at,invalidatedAt:a.invalidated_at,effective:effective===true}:null;

// This validates an issuer's stored preparation; it never manufactures a teacher
// approval. `current` comes from the single SQL snapshot, never a request field.
export function inspectReleaseReview(snapshot,ownerId){
 const r=snapshot?.review;need(r&&r.owner_id===ownerId&&snapshot.result&&typeof snapshot.current==='boolean');
 const {result,candidate}=inspectWorkerResult(snapshot.result);
 need(r.job_id===result.jobId&&sha(r.proposal_hash)&&hash(r.proposal_text)===r.proposal_hash);
 const summary={id:r.id,jobId:r.job_id,proposalHash:r.proposal_hash,candidateHash:r.candidate_hash,artifactHash:r.artifact_hash,
  contentId:candidate?.contentId??null,title:candidate?.meta.title??null,createdAt:r.created_at,current:snapshot.current,
  approval:receipt(snapshot.approval,false),approvalAllowed:false,blockers:snapshot.current?[]:['RELEASE_CHANGED']};
 if(!snapshot.current)return {summary,record:r,current:null};
 try{
  const p=JSON.parse(r.proposal_text);fields(p,proposalKeys);need(Object.keys(p).length===proposalKeys.length&&p.schemaVersion===1);
  need(candidate&&result.state==='awaiting_approval'&&snapshot.result.worker.state==='finished'&&result.budget.state==='closed'&&result.budget.heldUsdMicros===0);
  need(['curriculum','subject','design'].every(role=>result.initialReviews.filter(x=>x.role===role).length===1&&result.initialReviews.find(x=>x.role===role).status==='pass'));
  const last=result.attempts.at(-1);need(last&&last.review?.status==='pass'&&['science','learning','curriculum','textbook'].every(k=>last.review.checks[k]==='pass'));
  need(last.runtime?.checks.runtime==='pass'&&last.runtime.checks.contract==='pass'&&last.runtime.checksHash===r.checks_hash);
  need(result.version.stateVersion===r.state_version&&result.version.sourceHash===r.source_hash&&result.version.candidateHash===r.candidate_hash&&result.version.evidenceHash===r.evidence_hash);
  const expected={jobId:result.jobId,contentId:candidate.contentId,candidateHash:candidate.candidateHash,sourceSnapshotHash:result.version.sourceHash,
   baselineSha:result.baselineSha,attempt:last.attempt,baseArtifactHash:r.base_artifact_hash,artifactHash:r.artifact_hash,entry:candidate.meta.entry};
  need(Object.keys(expected).every(k=>p[k]===expected[k]));
  const bundle=openArtifactBundle(r.artifact_text,r.artifact_hash),prefix='simulations/'+candidate.contentId+'/';
  const target=bundle.files.filter(f=>f.path.startsWith(prefix));need(target.length===candidate.files.length);
  for(const f of candidate.files){const actual=target.find(t=>t.path===prefix+f.path);need(actual&&Buffer.from(actual.bytesBase64,'base64').equals(Buffer.from(f.content)));}
  need(['draft','in_review','ready'].includes(candidate.meta.stage)&&candidate.meta.schoolYear===null&&candidate.meta.curriculumRevision);
  need(sha(r.lock_hash)&&typeof r.policy_version==='string'&&r.policy_version.length>0&&r.policy_version.length<=100);
  // Source attestations must already have existed when this immutable review was
  // issued. approvedAt is the validator's time cutoff, not a teacher receipt.
  assertEducationEvidence(r.education_text,r.education_hash,candidate.meta,{candidateHash:candidate.candidateHash,evidenceVersion:{sourceSnapshotHash:r.source_hash},approvedAt:r.created_at});
  const current={...expected,...evidenceFor(r),ownerId};
  if(snapshot.approval?.invalidated_at===null){
   need(snapshot.approval.release_review_id===r.id);
   assertCatalogReleaseApproval({artifactText:r.artifact_text,proposalText:r.proposal_text,proposalHash:r.proposal_hash,approval:approvalFor(r,snapshot.approval),current});
   summary.approval=receipt(snapshot.approval,true);
  }
  summary.approvalAllowed=!snapshot.approval;
  if(snapshot.approval?.invalidated_at)summary.blockers.push('APPROVAL_REVOKED');
  return {summary,record:r,current};
 }catch{throw new StudioError('RELEASE_RECORD_INVALID',503);}
}

export function createReleaseApprovalService({db,ownerId,enabled=false}){
 id(ownerId);
 const rpc=async(name,args)=>{
  let response;try{response=await db.rpc(name,args).abortSignal(AbortSignal.timeout(10000));}catch{throw new StudioError('RELEASE_UNAVAILABLE',503);}
  if(response.error){const c=response.error.code;throw new StudioError(({PT400:'INVALID_REQUEST',PT403:'TEACHER_NOT_ALLOWED',PT404:'NOT_FOUND',PT409:'RELEASE_CHANGED',23505:'RELEASE_CHANGED'})[c]||'RELEASE_UNAVAILABLE',({PT400:400,PT403:403,PT404:404,PT409:409,23505:409})[c]||503);}
  return response.data;
 };
 const configured=()=>need(enabled,'RELEASE_SETUP_REQUIRED',503);
 const inspect=async jobId=>{id(jobId);const s=await rpc('read_release_review',{p_owner:ownerId,p_job:jobId});need(s,'NOT_FOUND',404);return inspectReleaseReview(s,ownerId);};
 return Object.freeze({
  async capability(){if(!enabled)return false;try{return await rpc('release_approval_version',{})===1;}catch{return false;}},
  async availability(){try{return await rpc('release_approval_version',{})===1;}catch{return false;}},
  async read(jobId){const {summary}=await inspect(jobId);return {publicationReview:{...summary,approvalAllowed:enabled&&summary.approvalAllowed,approvalPaused:!enabled}};},
  async approve(jobId,body){
   configured();fields(body,['reviewId','proposalHash','clientRequestId','confirmPublication']);id(body.reviewId);id(body.clientRequestId);
   need(sha(body.proposalHash)&&body.confirmPublication===true,'INVALID_REQUEST',400);
   const {summary,record:r,current}=await inspect(jobId);
   need(body.reviewId===r.id&&body.proposalHash===r.proposal_hash,'RELEASE_CHANGED',409);
   need(summary.current||summary.approval,'RELEASE_CHANGED',409);
   const saved=await rpc('approve_release_review',{p_owner:ownerId,p_review:r.id,p_client:body.clientRequestId,p_proposal:body.proposalHash});
   if(saved.effective){need(current);try{assertCatalogReleaseApproval({artifactText:r.artifact_text,proposalText:r.proposal_text,proposalHash:r.proposal_hash,approval:approvalFor(r,saved.approval),current});}catch{throw new StudioError('RELEASE_RECORD_INVALID',503);}}
   return {approval:receipt(saved.approval,saved.effective),published:false};
  },
  // Revocation remains available when new approvals are administratively paused.
  async revoke(approvalId,body){id(approvalId);fields(body,[]);const saved=await rpc('revoke_release_approval',{p_owner:ownerId,p_approval:approvalId});return {approval:receipt(saved.approval,false),published:false};},
 });
}
