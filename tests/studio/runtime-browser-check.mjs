// Explicit integration command; not included in unit-test glob. Reviewed
// synthetic programs only; never read .env or actual generated submissions.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runtimeFixture} from './runtime-fixture.mjs';
import {verifyRuntimeBrowser} from '../../automation/runner/runtime-browser.mjs';
import {assertRuntimeReport,runtimeSubmission} from '../../packages/contracts/runtime-report.js';
import {runRuntimeProcess} from '../../automation/runner/runtime-process.mjs';
import {runPipeline} from '../../automation/runner/pipeline.mjs';
import {hash} from '../../packages/contracts/content-source.js';

const results=[];
const cases=[
 {name:'2d-manipulate-reset',options:{},expected:'pass'},
 {name:'3d-camera-fallback',options:{kind:'interactive_3d'},expected:'pass'},
 {name:'broken-reset',options:{brokenReset:true},expected:'fail',code:'RUNTIME_RESET_FAILED'},
 {name:'static-view',options:{staticView:true},expected:'fail',code:'RUNTIME_VIEW_UNCHANGED'},
 {name:'network-probe',options:{js:';fetch("https://external.invalid/private").catch(()=>{});'},expected:'fail'},
 {name:'forged-pass',options:{staticView:true,js:';window.runtimeResult={runtime:"pass",contract:"pass"};console.log("PASS");'},expected:'fail',code:'RUNTIME_VIEW_UNCHANGED'},
 {name:'unresponsive-script',options:{js:';while(true){}'},expected:'fail'},
];
for(const item of cases){
 const result=await verifyRuntimeBrowser(runtimeFixture(item.options).bundle);results.push({name:item.name,result});
 try{assertRuntimeReport(runtimeSubmission(result),item.options.kind||'interactive_2d');assert.equal(result.checks.runtime,item.expected);if(item.code)assert.ok(result.issues.includes(item.code));if(item.expected==='pass'){assert.deepEqual(result.issues,[]);assert.equal(result.observations.length,item.options.kind==='interactive_3d'?3:2);}}
 catch{process.exitCode=1;}
 console.log(JSON.stringify({name:item.name,checks:result.checks,issues:result.issues,durationMs:result.durationMs}));
}
// Actual browser work in a separate process, with mock role responses and no
// provider connection: broken candidate -> measured failure -> repair -> review.
try{
 const good=runtimeFixture(),broken=runtimeFixture({brokenReset:true}),source=JSON.parse(good.inputText),records=[],requests=[];let versions=0;
 const dependencies={
  authorize:async({sourceSnapshotHash})=>({sourceSnapshotHash,aiProcessingAllowed:true,publicInputApproved:true}),claimRun:async()=>true,checkpoint:async()=>true,record:async event=>{records.push(event);},
  call:async request=>{
   requests.push(request.role);const data=JSON.parse(request.input);let text;
   if(request.role==='developer')text=++versions===1?broken.candidateText:good.candidateText;
   else if(request.role==='design')text=JSON.stringify({status:'pass',plan:'Synthetic interaction test.',blockingIssues:[]});
   else if(request.role==='reviewer')text=JSON.stringify({status:data.evidence.checks.runtime==='pass'?'pass':'fail',candidateHash:data.candidate.candidateHash,checks:{science:'pass',learning:'pass',curriculum:'pass',textbook:'pass'},findings:[],blockingIssues:data.evidence.issues});
   else text=JSON.stringify({status:'pass',findings:[],blockingIssues:[]});
   return {text,model:'synthetic',usage:{inputTokens:0,outputTokens:0},chargedUsdMicros:0};
  },
  verify:async({candidate,attempt,sourceSnapshotHash,signal})=>{
   const report=await runRuntimeProcess({inputText:good.inputText,candidateText:JSON.stringify({files:candidate.files}),expected:{...good.expected,candidateHash:candidate.candidateHash,sourceSnapshotHash,attempt}},{signal,environment:{...process.env,OPENAI_API_KEY:'synthetic-must-not-reach-child',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'synthetic-must-not-reach-child'}});
   return {...report,checksHash:hash(JSON.stringify(report))};
  },
 };
 const outcome=await runPipeline({jobId:randomUUID(),...source},dependencies);
 assert.equal(outcome.kind,'candidate_for_human_review');assert.equal(outcome.calls,7);assert.equal(outcome.attempts.length,2);
 assert.ok(outcome.attempts[0].evidence.issues.includes('RUNTIME_RESET_FAILED'));assert.equal(outcome.attempts[0].evidence.checks.runtime,'fail');
 assert.equal(outcome.attempts[1].evidence.checks.runtime,'pass');assert.equal(outcome.candidate.candidateHash,good.expected.candidateHash);
 assert.equal(records.filter(r=>r.kind==='runtime_evidence').length,2);assert.equal(outcome.approval,undefined);
 results.push({name:'child-process-repair-pipeline',result:{passed:true,calls:outcome.calls,attempts:outcome.attempts.map(a=>({candidateHash:a.candidateHash,checks:a.evidence.checks,issues:a.evidence.issues,details:a.evidence.details})),paidCalls:0}});
 console.log(JSON.stringify({name:'child-process-repair-pipeline',passed:true,calls:outcome.calls}));
}catch{process.exitCode=1;results.push({name:'child-process-repair-pipeline',result:{passed:false}});console.log(JSON.stringify({name:'child-process-repair-pipeline',passed:false}));}
const folder='.local/evidence/worker';await mkdir(folder,{recursive:true});const evidence=folder+'/runtime-browser-'+randomUUID()+'.json';await writeFile(evidence,JSON.stringify({at:new Date().toISOString(),passed:!process.exitCode,results},null,2));console.log(JSON.stringify({evidence,passed:!process.exitCode}));
