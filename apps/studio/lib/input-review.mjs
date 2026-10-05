// Server-side preparation of immutable, independently reviewable source data.
// No URL is fetched, no conversation history is included, no model is called.
import {hash} from '../../../packages/contracts/content-source.js';
import {StudioError,id,fields,requestEnvelope} from './domain.mjs';
import budget from '../../../config/execution-budget.json' with {type:'json'};
import {CURRICULUM} from './dispatcher.mjs';

const need=(value,code='INPUT_REVIEW_INVALID',status=400)=>{if(!value)throw new StudioError(code,status);};
const exact=(value,names)=>{fields(value,names);need(Object.keys(value).length===names.length);};
const secret=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sb_secret_[A-Za-z0-9_-]{20,})\b|(?:^|[\s"'])\.local[\\/]|[A-Za-z]:\\Users\\/i;
function text(value,max){need(typeof value==='string'&&value.trim().length>0&&value.length<=max);need(!secret.test(value),'INPUT_CONTAINS_PRIVATE_DATA');return value.trim();}
function publicUrl(value){
 let url;try{url=new URL(text(value,1000));}catch{throw new StudioError('SOURCE_URL_INVALID');}
 need(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}$|^[a-z0-9-]+\.[a-z]{2,}$/.test(url.hostname)&&!/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname),'SOURCE_URL_INVALID');
 return url.href;
}
export const INPUT_CONSENT=Object.freeze({version:1,aiProcessingAllowed:true,publicInputAllowed:true,noPrivateData:true,budgetAccepted:true});
export const inputBudget=()=>({monthlyLimitKrw:budget.monthlyLimitKrw,monthlyJobLimit:budget.monthlyJobLimit,jobLimitKrw:budget.jobLimitKrw,maxRepairAttempts:budget.maxRepairAttempts});
export function prepareInputReview(body,ownerId){
 id(ownerId);exact(body,['conversationId','clientRequestId','topic','grade','unit','requirements','generationKind','sources']);
 id(body.conversationId);id(body.clientRequestId);need(budget.generationKinds.includes(body.generationKind));
 const request=requestEnvelope({schemaVersion:2,conversationId:body.conversationId.toLowerCase(),clientRequestId:body.clientRequestId.toLowerCase(),operation:'create_simulation',payload:{topic:text(body.topic,120),grade:body.grade,unit:text(body.unit,120),requirements:text(body.requirements,4000),targetContentId:null,expectedVersion:null}});
 need(Array.isArray(body.sources)&&body.sources.length<=6);
 const sources=body.sources.map((source,index)=>{
  exact(source,['kind','title','url','location','summary']);need(['curriculum','textbook','science'].includes(source.kind));
  return {id:'source-'+(index+1),kind:source.kind,title:text(source.title,150),url:publicUrl(source.url),location:text(source.location,160),summary:text(source.summary,900),
   summaryAuthorship:'teacher_supplied',verification:'not_independently_verified',visibility:'public_link'};
 });
 need(new Set(sources.map(s=>s.kind+'|'+s.url+'|'+s.location)).size===sources.length,'SOURCE_DUPLICATE');
 const contentId='sim-'+hash(ownerId.toLowerCase()+'\0'+body.clientRequestId.toLowerCase()).slice(0,28);
 const input={topic:request.payload.topic,generationKind:body.generationKind,requirements:[{id:'R1',text:request.payload.requirements}],
  evidenceNotice:'Teacher-written summaries and links only. The system has not fetched these sources or verified curriculum/textbook alignment. Missing evidence must remain unverified.'};
 const context={contentId,grade:request.payload.grade,unit:request.payload.unit,schoolYear:null,curriculumRevision:CURRICULUM.revision,curriculumSelection:CURRICULUM,
  config:{units:[{grade:request.payload.grade,label:request.payload.unit}]},sources};
 const inputText=JSON.stringify({input,context});need(Buffer.byteLength(inputText)<=50000,'INPUT_REVIEW_TOO_LARGE');
 return {conversationId:request.conversationId,clientRequestId:request.clientRequestId,request,inputText,sourceHash:hash(inputText),contentId};
}
export function reviewForBrowser(row){
 need(row&&typeof row.input_text==='string'&&hash(row.input_text)===row.source_hash,'INPUT_REVIEW_CORRUPT',503);
 const {input,context}=JSON.parse(row.input_text);
 return {id:row.id,conversationId:row.conversation_id,sourceHash:row.source_hash,state:row.state,expiresAt:row.expires_at,jobId:row.job_id,
  topic:input.topic,generationKind:input.generationKind,requirements:input.requirements.map(r=>r.text).join('\n\n'),requirementItems:input.requirements,revision:input.revision??null,grade:context.grade,unit:context.unit,contentId:context.contentId,sources:context.sources,curriculumRevision:context.curriculumRevision,
  budget:inputBudget(),unverified:['교육과정 원문 대조','교과서 원문 대조','과학·학습 설계·실제 동작'],
  missingSourceKinds:['curriculum','textbook','science'].filter(kind=>!context.sources.some(s=>s.kind===kind))};
}
export function createInputReviewService({db,ownerId,enabled=false}){
 id(ownerId);
 const rpc=async(name,args)=>{
  let response;try{response=await db.rpc(name,args).abortSignal(AbortSignal.timeout(10000));}catch{throw new StudioError('INPUT_REVIEW_UNAVAILABLE',503);}
  if(response.error){const c=response.error.code;throw new StudioError(({PT400:'INPUT_REVIEW_INVALID',PT403:'TEACHER_NOT_ALLOWED',PT404:'NOT_FOUND',PT409:'INPUT_REVIEW_CHANGED',PT410:'INPUT_REVIEW_EXPIRED',PT412:'REAL_EXECUTION_UNAVAILABLE',PT423:'CONVERSATION_BUSY',PT429:'INPUT_REVIEW_LIMIT',PGRST202:'INPUT_REVIEW_SETUP_REQUIRED'})[c]||'INPUT_REVIEW_UNAVAILABLE',({PT400:400,PT403:403,PT404:404,PT409:409,PT410:409,PT412:503,PT423:409,PT429:429})[c]||503);}
  return response.data;
 };
 const configured=()=>need(enabled,'INPUT_REVIEW_SETUP_REQUIRED',503);
 return Object.freeze({
  async capability(){if(!enabled)return false;try{return await rpc('input_review_version',{})===1;}catch{return false;}},
  async prepare(body){configured();const p=prepareInputReview(body,ownerId);const row=await rpc('prepare_worker_input',{p_owner:ownerId,p_conversation:p.conversationId,p_client:p.clientRequestId,p_request:p.request,p_input:p.inputText,p_hash:p.sourceHash,p_content:p.contentId});return {review:reviewForBrowser(row)};},
  async read(reviewId){configured();id(reviewId);return {review:reviewForBrowser(await rpc('read_worker_input',{p_owner:ownerId,p_review:reviewId}))};},
  async approve(reviewId,body){configured();id(reviewId);exact(body,['sourceHash','rightsConfirmed','budgetAccepted']);need(/^[a-f0-9]{64}$/.test(body.sourceHash)&&body.rightsConfirmed===true&&body.budgetAccepted===true,'INPUT_PERMISSION_REQUIRED');
   return {review:reviewForBrowser(await rpc('approve_worker_input',{p_owner:ownerId,p_review:reviewId,p_hash:body.sourceHash,p_consent:INPUT_CONSENT}))};},
  // Called by the trusted dispatch service only after its configuration passes.
  // Preparing/approving input never silently consumes a paid job reservation.
  async submit(reviewId,sourceHash){configured();id(reviewId);need(/^[a-f0-9]{64}$/.test(sourceHash));return {job:await rpc('submit_reviewed_worker_job',{p_owner:ownerId,p_review:reviewId,p_hash:sourceHash})};},
 });
}
