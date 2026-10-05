import {randomUUID} from 'node:crypto';
import {StudioError,id,fields} from './domain.mjs';
import {createInputReviewService} from './input-review.mjs';
import {githubDispatchConfig,createGitHubDispatcher} from './github-dispatch.mjs';

export function createDispatchService({db,ownerId,env,transport=fetch}){
 id(ownerId);
 let dispatcher;
 try{dispatcher=createGitHubDispatcher(githubDispatchConfig(env),{transport});}catch{/* Disabled/incomplete configuration has no side effects. */}
 const rpc=async(name,args,signal)=>{
  let response;try{response=await db.rpc(name,args).abortSignal(AbortSignal.any([AbortSignal.timeout(5000),...(signal?[signal]:[])]));}catch{throw new StudioError('DISPATCH_UNAVAILABLE',503);}
  if(response.error){const code=response.error.code;throw new StudioError(({PT403:'TEACHER_NOT_ALLOWED',PT404:'NOT_FOUND',PT409:'DISPATCH_STATE_CONFLICT',PT412:'REAL_EXECUTION_UNAVAILABLE',PT423:'CONVERSATION_BUSY',PT429:'LIMIT_REACHED'})[code]||'DISPATCH_UNAVAILABLE',({PT403:403,PT404:404,PT409:409,PT412:503,PT423:409,PT429:429})[code]||503);}
  return response.data;
 };
 const configured=()=>{if(!dispatcher)throw new StudioError('RUNNER_CONNECTION_REQUIRED',503);};
 const input=createInputReviewService({db,ownerId,enabled:env.STUDIO_INPUT_REVIEW_ENABLED==='true'});
 return Object.freeze({
  async capability(signal=undefined){if(!dispatcher)return false;try{return await rpc('dispatch_version',{},signal)===1&&await rpc('dispatch_execution_enabled',{},signal)===true&&await rpc('worker_execution_enabled',{},signal)===true;}catch{return false;}},
  async read(jobId){id(jobId);return {dispatch:await rpc('read_dispatch_intent',{p_owner:ownerId,p_job:jobId})};},
  async start(reviewId,body){
   configured();id(reviewId);fields(body,['sourceHash']);if(Object.keys(body).length!==1||typeof body.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(body.sourceHash))throw new StudioError('INVALID_REQUEST');
   // Reject an inactive rollout before consuming the reviewed input/budget.
   const signal=AbortSignal.timeout(45000);
   if(!await this.capability(signal))throw new StudioError('REAL_EXECUTION_UNAVAILABLE',503);
   const {job}=await input.submit(reviewId,body.sourceHash),claimId=randomUUID();
   const claimed=await rpc('claim_dispatch_intent',{p_owner:ownerId,p_job:job.id,p_claim:claimId},signal);
   if(!claimed.claimed)return {jobId:job.id,dispatch:claimed.dispatch};
   const result=await dispatcher.dispatch(job.id,{signal});
   // A lost final DB acknowledgement leaves the durable claim in place. The
   // next click reads it; it does not send another GitHub dispatch.
   const dispatch=await rpc('finish_dispatch_intent',{p_owner:ownerId,p_job:job.id,p_claim:claimId,p_state:result.state,p_run:result.runId??null,p_sha:result.trustedSha??null,p_observed:result.observedRunId??null});
   return {jobId:job.id,dispatch};
  },
 });
}
