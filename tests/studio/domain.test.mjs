import {test} from 'node:test';
import assert from 'node:assert/strict';
import {teacher,owner,requestEnvelope,mockNext,retryAllowed,checkReceipt,PHASES} from '../../apps/studio/lib/domain.mjs';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const input=()=>({schemaVersion:1,conversationId:a,clientRequestId:b,operation:'create_simulation',payload:{topic:'유전',grade:3,unit:'생식과 유전',requirements:' 예측과 관찰 ',schoolYear:null,targetContentId:null,expectedVersion:null}});
test('server identity gate rejects no user, anonymous and non-allowlisted users including metadata claims',()=>{
  for(const user of [null,{id:a,is_anonymous:true},{id:b,user_metadata:{admin:true}}]) assert.throws(()=>teacher(user,[a]));
  assert.equal(teacher({id:a},[a]),a);
});
test('ownership gate hides missing and other-teacher records',()=>{
  assert.throws(()=>owner({owner_id:b},a),/NOT_FOUND/);assert.throws(()=>owner(null,a),/NOT_FOUND/);
  assert.equal(owner({owner_id:a},a).owner_id,a);
});
test('request normalizes deterministically, retains unknown year and rejects authority fields',()=>{
  assert.equal(requestEnvelope(input()).payload.schoolYear,null);
  assert.equal(JSON.stringify(requestEnvelope(input())),JSON.stringify(requestEnvelope(input())));
  assert.equal(requestEnvelope(input()).payload.requirements,'예측과 관찰');
  for(const field of ['ownerId','state','approved','executionMode'])assert.throws(()=>requestEnvelope({...input(),[field]:'forged'}));
  for(const update of [{schoolYear:undefined},{schoolYear:0},{requirements:'x'.repeat(4001)},{grade:4},{targetContentId:'../escape'},{expectedVersion:'fake'},{approved:true}])assert.throws(()=>requestEnvelope({...input(),payload:{...input().payload,...update}}));
});
const fresh=()=>({execution_mode:'mock',state:'queued',phase:null,state_version:0,run_attempt:1});
test('command receipt allows the same retry but rejects reused UUID with different command or version',()=>{
  const receipt={command_type:'advance',state_version:3};
  checkReceipt(receipt,'advance',2);
  for(const [command,version] of [['cancel',2],['advance',1],['advance',3],['approve',2]]) {
    assert.throws(()=>checkReceipt(receipt,command,version),/STATE_CONFLICT/);
  }
});
test('job retry rejects stale expected state even when retry count and terminal state permit it',()=>{
  const failed={...fresh(),state:'failed',state_version:2};
  retryAllowed(failed,2);
  assert.throws(()=>retryAllowed(failed,1),/STATE_CONFLICT/);
});
test('bounded mock worker visits six phases and stops for evidence, never publishes or approves',()=>{
  let job=fresh();const visited=[];
  for(let step=0;step<7;step++) {const next=mockNext(job,'advance',job.state_version);job={...job,...next,state_version:next.stateVersion};visited.push(job.phase);}
  assert.deepEqual(visited.slice(0,6),PHASES);assert.equal(job.state,'needs_input');assert.equal(job.errorCode,'MOCK_FINISHED_NO_EVIDENCE');
  assert.throws(()=>mockNext(job,'advance',job.state_version),/INVALID_TRANSITION/);
});
test('cancel acknowledgement is separate and late completion is rejected',()=>{
  const next=mockNext(fresh(),'cancel',0);assert.equal(next.state,'cancel_requested');
  const cancelled=mockNext({...fresh(),state:next.state,state_version:1},'advance',1);assert.equal(cancelled.state,'cancelled');
  assert.throws(()=>mockNext({...fresh(),state:'cancelled'},'advance',0));
});
test('mock error is explicit, retries capped and stale versions or real execution rejected',()=>{
  assert.equal(mockNext(fresh(),'simulate_error',0).errorCode,'MOCK_SIMULATED_FAILURE');
  retryAllowed({...fresh(),state:'failed',run_attempt:2});
  assert.throws(()=>retryAllowed({...fresh(),state:'failed',run_attempt:3}));
  assert.throws(()=>retryAllowed(fresh()));
  assert.throws(()=>mockNext(fresh(),'advance',1),/STATE_CONFLICT/);
  assert.throws(()=>mockNext({...fresh(),execution_mode:'real'},'advance',0),/MOCK_ONLY/);
  for(const cmd of ['approve','publish','complete'])assert.throws(()=>mockNext(fresh(),cmd,0));
});
