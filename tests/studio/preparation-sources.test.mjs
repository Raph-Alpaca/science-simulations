import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {workerFixture} from './worker-fixture.mjs';
import {preparationFixture,insertPreparation} from './preparation-fixture.mjs';
import {createPreparationSourceReader} from '../../apps/studio/lib/preparation-sources.mjs';

test('trusted source SQL binds Unicode bytes, isolates owners, preserves records and leaves execution off',async()=>{
 const f=await workerFixture(),now=Date.now();try{
  await f.db.exec('reset role');await f.db.exec(readFileSync('supabase/proposals/studio_preparation_sources_v1.sql','utf8'));
  const {scope,records}=preparationFixture(f.ownerId,now);
  for(let i=0;i<records.length;i++)await insertPreparation(f.db,scope.sources[i],records[i]);
  const other=randomUUID();await f.db.query('insert into auth.users values($1)',[other]);await f.db.query('insert into studio.teachers values($1,true)',[other]);
  await f.db.exec('set role service_role');
  const reader=createPreparationSourceReader({db:f.client.schema('studio'),ownerId:f.ownerId,enabled:true,now:()=>now});
  assert.equal(await reader.capability(),true);assert.equal((await reader.read(scope)).state,'ready');
  const otherReader=createPreparationSourceReader({db:f.client.schema('studio'),ownerId:other,enabled:true,now:()=>now});
  assert.equal((await otherReader.read(scope)).state,'needs_evidence');
  for(const action of [()=>insertPreparation(f.db,scope.sources[0],{...records[0],recordId:randomUUID()}),()=>f.db.query('update studio.preparation_sources set revoked_at=now()'),()=>f.db.query('delete from studio.preparation_sources')])await assert.rejects(action,e=>e.code==='42501');
  for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(f.db.query('select * from studio.preparation_sources'),e=>e.code==='42501');await assert.rejects(f.rpc('read_preparation_sources',{p_owner:f.ownerId,p_fingerprints:[]}),e=>e.code==='42501');}
  await f.db.exec('reset role');
  await assert.rejects(insertPreparation(f.db,scope.sources[0],{...records[0],recordId:randomUUID()}),e=>e.code==='23505');
  await assert.rejects(f.db.query("update studio.preparation_sources set record=jsonb_set(record,'{checkedScope}','\"changed\"')"),e=>e.code==='PT409');
  await assert.rejects(f.db.query('delete from studio.preparation_sources'),e=>e.code==='PT409');
  await f.db.query('update studio.preparation_sources set revoked_at=now() where id=$1',[records[0].recordId]);
  await assert.rejects(f.db.query('update studio.preparation_sources set revoked_at=null where id=$1',[records[0].recordId]),e=>e.code==='PT409');
  await f.db.exec('set role service_role');assert.equal((await reader.read(scope)).state,'needs_evidence');
  assert.equal((await f.db.query('select studio.worker_execution_enabled() enabled')).rows[0].enabled,false);
  assert.equal((await f.db.query('select enabled from studio.budget_policy')).rows[0].enabled,false);
  for(const table of ['jobs','budget_jobs','budget_calls'])assert.equal((await f.db.query('select count(*)::int n from studio.'+table)).rows[0].n,0);
  await f.db.exec('reset role');await f.db.query('update studio.teachers set active=false where owner_id=$1',[f.ownerId]);await f.db.exec('set role service_role');await assert.rejects(reader.read(scope),/TEACHER_NOT_ALLOWED/);
 }finally{await f.db.close();}
});

test('SQL rejects every JSON null authority field, fake types, hash mismatches and malformed validity',async()=>{
 const f=await workerFixture();try{
  await f.db.exec('reset role');await f.db.exec(readFileSync('supabase/proposals/studio_preparation_sources_v1.sql','utf8'));
  const {scope,records}=preparationFixture(f.ownerId);
  for(const key of Object.keys(records[0]))await assert.rejects(insertPreparation(f.db,scope.sources[0],{...records[0],[key]:null}),e=>['23502','23514'].includes(e.code),key);
  for(const patch of [{schemaVersion:'1'},{limitations:[null]},{aiUseAllowed:'true'},{validUntil:records[0].reviewedAt},{validUntil:'2026-02-30T00:00:00.000Z'},{reviewedAt:'today'},{documentHash:null}])await assert.rejects(insertPreparation(f.db,scope.sources[0],{...records[0],...patch}),e=>e.code==='23514');
  await assert.rejects(insertPreparation(f.db,{...scope.sources[0],summary:'changed'},records[0]),e=>e.code==='23514');
  assert.equal((await f.db.query('select count(*)::int n from studio.preparation_sources')).rows[0].n,0);
 }finally{await f.db.close();}
});

test('reader is disabled by default and sanitizes unavailable or malformed authority',async()=>{
 const {scope}=preparationFixture();let calls=0;
 const db={rpc(){calls++;return {async abortSignal(signal){assert.ok(signal instanceof AbortSignal);throw Error('private upstream detail');}};}};
 const off=createPreparationSourceReader({db,ownerId:scope.ownerId});assert.equal(await off.capability(),false);await assert.rejects(off.read(scope),/SETUP_REQUIRED/);assert.equal(calls,0);
 const enabled=createPreparationSourceReader({db,ownerId:scope.ownerId,enabled:true});await assert.rejects(enabled.read(scope),e=>e.code==='PREPARATION_SOURCES_UNAVAILABLE'&&!e.message.includes('private'));
 const broken=createPreparationSourceReader({db:{rpc(){return {async abortSignal(){return {data:[{verified:true}],error:null};}};}},ownerId:scope.ownerId,enabled:true});await assert.rejects(broken.read(scope),/PREPARATION_SOURCE_RECORD_INVALID/);
});
