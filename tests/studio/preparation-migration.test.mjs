import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {fingerprint} from '../../automation/studio/studio-fingerprint.mjs';
import {backupScope} from '../../automation/studio/backup-scope.mjs';
import {preparationFixture,insertPreparation} from './preparation-fixture.mjs';
const sql=readFileSync('supabase/migrations/20261015234634_studio_source_preparation.sql','utf8');
const tables=backupScope('publication-foundation');
async function fixture(){
 const db=new PGlite();try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;");
  for(const name of ['20261004111955_studio_v1_baseline','20261004111958_studio_v2_conversations','20261007123947_studio_worker_foundation','20261014025610_studio_publication_foundation'])await db.exec(readFileSync('supabase/migrations/'+name+'.sql','utf8'));
  const owner='10000000-0000-4000-8000-000000000001';
  await db.exec("insert into auth.users values('"+owner+"');insert into studio.teachers values('"+owner+"',true);set role service_role;");
  const conversation=(await db.query('select studio.new_conversation_v2($1,$2,gen_random_uuid()) value',[owner,'Synthetic preservation check'])).rows[0].value;
  await db.query('select studio.submit_job_v2($1,$2,gen_random_uuid(),$3,$4,gen_random_uuid(),gen_random_uuid())',[owner,conversation.id,'a'.repeat(64),{schemaVersion:2,payload:{requirements:'Synthetic data only.'}}]);await db.exec('reset role');
  const session={async json(query){const value=Object.values((await db.query(query)).rows[0])[0];return typeof value==='string'?JSON.parse(value):value;}};
  return {db,session,owner};
 }catch(error){await db.close();throw error;}
}
test('migration pins the tested source proposals and backup scope includes the new authority',()=>{
 assert.equal(backupScope('publication-foundation').length,26);assert.equal(backupScope('source-preparation').length,27);
 assert.deepEqual(backupScope('source-preparation'),[...tables,'preparation_sources'].sort());
 for(const name of ['studio_preparation_sources_v1','studio_preparation_admission_v1']){
  const path='supabase/proposals/'+name+'.sql',source=readFileSync(path,'utf8').replaceAll('\r\n','\n');
  assert.ok(sql.includes('-- SOURCE '+path+' SHA256-LF '+createHash('sha256').update(source).digest('hex')));
  assert.ok(sql.includes(source.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'')));
 }
});
test('full foundation migration preserves existing data/functions and adds private, empty authority with every gate closed',async()=>{
 const f=await fixture();try{
  const before=await fingerprint(f.session,{tables});await f.db.exec(sql);const after=await fingerprint(f.session,{tables});
  assert.equal(after.dataHash,before.dataHash);
  const previous=new Set(before.metadata.functions.map(fn=>fn.name+'|'+fn.args));
  assert.deepEqual(after.metadata.functions.filter(fn=>previous.has(fn.name+'|'+fn.args)),before.metadata.functions);
  assert.equal(after.metadata.functions.length-before.metadata.functions.length,10);
  const added=after.metadata.tables.filter(t=>!before.metadata.tables.some(old=>old.relname===t.relname));assert.equal(added.length,1);assert.equal(added[0].relname,'preparation_sources');assert.equal(added[0].relrowsecurity,true);
  assert.equal((await f.db.query('select count(*)::int n from studio.preparation_sources')).rows[0].n,0);
  const gates=(await f.db.query('select studio.worker_execution_enabled() worker,studio.dispatch_execution_enabled() dispatch,studio.publication_dispatch_enabled() publication,studio.publication_api_enabled() api,studio.publication_deploy_enabled() deploy,(select enabled from studio.budget_policy where singleton) budget')).rows[0];assert.ok(Object.values(gates).every(v=>v===false));
  const exposed=(await f.db.query("select count(*)::int n from pg_proc where pronamespace='studio'::regnamespace and (prosecdef or not coalesce('search_path=\"\"'=any(proconfig),false) or has_function_privilege('anon',oid,'EXECUTE') or has_function_privilege('authenticated',oid,'EXECUTE'))")).rows[0].n;assert.equal(exposed,0);
  const evidence=preparationFixture(f.owner);await insertPreparation(f.db,evidence.scope.sources[0],evidence.records[0]);
  const snapshot=await fingerprint(f.session,{tables:backupScope('source-preparation')});assert.equal(snapshot.data.preparation_sources.rows,1);
  await assert.rejects(f.db.exec(sql),/BASELINE_MISMATCH/);await f.db.exec('rollback');assert.equal((await fingerprint(f.session,{tables:backupScope('source-preparation')})).dataHash,snapshot.dataHash);
 }finally{await f.db.close();}
});
test('late migration failure rolls back the complete increment and active execution prevents applying it',async()=>{
 const f=await fixture();try{
  const before=await fingerprint(f.session,{tables});await assert.rejects(f.db.exec(sql.replace(/commit;\s*$/,'select 1/0;\ncommit;')),e=>e.code==='22012');await f.db.exec('rollback');
  const after=await fingerprint(f.session,{tables});assert.equal(after.dataHash,before.dataHash);assert.equal(after.metadataHash,before.metadataHash);
  await f.db.exec('update studio.budget_policy set enabled=true');await assert.rejects(f.db.exec(sql),/BASELINE_MISMATCH/);await f.db.exec('rollback');
  assert.equal((await f.db.query("select to_regclass('studio.preparation_sources') name")).rows[0].name,null);
 }finally{await f.db.close();}
});
