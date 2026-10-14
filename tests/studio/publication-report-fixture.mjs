import {readFile} from 'node:fs/promises';
import {publicationApiFixture} from './publication-api-fixture.mjs';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
export async function publicationReportFixture(){
 const f=await publicationApiFixture();try{
  await f.admin(async()=>f.db.exec(await readFile('supabase/proposals/studio_publication_report_v1.sql','utf8')));await f.enableApi();
  const context=await f.rpc('read_publication_report_context',{p_intent:f.intent.id,p_run:12345,p_attempt:1,p_sha:f.sha}),proposal=JSON.parse(context.inspection.proposalText);
  const report={version:'publication-runtime-v1',artifactHash:f.intent.artifact_hash,runtime:{...Object.fromEntries(['candidateHash','sourceSnapshotHash','baselineSha','attempt'].map(k=>[k,proposal[k]])),checks:{contract:'pass',runtime:'pass'},checksExecuted:['contract','runtime'],issues:[],details:{contractVersion:'browser-v1',browserVersion:'154.0.0.0',browserStopped:true,durationMs:100,requests:20,observations:[390,1440].map(width=>({width,controlChanged:true,outputChanged:true,viewChanged:true,resetRestored:true,initialViewHash:'a'.repeat(64),changedViewHash:'b'.repeat(64)}))}}};
  if(context.inspection.generationKind==='interactive_3d'){
   for(const observation of report.runtime.details.observations)Object.assign(observation,{webgl:{width:320,height:240,lost:false},cameraChanged:true,alternativeVisible:true});
   report.runtime.details.observations.push({width:390,webglUnavailable:true,alternativeVisible:true});
  }
  const reportToken=()=>f.sign({job_workflow_ref:PUBLICATION_TRUST.reportWorkflow});
  const send=async(value=report,options={})=>f.request('check-report',{report:value},{...options,headers:{authorization:await reportToken(),...options.headers}});
  return {...f,context,report,reportToken,send};
 }catch(error){await f.db.close();throw error;}
}
