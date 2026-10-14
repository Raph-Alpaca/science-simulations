import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {publicationCompletionFixture} from './publication-completion-fixture.mjs';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
import {sealPublicationArtifact} from '../../automation/publish/artifact-transfer.mjs';
import {completePublicationWorker} from '../../automation/publish/complete-worker.mjs';
import {createPublicationApiClient} from '../../automation/publish/artifact-client.mjs';
for(const mode of ['verified','lost-response','uncertain'])test('completion reporter with RSA and SQL: '+mode,async()=>{
 const f=await publicationCompletionFixture(),temp=await mkdtemp(path.resolve('.local/publication-complete-test-'));
 try{
  const row=(await f.db.query('select artifact_text from studio.release_reviews where id=$1',[f.context.binding.reviewId])).rows[0],secret=randomBytes(32).toString('base64');
  const folder=path.join(temp,'studio-publication-'+f.intent.id);await mkdir(folder);await writeFile(path.join(folder,'artifact.sealed.json'),sealPublicationArtifact(row.artifact_text,f.context.binding,secret,f.context.inspection));await writeFile(path.join(folder,'authority.json'),JSON.stringify(f.authority));
  const outcome=structuredClone(f.outcome);if(mode==='uncertain'){Object.assign(outcome.deployment,{status:'uncertain',errorCode:'PAGES_TRANSPORT_UNCERTAIN',statusRequests:0,deploymentId:null});outcome.verification=null;}await writeFile(path.join(folder,'outcome.json'),JSON.stringify(outcome));
  const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:PUBLICATION_TRUST.repository,GITHUB_REPOSITORY_ID:PUBLICATION_TRUST.repositoryId,GITHUB_REPOSITORY_OWNER_ID:PUBLICATION_TRUST.ownerId,GITHUB_REF:PUBLICATION_TRUST.ref,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'12345',GITHUB_SHA:f.sha,STUDIO_PUBLICATION_ID:f.intent.id,STUDIO_ARTIFACT_HASH:f.intent.artifact_hash,STUDIO_TRANSFER_KEY:secret,RUNNER_TEMP:temp};
  let calls=0;const client=createPublicationApiClient({publicationId:f.intent.id,runId:12345,workflowSha:f.sha,purpose:'complete',getToken:async()=>(await f.deployToken()).slice(7),transport:async(url,init)=>{calls++;const r=await f.handler(new Request(url,init),'complete');if(mode==='lost-response')throw Error('synthetic response loss');return r;}});
  if(mode==='lost-response')await assert.rejects(()=>completePublicationWorker({env,client}),/PUBLICATION_HTTP_UNCERTAIN/);
  else assert.deepEqual(await completePublicationWorker({env,client}),{state:mode==='verified'?'published':'unconfirmed',published:mode==='verified'});
  await assert.rejects(()=>completePublicationWorker({env,client}),e=>e.code==='EEXIST');assert.equal(calls,1);
  assert.equal((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n,mode==='uncertain'?0:1);
 }finally{await f.db.close();await rm(temp,{recursive:true,force:true});}
});
