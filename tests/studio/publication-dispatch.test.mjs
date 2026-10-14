import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {publicationFixture} from './publication-dispatch-fixture.mjs';
import {createPublicationDispatchService} from '../../automation/publish/dispatch-service.mjs';
import {createStudioPublicationDispatch} from '../../apps/studio/lib/publication-dispatch.mjs';
import {syntheticDispatchEnv,syntheticGitHub} from './github-dispatch-fixture.mjs';
const sqlError=code=>error=>error.code===code;
const submitted={state:'submitted',runId:12345,trustedSha:'c'.repeat(40)};
const service=(f,dispatcher,overrides={})=>createPublicationDispatchService({db:f.client.schema('studio'),ownerId:f.ownerId,enabled:true,dispatcher,...overrides});
const start=f=>({approvalId:f.approval.id,requestId:randomUUID()});
const state=async f=>(await f.db.query('select state from studio.publication_dispatches')).rows[0]?.state;

test('publication dispatch stays disabled and never exposes browser write authority',async()=>{
 const f=await publicationFixture();try{
  await assert.rejects(f.request(),sqlError('PT412'));
  await assert.rejects(service(f,{dispatch(){assert.fail('disabled transport');}},{enabled:false}).start(start(f)),/PUBLICATION_DISABLED/);
  assert.equal(await state(f),undefined);
  for(const role of ['anon','authenticated']){
   await f.db.exec('reset role;set role '+role);await assert.rejects(f.request(),sqlError('42501'));
   await assert.rejects(f.db.exec('select * from studio.publication_dispatches'),sqlError('42501'));
  }
 }finally{await f.db.close();}
});

