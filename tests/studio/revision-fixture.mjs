import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resultFixture} from './result-review-fixture.mjs';
import {createInputReviewService} from '../../apps/studio/lib/input-review.mjs';
import {createRevisionService} from '../../apps/studio/lib/revision.mjs';

export async function revisionFixture(){
 const f=await resultFixture();
 try{
  await f.db.exec('reset role');
  for(const name of ['studio_runner_v1','studio_input_review_v1','studio_dispatch_v1','studio_revision_v1'])await f.db.exec(await readFile('supabase/proposals/'+name+'.sql','utf8'));
  await f.db.exec('set role service_role');
  const db=f.client.schema('studio'),revision=createRevisionService({db,ownerId:f.ownerId,enabled:true}),inputs=createInputReviewService({db,ownerId:f.ownerId,enabled:true});
  const {result}=await f.service.read(f.jobId);
  const feedback=async(note='초기화 설명을 더 분명하게 해 주세요.')=>(await f.service.feedback(f.jobId,{version:result.version,decision:'request_changes',note,clientRequestId:randomUUID()})).feedback;
  const body=async()=>({version:result.version,feedbackId:(await feedback()).id,clientRequestId:randomUUID()});
  const approve=review=>inputs.approve(review.id,{sourceHash:review.sourceHash,rightsConfirmed:true,budgetAccepted:true});
  const submit=review=>inputs.submit(review.id,review.sourceHash);
  return {...f,revision,inputs,result,feedback,body,approve,submit};
 }catch(error){await f.db.close();throw error;}
}
