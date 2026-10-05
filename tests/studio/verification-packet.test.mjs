import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {sealTransfer,openTransfer} from '../../automation/runner/sealed-transfer.mjs';
import {sealVerificationPacket,openVerificationPacket,waitForVerificationPacket} from '../../automation/runner/verification-packet.mjs';
import {runtimeFixture} from './runtime-fixture.mjs';

const run=()=>({jobId:randomUUID(),runId:101,runAttempt:1,baselineSha:'a'.repeat(40),attempt:0});
test('private source transfers as authenticated ciphertext bound to one job/run/version/attempt/purpose',()=>{
 const f=runtimeFixture(),r=run(),key=randomBytes(32).toString('base64');
 const packet={inputText:f.inputText,candidateText:f.candidateText,expected:f.expected};
 const expected={...r,purpose:'candidate',candidateHash:f.expected.candidateHash,sourceSnapshotHash:f.expected.sourceSnapshotHash};
 const first=sealVerificationPacket(packet,r,key),second=sealVerificationPacket(packet,r,key);
 assert.notEqual(first,second);assert.equal(first.includes('검사용 도형'),false);assert.equal(first.includes('<canvas'),false);
 assert.deepEqual(openVerificationPacket(first,expected,key),packet);
 for(const changed of [{jobId:randomUUID()},{runId:102},{baselineSha:'b'.repeat(40)},{attempt:1},{purpose:'runtime-report'},{sourceSnapshotHash:'b'.repeat(64)}])assert.throws(()=>openTransfer(first,{...expected,...changed},key),/SEALED_TRANSFER_REJECTED/);
 assert.throws(()=>openTransfer(first,expected,randomBytes(32).toString('base64')),/SEALED_TRANSFER_REJECTED/);
});
test('tampering, invalid encodings, extra fields and plaintext size excess are rejected without revealing data',()=>{
 const key=randomBytes(32).toString('base64'),expected={...run(),purpose:'runtime-report',candidateHash:'a'.repeat(64),sourceSnapshotHash:'b'.repeat(64)};
 const sealed=JSON.parse(sealTransfer({private:'DO_NOT_EXPOSE'},expected,key));
 for(const field of ['ciphertext','tag','nonce','salt']){
  const copy={...sealed,[field]:(sealed[field][0]==='A'?'B':'A')+sealed[field].slice(1)};
  assert.throws(()=>openTransfer(JSON.stringify(copy),expected,key),e=>e.code==='SEALED_TRANSFER_REJECTED'&&!e.message.includes('DO_NOT_EXPOSE'));
 }
 assert.throws(()=>openTransfer(JSON.stringify({...sealed,extra:true}),expected,key),/SEALED_TRANSFER_REJECTED/);
 assert.throws(()=>sealTransfer({data:'x'.repeat(2_300_000)},expected,key),/SEALED_TRANSFER_REJECTED/);
 assert.throws(()=>sealTransfer({},expected,'not-a-key'),/SEALED_TRANSFER_REJECTED/);
 const large={data:'x'.repeat(2_200_000)};
 assert.deepEqual(openTransfer(sealTransfer(large,expected,key),expected,key),large);
});
test('packet polling returns only a validated ready snapshot or terminal marker, with finite waits',async()=>{
 const f=runtimeFixture();let polls=0,waits=0;
 const packet={inputText:f.inputText,candidateText:f.candidateText,expected:f.expected};
 const found=await waitForVerificationPacket({api:{post:async()=>++polls===1?{state:'pending'}:{state:'ready',packet}},attempt:0,baselineSha:f.expected.baselineSha,pollWait:async ms=>{assert.equal(ms,5000);waits++;}});
 assert.deepEqual(found,packet);assert.equal(waits,1);
 assert.equal(await waitForVerificationPacket({api:{post:async()=>({state:'done'})},attempt:1,baselineSha:f.expected.baselineSha}),null);
 await assert.rejects(waitForVerificationPacket({api:{post:async()=>({state:'ready',packet})},attempt:1,baselineSha:f.expected.baselineSha}),/VERIFICATION_PACKET_REJECTED/);
 for(const attempt of [0,1]){
  let count=0;await assert.rejects(waitForVerificationPacket({api:{post:async()=>{count++;return {state:'pending'};}},attempt,baselineSha:f.expected.baselineSha,pollWait:async()=>{}}),/VERIFICATION_PACKET_WAIT_LIMIT/);assert.equal(count,attempt===0?90:45);
 }
});
