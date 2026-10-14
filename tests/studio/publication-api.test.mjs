import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {publicationApiFixture} from './publication-api-fixture.mjs';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
import {createPublicationHttpHandler} from '../../apps/studio/lib/publication-http.mjs';
import {createPublicationGateway} from '../../apps/studio/lib/publication-gateway.mjs';
import {encodeArtifactBundle} from '../../automation/publish/artifact-bundle.mjs';
const count=async f=>(await f.db.query('select count(*)::int n from studio.publication_oidc_receipts')).rows[0].n;
const sqlError=code=>error=>error.code===code;

test('artifact API stays disabled by default and browser database roles cannot use it',async()=>{
 const f=await publicationApiFixture();try{
  const r=await f.request('manifest');assert.equal(r.status,503);assert.equal((await r.json()).error,'PUBLICATION_DISABLED');assert.equal(await count(f),0);
  for(const role of ['anon','authenticated']){
   await f.db.exec('reset role;set role '+role);
   await assert.rejects(f.rpc('read_publication_artifact',f.args()),sqlError('42501'));
   await assert.rejects(f.db.exec('select * from studio.publication_oidc_receipts'),sqlError('42501'));
  }
 }finally{await f.db.close();}
});

test('signed request -> durable receipt -> exact approved manifest and individual file bytes, without private review data',async()=>{
 const f=await publicationApiFixture();try{
  await f.enableApi();const response=await f.request('manifest');assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Authorization');
  const m=await response.json();assert.equal(m.binding.publicationId,f.intent.id);assert.equal(m.binding.approvalId,f.approval.id);assert.equal(m.published,false);
  assert.deepEqual(Object.keys(m).sort(),['binding','bytes','inspection','manifest','published']);assert.ok(!JSON.stringify(m).includes(f.ownerId));
  const files=[];
  for(const expected of m.manifest){
   const r=await f.request('file',{path:expected.path});assert.equal(r.status,200);const data=await r.json();
   assert.deepEqual(data.binding,m.binding);assert.equal(data.file.hash,expected.hash);assert.equal(data.published,false);
   files.push({path:data.file.path,bytesBase64:data.file.bytesBase64});
  }
  assert.equal(encodeArtifactBundle(files).artifactHash,m.binding.artifactHash);assert.equal(await count(f),m.manifest.length+1);
  assert.equal((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n,0);
  await assert.rejects(f.db.exec('delete from studio.publication_oidc_receipts'),sqlError('42501'));
 }finally{await f.db.close();}
});

test('a consumed token cannot read again or change paths; mismatched runs and unconfirmed dispatch never read files',async()=>{
 const f=await publicationApiFixture();try{
  await f.enableApi();const token=await f.sign();
  assert.equal((await f.request('manifest',{}, {headers:{authorization:token}})).status,200);
  assert.equal((await f.request('manifest',{}, {headers:{authorization:token}})).status,409);
  assert.equal((await f.request('file',{path:'index.html'}, {headers:{authorization:token}})).status,409);
  assert.equal((await f.request('manifest',{}, {headers:{authorization:await f.sign({run_id:'12346'})}})).status,403);
  assert.equal((await f.request('manifest',{}, {body:{publicationId:randomUUID()}})).status,403);assert.equal(await count(f),1);
 }finally{await f.db.close();}
 const pending=await publicationApiFixture({submitted:false});try{await pending.enableApi();assert.equal((await pending.request('manifest')).status,403);assert.equal(await count(pending),0);}finally{await pending.db.close();}
});

test('teacher or source withdrawal after manifest retrieval prevents all later file reads',async()=>{
 for(const source of [false,true]){
  const f=await publicationApiFixture();try{
   await f.enableApi();assert.equal((await f.request('manifest')).status,200);
   if(source)await f.admin(()=>f.db.query('update studio.source_reviews set revoked_at=clock_timestamp() where id=$1',[f.sourceId]));
   else await f.release.revoke(f.approval.id,{});
   assert.equal((await f.request('file',{path:'index.html'})).status,409);assert.equal(await count(f),1);
  }finally{await f.db.close();}
 }
});

test('request scope and bounded receipt ledger reject browser calls, role changes and excess reads',async()=>{
 const f=await publicationApiFixture();try{
  await f.enableApi();
  for(const headers of [{origin:PUBLICATION_TRUST.origin},{cookie:'synthetic=1'}])assert.equal((await f.request('manifest',{}, {headers})).status,403);
  assert.equal((await f.request('manifest',{}, {headers:{authorization:await f.sign({job_workflow_ref:PUBLICATION_TRUST.reportWorkflow})}})).status,403);
  assert.equal((await f.request('manifest',{}, {body:{ownerId:f.ownerId}})).status,400);
  for(const path of ['../index.html','/index.html','assets/%2e%2e/index.html','assets\\x.js','assets/con.js'])assert.equal((await f.request('file',{path})).status,400);
  assert.equal((await f.request('file',{path:'assets/missing.js'})).status,404);assert.equal(await count(f),0);
  const args=f.args();
  await assert.rejects(f.rpc('read_publication_artifact',{...args,p_expires:new Date(Date.now()-1000).toISOString()}),sqlError('PT400'));
  await f.db.query("insert into studio.publication_oidc_receipts(jti_hash,publication_id,run_id,run_attempt,workflow_sha,role,action,body_hash,expires_at) select lpad(to_hex(n),64,'0'),$1,12345,1,$2,'prepare','manifest',repeat('b',64),clock_timestamp()+interval '5 minutes' from generate_series(1,256) n",[f.intent.id,f.sha]);
  assert.equal((await f.request('manifest')).status,429);assert.equal(await count(f),256);
 }finally{await f.db.close();}
});

test('JSON byte and UTF-8 limits reject malformed input before reaching the database',async()=>{
 let reads=0;const h=createPublicationHttpHandler({verifyToken:async()=>({purpose:'publication',role:'prepare'}),gateway:{read:async()=>{reads++;return {};}}});
 for(const [bytes,headers,status] of [[Buffer.alloc(4097,32),{},413],[Buffer.from([0xff]),{},400],[Buffer.from('{}'),{'content-length':'99999'},413],[Buffer.from('{}'),{'content-encoding':'gzip'},400]]){
  const r=await h(new Request(PUBLICATION_TRUST.origin+'/api/publication/manifest',{method:'POST',headers:{'content-type':'application/json',...headers},body:bytes}),'manifest');assert.equal(r.status,status);
 }
 assert.equal(reads,0);
});

test('one maximum-size file fits the response cap and upstream private errors stay hidden',async()=>{
 const identity={purpose:'publication',role:'prepare',runId:12345,runAttempt:1,workflowSha:'a'.repeat(40)},id=randomUUID();
 const binding={publicationId:id,approvalId:randomUUID(),reviewId:randomUUID(),runId:12345,runAttempt:1,workflowSha:identity.workflowSha,proposalHash:'b'.repeat(64),artifactHash:'c'.repeat(64)};
 const bytes=Buffer.alloc(2*1024*1024,1);const packet={binding,file:{path:'assets/test.png',bytesBase64:bytes.toString('base64')}};
 const client={schema(){return {rpc(){return {async abortSignal(){return {data:packet,error:null};}};}};}};
 const gateway=createPublicationGateway(client),handler=createPublicationHttpHandler({verifyToken:async()=>identity,gateway});
 const request=new Request(PUBLICATION_TRUST.origin+'/api/publication/file',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({publicationId:id,payload:{path:'assets/test.png'}})});
 const response=await handler(request,'file');assert.equal(response.status,200);assert.ok(Buffer.byteLength(await response.text())<3_000_000);
 const broken=createPublicationHttpHandler({verifyToken:async()=>{throw Error('synthetic-private-secret');},gateway});
 const result=await broken(new Request(PUBLICATION_TRUST.origin+'/api/publication/manifest',{method:'POST'}),'manifest');assert.equal(result.status,503);assert.equal((await result.json()).error,'PUBLICATION_SERVICE_UNAVAILABLE');
});
