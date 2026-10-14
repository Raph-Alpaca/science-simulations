import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {publicationAuthorityFixture} from './publication-authority-fixture.mjs';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
import {sealPublicationArtifact} from '../../automation/publish/artifact-transfer.mjs';
import {sealPublicationReport} from '../../automation/publish/report-transfer.mjs';
import {claimPublicationWorker} from '../../automation/publish/claim-worker.mjs';
import {createPublicationApiClient} from '../../automation/publish/artifact-client.mjs';
import {fileManifest} from '../../automation/catalog/content.mjs';
import {openArtifactBundle} from '../../automation/publish/artifact-bundle.mjs';

for(const mode of ['success','lost-response','revoked','failed-check'])test('public staging authority: '+mode,async()=>{
 const f=await publicationAuthorityFixture({passed:mode!=='failed-check'}),temp=await mkdtemp(path.resolve('.local/publication-authority-test-'));
 try{
  await f.enableDeploy();const row=(await f.db.query('select artifact_text from studio.release_reviews where id=$1',[f.context.binding.reviewId])).rows[0],packet={...f.context,artifactText:row.artifact_text},secret=randomBytes(32).toString('base64');
  const folder=path.join(temp,'studio-publication-'+f.intent.id),output=path.join(temp,'output');await mkdir(folder);await writeFile(output,'');
  await writeFile(path.join(folder,'artifact.sealed.json'),sealPublicationArtifact(packet.artifactText,packet.binding,secret,packet.inspection));
  await writeFile(path.join(folder,'report.sealed.json'),sealPublicationReport(f.report,packet,secret));
  const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:PUBLICATION_TRUST.repository,GITHUB_REPOSITORY_ID:PUBLICATION_TRUST.repositoryId,GITHUB_REPOSITORY_OWNER_ID:PUBLICATION_TRUST.ownerId,GITHUB_REF:PUBLICATION_TRUST.ref,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'12345',GITHUB_SHA:f.sha,STUDIO_PUBLICATION_ID:f.intent.id,STUDIO_ARTIFACT_HASH:f.intent.artifact_hash,STUDIO_TRANSFER_KEY:secret,RUNNER_TEMP:temp,GITHUB_OUTPUT:output};
  if(mode==='revoked')await f.rpc('revoke_release_approval',{p_owner:f.ownerId,p_approval:f.approval.id});
  let calls=0;const client=createPublicationApiClient({publicationId:f.intent.id,runId:12345,workflowSha:f.sha,purpose:'deploy',getToken:async()=>(await f.deployToken()).slice(7),transport:async(url,init)=>{calls++;const r=await f.handler(new Request(url,init),'claim');if(mode==='lost-response')throw Error('synthetic lost claim response');return r;}});
  if(mode==='success'){
   assert.deepEqual(await claimPublicationWorker({env,client}),{state:'claimed',published:false});
   assert.deepEqual(await fileManifest(path.join(folder,'site')),openArtifactBundle(packet.artifactText,packet.binding.artifactHash).manifest);
   assert.equal(await readFile(output,'utf8'),'artifact_path='+path.join(folder,'site')+'\n');
  }else{
   await assert.rejects(()=>claimPublicationWorker({env,client}),e=>e.message===({'lost-response':'PUBLICATION_HTTP_UNCERTAIN',revoked:'PUBLICATION_HTTP_REJECTED','failed-check':'PUBLICATION_CLAIM_REJECTED'})[mode]);
   await assert.rejects(stat(path.join(folder,'site')),e=>e.code==='ENOENT');assert.equal(await readFile(output,'utf8'),'');
  }
  if(mode!=='failed-check')await assert.rejects(()=>claimPublicationWorker({env,client}),e=>e.code==='EEXIST');
  assert.equal(calls,mode==='failed-check'?0:1);
  assert.equal((await f.db.query('select count(*)::int n from studio.publication_authorizations')).rows[0].n,['success','lost-response'].includes(mode)?1:0);
 }finally{await f.db.close();await rm(temp,{recursive:true,force:true});}
});
