import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {workerFixture} from './worker-fixture.mjs';
const sha='a'.repeat(40),hash=value=>createHash('sha256').update(value).digest('hex');
const sqlstate=code=>error=>error.code===code;
const params=f=>({...f.identity,p_sha:sha,p_jti_hash:hash(randomUUID()),p_expires:new Date(Date.now()+300000).toISOString(),p_role:'generation',p_action:'claim',p_body_hash:'b'.repeat(64)});
async function fixture(){const f=await workerFixture({auth:true});await f.enable();await f.submit();await f.bind();return f;}
test('OIDC receipt records are private and cannot be consumed by browser roles',async()=>{
 const f=await fixture();try{
  for(const role of ['anon','authenticated']){
   await f.db.exec('reset role;set role '+role);
   await assert.rejects(()=>f.db.query('select * from studio.worker_oidc_receipts'),sqlstate('42501'));
   await assert.rejects(()=>f.rpc('consume_worker_identity',params(f)),sqlstate('42501'));
  }
 }finally{await f.db.close();}
});
test('atomic replay prevention binds job, run, SHA, action and body without storing the bearer token',async()=>{
 const f=await fixture();try{
  const p=params(f),receipt=await f.rpc('consume_worker_identity',p);assert.equal(receipt.jobId,f.jobId);assert.equal(receipt.workflowSha,sha);
  await assert.rejects(()=>f.rpc('consume_worker_identity',p),sqlstate('PT409'));
  await assert.rejects(()=>f.rpc('consume_worker_identity',{...p,p_action:'input',p_body_hash:'c'.repeat(64)}),sqlstate('PT409'));
  assert.equal((await f.db.query('select count(*)::int n from studio.worker_oidc_receipts')).rows[0].n,1);
  await assert.rejects(()=>f.rpc('consume_worker_identity',{...params(f),p_sha:'c'.repeat(40)}),sqlstate('PT403'));
  assert.equal((await f.db.query('select verified_sha from studio.worker_runs')).rows[0].verified_sha,sha);
 }finally{await f.db.close();}
});
test('cross-job, rerun, expired credentials and wrong job permissions are rejected before consuming a receipt',async()=>{
 const f=await fixture();try{
  for(const [extra,state] of [[{p_job:randomUUID()},'PT403'],[{p_run:999},'PT403'],[{p_attempt:2},'PT403'],
   [{p_expires:new Date(Date.now()-1000).toISOString()},'PT400'],[{p_expires:new Date(Date.now()+1300000).toISOString()},'PT400'],
   [{p_role:'generation',p_action:'runtime-report'},'PT400'],[{p_role:'report',p_action:'settle'},'PT400']]){
   await assert.rejects(()=>f.rpc('consume_worker_identity',{...params(f),...extra}),sqlstate(state));
  }
  assert.equal((await f.db.query('select count(*)::int n from studio.worker_oidc_receipts')).rows[0].n,0);
 }finally{await f.db.close();}
});
test('kill switch and teacher revocation stop generation while settlement/failure acknowledgement remain possible',async()=>{
 const f=await fixture();try{
  await f.claim();await f.db.exec('reset role;update studio.budget_policy set enabled=false;update studio.teachers set active=false;set role service_role;');
  await assert.rejects(()=>f.rpc('consume_worker_identity',params(f)),sqlstate('PT412'));
  for(const action of ['settle','finish'])assert.equal((await f.rpc('consume_worker_identity',{...params(f),p_action:action})).jobId,f.jobId);
 }finally{await f.db.close();}
});
test('finite request receipts cap a runaway authenticated worker',async()=>{
 const f=await fixture();try{
  await f.db.query("insert into studio.worker_oidc_receipts(jti_hash,job_id,run_id,run_attempt,workflow_sha,role,action,body_hash,expires_at) select encode(sha256(convert_to(n::text,'UTF8')),'hex'),$1,101,1,$2,'generation','checkpoint',$3,now()+interval '5 minutes' from generate_series(1,512) n",[f.jobId,sha,'b'.repeat(64)]);
  await assert.rejects(()=>f.rpc('consume_worker_identity',params(f)),sqlstate('PT429'));
 }finally{await f.db.close();}
});
