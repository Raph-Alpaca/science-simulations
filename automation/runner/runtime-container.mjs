import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {prepareRuntimeBundle,RuntimeCheckError} from './runtime-contract.mjs';
import {assertRuntimeReport} from '../../packages/contracts/runtime-report.js';
import {checkedSeccomp} from './container/build-context.mjs';
import {startupPublicKey as checkStartupKey,assertStartupProbe} from './startup-diagnostic.mjs';

const need=(v,code)=>{if(!v)throw new RuntimeCheckError(code);};
const canonical=value=>JSON.stringify(value&&typeof value==='object'?(Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))]))):value);
const sameProfile=(value,profile)=>{try{return value.startsWith('seccomp=')&&canonical(JSON.parse(value.slice(8)))===canonical(profile);}catch{return false;}};
export const CONTAINER_LIMITS=Object.freeze({memory:2147483648,cpus:2,pids:128,tmp:536870912,shm:1073741824,seconds:65});
// Never inherit job tokens, Docker daemon overrides or proxy settings.
export function dockerEnvironment(env=process.env){
 const result={};for(const name of ['PATH','HOME','SystemRoot','WINDIR'])if(typeof env[name]==='string')result[name]=env[name];
 return result;
}
export function dockerCommand(args,{input,signal,timeout=10000,maxBytes=64000,environment=process.env}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{env:dockerEnvironment(environment),stdio:['pipe','pipe','pipe'],windowsHide:true});
  let output='',bytes=0,failed=false;
  const stop=()=>{failed=true;child.kill('SIGKILL');};const timer=setTimeout(stop,timeout);
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);};
  child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes)stop();else output+=chunk;});
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
  child.once('error',()=>{cleanup();reject(new RuntimeCheckError('CONTAINER_COMMAND_UNAVAILABLE'));});
  child.once('close',code=>{cleanup();if(failed||code!==0)reject(new RuntimeCheckError(signal?.aborted?'RUNTIME_CANCELLED':'CONTAINER_COMMAND_FAILED'));else resolve(output);});
  child.stdin.end(input);
 });
}
export function containerCreateArgs({name,image,seccomp,probe=false,startupProbe=false}){
 need(/^studio-verify-[a-f0-9-]{36}$/.test(name)&&/^sha256:[a-f0-9]{64}$/.test(image)&&path.isAbsolute(seccomp),'CONTAINER_CONFIGURATION');
 const args=['create','--name',name,'--platform','linux/amd64','--init','--interactive','--network','none','--read-only','--cap-drop','ALL',
  '--security-opt','no-new-privileges=true','--security-opt','seccomp='+seccomp,'--user','pwuser','--ipc','private',
  '--shm-size','1g','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=512m,mode=1777','--memory','2g','--memory-swap','2g','--cpus','2','--pids-limit','128',
  '--ulimit','nofile=1024:1024','--log-driver','none','--env','HOME=/tmp'];
 need(!(probe&&startupProbe),'CONTAINER_CONFIGURATION');
 if(probe||startupProbe)args.push('--entrypoint','node');args.push(image);
 if(probe||startupProbe)args.push('automation/runner/container/'+(probe?'isolation-probe.mjs':'startup-probe.mjs'));return args;
}
export function assertContainerConfiguration(value,{image,profile,probe=false,startupProbe=false}){
 need(Array.isArray(value)&&value.length===1,'CONTAINER_INSPECTION_FAILED');
 const c=value[0],h=c.HostConfig,env=c.Config?.Env||[],security=h?.SecurityOpt||[];
 need(c.Image===image&&c.Config?.User==='pwuser'&&c.Config?.WorkingDir==='/app'&&h?.ReadonlyRootfs&&h.NetworkMode==='none'&&h.IpcMode==='private'&&!h.Privileged&&h.Init===true,
  'CONTAINER_ISOLATION_REJECTED');
 need((h.CapDrop||[]).some(v=>v.toUpperCase()==='ALL')&&!(h.CapAdd||[]).length&&security.some(v=>v==='no-new-privileges=true'||v==='no-new-privileges')&&
  security.some(v=>sameProfile(v,profile))&&!(h.Binds||[]).length&&!(h.Mounts||[]).length&&
  (c.Mounts||[]).every(m=>m.Type==='tmpfs'&&m.Destination==='/tmp'),'CONTAINER_ISOLATION_REJECTED');
 need(h.Memory===CONTAINER_LIMITS.memory&&h.MemorySwap===CONTAINER_LIMITS.memory&&h.NanoCpus===2_000_000_000&&h.PidsLimit===128&&h.ShmSize===CONTAINER_LIMITS.shm&&
  JSON.stringify(h.Tmpfs)==='{"/tmp":"rw,noexec,nosuid,nodev,size=512m,mode=1777"}'&&h.LogConfig?.Type==='none','CONTAINER_RESOURCE_REJECTED');
 need(env.includes('HOME=/tmp')&&env.every(v=>!/(?:TOKEN|SECRET|KEY|GITHUB|ACTIONS|SUPABASE|OPENAI)/i.test(v.split('=')[0])),'CONTAINER_CREDENTIAL_REJECTED');
 const command=probe||startupProbe?['node','automation/runner/container/'+(probe?'isolation-probe.mjs':'startup-probe.mjs')]:['node','automation/runner/runtime-child.mjs','--container'];
 need(JSON.stringify([...(c.Config.Entrypoint||[]),...(c.Config.Cmd||[])])===JSON.stringify(command),'CONTAINER_ENTRYPOINT_REJECTED');
 return c.Id;
}
export async function runRuntimeContainer(packet,{image,signal,command=dockerCommand,seccomp,probe=false,startupPublicKey}={}){
 const startupProbe=startupPublicKey!==undefined;
 need(!(probe&&startupProbe)&&(!startupProbe||packet===null),'CONTAINER_CONFIGURATION');
 if(startupProbe)checkStartupKey(startupPublicKey);
 const bundle=probe||startupProbe?null:prepareRuntimeBundle(packet);seccomp??=await checkedSeccomp();
 const profile=JSON.parse(await readFile(seccomp,'utf8'));
 const name='studio-verify-'+randomUUID();let started=false,result,failure,stage='configuration',cleanup='not_needed';
 try{
  need(!signal?.aborted,'RUNTIME_CANCELLED');started=true;stage='create';cleanup='unconfirmed';
  const id=(await command(containerCreateArgs({name,image,seccomp,probe,startupProbe}),{signal})).trim();
  need(/^[a-f0-9]{64}$/.test(id),'CONTAINER_ID_INVALID');
  stage='inspect';const state=JSON.parse(await command(['inspect',id],{signal}));
  need(assertContainerConfiguration(state,{image,profile,probe,startupProbe})===id,'CONTAINER_ID_INVALID');
  stage='execute';const raw=await command(['start','--attach','--interactive',id],{input:probe?'':JSON.stringify(startupProbe?{publicKey:startupPublicKey}:packet),signal,timeout:CONTAINER_LIMITS.seconds*1000});
  stage='report';
  if(probe){result=JSON.parse(raw);need(JSON.stringify(result)==='{"isolated":true}','CONTAINER_ISOLATION_REJECTED');}
  else if(startupProbe){result=assertStartupProbe(JSON.parse(raw));if(result.sealed)need(result.sealed.keyId===checkStartupKey(startupPublicKey).keyId,'CONTAINER_REPORT_MISMATCH');}
  else{
   result=assertRuntimeReport(JSON.parse(raw),bundle.generationKind);
   need(['candidateHash','sourceSnapshotHash','baselineSha','attempt'].every(k=>result[k]===bundle[k]),'CONTAINER_REPORT_MISMATCH');
   need(result.details.browserStopped,'CONTAINER_BROWSER_NOT_STOPPED');
  }
 }catch(error){failure=error instanceof RuntimeCheckError?error:new RuntimeCheckError('CONTAINER_VERIFICATION_FAILED');}
 finally{
  // Cleanup is bounded and independent of an aborted candidate. Failure to
  // confirm removal invalidates even an otherwise passing browser report.
  if(started)try{await command(['rm','--force',name],{timeout:10000});cleanup='confirmed';}catch{stage='cleanup';failure=new RuntimeCheckError('CONTAINER_CLEANUP_UNCONFIRMED');}
 }
 if(failure){failure.containerStage=stage;failure.cleanup=cleanup;throw failure;}return result;
}
