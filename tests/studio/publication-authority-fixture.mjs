import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {publicationReportFixture} from './publication-report-fixture.mjs';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
export async function publicationAuthorityFixture({passed=true,record=true}={}){
 const f=await publicationReportFixture();try{
  await f.admin(async()=>f.db.exec(await readFile('supabase/proposals/studio_publication_authority_v1.sql','utf8')));
  const report=structuredClone(f.report);if(!passed){report.runtime.checks.runtime='fail';report.runtime.issues=['RUNTIME_RESET_FAILED'];}
  if(record){const r=await f.send(report);if(r.status!==200)throw Error('REPORT_SEED_FAILED');}
  const reportHash=createHash('sha256').update(JSON.stringify(report)).digest('hex');
  const enableDeploy=()=>f.admin(()=>f.db.exec("create or replace function studio.publication_deploy_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;"));
  const deployToken=()=>f.sign({job_workflow_ref:PUBLICATION_TRUST.deployWorkflow,sub:PUBLICATION_TRUST.deploySubject,environment:'github-pages'});
  const authorize=async(payload={artifactHash:f.intent.artifact_hash,reportHash},token)=>f.request('claim',payload,{headers:{authorization:token??await deployToken()}});
  return {...f,report,reportHash,enableDeploy,deployToken,authorize};
 }catch(error){await f.db.close();throw error;}
}
