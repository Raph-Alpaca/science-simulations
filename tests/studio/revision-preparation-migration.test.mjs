import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {fingerprint} from '../../automation/studio/studio-fingerprint.mjs';
import {backupScope} from '../../automation/studio/backup-scope.mjs';
import {preparationFixture,insertPreparation} from './preparation-fixture.mjs';
const sql=readFileSync('supabase/migrations/20261016003924_studio_revision_source_refresh.sql','utf8'),tables=backupScope('source-preparation');
async function fixture(){
 const db=new PGlite();try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;");
  for(const name of ['20261004111955_studio_v1_baseline','20261004111958_studio_v2_conversations','20261007123947_studio_worker_foundation','20261014025610_studio_publication_foundation','20261015234634_studio_source_preparation'])await db.exec(readFileSync('supabase/migrations/'+name+'.sql','utf8'));
  const owner='10000000-0000-4000-8000-000000000001';await db.query('insert into auth.users values($1);',[owner]);await db.query('insert into studio.teachers values($1,true)',[owner]);
  const evidence=preparationFixture(owner);await insertPreparation(db,evidence.scope.sources[0],evidence.records[0]);
  const session={async json(query){const value=Object.values((await db.query(query)).rows[0])[0];return typeof value==='string'?JSON.parse(value):value;}};
  return {db,session};
 }catch(error){await db.close();throw error;}
}
test('revision migration contains the exact tested proposal',()=>{
 const path='supabase/proposals/studio_revision_preparation_v1.sql',source=readFileSync(path,'utf8').replaceAll('\r\n','\n');
 assert.ok(sql.includes('-- SOURCE '+path+' SHA256-LF '+createHash('sha256').update(source).digest('hex')));
 assert.ok(sql.includes(source.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'')));
});
test('full migration preserves 27-table data and all authority except the two intended functions and new version',async()=>{
 const f=await fixture();try{
  const before=await fingerprint(f.session,{tables});await f.db.exec(sql);const after=await fingerprint(f.session,{tables});
  assert.equal(after.dataHash,before.dataHash);
  for(const key of Object.keys(before.metadata).filter(k=>k!=='functions'))assert.deepEqual(after.metadata[key],before.metadata[key],key);
  const modified=after.metadata.functions.filter(fn=>{const old=before.metadata.functions.find(b=>b.name===fn.name&&b.args===fn.args);return old&&JSON.stringify(old)!==JSON.stringify(fn);});
  assert.deepEqual(modified.map(f=>f.name).sort(),['assert_revision_ready','read_revision_context']);
  const added=after.metadata.functions.filter(fn=>!before.metadata.functions.some(b=>b.name===fn.name&&b.args===fn.args));assert.deepEqual(added.map(f=>f.name),['revision_preparation_version']);
  for(const fn of modified){const old=before.metadata.functions.find(b=>b.name===fn.name);assert.deepEqual(fn.acl,old.acl);assert.equal(fn.owner,old.owner);}
  const gates=(await f.db.query('select studio.worker_execution_enabled() worker,studio.dispatch_execution_enabled() dispatch,studio.publication_dispatch_enabled() publication,studio.publication_api_enabled() api,studio.publication_deploy_enabled() deploy,(select enabled from studio.budget_policy where singleton) budget')).rows[0];assert.ok(Object.values(gates).every(v=>v===false));
  assert.equal((await f.db.query("select count(*)::int n from pg_proc where pronamespace='studio'::regnamespace and (prosecdef or not coalesce('search_path=\"\"'=any(proconfig),false) or has_function_privilege('anon',oid,'EXECUTE') or has_function_privilege('authenticated',oid,'EXECUTE'))")).rows[0].n,0);
  await f.db.exec('set role service_role');assert.equal((await f.db.query('select studio.revision_preparation_version() version')).rows[0].version,1);
  await assert.rejects(f.db.query('delete from studio.preparation_sources'),e=>e.code==='42501');await f.db.exec('reset role');
  await assert.rejects(f.db.exec(sql),/BASELINE_MISMATCH/);await f.db.exec('rollback');assert.equal((await fingerprint(f.session,{tables})).metadataHash,after.metadataHash);
 }finally{await f.db.close();}
});
test('incomplete migration rolls back and active execution is rejected without changing data or definitions',async()=>{
 const f=await fixture();try{
  const before=await fingerprint(f.session,{tables});await assert.rejects(f.db.exec(sql.replace(/commit;\s*$/,'select 1/0;\ncommit;')),e=>e.code==='22012');await f.db.exec('rollback');
  const after=await fingerprint(f.session,{tables});assert.equal(after.dataHash,before.dataHash);assert.equal(after.metadataHash,before.metadataHash);
  await f.db.exec('update studio.budget_policy set enabled=true');await assert.rejects(f.db.exec(sql),/BASELINE_MISMATCH/);await f.db.exec('rollback');
  assert.equal((await f.db.query("select to_regprocedure('studio.revision_preparation_version()') name")).rows[0].name,null);
 }finally{await f.db.close();}
});
