import {prepareRuntimeBundle} from './runtime-contract.mjs';
import {RunnerError} from './bounded-responses.mjs';
import {sealTransfer,openTransfer} from './sealed-transfer.mjs';
import {assertRuntimeReport} from '../../packages/contracts/runtime-report.js';

const need=(value,code='VERIFICATION_PACKET_REJECTED')=>{if(!value)throw new RunnerError(code);};
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted){reject(new RunnerError('WORKER_CANCELLED'));return;}
 const cancel=()=>{clearTimeout(timer);reject(new RunnerError('WORKER_CANCELLED'));};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);signal?.addEventListener('abort',cancel,{once:true});
});
export async function waitForVerificationPacket({api,attempt,baselineSha,signal,pollWait=sleep}){
 need(Number.isInteger(attempt)&&attempt>=0&&attempt<=2&&/^[a-f0-9]{40}$/.test(baselineSha));
 const polls=attempt===0?90:45;
 for(let i=0;i<polls;i++){
  need(!signal?.aborted,'WORKER_CANCELLED');const result=await api.post('verification',{attempt},{signal});
  if(result?.state==='done'){need(Object.keys(result).length===1);return null;}
  if(result?.state==='ready'){
   need(Object.keys(result).sort().join(',')==='packet,state');const bundle=prepareRuntimeBundle(result.packet);
   need(bundle.baselineSha===baselineSha&&bundle.attempt===attempt);return result.packet;
  }
  need(result?.state==='pending'&&Object.keys(result).length===1);
  if(i+1<polls)await pollWait(5000,signal);
 }
 throw new RunnerError('VERIFICATION_PACKET_WAIT_LIMIT');
}
function identityFor(packet,run,purpose){
 const bundle=prepareRuntimeBundle(packet);need(run.baselineSha===bundle.baselineSha&&run.attempt===bundle.attempt);
 return {...run,purpose,candidateHash:bundle.candidateHash,sourceSnapshotHash:bundle.sourceSnapshotHash};
}
export function sealVerificationPacket(packet,run,secret){return sealTransfer(packet,identityFor(packet,run,'candidate'),secret);}
export function openVerificationPacket(text,expected,secret){
 need(expected.purpose==='candidate');const packet=openTransfer(text,expected,secret),bundle=prepareRuntimeBundle(packet);
 need(['candidateHash','sourceSnapshotHash','baselineSha','attempt'].every(key=>bundle[key]===expected[key]));return packet;
}
export function sealRuntimeReport(report,expected,secret){
 need(expected.purpose==='runtime-report');assertRuntimeReport(report);need(['candidateHash','sourceSnapshotHash','baselineSha','attempt'].every(key=>report[key]===expected[key]));return sealTransfer(report,expected,secret);
}
export function openRuntimeReport(text,expected,secret,generationKind){
 need(expected.purpose==='runtime-report');const report=assertRuntimeReport(openTransfer(text,expected,secret),generationKind);
 need(['candidateHash','sourceSnapshotHash','baselineSha','attempt'].every(key=>report[key]===expected[key]));return report;
}
