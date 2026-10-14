import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {fingerprint} from '../../automation/studio/studio-fingerprint.mjs';
import {backupScope,FOUNDATION_TABLES,PUBLICATION_TABLES,fingerprintScope} from '../../automation/studio/backup-scope.mjs';
const sql=readFileSync('supabase/migrations/20261014025610_studio_publication_foundation.sql','utf8');
const excluded={approvals:['release_review_id','release_request_id'],releases:['publication_id','publication_outcome_id']};
async function fixture(){
 const db=new PGlite();
 try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;");
 for(const name of ['20261004111955_studio_v1_baseline','20261004111958_studio_v2_conversations','20261007123947_studio_worker_foundation'])await db.exec(readFileSync('supabase/migrations/'+name+'.sql','utf8'));
 const owner='10000000-0000-4000-8000-000000000001';
 await db.exec("insert into auth.users values('"+owner+"');insert into studio.teachers values('"+owner+"',true);set role service_role;");
 const c=(await db.query('select studio.new_conversation_v2($1,$2,gen_random_uuid()) value',[owner,'Synthetic migration preservation'])).rows[0].value;
 await db.query("select studio.submit_job_v2($1,$2,gen_random_uuid(),$3,$4,gen_random_uuid(),gen_random_uuid())",[owner,c.id,'a'.repeat(64),{schemaVersion:2,payload:{requirements:'Synthetic preservation check'}}]);
 await db.exec('reset role');
 const session={async json(query){const value=Object.values((await db.query(query)).rows[0])[0];return typeof value==='string'?JSON.parse(value):value;}};
 return {db,session,owner};
 }catch(error){await db.close();throw error;}
}
test('backup scope is explicit and fingerprint identifiers reject arbitrary SQL',()=>{
 assert.equal(backupScope().length,8);assert.equal(backupScope('worker-foundation').length,18);
 assert.throws(()=>backupScope('discover'),/SCOPE_REJECTED/);
 assert.throws(()=>fingerprintScope(['jobs;delete']),/SCOPE_REJECTED/);
 assert.throws(()=>fingerprintScope(['jobs'],{unknown:['id']}),/SCOPE_REJECTED/);
});
test('publication migration preserves all foundation rows, grants and disabled gates',async()=>{
 const f=await fixture();try{
 const before=await fingerprint(f.session,{tables:FOUNDATION_TABLES});await f.db.exec(sql);
 const after=await fingerprint(f.session,{tables:FOUNDATION_TABLES,excludeColumns:excluded});assert.equal(after.dataHash,before.dataHash);
 const tables=(await f.db.query("select relname,relrowsecurity from pg_class where relnamespace='studio'::regnamespace and relkind='r'")).rows;assert.equal(tables.length,26);assert.ok(tables.every(t=>t.relrowsecurity));
 for(const table of PUBLICATION_TABLES){assert.equal(Number((await f.db.query('select count(*) n from studio.'+table)).rows[0].n),0);for(const role of ['anon','authenticated'])assert.equal((await f.db.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed",[role,'studio.'+table])).rows[0].allowed,false);}
 const gates=(await f.db.query("select studio.worker_execution_enabled() worker,studio.dispatch_execution_enabled() dispatch,studio.conversation_delete_enabled_v2() deletion,studio.publication_dispatch_enabled() publication,studio.publication_api_enabled() api,studio.publication_deploy_enabled() deploy,(select enabled from studio.budget_policy where singleton) budget")).rows[0];assert.ok(Object.values(gates).every(v=>v===false));
 const bad=await f.db.query("select count(*) n from pg_proc where pronamespace='studio'::regnamespace and (prosecdef or not coalesce('search_path=\"\"'=any(proconfig),false) or has_function_privilege('anon',oid,'EXECUTE') or has_function_privilege('authenticated',oid,'EXECUTE'))");assert.equal(Number(bad.rows[0].n),0);
 await assert.rejects(()=>f.db.exec(sql),e=>e.message.includes('BASELINE_MISMATCH'));await f.db.exec('rollback');assert.equal((await fingerprint(f.session,{tables:FOUNDATION_TABLES,excludeColumns:excluded})).dataHash,before.dataHash);
 }finally{await f.db.close();}
});
test('late migration failure rolls back every new table and existing function change',async()=>{
 const f=await fixture();try{
 const before=await fingerprint(f.session,{tables:FOUNDATION_TABLES});
 await assert.rejects(()=>f.db.exec(sql.replace(/commit;\s*$/,"select 1/0;\ncommit;")),e=>e.code==='22012');await f.db.exec('rollback');
 const after=await fingerprint(f.session,{tables:FOUNDATION_TABLES});assert.equal(after.dataHash,before.dataHash);assert.equal(after.metadataHash,before.metadataHash);
 }finally{await f.db.close();}
});
test('extended fingerprints detect worker-only data drift, legacy shape stays compatible',async()=>{
 const f=await fixture();try{
 const before=await fingerprint(f.session,{tables:FOUNDATION_TABLES}),legacy=await fingerprint(f.session);
 await f.db.exec('update studio.budget_policy set enabled=true');
 assert.notEqual((await fingerprint(f.session,{tables:FOUNDATION_TABLES})).dataHash,before.dataHash);
 assert.equal((await fingerprint(f.session)).dataHash,legacy.dataHash);
 }finally{await f.db.close();}
});
