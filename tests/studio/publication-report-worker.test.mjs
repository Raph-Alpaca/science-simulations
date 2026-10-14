import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {publicationReportFixture} from './publication-report-fixture.mjs';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
import {sealPublicationArtifact} from '../../automation/publish/artifact-transfer.mjs';
import {verifyPublicationWorker} from '../../automation/publish/verify-worker.mjs';
import {reportPublicationWorker} from '../../automation/publish/report-worker.mjs';
import {createPublicationApiClient} from '../../automation/publish/artifact-client.mjs';

for(const lost of [false,true])test(lost?'lost report response retains one DB result and blocks local resend':'encrypted verification -> reporter RSA -> HTTP -> immutable database report',async()=>{
 const f=await publicationReportFixture(),temp=await mkdtemp(path.resolve('.local/publication-report-test-'));
 try{
  const row=(await f.db.query('select artifact_text from studio.release_reviews where id=$1',[f.context.binding.reviewId])).rows[0],packet={...f.context,artifactText:row.artifact_text},secret=randomBytes(32).toString('base64');
  const folder=path.join(temp,'studio-publication-'+f.intent.id);await mkdir(folder);await writeFile(path.join(folder,'artifact.sealed.json'),sealPublicationArtifact(packet.artifactText,packet.binding,secret,packet.inspection));
  const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:PUBLICATION_TRUST.repository,GITHUB_REPOSITORY_ID:PUBLICATION_TRUST.repositoryId,GITHUB_REPOSITORY_OWNER_ID:PUBLICATION_TRUST.ownerId,GITHUB_REF:PUBLICATION_TRUST.ref,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'12345',GITHUB_SHA:f.sha,STUDIO_PUBLICATION_ID:f.intent.id,STUDIO_ARTIFACT_HASH:f.intent.artifact_hash,STUDIO_TRANSFER_KEY:secret,RUNNER_TEMP:temp,STUDIO_CHECKER_IMAGE:'sha256:'+'a'.repeat(64)};
  const verified=await verifyPublicationWorker({env,verify:async(received,options)=>{assert.deepEqual(received,packet);assert.equal(options.publication,true);return f.report;}});assert.equal(verified.passed,true);
  let calls=0;const client=createPublicationApiClient({publicationId:f.intent.id,runId:12345,workflowSha:f.sha,purpose:'report',getToken:async()=>(await f.reportToken()).slice(7),transport:async(url,init)=>{calls++;const response=await f.handler(new Request(url,init),'check-report');if(lost)throw Error('synthetic lost response');return response;}});
  if(lost)await assert.rejects(()=>reportPublicationWorker({env,client}),/PUBLICATION_HTTP_UNCERTAIN/);
  else assert.deepEqual(await reportPublicationWorker({env,client}),{state:'reported',passed:true,published:false});
  await assert.rejects(()=>reportPublicationWorker({env,client}),e=>e.code==='EEXIST');assert.equal(calls,1);
  assert.equal((await f.db.query('select count(*)::int n from studio.publication_checks')).rows[0].n,1);
  assert.equal((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n,0);
  await assert.rejects(()=>client.post('manifest'),/PUBLICATION_ACTION_REJECTED/);
  await assert.rejects(()=>client.post('check-report',{report:f.report}),/PUBLICATION_REQUEST_LIMIT/);
 }finally{await f.db.close();await rm(temp,{recursive:true,force:true});}
});
