// Original pure adapter contract retained for mock/backward-compatible tests.
// Production dispatch is implemented separately in github-dispatch.mjs and
// dispatch-service.mjs; only the fixed target below is shared with that path.
import {StudioError,id} from './domain.mjs';
export const TARGET=Object.freeze({repository:'Raph-Alpaca/science-simulations',ref:'main',workflow:'studio-worker.yml'});
export const CURRICULUM=Object.freeze({revision:'2022',verification:'unverified',sourceRefs:[]});
export function githubRequest(jobId,config){
 id(jobId);
 if(typeof config?.appClientId!=='string'||!config.appClientId||!/^\d+$/.test(config?.installationId||'')||!/^\d+$/.test(config?.repositoryId||''))throw new StudioError('RUNNER_CONNECTION_REQUIRED',503);
 if(config.repository!==TARGET.repository||config.ref!==TARGET.ref||config.workflow!==TARGET.workflow)throw new StudioError('RUNNER_TARGET_REJECTED',403);
 return {url:'https://api.github.com/repos/'+TARGET.repository+'/actions/workflows/'+TARGET.workflow+'/dispatches',method:'POST',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'},body:JSON.stringify({ref:TARGET.ref,inputs:{mode:'generate',job_id:jobId}})};
}
export class GitHubActionsAdapter {
 constructor(config,transport){this.config=config;this.transport=transport;}
 async dispatch(job){
  if(job.execution_mode!=='real')throw new StudioError('MODE_MISMATCH',409);
  const request=githubRequest(job.id,this.config);
  if(!this.transport)throw new StudioError('RUNNER_CONNECTION_REQUIRED',503);
  // Transport must mint its own short-lived installation token; never return credentials.
  let result;
  try{result=await this.transport(request,{signal:AbortSignal.timeout(10000)});}catch{throw new StudioError('DISPATCH_UNCERTAIN',503);}
  if(result.status===401||result.status===403)throw new StudioError('RUNNER_PERMISSION_DENIED',403);
  if(result.status===429)throw new StudioError('RUNNER_RATE_LIMITED',429);
  if(result.status!==200 || !Number.isSafeInteger(result.body?.workflow_run_id) || result.body.workflow_run_id<1)throw new StudioError('DISPATCH_UNCERTAIN',503);
  return {state:'submitted',runId:String(result.body.workflow_run_id)}; // Not execution success; reconcile/claim still required.
 }
}
export class MockAdapter {
 async dispatch(job){if(job.execution_mode!=='mock')throw new StudioError('MODE_MISMATCH',409);return {state:'mock',runId:'mock:'+id(job.id)};}
}
// Store must atomically claim a unique job intent, including persistent concurrency/day limits.
// An uncertain response is never automatically retried. Production store/claim API is not connected.
export class Dispatcher {
 constructor(store,adapter){this.store=store;this.adapter=adapter;}
 async dispatch(job){
  if(!await this.store.claim(job.id))throw new StudioError('DISPATCH_ALREADY_CLAIMED',409);
  try{const result=await this.adapter.dispatch(job);await this.store.finish(job.id,result);return result;}
  catch(error){await this.store.finish(job.id,{state:'blocked',code:error instanceof StudioError?error.code:'DISPATCH_UNCERTAIN'});throw error instanceof StudioError?error:new StudioError('DISPATCH_UNCERTAIN',503);}
 }
}
// Strictly allowlisted independent input, no conversation title/messages, schoolYear or credentials.
// Requirements remain PRIVATE: this output must not be sent to public Actions without source review.
export function independentSpecification(snapshot){
 const p=snapshot.payload;
 return {topic:p.topic,grade:p.grade,unit:p.unit,requirements:p.requirements,targetContentId:p.targetContentId,expectedVersion:p.expectedVersion,curriculum:snapshot.schemaVersion===2?CURRICULUM:{revision:null,verification:'unverified',sourceRefs:[]}};
}
