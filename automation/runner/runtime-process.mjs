// Local fixture bridge without credentials. Production uses runtime-container;
// the separate reporting job owns OIDC. This child has no reporting identity.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {browserEnvironment} from './runtime-browser.mjs';
import {prepareRuntimeBundle,RuntimeCheckError} from './runtime-contract.mjs';
import {assertRuntimeReport} from '../../packages/contracts/runtime-report.js';

export async function runRuntimeProcess(packet,{signal,environment=process.env}={}){
 const bundle=prepareRuntimeBundle(packet);
 if(signal?.aborted)throw new RuntimeCheckError('RUNTIME_CANCELLED');
 const body=JSON.stringify({inputText:packet.inputText,candidateText:packet.candidateText,expected:packet.expected});
 if(Buffer.byteLength(body)>2_300_000)throw new RuntimeCheckError('RUNTIME_PACKET_TOO_LARGE');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('./runtime-child.mjs',import.meta.url))],{env:browserEnvironment(environment),stdio:['pipe','pipe','pipe','ipc'],windowsHide:true});
  let output='',bytes=0,timedOut=false,killTimer;
  const cancel=()=>{if(child.connected)child.send('cancel',()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>{timedOut=true;cancel();killTimer=setTimeout(()=>child.kill(),5000);},55000);
  child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>64000){child.kill();return;}output+=chunk;});
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
  const cleanup=()=>{clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',cancel);};
  child.once('error',()=>{cleanup();reject(new RuntimeCheckError('RUNTIME_PROCESS_UNAVAILABLE'));});
  child.once('close',code=>{
   cleanup();
   try{
    if(timedOut||signal?.aborted||code!==0||bytes>64000)throw new RuntimeCheckError(timedOut?'RUNTIME_PROCESS_TIMEOUT':signal?.aborted?'RUNTIME_CANCELLED':'RUNTIME_PROCESS_FAILED');
    const result=assertRuntimeReport(JSON.parse(output),bundle.generationKind);
    if(['candidateHash','sourceSnapshotHash','baselineSha','attempt'].some(key=>result[key]!==bundle[key]))throw new RuntimeCheckError('RUNTIME_PROCESS_BINDING_FAILED');
    resolve(result);
   }catch(error){reject(error instanceof RuntimeCheckError?error:new RuntimeCheckError('RUNTIME_PROCESS_REPORT_INVALID'));}
  });
  child.stdin.end(body);
 });
}
