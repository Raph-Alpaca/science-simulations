// Trusted control-plane preparation, never a browser/model authority endpoint.
// Inputs must come from the authenticated DB snapshot, reviewed source ledger
// and pinned baseline store. This neither reads originals nor certifies them.
import {hash} from '../../packages/contracts/content-source.js';
import {prepareCatalogRelease} from './artifact-bundle.mjs';
import {inspectWorkerResult} from '../../apps/studio/lib/result-review.mjs';
import {inspectReleaseReview} from '../../apps/studio/lib/release-approval.mjs';

const need=(v,code)=>{if(!v)throw Error(code);};
export function prepareReleaseReview({snapshot,sourceReview,baseline,ownerId,reviewId,now=new Date().toISOString()}){
 const {result,candidate}=inspectWorkerResult(snapshot);
 need(candidate&&result.state==='awaiting_approval','RELEASE_RESULT_NOT_READY');
 need(!result.feedback.some(f=>f.decision==='request_changes'&&f.candidate_hash===candidate.candidateHash),'RELEASE_CHANGES_REQUESTED');
 need(sourceReview&&sourceReview.owner_id===ownerId&&sourceReview.job_id===result.jobId&&sourceReview.revoked_at===null&&
  sourceReview.candidate_hash===candidate.candidateHash&&sourceReview.source_hash===result.version.sourceHash&&
  Number.isFinite(Date.parse(sourceReview.created_at))&&Date.parse(sourceReview.created_at)<=Date.parse(now),'RELEASE_SOURCE_REVIEW_REQUIRED');
 need(baseline?.enabled===true&&typeof baseline.artifact_text==='string','RELEASE_BASELINE_REQUIRED');
 const version=snapshot.evidence.findLast(e=>e.kind==='candidate');
 const developer=snapshot.evidence.findLast(e=>e.sequence<version.sequence&&e.kind==='role_output'&&JSON.parse(e.body).role==='developer');
 const source=JSON.parse(snapshot.worker.input_text),last=result.attempts.at(-1);
 const prepared=prepareCatalogRelease({jobId:result.jobId,baseArtifactText:baseline.artifact_text,expectedBaseArtifactHash:baseline.artifact_hash,config:source.context.config,
  packet:{inputText:snapshot.worker.input_text,candidateText:JSON.parse(developer.body).output,expected:{sourceSnapshotHash:result.version.sourceHash,candidateHash:candidate.candidateHash,baselineSha:result.baselineSha,attempt:last.attempt}}});
 const record={id:reviewId,job_id:result.jobId,owner_id:ownerId,state_version:result.version.stateVersion,source_hash:result.version.sourceHash,candidate_hash:candidate.candidateHash,
  evidence_hash:result.version.evidenceHash,feedback_hash:hash(snapshot.feedback.map(f=>f.id).sort().join(',')),proposal_text:prepared.proposalText,proposal_hash:prepared.proposalHash,
  artifact_text:prepared.artifactText,artifact_hash:prepared.artifactHash,base_artifact_hash:baseline.artifact_hash,education_text:sourceReview.education_text,education_hash:sourceReview.education_hash,
  checks_hash:last.runtime?.checksHash,lock_hash:baseline.lock_hash,policy_version:baseline.policy_version,created_at:now};
 // Reuse the same full validation the teacher's read/approve service performs.
 inspectReleaseReview({review:record,result:snapshot,current:true,approval:null},ownerId);
 const {id,job_id,owner_id,education_text,education_hash,created_at,...command}=record;
 return Object.freeze({sourceReviewId:sourceReview.id,record:command});
}
