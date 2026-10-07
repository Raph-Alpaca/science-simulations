import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {runRuntimeContainer,dockerEnvironment} from '../../automation/runner/runtime-container.mjs';
import {checkedSeccomp,createBuildContext,CONTAINER_FILES} from '../../automation/runner/container/build-context.mjs';
import {runtimeFixture} from './runtime-fixture.mjs';
import {runtimeSubmission} from '../../packages/contracts/runtime-report.js';
import {generateKeyPairSync} from 'node:crypto';
import {sealStartupError} from '../../automation/runner/startup-diagnostic.mjs';
import {hash} from '../../packages/contracts/content-source.js';

const image='sha256:'+'a'.repeat(64),id='b'.repeat(64),seccomp=await checkedSeccomp(),profile=JSON.parse(await readFile(seccomp,'utf8'));
const f=runtimeFixture(),packet={inputText:f.inputText,candidateText:f.candidateText,expected:f.expected};
test('Chromium seccomp derivative changes only the chroot capability selector',async()=>{
 const upstreamBytes=await readFile(new URL('../../automation/runner/container/seccomp.json',import.meta.url));
 assert.equal(hash(upstreamBytes),'cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849');
 const upstream=JSON.parse(upstreamBytes),rules=upstream.syscalls.filter(rule=>rule.names.includes('chroot'));
 assert.equal(rules.length,1);assert.deepEqual(rules[0].names,['chroot']);
 assert.deepEqual(rules[0].includes,{caps:['CAP_SYS_CHROOT']});rules[0].includes={};
 assert.deepEqual(profile,upstream);assert.equal(profile.defaultAction,'SCMP_ACT_ERRNO');
});
const report=runtimeSubmission({...f.expected,contractVersion:'browser-v1',browserVersion:'154.0.0.0',browserStopped:true,durationMs:100,requests:8,checks:{contract:'pass',runtime:'pass'},checksExecuted:['contract','runtime'],issues:[],observations:[390,1440].map(width=>({width,controlChanged:true,outputChanged:true,viewChanged:true,resetRestored:true,initialViewHash:'a'.repeat(64),changedViewHash:'b'.repeat(64)}))});
function inspection(){return [{Id:id,Image:image,Mounts:[],Config:{User:'pwuser',WorkingDir:'/app',Env:['PATH=/usr/bin','HOME=/tmp'],Entrypoint:['node','automation/runner/runtime-child.mjs','--container'],Cmd:[]},HostConfig:{ReadonlyRootfs:true,NetworkMode:'none',IpcMode:'private',Privileged:false,Init:true,CapDrop:['ALL'],CapAdd:[],SecurityOpt:['no-new-privileges=true','seccomp='+JSON.stringify(profile)],Binds:[],Mounts:[],Memory:2147483648,MemorySwap:2147483648,NanoCpus:2_000_000_000,PidsLimit:128,ShmSize:1073741824,Tmpfs:{'/tmp':'rw,noexec,nosuid,nodev,size=512m,mode=1777'},LogConfig:{Type:'none'}}}];}
function mock({change=()=>{},start=()=>JSON.stringify(report),remove=()=>'',create=()=>id}={}){
 const calls=[];return {calls,command:async(args,options)=>{
  calls.push({args,options});
  if(args[0]==='create')return create();if(args[0]==='inspect'){const state=inspection();change(state[0]);return JSON.stringify(state);}
  if(args[0]==='start')return start(options);if(args[0]==='rm')return remove();throw Error('UNEXPECTED_DOCKER_ACTION');
 }};
}
test('candidate enters only stdin after inspected isolation; successful report requires confirmed removal',async()=>{
 const docker=mock();assert.deepEqual(await runRuntimeContainer(packet,{image,command:docker.command}),report);
 assert.deepEqual(docker.calls.map(c=>c.args[0]),['create','inspect','start','rm']);
 assert.equal(JSON.stringify(docker.calls.map(c=>c.args)).includes('검사용 도형'),false);
 const start=docker.calls[2];assert.deepEqual(JSON.parse(start.options.input),packet);assert.equal(start.options.timeout,65000);
 const remove=docker.calls[3];assert.match(remove.args[2],/^studio-verify-/);assert.equal(remove.options.signal,undefined);
 assert.deepEqual(dockerEnvironment({PATH:'trusted',HOME:'home',OPENAI_API_KEY:'private',STUDIO_TRANSFER_KEY:'private',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'private',NODE_OPTIONS:'injected',DOCKER_HOST:'remote',HTTPS_PROXY:'proxy'}),{PATH:'trusted',HOME:'home'});
});
test('network, mounts, credentials, changed image/profile or resource escape prevent candidate start and still clean up',async()=>{
 for(const change of [c=>{c.HostConfig.NetworkMode='host';},c=>{c.Mounts=[{Type:'bind',Source:'/',Destination:'/host'}];},c=>{c.Config.Env.push('STUDIO_TRANSFER_KEY=private');},c=>{c.Image='sha256:'+'c'.repeat(64);},c=>{c.HostConfig.Memory=0;},c=>{c.HostConfig.SecurityOpt=['seccomp=unconfined','no-new-privileges=true'];},c=>{c.Config.Entrypoint=['node','candidate.js'];},c=>{c.HostConfig.CapAdd=['SYS_CHROOT'];},c=>{c.HostConfig.CapDrop=[];},c=>{c.HostConfig.Privileged=true;},c=>{c.Config.User='root';},c=>{c.HostConfig.ReadonlyRootfs=false;}]){
  const docker=mock({change});await assert.rejects(runRuntimeContainer(packet,{image,command:docker.command}),/CONTAINER_/);
  assert.equal(docker.calls.some(c=>c.args[0]==='start'),false);assert.equal(docker.calls.at(-1).args[0],'rm');
 }
});
test('timeout, wrong candidate and cleanup failure never become a passing observation',async()=>{
 for(const options of [{start:()=>{throw Error('raw private output');}},{start:()=>JSON.stringify({...report,candidateHash:'c'.repeat(64)})},{remove:()=>{throw Error('daemon unavailable');}},{create:()=>{throw Error('ambiguous create');}}]){
  const docker=mock(options);await assert.rejects(runRuntimeContainer(packet,{image,command:docker.command}),e=>/^CONTAINER_/.test(e.code)&&!e.message.includes('private'));
  assert.equal(docker.calls.at(-1).args[0],'rm');
 }
 const controller=new AbortController();controller.abort();const docker=mock();
 await assert.rejects(runRuntimeContainer(packet,{image,command:docker.command,signal:controller.signal}),/RUNTIME_CANCELLED/);assert.equal(docker.calls.length,0);
});
test('failed container stages report whether cleanup succeeded without retaining raw errors',async()=>{
 for(const [options,stage,cleanup] of [
  [{create:()=>{throw Error('private create response');}},'create','confirmed'],
  [{change:c=>{c.HostConfig.NetworkMode='host';}},'inspect','confirmed'],
  [{start:()=>{throw Error('private runtime output');}},'execute','confirmed'],
  [{start:()=>'{private invalid JSON'},'report','confirmed'],
  [{remove:()=>{throw Error('private daemon response');}},'cleanup','unconfirmed'],
 ]){
  const docker=mock(options);
  await assert.rejects(runRuntimeContainer(packet,{image,command:docker.command}),error=>{
   assert.equal(error.containerStage,stage);assert.equal(error.cleanup,cleanup);
   assert.equal(JSON.stringify(error).includes('private'),false);return true;
  });
  assert.equal(docker.calls.at(-1).args[0],'rm');
 }
});
test('fresh Docker context contains only trusted allowlisted files and no candidate or environment data',async()=>{
 const base=fileURLToPath(new URL('../../.local/container-context-tests/',import.meta.url));await mkdir(base,{recursive:true});
 const parent=await mkdtemp(path.join(base,'context-'));
 try{
  const folder=await createBuildContext(parent);const files=(await readdir(folder,{recursive:true,withFileTypes:true})).filter(e=>e.isFile()).map(e=>path.relative(folder,path.join(e.parentPath,e.name)).replaceAll('\\','/')).sort();
  assert.deepEqual(files,[...CONTAINER_FILES,'Dockerfile'].sort());assert.equal(files.some(f=>/\.env|\.local|content\/simulations/.test(f)),false);
  assert.ok((await readFile(path.join(folder,'Dockerfile'),'utf8')).includes('USER pwuser'));
  // Resolve the actual copied entrypoint/import graph, including workspace
  // contracts, so an omitted transitive file cannot hide behind the allowlist.
  await build({entryPoints:['automation/runner/runtime-child.mjs','automation/runner/container/startup-probe.mjs'].map(file=>path.join(folder,file)),outdir:path.join(folder,'unused-output'),bundle:true,platform:'node',format:'esm',write:false,packages:'external',alias:{'@science/contracts':path.join(folder,'packages/contracts/index.js')},logLevel:'silent'});
 }finally{assert.equal(path.dirname(path.resolve(parent)),path.resolve(base));await rm(parent,{recursive:true,force:true});}
});

