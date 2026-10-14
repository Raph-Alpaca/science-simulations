// Trusted operator adapter. Never import into browser routes or generation jobs.
// No credentials are loaded here. The supplied DB connection must separately
// possess issuer authority; the application service role is denied by SQL.
import {randomUUID} from 'node:crypto';
import {prepareReleaseReview} from './prepare-review.mjs';
const need=(v,c)=>{if(!v)throw Error(c);};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);

export function createReleaseReviewIssuer({db}){
 const rpc=async(name,args)=>{
  let response;try{response=await db.rpc(name,args).abortSignal(AbortSignal.timeout(10000));}catch{throw Error('RELEASE_ISSUER_UNAVAILABLE');}
  if(response.error)throw Error(({42501:'RELEASE_ISSUER_FORBIDDEN',PT400:'RELEASE_ISSUER_INPUT_INVALID',PT403:'RELEASE_ISSUER_FORBIDDEN',PT404:'RELEASE_SOURCE_REVIEW_REQUIRED',PT409:'RELEASE_PREPARATION_CHANGED',PT429:'RELEASE_PREPARATION_LIMIT'})[response.error.code]||'RELEASE_ISSUER_UNAVAILABLE');
  return response.data;
 };
 return Object.freeze({async issue({ownerId,jobId,sourceReviewId,requestId,baselineArtifactText}){
  need([ownerId,jobId,sourceReviewId,requestId].every(uuid),'RELEASE_ISSUER_INPUT_INVALID');
  need(typeof baselineArtifactText==='string'&&Buffer.byteLength(baselineArtifactText)<=14100000,'RELEASE_ISSUER_INPUT_INVALID');
  const stored=await rpc('read_release_preparation',{p_owner:ownerId,p_job:jobId,p_source_review:sourceReviewId});
  need(stored?.result&&stored.sourceReview&&stored.baseline,'RELEASE_SOURCE_REVIEW_REQUIRED');
  const prepared=prepareReleaseReview({...stored,ownerId,reviewId:randomUUID(),snapshot:stored.result,baseline:{...stored.baseline,artifact_text:baselineArtifactText}});
  const result=await rpc('issue_release_review',{p_owner:ownerId,p_job:jobId,p_client:requestId,p_source_review:sourceReviewId,p_record:prepared.record});
  need(uuid(result?.id)&&/^[a-f0-9]{64}$/.test(result.proposalHash)&&typeof result.current==='boolean','RELEASE_ISSUER_UNAVAILABLE');
  return Object.freeze({reviewId:result.id,proposalHash:result.proposalHash,current:result.current,approved:false,published:false});
 }});
}
