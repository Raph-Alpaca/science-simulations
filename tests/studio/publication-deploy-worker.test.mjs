import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {publicationAuthorityFixture} from './publication-authority-fixture.mjs';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
import {sealPublicationArtifact} from '../../automation/publish/artifact-transfer.mjs';
import {sealPublicationReport} from '../../automation/publish/report-transfer.mjs';
import {claimPublicationWorker} from '../../automation/publish/claim-worker.mjs';
import {deployPublicationWorker} from '../../automation/publish/deploy-worker.mjs';
import {createPublicationApiClient} from '../../automation/publish/artifact-client.mjs';
import {createPagesDeploymentClient} from '../../automation/publish/pages-client.mjs';
import {verifyPublishedArtifact,PUBLIC_BASE_URL} from '../../automation/publish/verify-artifact.mjs';
import {openArtifactBundle} from '../../automation/publish/artifact-bundle.mjs';

for(const mode of ['verified','stale-public-bytes','lost-create-response','changed-stage'])test('claim to bounded Pages to public verification: '+mode,async()=>{
 const f=await publicationAuthorityFixture(),temp=await mkdtemp(path.resolve('.local/publication-deploy-test-'));
 try{
  await f.enableDeploy();const row=(await f.db.query('select artifact_text from studio.release_reviews where id=$1',[f.context.binding.reviewId])).rows[0],packet={...f.context,artifactText:row.artifact_text},secret=randomBytes(32).toString('base64');
  const bundle=openArtifactBundle(packet.artifactText,packet.binding.artifactHash),folder=path.join(temp,'studio-publication-'+f.intent.id),output=path.join(temp,'output');await mkdir(folder);await writeFile(output,'');
  await writeFile(path.join(folder,'artifact.sealed.json'),sealPublicationArtifact(packet.artifactText,packet.binding,secret,packet.inspection));await writeFile(path.join(folder,'report.sealed.json'),sealPublicationReport(f.report,packet,secret));
  const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:PUBLICATION_TRUST.repository,GITHUB_REPOSITORY_ID:PUBLICATION_TRUST.repositoryId,GITHUB_REPOSITORY_OWNER_ID:PUBLICATION_TRUST.ownerId,GITHUB_REF:PUBLICATION_TRUST.ref,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'12345',GITHUB_SHA:f.sha,STUDIO_PUBLICATION_ID:f.intent.id,STUDIO_ARTIFACT_HASH:f.intent.artifact_hash,STUDIO_TRANSFER_KEY:secret,RUNNER_TEMP:temp,GITHUB_OUTPUT:output,STUDIO_PAGES_ARTIFACT_ID:'4321'};
  const client=createPublicationApiClient({publicationId:f.intent.id,runId:12345,workflowSha:f.sha,purpose:'deploy',getToken:async()=>(await f.deployToken()).slice(7),transport:async(url,init)=>f.handler(new Request(url,init),'claim')});
  await claimPublicationWorker({env,client});let creates=0,publicRequests=0;
  const pages=createPagesDeploymentClient({runId:12345,workflowSha:f.sha,artifactId:4321,token:'synthetic-pages-token-never-real',getIdToken:async()=>'e30.e30.c2ln',pollMs:1,transport:async(url,init)=>{
   assert.ok(url.startsWith('https://api.github.com/repos/Raph-Alpaca/science-simulations/'));
   if(url.includes('/actions/artifacts/'))return Response.json({id:4321,name:'studio-pages-12345',expired:false,size_in_bytes:10240,workflow_run:{id:12345,head_sha:f.sha,repository_id:1368255570,head_repository_id:1368255570}});
   if(init.method==='POST'){creates++;if(mode==='lost-create-response')throw Error('synthetic lost create response');return Response.json({id:f.sha});}
   return Response.json({status:'succeed'});
  }});
  const verify=(artifact,options)=>verifyPublishedArtifact(artifact,{...options,fetchImpl:async(url,init)=>{
   publicRequests++;assert.equal(init.credentials,'omit');assert.equal(init.headers.authorization,undefined);assert.ok(url.startsWith(PUBLIC_BASE_URL));
   const name=url.slice(PUBLIC_BASE_URL.length)||'index.html',file=bundle.files.find(x=>x.path===name);assert.ok(file);
   const mime=name.endsWith('.html')?'text/html':name.endsWith('.json')?'application/json':name.endsWith('.css')?'text/css':'text/javascript';
   const r=new Response(mode==='stale-public-bytes'?'stale synthetic bytes':Buffer.from(file.bytesBase64,'base64'),{headers:{'content-type':mime}});Object.defineProperty(r,'url',{value:url});return r;
  }});
  if(mode==='changed-stage'){
   await writeFile(path.join(folder,'site','index.html'),'changed synthetic bytes');await assert.rejects(()=>deployPublicationWorker({env,pages,verify}),/PUBLICATION_DEPLOY_REJECTED/);assert.equal(creates,0);assert.equal(publicRequests,0);
  }else{
   assert.deepEqual(await deployPublicationWorker({env,pages,verify}),{state:mode==='verified'?'verified':'unconfirmed',published:false});
   const outcome=JSON.parse(await readFile(path.join(folder,'outcome.json'),'utf8'));
   assert.equal(outcome.deployment.createRequests,1);assert.equal(outcome.verification?.status??null,mode==='verified'?'pass':mode==='stale-public-bytes'?'fail':null);
   await assert.rejects(()=>deployPublicationWorker({env,pages,verify}),e=>e.code==='EEXIST');assert.equal(creates,1);
  }
  assert.equal((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n,0);
 }finally{await f.db.close();await rm(temp,{recursive:true,force:true});}
});
