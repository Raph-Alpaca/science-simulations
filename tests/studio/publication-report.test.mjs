import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicationReportFixture} from './publication-report-fixture.mjs';
const count=async f=>(await f.db.query('select count(*)::int n from studio.publication_checks')).rows[0].n;

test('authenticated reporter records one immutable result, deduplicates fresh-token retries and rejects replay or changed evidence',async()=>{
 const f=await publicationReportFixture();try{
  const token=await f.reportToken(),first=await f.send(f.report,{headers:{authorization:token}});assert.equal(first.status,200);const receipt=await first.json();assert.equal(receipt.passed,true);assert.equal(receipt.published,false);assert.equal(receipt.binding.approvalId,f.approval.id);
  assert.equal((await f.send(f.report,{headers:{authorization:token}})).status,409);
  const repeat=await f.send();assert.equal(repeat.status,200);assert.deepEqual(await repeat.json(),receipt);assert.equal(await count(f),1);
  const different=structuredClone(f.report);different.runtime.checks.runtime='fail';different.runtime.issues=['RUNTIME_RESET_FAILED'];assert.equal((await f.send(different)).status,409);
  await assert.rejects(f.db.exec('update studio.publication_checks set passed=false'));
  await assert.rejects(f.db.exec('delete from studio.publication_checks'));
  assert.equal((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n,0);
 }finally{await f.db.close();}
});

test('recording old measured evidence after teacher withdrawal does not restore approval or publish',async()=>{
 const f=await publicationReportFixture();try{
  await f.rpc('revoke_release_approval',{p_owner:f.ownerId,p_approval:f.approval.id});
  const failed=structuredClone(f.report);failed.runtime.checks.runtime='fail';failed.runtime.issues=['RUNTIME_RESET_FAILED'];
  const response=await f.send(failed);assert.equal(response.status,200);assert.equal((await response.json()).passed,false);
  assert.equal(await f.rpc('publication_approval_current',{p_owner:f.ownerId,p_approval:f.approval.id}),false);assert.equal(await count(f),1);
  assert.equal((await f.request('manifest')).status,409);
 }finally{await f.db.close();}
});

test('wrong role/version, forged pass, unclosed browser and arbitrary error text never enter the report ledger',async()=>{
 const f=await publicationReportFixture();try{
  assert.equal((await f.request('check-report',{report:f.report})).status,403);
  for(const change of [r=>{r.artifactHash='f'.repeat(64);},r=>{r.runtime.candidateHash='f'.repeat(64);},r=>{r.runtime.details.observations=[];},r=>{r.runtime.details.browserStopped=false;},r=>{r.runtime.checks.runtime='fail';r.runtime.issues=['private original text'];}]){const report=structuredClone(f.report);change(report);assert.equal((await f.send(report)).status,409);}
  assert.equal(await count(f),0);
  assert.equal((await f.db.query("select count(*)::int n from studio.publication_oidc_receipts where role='report'")).rows[0].n,0);
 }finally{await f.db.close();}
});