test('encrypted startup probe receives only its public key and keeps isolation and cleanup mandatory',async()=>{
 const key=generateKeyPairSync('rsa',{modulusLength:3072}).publicKey.export({type:'spki',format:'der'}).toString('base64');
 const diagnostic={mode:'startup-only',started:false,stopped:true,sealed:sealStartupError(Error('private'),key)};
 const change=c=>{c.Config.Entrypoint=['node'];c.Config.Cmd=['automation/runner/container/startup-probe.mjs'];};
 const docker=mock({change,start:()=>JSON.stringify(diagnostic)});
 assert.deepEqual(await runRuntimeContainer(null,{image,command:docker.command,startupPublicKey:key}),diagnostic);
 assert.deepEqual(JSON.parse(docker.calls[2].options.input),{publicKey:key});assert.equal(docker.calls.at(-1).args[0],'rm');
 const blocked=mock();await assert.rejects(runRuntimeContainer(packet,{image,command:blocked.command,startupPublicKey:key}),/CONTAINER_CONFIGURATION/);assert.equal(blocked.calls.length,0);
 const wrongEntrypoint=mock({start:()=>JSON.stringify(diagnostic)});await assert.rejects(runRuntimeContainer(null,{image,command:wrongEntrypoint.command,startupPublicKey:key}),/CONTAINER_ENTRYPOINT_REJECTED/);assert.equal(wrongEntrypoint.calls.some(c=>c.args[0]==='start'),false);
 const cleanupFailed=mock({change,start:()=>JSON.stringify(diagnostic),remove:()=>{throw Error('private');}});await assert.rejects(runRuntimeContainer(null,{image,command:cleanupFailed.command,startupPublicKey:key}),/CONTAINER_CLEANUP_UNCONFIRMED/);
});
