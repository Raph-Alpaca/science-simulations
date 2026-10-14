import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,readFile,readdir,rm,link} from 'node:fs/promises';
import path from 'node:path';
import {encodeArtifactBundle,openArtifactBundle} from '../../automation/publish/artifact-bundle.mjs';
import {sealPublicationArtifact,openPublicationArtifact,PUBLICATION_TRANSFER_BYTES} from '../../automation/publish/artifact-transfer.mjs';
import {publicationRun,preparePublicationWorker} from '../../automation/publish/prepare-worker.mjs';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
import {publicationRuntimeFixture} from './publication-runtime-fixture.mjs';
const secret=randomBytes(32).toString('base64');
const fixture=await publicationRuntimeFixture({assetBytes:2*1024*1024}),inspection=fixture.inspection;
const artifact={artifactText:fixture.artifactText,artifactHash:fixture.binding.artifactHash};
const packet=openArtifactBundle(artifact.artifactText,artifact.artifactHash);
const binding=fixture.binding;
const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:PUBLICATION_TRUST.repository,GITHUB_REPOSITORY_ID:PUBLICATION_TRUST.repositoryId,GITHUB_REPOSITORY_OWNER_ID:PUBLICATION_TRUST.ownerId,GITHUB_REF:PUBLICATION_TRUST.ref,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:String(binding.runId),GITHUB_SHA:binding.workflowSha,STUDIO_PUBLICATION_ID:binding.publicationId,STUDIO_TRANSFER_KEY:secret};
const client=()=>({post:async(action,payload)=>action==='manifest'?{binding,manifest:packet.manifest,bytes:packet.bytes,inspection,published:false}:{binding,file:{...packet.files.find(f=>f.path===payload.path),hash:packet.manifest.find(f=>f.path===payload.path).hash},published:false}});

test('publication transfer preserves binary bytes with randomized, version-bound authenticated encryption',()=>{
 const first=sealPublicationArtifact(artifact.artifactText,binding,secret,inspection),second=sealPublicationArtifact(artifact.artifactText,binding,secret,inspection);
 assert.notEqual(first,second);assert.ok(Buffer.byteLength(first)<PUBLICATION_TRANSFER_BYTES);assert.ok(!first.includes('unpublished synthetic candidate'));
 const result=openPublicationArtifact(first,binding,secret);assert.equal(result.artifactText,artifact.artifactText);assert.equal(result.artifactHash,artifact.artifactHash);assert.deepEqual(result.binding,binding);
 for(const changed of [{...binding,runId:12346},{...binding,approvalId:randomUUID()},{...binding,workflowSha:'c'.repeat(40)},{...binding,proposalHash:'d'.repeat(64)},{...binding,artifactHash:'e'.repeat(64)}])assert.throws(()=>openPublicationArtifact(first,changed,secret),/PUBLICATION_TRANSFER_REJECTED/);
 assert.throws(()=>openPublicationArtifact(first,binding,randomBytes(32).toString('base64')),/PUBLICATION_TRANSFER_REJECTED/);
 for(const field of ['ciphertext','tag','nonce','salt']){const changed=JSON.parse(first),b=Buffer.from(changed[field],'base64');b[0]^=1;changed[field]=b.toString('base64');assert.throws(()=>openPublicationArtifact(JSON.stringify(changed),binding,secret),/PUBLICATION_TRANSFER_REJECTED/);}
 const extra=JSON.parse(first);extra.extra=true;assert.throws(()=>openPublicationArtifact(JSON.stringify(extra),binding,secret),/PUBLICATION_TRANSFER_REJECTED/);
 const altered=JSON.parse(first);altered.inspection.generationKind='interactive_3d';assert.throws(()=>openPublicationArtifact(JSON.stringify(altered),binding,secret),/PUBLICATION_TRANSFER_REJECTED/);
 assert.throws(()=>sealPublicationArtifact(artifact.artifactText,{...binding,artifactHash:'0'.repeat(64)},secret,inspection),/PUBLICATION_TRANSFER_REJECTED/);
});

test('prepare writes only sealed bytes in a fresh directory and hash metadata, refusing replacement',async()=>{
 const temp=await mkdtemp(path.resolve('.local/publication-prepare-test-'));
 try{
  const output=path.join(temp,'output');await writeFile(output,'');const variables={...env,RUNNER_TEMP:temp,GITHUB_OUTPUT:output};
  assert.deepEqual(await preparePublicationWorker({env:variables,client:client()}),{state:'prepared',published:false});
  const folder=path.join(temp,'studio-publication-'+binding.publicationId);assert.deepEqual(await readdir(folder),['artifact.sealed.json']);
  const sealed=await readFile(path.join(folder,'artifact.sealed.json'),'utf8');assert.equal(openPublicationArtifact(sealed,binding,secret).artifactText,artifact.artifactText);
  assert.equal(await readFile(output,'utf8'),'artifact_hash='+artifact.artifactHash+'\n');
  await assert.rejects(()=>preparePublicationWorker({env:variables,client:client()}),e=>e.code==='EEXIST');assert.equal(await readFile(path.join(folder,'artifact.sealed.json'),'utf8'),sealed);
 }finally{await rm(temp,{recursive:true,force:true});}
});

test('prepare rejects caller identity changes and linked output before artifact access',async()=>{
 for(const [key,value] of [['GITHUB_REPOSITORY','other/repo'],['GITHUB_REF','refs/heads/other'],['GITHUB_EVENT_NAME','pull_request'],['GITHUB_RUN_ATTEMPT','2'],['GITHUB_REPOSITORY_ID','1'],['GITHUB_REPOSITORY_OWNER_ID','1'],['GITHUB_SHA',''],['STUDIO_TRANSFER_KEY','x'],['STUDIO_PUBLICATION_ID','../../outside']])assert.throws(()=>publicationRun({...env,[key]:value}),/PUBLICATION_PREPARE_CONFIGURATION/);
 const temp=await mkdtemp(path.resolve('.local/publication-prepare-test-'));
 try{
  const output=path.join(temp,'output'),alias=path.join(temp,'alias');await writeFile(output,'');await link(output,alias);
  await assert.rejects(()=>preparePublicationWorker({env:{...env,RUNNER_TEMP:temp,GITHUB_OUTPUT:alias},client:{post:()=>assert.fail('must not read artifact')}}),/LINK_NOT_ALLOWED/);
  assert.equal(await readFile(output,'utf8'),'');
 }finally{await rm(temp,{recursive:true,force:true});}
});

test('revocation during download or mismatched run produces no transfer file',async()=>{
 for(const mode of ['revoked','run']){
  const temp=await mkdtemp(path.resolve('.local/publication-prepare-test-'));
  try{
   const output=path.join(temp,'output');await writeFile(output,'');const c=client(),post=c.post;c.post=async(action,payload)=>{if(mode==='revoked'&&action==='file')throw Error('PUBLICATION_REVOKED');const result=await post(action,payload);return mode==='run'?{...result,binding:{...binding,runId:12346}}:result;};
   await assert.rejects(()=>preparePublicationWorker({env:{...env,RUNNER_TEMP:temp,GITHUB_OUTPUT:output},client:c}),mode==='revoked'?/PUBLICATION_REVOKED/:/PUBLICATION_PREPARE_CONFIGURATION/);
   assert.deepEqual(await readdir(temp),['output']);assert.equal(await readFile(output,'utf8'),'');
  }finally{await rm(temp,{recursive:true,force:true});}
 }
});
