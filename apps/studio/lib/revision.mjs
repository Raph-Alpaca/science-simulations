import {hash} from '../../../packages/contracts/content-source.js';
import {inspectRevisionBase} from '../../../automation/runner/revision.mjs';
import {inspectWorkerResult} from './result-review.mjs';
import {reviewForBrowser,createInputReviewService} from './input-review.mjs';
import {createPreparationSourceReader} from './preparation-sources.mjs';
import {StudioError,id,fields,requestEnvelope} from './domain.mjs';

const need=(ok,code='REVISION_CHANGED',status=409)=>{if(!ok)throw new StudioError(code,status);};
export function prepareRevision(snapshot,lineage,body){
 fields(body,['feedbackId','clientRequestId','version']);id(body.feedbackId);id(body.clientRequestId);
 fields(body.version,['stateVersion','sourceHash','candidateHash','evidenceHash']);
 need(Object.keys(body).length===3&&Object.keys(body.version).length===4,'INVALID_REQUEST',400);
 const {result,candidate}=inspectWorkerResult(snapshot);
 need(candidate&&result.feedbackAllowed&&snapshot.worker.state==='finished'&&snapshot.budget.state==='closed');
 need(Object.keys(result.version).every(k=>body.version[k]===result.version[k]));
 need(lineage?.contentId===candidate.contentId&&typeof lineage.conversationId==='string');
 id(lineage.headJobId);id(lineage.conversationId);
 const feedback=result.feedback.find(f=>f.id===body.feedbackId);
 need(feedback?.decision==='request_changes'&&feedback.candidate_hash===result.version.candidateHash&&feedback.source_hash===result.version.sourceHash&&feedback.evidence_hash===result.version.evidenceHash&&feedback.state_version===result.version.stateVersion);
 const source=JSON.parse(snapshot.worker.input_text);
 need(Array.isArray(source.input.requirements)&&source.input.requirements.length<21,'REVISION_LIMIT',429);
 const last=snapshot.evidence.findLast(e=>e.kind==='candidate');
 const developer=snapshot.evidence.findLast(e=>e.sequence<last.sequence&&e.kind==='role_output'&&JSON.parse(e.body).role==='developer');
 const baseCandidateText=JSON.parse(developer.body).output;
 const reference={parentJobId:result.jobId,feedbackId:feedback.id,headJobId:lineage.headJobId,...result.version,candidateTextHash:hash(baseCandidateText)};
 const input={...source.input,requirements:[...source.input.requirements,{id:'revision-'+feedback.id,text:feedback.note}],revision:reference};
 try{inspectRevisionBase(input,source.context,baseCandidateText);}catch(error){throw new StudioError(error.message==='REVISION_CONTEXT_TOO_LARGE'?'REVISION_CONTEXT_TOO_LARGE':'REVISION_CHANGED',409);}
 const inputText=JSON.stringify({input,context:source.context});need(Buffer.byteLength(inputText)<=50000,'INPUT_REVIEW_TOO_LARGE',400);
 const request=requestEnvelope({schemaVersion:2,conversationId:lineage.conversationId,clientRequestId:body.clientRequestId,operation:'create_simulation',payload:{topic:input.topic||candidate.meta.title,grade:source.context.grade,unit:source.context.unit,requirements:feedback.note,targetContentId:candidate.contentId,expectedVersion:candidate.candidateHash}});
 return {inputText,sourceHash:hash(inputText),baseCandidateText,request,reference};
}

export function createRevisionService({db,ownerId,enabled=false,preparationEnabled=false}){
 id(ownerId);
 const preparation=createPreparationSourceReader({db,ownerId,enabled:preparationEnabled});
 const rpc=async(name,args)=>{
  let response;try{response=await db.rpc(name,args).abortSignal(AbortSignal.timeout(10000));}catch{throw new StudioError('REVISION_UNAVAILABLE',503);}
  if(response.error){const code=response.error.code;throw new StudioError(({PT400:'INVALID_REQUEST',PT403:'TEACHER_NOT_ALLOWED',PT404:'NOT_FOUND',PT409:'REVISION_CHANGED',PT422:'SOURCE_EVIDENCE_REQUIRED',PT423:'REVISION_BUSY',PT429:'REVISION_LIMIT'})[code]||'REVISION_UNAVAILABLE',({PT400:400,PT403:403,PT404:404,PT409:409,PT422:409,PT423:409,PT429:429})[code]||503);}
  return response.data;
 };
 return Object.freeze({
  async capability(){if(!enabled)return false;try{return await rpc('revision_version',{})===1&&(!preparationEnabled||await rpc('revision_preparation_version',{})===1&&await preparation.capability()&&await preparation.admissionReady());}catch{return false;}},
  async prepare(jobId,body){
   need(enabled,'REVISION_SETUP_REQUIRED',503);id(jobId);
   if(preparationEnabled)need(await this.capability(),'REVISION_SETUP_REQUIRED',503);
   fields(body,['feedbackId','clientRequestId','version']);id(body.feedbackId);id(body.clientRequestId);
   const snapshot=await rpc('read_worker_result',{p_owner:ownerId,p_job:jobId});need(snapshot,'NOT_FOUND',404);
   const lineage=await rpc('read_revision_context',{p_owner:ownerId,p_job:jobId,p_client:body.clientRequestId});
   let p=prepareRevision(snapshot,lineage,body);
   if(preparationEnabled){
    const source=JSON.parse(p.inputText);
    if(lineage.inputReviewId){
     // A lost response must replay the exact saved bytes, even if authority
     // has since changed. Refreshing requires a NEW client request and consent.
     const saved=await rpc('read_worker_input',{p_owner:ownerId,p_review:lineage.inputReviewId});
     const savedContext=JSON.parse(saved.input_text).context;
     if(Object.hasOwn(savedContext,'sourcePreparation'))source.context.sourcePreparation=savedContext.sourcePreparation;
     else delete source.context.sourcePreparation;
    }else{
     const evidence=await preparation.read({sources:source.context.sources,reviewScope:source.context.sourcePreparation?.reviewScope??'general_concepts',curriculumRevision:source.context.curriculumRevision});
     // Incomplete authority keeps the original draft and shows a hold. Only
     // a complete current packet may replace this one field in the lineage.
     if(evidence.state==='ready')source.context.sourcePreparation=evidence.packet;
    }
    const inputText=JSON.stringify(source);need(Buffer.byteLength(inputText)<=50000,'INPUT_REVIEW_TOO_LARGE',400);
    p={...p,inputText,sourceHash:hash(inputText)};
   }
   const row=await rpc('prepare_worker_revision',{p_owner:ownerId,p_parent:jobId,p_feedback:body.feedbackId,p_client:body.clientRequestId,p_head:p.reference.headJobId,p_request:p.request,p_input:p.inputText,p_hash:p.sourceHash,p_candidate:p.baseCandidateText});
   return preparationEnabled?createInputReviewService({db,ownerId,enabled:true,preparationEnabled:true}).read(row.id):{review:reviewForBrowser(row)};
  },
 });
}
