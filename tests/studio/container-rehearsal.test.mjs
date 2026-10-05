import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runRehearsal} from '../../automation/runner/container/rehearsal.mjs';

const image='sha256:'+'a'.repeat(64);
const pass={checks:{contract:'pass',runtime:'pass'},details:{browserStopped:true},issues:[]};
function output(){const logs=[],errors=[];return {logs,errors,log:value=>logs.push(value),error:value=>errors.push(value)};}
test('isolation failure stops before fixtures and emits only allowed diagnostic fields',async()=>{
 for(const safe of [true,false]){
  const out=output();let calls=0;
  const status=await runRehearsal({image,...out,run:async()=>{calls++;throw Object.assign(Error('sk-private-do-not-print'),{code:safe?'CONTAINER_RESOURCE_REJECTED':'sk-private-code',containerStage:safe?'inspect':'private-stage',cleanup:safe?'confirmed':'private-cleanup',stderr:'private stderr'});}});
  assert.equal(status,1);assert.equal(calls,1);assert.deepEqual(out.logs,[]);
  const result=JSON.parse(out.errors[0]);assert.equal(result.stage,'isolation');
  assert.equal(result.code,safe?'CONTAINER_RESOURCE_REJECTED':'CONTAINER_REHEARSAL_FAILED');
  assert.equal(result.containerStage,safe?'inspect':'unknown');assert.equal(result.cleanup,safe?'confirmed':'unknown');
  assert.equal(JSON.stringify(out).includes('private'),false);
 }
});
test('2D failure retains the passed isolation checkpoint and does not run later fixtures',async()=>{
 const out=output();let calls=0;
 const status=await runRehearsal({image,...out,run:async()=>{if(++calls===1)return {isolated:true};throw Object.assign(Error('private'),{code:'CONTAINER_COMMAND_FAILED',containerStage:'execute',cleanup:'confirmed'});}});
 assert.equal(status,1);assert.equal(calls,2);assert.equal(JSON.parse(out.logs[0]).name,'isolation');
 assert.equal(JSON.parse(out.errors[0]).stage,'2d');assert.equal(out.logs.includes('CONTAINER_REHEARSAL_PASSED'),false);
});
test('rehearsal passes only after isolation, 2D, 3D and broken-reset detection',async()=>{
 const out=output(),seen=[];
 const status=await runRehearsal({image,...out,run:async(packet,options)=>{seen.push({packet,options});return seen.length===1?{isolated:true}:seen.length===4?{...pass,checks:{contract:'pass',runtime:'fail'},issues:['RUNTIME_RESET_FAILED']}:pass;}});
 assert.equal(status,0);assert.equal(seen.length,4);assert.equal(seen[0].options.probe,true);
 assert.deepEqual(out.logs.slice(0,4).map(value=>JSON.parse(value).name),['isolation','2d','3d','broken-reset']);
 assert.equal(out.logs.at(-1),'CONTAINER_REHEARSAL_PASSED');assert.deepEqual(out.errors,[]);
});
test('a passing broken-reset or unstopped browser never completes rehearsal',async()=>{
 for(const unstopped of [false,true]){
  const out=output();let calls=0;
  const status=await runRehearsal({image,...out,run:async()=>++calls===1?{isolated:true}:unstopped?{...pass,details:{browserStopped:false}}:pass});
  assert.equal(status,1);assert.equal(calls,unstopped?2:4);
  assert.equal(JSON.parse(out.errors[0]).code,'CONTAINER_REHEARSAL_REPORT_INVALID');
  assert.equal(out.logs.includes('CONTAINER_REHEARSAL_PASSED'),false);
 }
});