test('durable claim sends once across repeat clicks, changed request IDs and new server instances',async()=>{
 const f=await publicationFixture();try{
  await f.enable();let calls=0;const dispatcher={async dispatch(_id,{signal}){calls++;assert.ok(signal instanceof AbortSignal);return submitted;}};
  const args=start(f),a=await service(f,dispatcher).start(args),b=await service(f,dispatcher).start(args),c=await service(f,dispatcher).start(start(f));
  assert.deepEqual(a,b);assert.deepEqual(a,c);assert.equal(calls,1);assert.equal(a.dispatch.state,'submitted');assert.equal(a.published,false);
  assert.equal(a.dispatch.artifact_hash,f.prepared.artifactHash);
  for(const privateField of ['claim_id','owner_id','request_id'])assert.equal(a.dispatch[privateField],undefined);
  assert.equal((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n,0);
  await assert.rejects(f.db.exec("update studio.publication_dispatches set state='ready',claim_id=null,claimed_at=null,finished_at=null,run_id=null,verified_sha=null"),sqlError('PT409'));
  await assert.rejects(f.db.exec('delete from studio.publication_dispatches'),sqlError('42501'));
 }finally{await f.db.close();}
});

for(const committed of [false,true])test('lost final DB acknowledgement never sends again (finish committed='+committed+')',async()=>{
 const f=await publicationFixture();try{
  await f.enable();let calls=0;const dispatcher={async dispatch(){calls++;return submitted;}};
  const underlying=f.client.schema('studio');
  const faulty={rpc(name,args){if(name!=='finish_publication_dispatch')return underlying.rpc(name,args);return {async abortSignal(signal){if(committed)await underlying.rpc(name,args).abortSignal(signal);throw Error('SYNTHETIC_RESPONSE_LOST');}};}};
  await assert.rejects(service(f,dispatcher,{db:faulty}).start(start(f)),/PUBLICATION_DISPATCH_UNAVAILABLE/);
  const again=await service(f,dispatcher).start(start(f));assert.equal(calls,1);assert.equal(again.dispatch.state,committed?'submitted':'claimed');
 }finally{await f.db.close();}
});

test('unresponsive transport is bounded and stays uncertain without retry or false publication',async()=>{
 const f=await publicationFixture();try{
  await f.enable();let calls=0;const dispatcher={dispatch(){calls++;return new Promise(()=>{});}};
  const begun=Date.now(),r=await service(f,dispatcher,{totalMs:500}).start(start(f));
  assert.ok(Date.now()-begun<4000);assert.equal(r.dispatch.state,'uncertain');assert.equal(r.published,false);
  assert.equal((await service(f,dispatcher).start(start(f))).dispatch.state,'uncertain');assert.equal(calls,1);
 }finally{await f.db.close();}
});

test('teacher withdrawal before claim cancels dispatch; withdrawal after dispatch is preserved for deployment recheck',async()=>{
 for(const beforeClaim of [true,false]){
  const f=await publicationFixture();try{
   await f.enable();let calls=0;
   const intent=await f.request();
   if(beforeClaim)await f.release.revoke(f.approval.id,{});
   const dispatcher={async dispatch(){calls++;await f.release.revoke(f.approval.id,{});return submitted;}};
   const r=await service(f,dispatcher).start(start(f));assert.equal(r.dispatch.id,intent.id);
   assert.equal(r.dispatch.state,beforeClaim?'cancelled':'submitted');assert.equal(calls,beforeClaim?0:1);
   assert.equal((await f.release.read(f.jobId)).publicationReview.approval.effective,false);
   assert.equal(r.published,false);
  }finally{await f.db.close();}
 }
});

test('forged receipts, mismatched claims and mutation of immutable dispatch data are rejected',async()=>{
 const f=await publicationFixture();try{
  await f.enable();const intent=await f.request(),claim=randomUUID();await f.claim(intent.id,claim);
  const args={p_owner:f.ownerId,p_intent:intent.id,p_claim:claim,p_state:'submitted',p_run:12345,p_sha:'c'.repeat(40)};
  await assert.rejects(f.rpc('finish_publication_dispatch',{...args,p_claim:randomUUID()}),sqlError('PT403'));
  await assert.rejects(f.rpc('finish_publication_dispatch',{...args,p_run:null}),sqlError('PT400'));
  await assert.rejects(f.db.exec("update studio.publication_dispatches set claim_id=gen_random_uuid()"),sqlError('PT409'));
  const finished=await f.rpc('finish_publication_dispatch',args);assert.deepEqual(await f.rpc('finish_publication_dispatch',args),finished);
  await assert.rejects(f.rpc('finish_publication_dispatch',{...args,p_state:'failed',p_run:null,p_sha:null}),sqlError('PT409'));
 }finally{await f.db.close();}
});

test('unknown dispatch holds the whole-catalog slot across later approval and gate changes',async()=>{
 const f=await publicationFixture();try{
  await f.enable();let calls=0;const dispatcher={async dispatch(){calls++;throw Error('SYNTHETIC_CONNECTION_LOST');}};
  const original=start(f);assert.equal((await service(f,dispatcher).start(original)).dispatch.state,'uncertain');
  const next=await f.nextApproval();
  await assert.rejects(service(f,dispatcher).start({approvalId:next.id,requestId:randomUUID()}),/PUBLICATION_BUSY/);
  await assert.rejects(f.rpc('request_publication_dispatch',{p_owner:randomUUID(),p_approval:next.id,p_client:randomUUID()}),sqlError('PT404'));
  await f.admin(()=>f.db.exec("create or replace function studio.publication_dispatch_enabled() returns boolean language sql security invoker set search_path='' as $$select false$$;"));
  assert.equal((await service(f,dispatcher).start(original)).dispatch.state,'uncertain');assert.equal(calls,1);
  assert.equal((await f.db.query('select count(*)::int n from studio.publication_dispatches')).rows[0].n,1);
 }finally{await f.db.close();}
});

test('Studio server connects authenticated approval and durable SQL to the fixed GitHub transport, with private reads after pause',async()=>{
 const f=await publicationFixture();try{
  const provider=syntheticGitHub({publication:true});
  const env={...syntheticDispatchEnv,STUDIO_PUBLICATION_DISPATCH_ENABLED:'true',STUDIO_PUBLICATION_TRUSTED_SHAS:'a'.repeat(40)};
  const studio=createStudioPublicationDispatch({db:f.client.schema('studio'),ownerId:f.ownerId,env,transport:provider.transport});
  assert.equal(await studio.capability(),false);
  await assert.rejects(studio.start(f.approval.id,{clientRequestId:randomUUID()}),e=>e.code==='PUBLICATION_DISABLED'&&e.status===503);assert.equal(provider.calls.length,0);
  await f.enable();assert.equal(await studio.capability(),true);
  await assert.rejects(studio.start(f.approval.id,{clientRequestId:randomUUID(),ownerId:f.ownerId}),e=>e.code==='INVALID_REQUEST');
  const r=await studio.start(f.approval.id,{clientRequestId:randomUUID()});assert.equal(r.dispatch.state,'submitted');assert.equal(r.published,false);
  assert.deepEqual(provider.calls.find(c=>c.endpoint.endsWith('/dispatches')).body.inputs,{publication_id:r.dispatch.id});
  const paused=createStudioPublicationDispatch({db:f.client.schema('studio'),ownerId:f.ownerId,env:{},transport:provider.transport});
  assert.equal(await paused.capability(),false);assert.deepEqual(await paused.read(f.approval.id),r);
  await assert.rejects(paused.start(f.approval.id,{clientRequestId:randomUUID()}),e=>e.code==='PUBLICATION_DISABLED');
  const stranger=createStudioPublicationDispatch({db:f.client.schema('studio'),ownerId:randomUUID(),env:{}});
  await assert.rejects(stranger.read(f.approval.id),e=>e.code==='PUBLICATION_FORBIDDEN');
  assert.equal(provider.calls.filter(c=>c.endpoint.endsWith('/dispatches')).length,1);
 }finally{await f.db.close();}
});
