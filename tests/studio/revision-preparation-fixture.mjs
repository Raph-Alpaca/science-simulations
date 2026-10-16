import {readFile} from 'node:fs/promises';
import {revisionFixture} from './revision-fixture.mjs';
import {preparationFixture,insertPreparation} from './preparation-fixture.mjs';
import {prepareSourceEvidence} from '../../packages/contracts/preparation-evidence.js';
import {createRevisionService} from '../../apps/studio/lib/revision.mjs';
import {createInputReviewService} from '../../apps/studio/lib/input-review.mjs';

export async function revisionPreparationFixture({seed=true,expiredParent=false,install=true}={}){
 const evidence=preparationFixture();
 const oldTime=Date.now()-3*86400000,old=preparationFixture(evidence.scope.ownerId,oldTime);
 const sourcePreparation=expiredParent?prepareSourceEvidence(old.scope,old.records,{now:oldTime}).packet:null;
 const metadata={...JSON.parse(await readFile('content/simulations/mendel-inheritance/meta.json','utf8')),curriculumRevision:'2022',sourceIds:evidence.scope.sources.map(s=>s.id)};
 const f=await revisionFixture({metadata,sources:evidence.scope.sources,sourcePreparation});
 try{
  evidence.scope.ownerId=f.ownerId;evidence.records=evidence.records.map(r=>({...r,ownerId:f.ownerId}));
  await f.db.exec('reset role');
  for(const name of ['studio_preparation_sources_v1','studio_preparation_admission_v1',...(install?['studio_revision_preparation_v1']:[])])await f.db.exec(await readFile('supabase/proposals/'+name+'.sql','utf8'));
  const seedRecords=async()=>{await f.db.exec('reset role');for(let i=0;i<3;i++)await insertPreparation(f.db,evidence.scope.sources[i],evidence.records[i]);await f.db.exec('set role service_role');};
  if(seed)await seedRecords();await f.db.exec('set role service_role');
  const db=f.client.schema('studio'),revision=createRevisionService({db,ownerId:f.ownerId,enabled:true,preparationEnabled:true}),inputs=createInputReviewService({db,ownerId:f.ownerId,enabled:true,preparationEnabled:true});
  const approve=review=>inputs.approve(review.id,{sourceHash:review.sourceHash,rightsConfirmed:true,budgetAccepted:true});
  const submit=review=>inputs.submit(review.id,review.sourceHash);
  return {...f,...evidence,revision,inputs,approve,submit,seedRecords};
 }catch(error){await f.db.close();throw error;}
}
