import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicationAuthorityFixture} from './publication-authority-fixture.mjs';
import {createReleaseApprovalService} from '../../apps/studio/lib/release-approval.mjs';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
const count=async f=>(await f.db.query('select count(*)::int n from studio.publication_authorizations')).rows[0].n;

test('default deployment gate blocks claims; matching environment-scoped claim consumes approval exactly once',async()=>{
 const f=await publicationAuthorityFixture();try{
  assert.equal((await f.authorize()).status,503);assert.equal(await count(f),0);await f.enableDeploy();
  const token=await f.deployToken(),response=await f.authorize(undefined,token);assert.equal(response.status,200);const receipt=await response.json();
  assert.equal(receipt.published,false);assert.equal(receipt.claim.reportHash,f.reportHash);assert.equal(receipt.binding.approvalId,f.approval.id);
  assert.equal((await f.authorize(undefined,token)).status,409);assert.equal((await f.authorize()).status,409);assert.equal(await count(f),1);
  const service=createReleaseApprovalService({db:f.client.schema('studio'),ownerId:f.ownerId,enabled:true});
  const shown=await service.read(f.jobId);assert.ok(shown.publicationReview.publicationStartedAt);assert.equal(shown.publicationReview.approval.effective,false);
  await assert.rejects(()=>service.revoke(f.approval.id,{}),e=>e.code==='PUBLICATION_STARTED');
  await assert.rejects(f.db.exec('delete from studio.publication_authorizations'));await assert.rejects(f.db.exec('update studio.publication_authorizations set report_hash=repeat(\'f\',64)'));
  assert.equal((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n,0);
 }finally{await f.db.close();}
});
test('revocation before claim prevents public transfer authority',async()=>{
 const f=await publicationAuthorityFixture();try{await f.enableDeploy();await f.rpc('revoke_release_approval',{p_owner:f.ownerId,p_approval:f.approval.id});assert.equal((await f.authorize()).status,409);assert.equal(await count(f),0);}finally{await f.db.close();}
});
for(const record of [false,true])test(record?'failed runtime cannot authorize transfer':'missing runtime cannot authorize transfer',async()=>{
 const f=await publicationAuthorityFixture({passed:false,record});try{await f.enableDeploy();assert.equal((await f.authorize()).status,409);assert.equal(await count(f),0);}finally{await f.db.close();}
});
test('wrong role, environment, hashes and source withdrawal fail closed',async()=>{
 const f=await publicationAuthorityFixture();try{
  await f.enableDeploy();const payload={artifactHash:f.intent.artifact_hash,reportHash:f.reportHash};
  assert.equal((await f.request('claim',payload)).status,403);assert.equal((await f.authorize(payload,await f.reportToken())).status,403);
  assert.equal((await f.authorize(payload,await f.sign({job_workflow_ref:PUBLICATION_TRUST.deployWorkflow}))).status,403);
  assert.equal((await f.authorize({...payload,artifactHash:'f'.repeat(64)})).status,409);assert.equal((await f.authorize({...payload,reportHash:'f'.repeat(64)})).status,409);
  await f.admin(()=>f.db.exec("update studio.source_reviews set revoked_at=clock_timestamp() where id='"+f.sourceId+"'"));
  assert.equal((await f.authorize()).status,409);assert.equal(await count(f),0);
 }finally{await f.db.close();}
});
test('catalog baseline change before authority claim prevents transfer',async()=>{
 const f=await publicationAuthorityFixture();try{await f.enableDeploy();await f.admin(()=>f.db.exec("update studio.release_baseline set artifact_hash=repeat('f',64)"));assert.equal((await f.authorize()).status,409);assert.equal(await count(f),0);}finally{await f.db.close();}
});
