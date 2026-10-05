import {runRuntimeContainer} from '../runtime-container.mjs';
import {runtimeFixture} from '../../../tests/studio/runtime-fixture.mjs';
try{
 const image=process.env.STUDIO_CHECKER_IMAGE;
 await runRuntimeContainer(null,{image,probe:true});
 for(const [name,options,expected] of [['2d',{},'pass'],['3d',{kind:'interactive_3d'},'pass'],['broken-reset',{brokenReset:true},'fail']]){
  const f=runtimeFixture(options),packet={inputText:f.inputText,candidateText:f.candidateText,expected:f.expected};
  const report=await runRuntimeContainer(packet,{image});
  if(report.checks.contract!=='pass'||report.checks.runtime!==expected||(expected==='fail'&&!report.issues.includes('RUNTIME_RESET_FAILED')))throw Error();
  console.log(JSON.stringify({name,runtime:report.checks.runtime,browserStopped:report.details.browserStopped}));
 }
 console.log('CONTAINER_REHEARSAL_PASSED');
}catch{console.error('CONTAINER_REHEARSAL_FAILED');process.exitCode=1;}
