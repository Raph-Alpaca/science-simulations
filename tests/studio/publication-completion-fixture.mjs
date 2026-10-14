import {readFile} from 'node:fs/promises';
import {publicationAuthorityFixture} from './publication-authority-fixture.mjs';
import {PUBLIC_BASE_URL} from '../../automation/publish/verify-artifact.mjs';
export async function publicationCompletionFixture(){
 const f=await publicationAuthorityFixture();try{
  await f.admin(async()=>f.db.exec(await readFile('supabase/proposals/studio_publication_completion_v1.sql','utf8')));await f.enableDeploy();
  const response=await f.authorize();if(response.status!==200)throw Error('AUTHORITY_SEED_FAILED');const authority=await response.json();
  const context=await f.rpc('read_publication_completion_context',{p_intent:f.intent.id,p_run:12345,p_attempt:1,p_sha:f.sha}),at=new Date().toISOString();
  const outcome={version:'publication-outcome-v1',binding:context.binding,claimId:authority.claim.id,claimReportHash:f.reportHash,
   deployment:{version:'pages-deployment-v1',runId:12345,workflowSha:f.sha,artifactId:4321,deploymentId:f.sha,status:'succeeded',errorCode:null,createRequests:1,statusRequests:1},
   verification:{schemaVersion:1,scope:'published_file_bytes',status:'pass',failureCode:null,failedPath:null,artifactHash:f.intent.artifact_hash,publicUrl:PUBLIC_BASE_URL,filesVerified:context.manifest.length,requestCount:context.manifest.length+1,bytesRead:context.bytes+context.indexBytes,startedAt:at,finishedAt:at,runtime:'not_run'}};
  const complete=async(value=outcome,token)=>f.request('complete',{outcome:value},{headers:{authorization:token??await f.deployToken()}});
  return {...f,authority,completionContext:context,outcome,complete};
 }catch(error){await f.db.close();throw error;}
}
