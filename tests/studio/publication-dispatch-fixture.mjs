import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {releaseFixture} from './release-approval-fixture.mjs';
import {prepareReleaseReview} from '../../automation/publish/prepare-review.mjs';
export async function publicationFixture(){
 const f=await releaseFixture();
 try{
  for(const file of ['studio_release_preparation_v1','studio_publication_dispatch_v1'])await f.admin(async()=>f.db.exec(await readFile('supabase/proposals/'+file+'.sql','utf8')));
  const sourceId=randomUUID();
  await f.admin(()=>f.db.query('insert into studio.source_reviews(id,job_id,owner_id,candidate_hash,source_hash,education_text,education_hash) values($1,$2,$3,$4,$5,$6,$7)',[sourceId,f.jobId,f.ownerId,f.row.candidate_hash,f.row.source_hash,f.row.education_text,f.row.education_hash]));
  const sourceReview=(await f.db.query('select to_jsonb(s) row from studio.source_reviews s where id=$1',[sourceId])).rows[0].row;
  const prepared=prepareReleaseReview({snapshot:await f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId}),sourceReview,
   baseline:{enabled:true,artifact_text:f.base.artifactText,artifact_hash:f.base.artifactHash,lock_hash:f.row.lock_hash,policy_version:f.row.policy_version},ownerId:f.ownerId,reviewId:randomUUID()});
  const issued=await f.admin(()=>f.rpc('issue_release_review',{p_owner:f.ownerId,p_job:f.jobId,p_client:randomUUID(),p_source_review:sourceId,p_record:prepared.record}));
  const {approval}=await f.release.approve(f.jobId,{...f.body(),reviewId:issued.id,proposalHash:issued.proposalHash});
  const enable=()=>f.admin(()=>f.db.exec("create or replace function studio.publication_dispatch_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;"));
  const request=(client=randomUUID())=>f.rpc('request_publication_dispatch',{p_owner:f.ownerId,p_approval:approval.id,p_client:client});
  const claim=(intent,claimId=randomUUID())=>f.rpc('claim_publication_dispatch',{p_owner:f.ownerId,p_intent:intent,p_claim:claimId});
  const nextApproval=async()=>{
   const next=await f.admin(()=>f.rpc('issue_release_review',{p_owner:f.ownerId,p_job:f.jobId,p_client:randomUUID(),p_source_review:sourceId,p_record:prepared.record}));
   return (await f.release.approve(f.jobId,{...f.body(),reviewId:next.id,proposalHash:next.proposalHash})).approval;
  };
  return {...f,approval,sourceId,enable,request,claim,nextApproval};
 }catch(error){await f.db.close();throw error;}
}
