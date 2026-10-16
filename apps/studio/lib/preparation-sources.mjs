// Reads trusted authority only. It cannot create or revoke review records.
import {preparationSourceFingerprint,prepareSourceEvidence} from '../../../packages/contracts/preparation-evidence.js';
import {StudioError,id} from './domain.mjs';

export function createPreparationSourceReader({db,ownerId,enabled=false,now=()=>Date.now()}){
 id(ownerId);
 const rpc=async(name,args)=>{
  let result;try{result=await db.rpc(name,args).abortSignal(AbortSignal.timeout(5000));}catch{throw new StudioError('PREPARATION_SOURCES_UNAVAILABLE',503);}
  if(result.error)throw new StudioError(result.error.code==='PT403'?'TEACHER_NOT_ALLOWED':'PREPARATION_SOURCES_UNAVAILABLE',result.error.code==='PT403'?403:503);
  return result.data;
 };
 return Object.freeze({
  async capability(){if(!enabled)return false;try{return await rpc('preparation_sources_version',{})===1;}catch{return false;}},
  async admissionReady(){if(!enabled)return false;try{return await rpc('preparation_admission_version',{})===1;}catch{return false;}},
  async read({sources,reviewScope,curriculumRevision}){
   if(!enabled)throw new StudioError('PREPARATION_SOURCES_SETUP_REQUIRED',503);
   const scope={sources,ownerId,reviewScope,curriculumRevision};
   // Validate bounds before any database query. No browser-supplied authority.
   prepareSourceEvidence(scope,[],{now:now()});
   const records=await rpc('read_preparation_sources',{p_owner:ownerId,p_fingerprints:sources.map(preparationSourceFingerprint)});
   try{return prepareSourceEvidence(scope,records,{now:now()});}catch{throw new StudioError('PREPARATION_SOURCE_RECORD_INVALID',503);}
  }
 });
}
