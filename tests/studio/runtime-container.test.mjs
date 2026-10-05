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

const image='sha256:'+'a'.repeat(64),id='b'.repeat(64),seccomp=await checkedSeccomp(),profile=JSON.parse(await readFile(seccomp,'utf8'));
const f=runtimeFixture(),packet={inputText:f.inputText,candidateText:f.candidateText,expected:f.expected};
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
 for(const change of [c=>{c.HostConfig.NetworkMode='host';},c=>{c.Mounts=[{Type:'bind',Source:'/',Destination:'/host'}];},c=>{c.Config.Env.push('STUDIO_TRANSFER_KEY=private');},c=>{c.Image='sha256:'+'c'.repeat(64);},c=>{c.HostConfig.Memory=0;},c=>{c.HostConfig.SecurityOpt=['seccomp=unconfined','no-new-privileges=true'];},c=>{c.Config.Entrypoint=['node','candidate.js'];}]){
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
test('fresh Docker context contains only trusted allowlisted files and no candidate or environment data',async()=>{
 const base=fileURLToPath(new URL('../../.local/container-context-tests/',import.meta.url));await mkdir(base,{recursive:true});
 const parent=await mkdtemp(path.join(base,'context-'));
 try{
  const folder=await createBuildContext(parent);const files=(await readdir(folder,{recursive:true,withFileTypes:true})).filter(e=>e.isFile()).map(e=>path.relative(folder,path.join(e.parentPath,e.name)).replaceAll('\\','/')).sort();
  assert.deepEqual(files,[...CONTAINER_FILES,'Dockerfile'].sort());assert.equal(files.some(f=>/\.env|\.local|content\/simulations/.test(f)),false);
  assert.ok((await readFile(path.join(folder,'Dockerfile'),'utf8')).includes('USER pwuser'));
  // Resolve the actual copied entrypoint/import graph, including workspace
  // contracts, so an omitted transitive file cannot hide behind the allowlist.
  await build({entryPoints:[path.join(folder,'automation/runner/runtime-child.mjs')],bundle:true,platform:'node',format:'esm',write:false,packages:'external',alias:{'@science/contracts':path.join(folder,'packages/contracts/index.js')},logLevel:'silent'});
 }finally{assert.equal(path.dirname(path.resolve(parent)),path.resolve(base));await rm(parent,{recursive:true,force:true});}
});
