// Server composition: authenticated teacher -> durable claim -> fixed workflow.
// This is not a Pages deployment client and never issues teacher approval.
import {StudioError,id,fields} from './domain.mjs';
import {publicationGitHubDispatchConfig,createGitHubPublicationDispatcher} from './github-dispatch.mjs';
import {createPublicationDispatchService} from '../../../automation/publish/dispatch-service.mjs';
const statuses={PUBLICATION_REQUEST_INVALID:400,PUBLICATION_FORBIDDEN:403,PUBLICATION_NOT_FOUND:404,PUBLICATION_CHANGED:409,PUBLICATION_DISABLED:503,PUBLICATION_BUSY:409,PUBLICATION_LIMIT:429,PUBLICATION_DISPATCH_UNAVAILABLE:503};
const convert=error=>new StudioError(Object.hasOwn(statuses,error?.message)?error.message:'PUBLICATION_DISPATCH_UNAVAILABLE',statuses[error?.message]||503);

export function createStudioPublicationDispatch({db,ownerId,env,transport=fetch}){
 id(ownerId);let dispatcher;
 try{dispatcher=createGitHubPublicationDispatcher(publicationGitHubDispatchConfig(env),{transport});}catch{/* No configuration means no external action. */}
 const core=createPublicationDispatchService({db,ownerId,enabled:Boolean(dispatcher),dispatcher});
 const rpc=async(name,args={})=>{
  let r;try{r=await db.rpc(name,args).abortSignal(AbortSignal.timeout(5000));}catch{throw new StudioError('PUBLICATION_DISPATCH_UNAVAILABLE',503);}
  if(r.error)throw new StudioError(({PT403:'PUBLICATION_FORBIDDEN',PT404:'PUBLICATION_NOT_FOUND'})[r.error.code]||'PUBLICATION_DISPATCH_UNAVAILABLE',({PT403:403,PT404:404})[r.error.code]||503);
  return r.data;
 };
 return Object.freeze({
  async capability(){if(!dispatcher)return false;try{return await rpc('publication_dispatch_version')===1&&await rpc('publication_dispatch_enabled')===true;}catch{return false;}},
  async read(approvalId){id(approvalId);return {dispatch:await rpc('read_publication_dispatch',{p_owner:ownerId,p_approval:approvalId}),published:false};},
  async start(approvalId,body){
   id(approvalId);fields(body,['clientRequestId']);if(Object.keys(body).length!==1)throw new StudioError('INVALID_REQUEST');id(body.clientRequestId);
   try{return await core.start({approvalId,requestId:body.clientRequestId});}catch(error){throw convert(error);}
  },
 });
}
