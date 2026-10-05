import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {runPipeline} from '../../automation/runner/pipeline.mjs';
import {parseCandidate} from '../../automation/runner/candidate.mjs';
import {hash} from '../../packages/contracts/content-source.js';

const meta=JSON.parse(readFileSync('content/simulations/mendel-inheritance/meta.json','utf8'));
const context={contentId:meta.id,grade:3,unit:meta.unit,schoolYear:null,curriculumRevision:null,
 config:JSON.parse(readFileSync('config/catalog.json','utf8')),sources:meta.sourceIds.map(id=>({id}))};
// These are synthetic model and runtime results, not a review of real content.
function fixture({failures=0,runtime='pass',curriculum='pass',reviewChange={},overrides={}}={}){
 const requests=[],records=[];let generation=0,claims=0;
 const dependencies={
  async authorize({sourceSnapshotHash}){return {sourceSnapshotHash,aiProcessingAllowed:true,publicInputApproved:true};},
  async claimRun(){claims++;return claims===1;},
  async checkpoint(){return true;},
  async record(event){records.push(structuredClone(event));},
  async call(request){
   requests.push(request);const data=JSON.parse(request.input);let value;
   if(request.role==='developer'){
    generation++;value={files:[{path:'index.html',content:'<!doctype html><canvas></canvas><!-- fixture '+generation+' -->'},
     {path:'meta.json',content:JSON.stringify(meta)}]};
   }else if(request.role==='design')value={status:'pass',plan:'Synthetic design and WebGL fallback.',blockingIssues:[]};
   else if(request.role==='reviewer'){
    const pass=generation>failures;
    value={status:pass?'pass':'fail',candidateHash:data.candidate.candidateHash,
     checks:{science:pass?'pass':'fail',learning:'pass',curriculum:'pass',textbook:'pass'},
     findings:[],blockingIssues:pass?[]:['Synthetic calculation issue.'],...reviewChange};
   }else value={status:request.role==='curriculum'?curriculum:'pass',findings:[],blockingIssues:[]};
   return {text:JSON.stringify(value),model:'synthetic',usage:{inputTokens:0,outputTokens:0},chargedUsdMicros:0};
  },
  async verify({candidate,sourceSnapshotHash}){return {candidateHash:candidate.candidateHash,sourceSnapshotHash,checksHash:'a'.repeat(64),checks:{runtime,contract:'pass'},issues:[]};},
  ...overrides,
 };
 const args={jobId:randomUUID(),input:{generationKind:'interactive_3d',requirements:[{id:'R1',text:'Synthetic public task.'}]},context};
 return {requests,records,dependencies,args,run:()=>runPipeline(args,dependencies)};
}

