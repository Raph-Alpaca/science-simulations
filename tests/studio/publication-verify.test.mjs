import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {publicationRuntimeFixture} from './publication-runtime-fixture.mjs';
import {preparePublicationBundle} from '../../automation/publish/publication-packet.mjs';
import {sealPublicationArtifact} from '../../automation/publish/artifact-transfer.mjs';
import {sealPublicationReport,openPublicationReport} from '../../automation/publish/report-transfer.mjs';
import {verifyPublicationWorker} from '../../automation/publish/verify-worker.mjs';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
const secret=randomBytes(32).toString('base64');
function mockReport(packet,pass=true){const bundle=preparePublicationBundle(packet);return {version:'publication-runtime-v1',artifactHash:packet.binding.artifactHash,runtime:{...Object.fromEntries(['candidateHash','sourceSnapshotHash','baselineSha','attempt'].map(k=>[k,bundle.runtime[k]])),checks:{contract:'pass',runtime:pass?'pass':'fail'},checksExecuted:['contract','runtime'],issues:pass?[]:['RUNTIME_RESET_FAILED'],details:{contractVersion:'browser-v1',browserVersion:'154.0.0.0',browserStopped:true,durationMs:100,requests:20,observations:pass?[390,1440].map(width=>({width,controlChanged:true,outputChanged:true,viewChanged:true,resetRestored:true,initialViewHash:'a'.repeat(64),changedViewHash:'b'.repeat(64)})):[]}}};}

test('encrypted publication reports preserve pass/failure and reject different approval, key, type and tampering',async()=>{
 const packet=await publicationRuntimeFixture();for(const pass of [true,false]){
  const report=mockReport(packet,pass),sealed=sealPublicationReport(report,packet,secret);assert.deepEqual(openPublicationReport(sealed,packet.binding,secret).report,report);assert.ok(!sealed.includes('RUNTIME_RESET_FAILED'));
  assert.throws(()=>openPublicationReport(sealed,{...packet.binding,approvalId:randomUUID()},secret));assert.throws(()=>openPublicationReport(sealed,packet.binding,randomBytes(32).toString('base64')));
  const modified=JSON.parse(sealed);modified.inspection.generationKind='interactive_3d';assert.throws(()=>openPublicationReport(JSON.stringify(modified),packet.binding,secret));
  const artifact=sealPublicationArtifact(packet.artifactText,packet.binding,secret,packet.inspection);assert.throws(()=>openPublicationReport(artifact,packet.binding,secret));
  const privateError=structuredClone(report);privateError.runtime.checks.runtime='fail';privateError.runtime.issues=['private original text'];assert.throws(()=>sealPublicationReport(privateError,packet,secret));
 }
});

test('trusted verification wrapper sends only inert packet to container and stores ciphertext report once',async()=>{
 const packet=await publicationRuntimeFixture(),temp=await mkdtemp(path.resolve('.local/publication-verify-test-'));
 try{
  const folder=path.join(temp,'studio-publication-'+packet.binding.publicationId);await mkdir(folder);await writeFile(path.join(folder,'artifact.sealed.json'),sealPublicationArtifact(packet.artifactText,packet.binding,secret,packet.inspection));
  const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:PUBLICATION_TRUST.repository,GITHUB_REPOSITORY_ID:PUBLICATION_TRUST.repositoryId,GITHUB_REPOSITORY_OWNER_ID:PUBLICATION_TRUST.ownerId,GITHUB_REF:PUBLICATION_TRUST.ref,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'12345',GITHUB_SHA:packet.binding.workflowSha,STUDIO_PUBLICATION_ID:packet.binding.publicationId,STUDIO_ARTIFACT_HASH:packet.binding.artifactHash,STUDIO_TRANSFER_KEY:secret,RUNNER_TEMP:temp,STUDIO_CHECKER_IMAGE:'sha256:'+'a'.repeat(64)};
  for(const extra of [{OPENAI_API_KEY:'synthetic'},{ACTIONS_ID_TOKEN_REQUEST_TOKEN:'synthetic'},{ACTIONS_ID_TOKEN_REQUEST_URL:'synthetic'},{STUDIO_ARTIFACT_HASH:'f'.repeat(64)}])await assert.rejects(()=>verifyPublicationWorker({env:{...env,...extra},verify:()=>assert.fail('container must not start')}));
  let calls=0;const verify=async(received,options)=>{calls++;assert.deepEqual(received,packet);assert.equal(options.publication,true);assert.equal(options.image,env.STUDIO_CHECKER_IMAGE);assert.ok(!JSON.stringify(received).includes(secret));assert.ok(!Object.hasOwn(options,'env'));return mockReport(packet);};
  assert.deepEqual(await verifyPublicationWorker({env,verify}),{state:'checked',passed:true,published:false});assert.equal(calls,1);
  assert.deepEqual((await readdir(folder)).sort(),['artifact.sealed.json','report.sealed.json','verification.claim']);assert.deepEqual(openPublicationReport(await readFile(path.join(folder,'report.sealed.json'),'utf8'),packet.binding,secret).report,mockReport(packet));
  await assert.rejects(()=>verifyPublicationWorker({env,verify}),/PUBLICATION_REPORT_EXISTS/);assert.equal(calls,1);
 }finally{await rm(temp,{recursive:true,force:true});}
});
