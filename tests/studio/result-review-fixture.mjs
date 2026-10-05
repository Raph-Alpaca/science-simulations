import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setup,sha} from './worker-http-fixture.mjs';
import {parseCandidate} from '../../automation/runner/candidate.mjs';
import {parseRoleReport} from '../../automation/runner/pipeline.mjs';
import {hash} from '../../packages/contracts/content-source.js';
import {PRICING} from '../../automation/runner/bounded-responses.mjs';
import {createResultReviewService} from '../../apps/studio/lib/result-review.mjs';

// Signed HTTP + actual local SQL; model opinions and browser measurements are
// deliberately synthetic. No actual AI, source validation or browser execution.
export async function resultFixture({missing=false,repair=false,finish=true}={}){
 const f=await setup();
 try{
  await f.db.exec('reset role');await f.db.exec(await readFile('supabase/proposals/studio_result_review_v1.sql','utf8'));await f.db.exec('set role service_role');
  const service=createResultReviewService({db:f.client.schema('studio'),ownerId:f.ownerId,enabled:true});
  await f.post('claim');
  const output=async(role,value)=>{
   const callId=randomUUID(),text=JSON.stringify(value),requestHash=hash('synthetic:'+role+callId);
   await f.post('reserve',{callId,requestHash,role,maxUsdMicros:10000});await f.post('settle',{callId,chargedUsdMicros:1000,uncertain:false});
   await f.post('evidence',{event:{jobId:f.jobId,sourceSnapshotHash:f.sourceSnapshotHash,kind:'role_output',executionMode:'separate_context',role,callId,inputHash:hash('synthetic input'),outputHash:hash(text),output:text,model:PRICING.model,requestHash,usage:{inputTokens:100,outputTokens:100},chargedUsdMicros:1000}});
  };
  await output('curriculum',{status:missing?'needs_evidence':'pass',findings:['Synthetic curriculum review only.'],blockingIssues:missing?['원문 범위를 확인해야 합니다.']:[]});
  if(missing){if(finish)await f.post('finish',{kind:'needs_input',candidateHash:null,reason:'CURRICULUM_EVIDENCE_REQUIRED'});return {...f,service};}
  await output('subject',{status:'pass',findings:['Synthetic science review only.'],blockingIssues:[]});
  await output('design',{status:'pass',plan:'예측하고 크기를 조절한 뒤 결과를 설명하는 합성 계획입니다.',blockingIssues:[]});
  let candidate;
  for(let attempt=0;attempt<=(repair?1:0);attempt++){
   const failing=repair&&attempt===0;
   const files=[{path:'meta.json',content:JSON.stringify({...f.meta,title:'합성 결과 검토',assumptions:['검사 전용 모형이며 실제 교육과정 근거가 아닙니다.']})},
    {path:'index.html',content:'<!doctype html><h1>합성 결과 '+attempt+'</h1><script>globalThis.RESULT_CODE_EXECUTED=true;parent.postMessage("unsafe-preview","*")</script>'}];
   const value={files};await output('developer',value);candidate=parseCandidate(JSON.stringify(value),f.context);
   await f.post('evidence',{event:{jobId:f.jobId,sourceSnapshotHash:f.sourceSnapshotHash,kind:'candidate',attempt,candidateHash:candidate.candidateHash,manifest:candidate.manifest}});
   const report={candidateHash:candidate.candidateHash,sourceSnapshotHash:f.sourceSnapshotHash,baselineSha:sha,attempt,checks:{runtime:failing?'fail':'pass',contract:'pass'},checksExecuted:['contract','runtime'],issues:failing?['RESET_FAILED']:[],
    details:{contractVersion:'browser-v1',browserVersion:'150.0.0.0',browserStopped:true,durationMs:100,requests:12,observations:failing?[]:[...[390,1440].map(width=>({width,controlChanged:true,outputChanged:true,viewChanged:true,resetRestored:true,initialViewHash:'a'.repeat(64),changedViewHash:'b'.repeat(64),webgl:{width:320,height:240,lost:false},cameraChanged:true,alternativeVisible:true})),{width:390,webglUnavailable:true,alternativeVisible:true}]}};
   await f.post('runtime-report',report,{role:'report'});
   const review={status:failing?'fail':'pass',candidateHash:candidate.candidateHash,checks:{science:'pass',learning:failing?'fail':'pass',curriculum:'pass',textbook:'pass'},findings:['합성 독립 검토 <img src=x onerror="globalThis.RESULT_CODE_EXECUTED=true">'],blockingIssues:failing?['초기화 동작을 수정하세요.']:[]};
   await output('reviewer',review);
   await f.post('evidence',{event:{jobId:f.jobId,sourceSnapshotHash:f.sourceSnapshotHash,kind:'review',attempt,checksHash:hash(JSON.stringify(report)),review:parseRoleReport(JSON.stringify(review),'reviewer',candidate.candidateHash)}});
  }
  if(finish)await f.post('finish',{kind:'candidate_for_human_review',candidateHash:candidate.candidateHash,reason:null});
  return {...f,service,candidate};
 }catch(error){await f.db.close();throw error;}
}