test('a follow-up revision reviews fresh evidence and supplies the exact original source to developer and reviewer',async()=>{
 const f=fixture(),feedbackId=randomUUID();
 const baseCandidateText=JSON.stringify({files:[{path:'index.html',content:'<!doctype html><h1>Previous source</h1>'},{path:'meta.json',content:JSON.stringify(meta)}]});
 const candidate=parseCandidate(baseCandidateText,context);
 f.args.input.revision={parentJobId:randomUUID(),feedbackId,headJobId:randomUUID(),stateVersion:1,sourceHash:'a'.repeat(64),candidateHash:candidate.candidateHash,evidenceHash:'b'.repeat(64),candidateTextHash:hash(baseCandidateText)};
 f.args.input.requirements.push({id:'revision-'+feedbackId,text:'Explain the reset control more clearly.'});f.args.baseCandidateText=baseCandidateText;
 const result=await f.run();assert.equal(result.calls,5);assert.equal(result.kind,'candidate_for_human_review');
 for(const role of ['developer','reviewer']){
  const input=JSON.parse(f.requests.find(r=>r.role===role).input);
  assert.equal(input.previousCandidate.candidateHash,candidate.candidateHash);assert.equal(input.previousCandidate.files.find(f=>f.path==='index.html').content,'<!doctype html><h1>Previous source</h1>');
  assert.equal(input.input.requirements.length,2);
 }
 assert.equal(result.candidate.contentId,candidate.contentId);assert.notEqual(result.candidate.candidateHash,candidate.candidateHash);
 const g=fixture();g.args.input=structuredClone(f.args.input);g.args.baseCandidateText=baseCandidateText+' ';
 await assert.rejects(g.run(),/REVISION_BASE_CHANGED/);assert.equal(g.requests.length,0);
 const h=fixture();h.args.input=structuredClone(f.args.input);const files=JSON.parse(baseCandidateText);files.files[0].content+='x'.repeat(120000);h.args.baseCandidateText=JSON.stringify(files);const large=parseCandidate(h.args.baseCandidateText,context);h.args.input.revision.candidateTextHash=hash(h.args.baseCandidateText);h.args.input.revision.candidateHash=large.candidateHash;
 await assert.rejects(h.run(),/REVISION_CONTEXT_TOO_LARGE/);assert.equal(h.requests.length,0);
});
test('separate role contexts and exact candidate/runtime evidence produce human-review result only',async()=>{
 const f=fixture(),result=await f.run();
 assert.equal(result.kind,'candidate_for_human_review');assert.equal(result.calls,5);assert.equal(result.candidate.meta.stage,'draft');
 assert.deepEqual(f.requests.map(r=>r.role),['curriculum','subject','design','developer','reviewer']);
 assert.equal(f.requests[0].input,f.requests[1].input);assert.equal(JSON.parse(f.requests[1].input).curriculum,undefined);
 const reviewInput=JSON.parse(f.requests[4].input);
 assert.equal(reviewInput.candidate.candidateHash,result.candidate.candidateHash);assert.equal(reviewInput.evidence.candidateHash,result.candidate.candidateHash);
 assert.equal(reviewInput.previousResponse,undefined);assert.equal(reviewInput.input.requirements[0].id,'R1');
 assert.equal(f.records.filter(r=>r.kind==='role_output').length,5);
 assert.ok(f.records.filter(r=>r.kind==='role_output').every(r=>r.executionMode==='separate_context'));
 assert.equal(f.records.filter(r=>r.kind==='runtime_evidence').length,1);
 assert.equal(result.approval,undefined);assert.equal(result.publicUrl,undefined);
 await assert.rejects(()=>f.run(),/RUN_ALREADY_CLAIMED/);assert.equal(f.requests.length,5);
});
test('two repairs preserve all failures and cap total calls at nine',async()=>{
 for(const failures of [2,3]){
  const f=fixture({failures}),result=await f.run();
  assert.equal(result.calls,9);assert.equal(result.attempts.length,3);
  assert.equal(result.kind,failures===2?'candidate_for_human_review':'needs_input');
  if(failures===3)assert.equal(result.reason,'REPAIR_LIMIT_REACHED');
  assert.equal(result.attempts[0].review.status,'fail');assert.equal(result.attempts[1].review.status,'fail');
  assert.equal(new Set(result.attempts.map(a=>a.candidateHash)).size,3);
  assert.equal(f.records.filter(r=>r.kind==='review').length,3);
  const repairs=f.requests.filter(r=>r.role==='developer').slice(1).map(r=>JSON.parse(r.input));
  assert.ok(repairs.every(r=>r.repair.review.blockingIssues.length===1));
 }
});
test('missing curriculum or runtime evidence holds the run instead of approving or spending on blind repairs',async()=>{
 const missing=fixture({curriculum:'needs_evidence'}),m=await missing.run();
 assert.equal(m.kind,'needs_input');assert.equal(m.reason,'CURRICULUM_EVIDENCE_REQUIRED');assert.equal(missing.requests.length,1);
 const noRuntime=fixture({runtime:'not_run'}),r=await noRuntime.run();
 assert.equal(r.kind,'needs_input');assert.equal(r.reason,'RUNTIME_NOT_VERIFIED');assert.equal(r.calls,5);
});
test('known source failure can be repaired without claiming its blocked browser test ran',async()=>{
 const f=fixture({overrides:{async verify({attempt,candidate,sourceSnapshotHash}){
  return {candidateHash:candidate.candidateHash,sourceSnapshotHash,checksHash:'a'.repeat(64),checks:{contract:attempt===0?'fail':'pass',runtime:attempt===0?'not_run':'pass'},issues:attempt===0?['RUNTIME_INLINE_SCRIPT_REJECTED']:[]};
 }}});
 const result=await f.run();assert.equal(result.kind,'candidate_for_human_review');assert.equal(result.calls,7);
 assert.deepEqual(result.attempts[0].evidence.checks,{contract:'fail',runtime:'not_run'});
 assert.deepEqual(result.attempts[0].evidence.issues,['RUNTIME_INLINE_SCRIPT_REJECTED']);
 assert.equal(JSON.parse(f.requests.find(r=>r.role==='developer').input).runtimeContract.version,'browser-v1');
});
test('wrong review hash and forged runtime version stop before approval',async()=>{
 const review=fixture({reviewChange:{candidateHash:'b'.repeat(64)}});await assert.rejects(()=>review.run(),/REVIEW_CANDIDATE_MISMATCH/);
 const runtime=fixture({overrides:{async verify(){return {candidateHash:'b'.repeat(64)};}}});
 await assert.rejects(()=>runtime.run(),/RUNTIME_EVIDENCE_INVALID/);assert.equal(runtime.requests.length,4);
});
test('private input cannot reach provider and cancellation/live job checkpoint are required',async()=>{
 const noPermission=fixture({overrides:{async authorize(){return {aiProcessingAllowed:false};}}});
 await assert.rejects(()=>noPermission.run(),/INPUT_PERMISSION_REQUIRED/);assert.equal(noPermission.requests.length,0);
 const stopped=fixture({overrides:{async checkpoint(){return false;}}});
 await assert.rejects(()=>stopped.run(),/JOB_NOT_ACTIVE/);assert.equal(stopped.requests.length,0);
 const cancelled=fixture();cancelled.args.signal=AbortSignal.abort();
 await assert.rejects(()=>cancelled.run(),/JOB_CANCELLED/);assert.equal(cancelled.requests.length,0);
});
test('private evidence persistence failure stops later calls and never fabricates a success record',async()=>{
 const f=fixture({overrides:{async record(){throw Error('SYNTHETIC_STORE_FAILURE');}}});
 await assert.rejects(()=>f.run(),e=>e.code==='RUNNER_DEPENDENCY_FAILED'&&!e.message.includes('SYNTHETIC_STORE_FAILURE'));assert.equal(f.requests.length,1);
});
test('in-flight cancellation after runtime does not dispatch another paid review',async()=>{
 const controller=new AbortController();
 const f=fixture({overrides:{async verify({candidate,sourceSnapshotHash}){controller.abort();return {candidateHash:candidate.candidateHash,sourceSnapshotHash,checksHash:'a'.repeat(64),checks:{runtime:'pass',contract:'pass'},issues:[]};}}});
 f.args.signal=controller.signal;await assert.rejects(()=>f.run(),/JOB_CANCELLED/);assert.equal(f.requests.length,4);
});
