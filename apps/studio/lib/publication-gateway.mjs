import {PublicationAuthError} from './publication-auth.mjs';
import {publicationNeed as need,publicationHash as hash,publicationUuid as uuid,publicationSha as sha,publicationPath as path,publicationExact as exact} from './publication-http.mjs';
import {inspectReleaseReview} from './release-approval.mjs';
import {openArtifactBundle} from '../../../automation/publish/artifact-bundle.mjs';
import {LIMITS} from '../../../packages/contracts/content-source.js';
import {publicationInspection,assertPublicationRuntimeSummary} from '../../../automation/publish/publication-packet.mjs';

export function createPublicationGateway(client){
 const db=client.schema('studio');
 const reportRpc=async(name,args)=>{
  let r;try{r=await db.rpc(name,args).abortSignal(AbortSignal.timeout(10000));}catch{throw new PublicationAuthError('PUBLICATION_DATABASE_UNCERTAIN',503);}
  if(r.error){const code=r.error.code;throw new PublicationAuthError(({PT400:'PUBLICATION_REQUEST_INVALID',PT403:'PUBLICATION_BINDING_REJECTED',PT409:'PUBLICATION_STATE_CONFLICT',PT412:'PUBLICATION_DISABLED',PT429:'PUBLICATION_LIMIT_REACHED'})[code]||'PUBLICATION_DATABASE_UNAVAILABLE',({PT400:400,PT403:403,PT409:409,PT412:503,PT429:429})[code]||503);}return r.data;
 };
 return Object.freeze({async read({identity,publicationId,action,bodyHash,path:filePath}){
  need(identity.purpose==='publication'&&identity.role==='prepare','PUBLICATION_ROLE_REJECTED',403);
  let r;try{r=await db.rpc('read_publication_artifact',{p_intent:publicationId,p_run:identity.runId,p_attempt:identity.runAttempt,p_sha:identity.workflowSha,p_jti_hash:identity.jtiHash,p_expires:identity.expiresAt,p_role:identity.role,p_action:action,p_body_hash:bodyHash,p_path:filePath}).abortSignal(AbortSignal.timeout(10000));}
  catch{throw new PublicationAuthError('PUBLICATION_DATABASE_UNCERTAIN',503);}
  if(r.error){const code=r.error.code;throw new PublicationAuthError(({PT400:'PUBLICATION_REQUEST_INVALID',PT403:'PUBLICATION_BINDING_REJECTED',PT404:'PUBLICATION_FILE_NOT_FOUND',PT409:'PUBLICATION_STATE_CONFLICT',PT412:'PUBLICATION_DISABLED',PT429:'PUBLICATION_LIMIT_REACHED'})[code]||'PUBLICATION_DATABASE_UNAVAILABLE',({PT400:400,PT403:403,PT404:404,PT409:409,PT412:503,PT429:429})[code]||503);}
  const packet=r.data,b=packet?.binding;
  exact(b,['publicationId','approvalId','reviewId','runId','runAttempt','workflowSha','proposalHash','artifactHash']);
  need(b.publicationId===publicationId&&b.runId===identity.runId&&b.runAttempt===1&&b.workflowSha===identity.workflowSha&&uuid(b.approvalId)&&uuid(b.reviewId)&&sha(b.proposalHash)&&sha(b.artifactHash),'PUBLICATION_BINDING_REJECTED',403);
  if(action==='manifest'){
   let checked,bundle;
   try{checked=inspectReleaseReview(packet.snapshot,packet.ownerId);bundle=openArtifactBundle(checked.record.artifact_text,b.artifactHash);}
   catch{throw new PublicationAuthError('PUBLICATION_ARTIFACT_INVALID',409);}
   need(checked.summary.current&&checked.summary.approval?.effective&&checked.summary.approval.id===b.approvalId&&checked.record.id===b.reviewId&&checked.record.proposal_hash===b.proposalHash,'PUBLICATION_APPROVAL_CHANGED',409);
   const inspection={proposalText:checked.record.proposal_text,generationKind:JSON.parse(packet.snapshot.result.worker.input_text).input.generationKind};
   publicationInspection(inspection,b);
   return {binding:b,manifest:bundle.manifest,bytes:bundle.bytes,inspection,published:false};
  }
  need(action==='file'&&path(filePath),'PUBLICATION_REQUEST_INVALID',400);
  const f=packet.file;exact(f,['path','bytesBase64']);need(f.path===filePath&&typeof f.bytesBase64==='string'&&f.bytesBase64.length<=Math.ceil(LIMITS.fileBytes/3)*4,'PUBLICATION_ARTIFACT_INVALID',409);
  const bytes=Buffer.from(f.bytesBase64,'base64');need(bytes.length<=LIMITS.fileBytes&&bytes.toString('base64')===f.bytesBase64,'PUBLICATION_ARTIFACT_INVALID',409);
  return {binding:b,file:{path:f.path,bytesBase64:f.bytesBase64,hash:hash(bytes)},published:false};
 },async report({identity,publicationId,bodyHash,report}){
  need(identity.purpose==='publication'&&identity.role==='report','PUBLICATION_ROLE_REJECTED',403);
  const run={p_intent:publicationId,p_run:identity.runId,p_attempt:identity.runAttempt,p_sha:identity.workflowSha};
  const context=await reportRpc('read_publication_report_context',run),b=context?.binding;
  exact(b,['publicationId','approvalId','reviewId','runId','runAttempt','workflowSha','proposalHash','artifactHash']);
  need(b.publicationId===publicationId&&b.runId===identity.runId&&b.runAttempt===1&&b.workflowSha===identity.workflowSha&&uuid(b.approvalId)&&uuid(b.reviewId)&&sha(b.proposalHash)&&sha(b.artifactHash),'PUBLICATION_BINDING_REJECTED',403);
  try{assertPublicationRuntimeSummary(report,context);}catch{throw new PublicationAuthError('PUBLICATION_REPORT_INVALID',409);}
  need(report.runtime.details.browserStopped,'PUBLICATION_REPORT_INVALID',409);
  const text=JSON.stringify(report),digest=hash(text);
  const receipt=await reportRpc('record_publication_check',{...run,p_jti_hash:identity.jtiHash,p_expires:identity.expiresAt,p_body_hash:bodyHash,p_report_text:text});
  exact(receipt,['publicationId','reportHash','passed','recordedAt','published']);
  need(receipt.publicationId===publicationId&&receipt.reportHash===digest&&receipt.passed===(report.runtime.checks.runtime==='pass')&&receipt.published===false&&typeof receipt.recordedAt==='string'&&Number.isFinite(Date.parse(receipt.recordedAt)),'PUBLICATION_REPORT_RECEIPT_INVALID',503);
  return {binding:b,reportHash:digest,passed:receipt.passed,recordedAt:receipt.recordedAt,published:false};
 }});
}
