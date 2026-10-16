import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {fingerprint} from '../../automation/studio/studio-fingerprint.mjs';
import {backupScope} from '../../automation/studio/backup-scope.mjs';

test('restoration rehearses new objects as the production owner so full metadata compares exactly',async()=>{
 const db=new PGlite();try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create role restore_admin superuser;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;");
  for(const name of ['20261004111955_studio_v1_baseline','20261004111958_studio_v2_conversations','20261007123947_studio_worker_foundation','20261014025610_studio_publication_foundation'])await db.exec(readFileSync('supabase/migrations/'+name+'.sql','utf8'));
  const session={async json(query){const value=Object.values((await db.query(query)).rows[0])[0];return typeof value==='string'?JSON.parse(value):value;}};
  const sql=readFileSync('supabase/migrations/20261015234634_studio_source_preparation.sql','utf8');
  await db.exec('begin;set role restore_admin;');assert.equal((await db.query('select current_user name')).rows[0].name,'restore_admin');
  await db.exec('set role postgres;'+sql.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,''));
  const rehearsed=await fingerprint(session,{tables:backupScope('source-preparation')});
  assert.equal(rehearsed.metadata.tables.find(t=>t.relname==='preparation_sources').owner,'postgres');
  await db.exec('rollback;reset role;');await db.exec(sql);const actual=await fingerprint(session,{tables:backupScope('source-preparation')});
  assert.equal(actual.metadataHash,rehearsed.metadataHash);assert.equal(actual.dataHash,rehearsed.dataHash);
 }finally{await db.close();}
});
