import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicationRuntimeFixture} from './publication-runtime-fixture.mjs';
import {preparePublicationBundle,assertPublicationRuntimeReport} from '../../automation/publish/publication-packet.mjs';
import {encodeArtifactBundle} from '../../automation/publish/artifact-bundle.mjs';
import {hash} from '../../packages/contracts/content-source.js';
import {runRuntimeContainer,containerCreateArgs,CONTAINER_LIMITS} from '../../automation/runner/runtime-container.mjs';
import {readFile} from 'node:fs/promises';
import {checkedSeccomp} from '../../automation/runner/container/build-context.mjs';

test('inspection binds exact approved target bytes, metadata, catalog entry and source version',async()=>{
 const packet=await publicationRuntimeFixture(),bundle=preparePublicationBundle(packet);
 assert.equal(bundle.entryPath,'/science-simulations/simulations/runtime-shapes/index.html');assert.equal(bundle.runtime.generationKind,'interactive_2d');
 assert.equal(bundle.runtime.candidateHash,JSON.parse(packet.inspection.proposalText).candidateHash);
 for(const field of ['candidateHash','artifactHash','entry','contentId']){const p=JSON.parse(packet.inspection.proposalText);p[field]=field.endsWith('Hash')?'e'.repeat(64):'changed';const proposalText=JSON.stringify(p);assert.throws(()=>preparePublicationBundle({...packet,inspection:{...packet.inspection,proposalText},binding:{...packet.binding,proposalHash:hash(proposalText)}}));}
 const changed=JSON.parse(packet.artifactText);changed.files.find(f=>f.path.endsWith('/ui.js')).bytesBase64=Buffer.from('changed').toString('base64');const artifact=encodeArtifactBundle(changed.files),p=JSON.parse(packet.inspection.proposalText);p.artifactHash=artifact.artifactHash;
 const proposalText=JSON.stringify(p);assert.throws(()=>preparePublicationBundle({artifactText:artifact.artifactText,binding:{...packet.binding,artifactHash:artifact.artifactHash,proposalHash:hash(proposalText)},inspection:{...packet.inspection,proposalText}}));
 assert.throws(()=>preparePublicationBundle({...packet,inspection:{...packet.inspection,generationKind:'executable'}}));
});

test('publication container uses only validated stdin and unchanged isolation, rejects wrong reports and cleanup failures',async()=>{
 const packet=await publicationRuntimeFixture(),bundle=preparePublicationBundle(packet),image='sha256:'+'a'.repeat(64),id='b'.repeat(64),seccomp=await checkedSeccomp(),profile=JSON.parse(await readFile(seccomp,'utf8'));
 const runtime={...Object.fromEntries(['candidateHash','sourceSnapshotHash','baselineSha','attempt'].map(k=>[k,bundle.runtime[k]])),checks:{runtime:'fail',contract:'pass'},checksExecuted:['contract','runtime'],issues:['RUNTIME_RESET_FAILED'],details:{contractVersion:'browser-v1',browserVersion:'154.0.0.0',browserStopped:true,durationMs:100,requests:10,observations:[]}};
 const report={version:'publication-runtime-v1',artifactHash:packet.binding.artifactHash,runtime};assertPublicationRuntimeReport(report,packet);
 for(const mode of ['valid','wrong-hash','credential','cleanup']){
  const calls=[];const command=async(args,options)=>{calls.push(args[0]);if(args[0]==='create'){assert.ok(args.includes('--publication-container'));assert.ok(!args.join(' ').includes(packet.artifactText));return id;}
   if(args[0]==='inspect')return JSON.stringify([{Id:id,Image:image,Mounts:[],Config:{User:'pwuser',WorkingDir:'/app',Env:['HOME=/tmp',...(mode==='credential'?['OPENAI_API_KEY=synthetic']:[])],Entrypoint:['node'],Cmd:['automation/runner/runtime-child.mjs','--publication-container']},HostConfig:{ReadonlyRootfs:true,NetworkMode:'none',IpcMode:'private',Privileged:false,Init:true,CapDrop:['ALL'],CapAdd:[],SecurityOpt:['no-new-privileges=true','seccomp='+JSON.stringify(profile)],Binds:[],Mounts:[],Memory:CONTAINER_LIMITS.memory,MemorySwap:CONTAINER_LIMITS.memory,NanoCpus:2_000_000_000,PidsLimit:128,ShmSize:CONTAINER_LIMITS.shm,Tmpfs:{'/tmp':'rw,noexec,nosuid,nodev,size=512m,mode=1777'},LogConfig:{Type:'none'}}}]);
   if(args[0]==='start'){assert.deepEqual(JSON.parse(options.input),packet);assert.equal(options.timeout,65000);assert.equal(options.maxBytes,64000);return JSON.stringify(mode==='wrong-hash'?{...report,artifactHash:'f'.repeat(64)}:report);}
   if(args[0]==='rm'){if(mode==='cleanup')throw Error('private daemon error');return '';}
  };
  if(mode==='valid')assert.deepEqual(await runRuntimeContainer(packet,{image,command,publication:true}),report);else await assert.rejects(()=>runRuntimeContainer(packet,{image,command,publication:true}),/CONTAINER_/);
  assert.equal(calls.at(-1),'rm');if(mode==='credential')assert.ok(!calls.includes('start'));
 }
 assert.throws(()=>containerCreateArgs({name:'studio-verify-'+packet.binding.publicationId,image,seccomp,publication:true,probe:true}),/CONTAINER_CONFIGURATION/);
});
