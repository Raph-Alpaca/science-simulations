import {runRuntimeContainer} from '../runtime-container.mjs';
import {runtimeFixture} from '../../../tests/studio/runtime-fixture.mjs';
import {runtimeDiagnostic} from '../runtime-diagnostics.mjs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Fixed vocabulary only: never publish Docker output, candidate text or an
// arbitrary error message, even when the diagnostic itself is malformed.
const codes=new Set(['CONTAINER_CONFIGURATION','CONTAINER_INSPECTION_FAILED','CONTAINER_ISOLATION_REJECTED','CONTAINER_RESOURCE_REJECTED','CONTAINER_CREDENTIAL_REJECTED','CONTAINER_ENTRYPOINT_REJECTED','CONTAINER_ID_INVALID','CONTAINER_REPORT_MISMATCH','CONTAINER_BROWSER_NOT_STOPPED','CONTAINER_VERIFICATION_FAILED','CONTAINER_CLEANUP_UNCONFIRMED','CONTAINER_COMMAND_UNAVAILABLE','CONTAINER_COMMAND_FAILED','CONTAINER_SECCOMP_CHANGED','CONTAINER_REHEARSAL_REPORT_INVALID','RUNTIME_CANCELLED']);
const stages=new Set(['configuration','create','inspect','execute','report','cleanup']);
const cleanupStates=new Set(['not_needed','confirmed','unconfirmed']);
export async function runRehearsal({image,run=runRuntimeContainer,log=console.log,error=console.error}){
 let stage='isolation',diagnostic;
 try{
 await run(null,{image,probe:true});
 log(JSON.stringify({name:'isolation',isolated:true,cleanup:'confirmed'}));
 for(const [name,options,expected] of [['2d',{},'pass'],['3d',{kind:'interactive_3d'},'pass'],['broken-reset',{brokenReset:true},'fail']]){
  stage=name;
  diagnostic=undefined;
  const f=runtimeFixture(options),packet={inputText:f.inputText,candidateText:f.candidateText,expected:f.expected};
  const report=await run(packet,{image});
  if(report.checks.contract!=='pass'||report.checks.runtime!==expected||report.details.browserStopped!==true||(expected==='fail'&&!report.issues.includes('RUNTIME_RESET_FAILED'))){
   diagnostic=runtimeDiagnostic(report);
   // runRuntimeContainer returns only after validated report and confirmed rm.
   throw Object.assign(Error('CONTAINER_REHEARSAL_REPORT_INVALID'),{containerStage:'report',cleanup:'confirmed'});
  }
  log(JSON.stringify({name,runtime:report.checks.runtime,browserStopped:report.details.browserStopped,cleanup:'confirmed'}));
 }
 log('CONTAINER_REHEARSAL_PASSED');return 0;
 }catch(cause){
  const code=codes.has(cause?.code)?cause.code:codes.has(cause?.message)?cause.message:'CONTAINER_REHEARSAL_FAILED';
  error(JSON.stringify({result:'CONTAINER_REHEARSAL_FAILED',stage,code,containerStage:stages.has(cause?.containerStage)?cause.containerStage:'unknown',cleanup:cleanupStates.has(cause?.cleanup)?cause.cleanup:'unknown',...(diagnostic?{runtimeReport:diagnostic}:{})}));
  return 1;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)process.exitCode=await runRehearsal({image:process.env.STUDIO_CHECKER_IMAGE});
