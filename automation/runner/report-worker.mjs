// Trusted host wrapper: ciphertext files only; no source or report body in logs.
import {readFile,lstat,mkdir,writeFile,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {RunnerError} from './bounded-responses.mjs';
import {WORKER_TRUST} from '../../apps/studio/lib/worker-auth.mjs';
import {createGitHubTokenProvider,createWorkerApiClient} from './worker-client.mjs';
import {waitForVerificationPacket,sealVerificationPacket,openVerificationPacket,sealRuntimeReport,openRuntimeReport} from './verification-packet.mjs';
import {runRuntimeContainer} from './runtime-container.mjs';
import {prepareRuntimeBundle} from './runtime-contract.mjs';
import {hash} from '../../packages/contracts/content-source.js';

const need=v=>{if(!v)throw new RunnerError('REPORT_WORKER_CONFIGURATION');};
export function reportIdentity(env){
 need(env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY===WORKER_TRUST.repository&&env.GITHUB_REF===WORKER_TRUST.ref&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_RUN_ATTEMPT==='1');
 need(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(env.STUDIO_JOB_ID)&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA)&&/^[1-9][0-9]{0,15}$/.test(env.GITHUB_RUN_ID)&&Number.isSafeInteger(Number(env.GITHUB_RUN_ID))&&/^[012]$/.test(env.STUDIO_ATTEMPT));
 const secret=env.STUDIO_TRANSFER_KEY;need(typeof secret==='string'&&Buffer.from(secret,'base64').length===32&&Buffer.from(secret,'base64').toString('base64')===secret);
 return {jobId:env.STUDIO_JOB_ID,runId:Number(env.GITHUB_RUN_ID),runAttempt:1,baselineSha:env.GITHUB_SHA,attempt:Number(env.STUDIO_ATTEMPT)};
}
export function transferBinding(text,run,purpose){
 need(typeof text==='string'&&Buffer.byteLength(text)<=3_100_000);let binding;try{binding=JSON.parse(text).binding;}catch{throw new RunnerError('SEALED_TRANSFER_REJECTED');}
 need(binding&&Object.entries({...run,purpose}).every(([k,v])=>binding[k]===v));
 // Untrusted hashes are authenticated by open* before any report can be used.
 return {...run,purpose,candidateHash:binding.candidateHash,sourceSnapshotHash:binding.sourceSnapshotHash};
}
export async function reportWorker(mode,{env=process.env,api,verify=runRuntimeContainer,signal}={}){
 need(['fetch','verify','report'].includes(mode));const run=reportIdentity(env),secret=env.STUDIO_TRANSFER_KEY;
 need(path.isAbsolute(env.RUNNER_TEMP||''));const folder=path.join(env.RUNNER_TEMP,'studio-packet-'+run.attempt);
 const file=name=>path.join(folder,name+'.sealed.json');
 const read=async name=>{const p=file(name),s=await lstat(p);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=3_100_000);return readFile(p,'utf8');};
 const write=async(name,value)=>{await mkdir(folder,{recursive:true,mode:0o700});await writeFile(file(name),value,{flag:'wx',mode:0o600});};
 if(mode!=='verify')api??=createWorkerApiClient({jobId:run.jobId,getToken:createGitHubTokenProvider(env)});
 if(mode==='fetch'){
  need(path.isAbsolute(env.GITHUB_OUTPUT||''));
  const packet=await waitForVerificationPacket({api,attempt:run.attempt,baselineSha:run.baselineSha,signal});
  if(!packet){await appendFile(env.GITHUB_OUTPUT,'ready=false\n');return {state:'done'};}
  await write('candidate',sealVerificationPacket(packet,run,secret));await appendFile(env.GITHUB_OUTPUT,'ready=true\n');return {state:'ready'};
 }
 if(mode==='verify'){
  need(!env.OPENAI_API_KEY&&!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN&&!env.ACTIONS_ID_TOKEN_REQUEST_URL);
  const text=await read('candidate'),binding=transferBinding(text,run,'candidate');
  const packet=openVerificationPacket(text,binding,secret);
  const report=await verify(packet,{image:env.STUDIO_CHECKER_IMAGE,signal});
  await write('report',sealRuntimeReport(report,{...binding,purpose:'runtime-report'},secret));return {state:'verified'};
 }
 const text=await read('report'),binding=transferBinding(text,run,'runtime-report');
 const current=await api.post('verification',{attempt:run.attempt},{signal});
 if(current?.state==='done')return {state:'done'};
 need(current?.state==='ready');const bundle=prepareRuntimeBundle(current.packet);
 need(['candidateHash','sourceSnapshotHash','baselineSha','attempt'].every(k=>binding[k]===bundle[k]));
 const report=openRuntimeReport(text,binding,secret,bundle.generationKind);
 const receipt=await api.post('runtime-report',report,{signal});
 const evidence={candidateHash:report.candidateHash,sourceSnapshotHash:report.sourceSnapshotHash,baselineSha:report.baselineSha,checksHash:hash(JSON.stringify(report)),checks:report.checks,checksExecuted:report.checksExecuted,issues:report.issues,details:report.details};
 const event={jobId:run.jobId,sourceSnapshotHash:report.sourceSnapshotHash,kind:'runtime_evidence',attempt:run.attempt,evidence};
 need(receipt?.bodyHash===hash(JSON.stringify(event))&&Number.isInteger(receipt.sequence)&&receipt.sequence>=1&&receipt.sequence<=40);
 return {state:'reported'};
}
