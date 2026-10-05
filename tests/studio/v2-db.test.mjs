import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003',J='00000000-0000-4000-8000-000000000004',R='00000000-0000-4000-8000-000000000005';
test('isolated PostgreSQL: apply delta, ownership, busy/delete/submit, messages erased and history preserved',async()=>{
 const db=new PGlite();
 try{
 await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;");
 await db.exec(readFileSync('supabase/proposals/studio_v1.sql','utf8'));
 await db.exec("insert into auth.users values ('"+A+"'),('"+B+"'); insert into studio.teachers values ('"+A+"',true),('"+B+"',true);");
 await db.exec(readFileSync('supabase/proposals/studio_v2.sql','utf8'));
 await db.exec(readFileSync('supabase/proposals/studio_runner_v1.sql','utf8'));
 assert.equal((await db.query("select has_table_privilege('authenticated','studio.dispatch_intents','insert') allowed")).rows[0].allowed,false);
 await db.exec('set role service_role');
 const rpc=async(sql,args)=>(await db.query(sql,args)).rows[0].result;
 const create=()=>rpc('select studio.new_conversation_v2($1,$2,$3) result',[A,'Fixture',C]);
 const c=await create();assert.equal((await create()).id,c.id);
 await assert.rejects(()=>rpc('select studio.edit_conversation_v2($1,$2,$3,$4) result',[A,c.id,'delete',null]),e=>e.code==='PT412');
 assert.equal((await db.query('select title,deleted_at from studio.conversations where id=$1',[c.id])).rows[0].deleted_at,null);
 await assert.rejects(()=>db.exec('create or replace function studio.conversation_delete_enabled_v2() returns boolean language sql as $$select true$$'),e=>e.code==='42501');
 // Only this disposable DB enables deletion; no production activation SQL is run.
 await db.exec("reset role; create or replace function studio.conversation_delete_enabled_v2() returns boolean language sql security invoker set search_path='' as $$select true$$; set role service_role;");
 await assert.rejects(()=>rpc('select studio.new_conversation_v2($1,$2,$3) result',[A,'   ',R]));
 await assert.rejects(()=>rpc('select studio.edit_conversation_v2($1,$2,$3,$4) result',[B,c.id,'rename','Attack']),e=>e.code==='PT404');
 await rpc('select studio.edit_conversation_v2($1,$2,$3,$4) result',[A,c.id,'rename','Renamed']);
 const snapshot={schemaVersion:2,conversationId:c.id,clientRequestId:R,operation:'create_simulation',payload:{topic:'Fixture',grade:3,unit:'Unit',requirements:'Independent private specification',targetContentId:null,expectedVersion:null}};
 const submit=()=>rpc('select studio.submit_job_v2($1,$2,$3,$4,$5,$6,$7) result',[A,c.id,R,'a'.repeat(64),snapshot,J,R]);
 const j=await submit();assert.equal(j.request_version,2);assert.equal(j.school_year,null);assert.equal((await submit()).id,j.id);
 await assert.rejects(()=>rpc('select studio.edit_conversation_v2($1,$2,$3,$4) result',[A,c.id,'delete',null]),e=>e.code==='PT423');
 await rpc('select studio.transition_mock_job($1,$2,0,$3,$4,$5,null,$6) result',[A,J,C,'simulate_error','failed','MOCK_SIMULATED_FAILURE']);
 await db.exec('reset role');
 await db.query('insert into studio.reviews(job_id,owner_id,role,candidate_hash,evidence_version,result) values($1,$2,$3,$4,$5,$6)',[J,A,'independent','hash','v1',{}]);
 await db.query('insert into studio.approvals(id,job_id,owner_id,content_id,candidate_hash,artifact_hash,policy_version,checks_version,approver,approved_at) values($1,$2,$3,$4,$5,$6,$7,$8,$3,now())',[R,J,A,'fixture-content','hash','artifact','v1','v1']);
 await db.query('insert into studio.releases(job_id,owner_id,content_id,action,approval_id,candidate_hash,artifact_hash,release_commit,run_id,run_attempt,public_url,verification_state) values($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11)',[J,A,'fixture-content','fixture-only',R,'hash','artifact','fixture-commit','fixture-run','https://example.invalid/fixture','fixture-only']);
 await db.exec('set role service_role');
 await rpc('select studio.edit_conversation_v2($1,$2,$3,$4) result',[A,c.id,'delete',null]);
 // Reproduce why rolling back to the old service-role reader is forbidden after deletion.
 assert.equal((await db.query('select title from studio.conversations where id=$1',[c.id])).rows[0].title,'[deleted]');
 assert.equal((await db.query('select id from studio.conversations where id=$1 and deleted_at is null',[c.id])).rows.length,0);
 assert.equal((await db.query('select count(*)::int n from studio.messages')).rows[0].n,0);
 for(const table of ['jobs','job_events','reviews','approvals','releases'])assert.ok((await db.query('select count(*)::int n from studio.'+table)).rows[0].n>0);
 assert.deepEqual((await db.query('select request_snapshot from studio.jobs')).rows[0].request_snapshot,snapshot);
 await assert.rejects(submit,e=>e.code==='PT404');
 // Concurrent submissions on this single-connection embedded engine are queued; proves both outcomes, not multi-connection lock timing.
 const race=await rpc('select studio.new_conversation_v2($1,$2,$3) result',[A,'Race',R]);
 const late=()=>rpc('select studio.submit_job_v2($1,$2,$3,$4,$5,$6,$7) result',[A,race.id,C,'b'.repeat(64),{...snapshot,conversationId:race.id},B,C]);
 const outcomes=await Promise.allSettled([rpc('select studio.edit_conversation_v2($1,$2,$3,$4) result',[A,race.id,'delete',null]),late()]);
 assert.equal(outcomes[0].status,'fulfilled');assert.equal(outcomes[1].status,'rejected');assert.equal(outcomes[1].reason.code,'PT404');
 await db.exec("reset role; set role authenticated; select set_config('request.jwt.claim.sub','"+A+"',false)");
 assert.equal((await db.query('select * from studio.conversations')).rows.length,0);
 await assert.rejects(()=>db.query('update studio.conversations set title=$1',['forged']),e=>e.code==='42501');
 await db.exec('reset role');
 await assert.rejects(()=>db.exec(readFileSync('supabase/proposals/studio_v2.sql','utf8')));
 await db.exec('rollback');
 assert.equal((await db.query('select count(*)::int n from studio.jobs')).rows[0].n,1);
 }finally{await db.close();}
});

test('isolated PostgreSQL preserves a pre-migration v1 snapshot/hash and legacy retry',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;");
 await db.exec(readFileSync('supabase/proposals/studio_v1.sql','utf8'));
 await db.exec("insert into auth.users values ('"+A+"');insert into studio.teachers values('"+A+"',true);set role service_role;");
 const c=(await db.query('select studio.new_conversation($1,$2) c',[A,'Legacy'])).rows[0].c;
 const snapshot={schemaVersion:1,conversationId:c.id,clientRequestId:R,operation:'create_simulation',payload:{topic:'Legacy',grade:3,unit:'Unit',requirements:'Legacy specification',schoolYear:2024,targetContentId:null,expectedVersion:null}};
 const args=[A,c.id,R,'f'.repeat(64),snapshot,J,C];
 await db.query('select studio.submit_job($1,$2,$3,$4,$5,$6,$7)',args);
 await db.query('select studio.transition_mock_job($1,$2,0,$3,$4,$5,null,$6)',[A,J,C,'simulate_error','failed','MOCK_SIMULATED_FAILURE']);
 await db.exec('reset role');await db.exec(readFileSync('supabase/proposals/studio_v2.sql','utf8'));await db.exec('set role service_role');
 const before=(await db.query('select request_snapshot,payload_hash,school_year from studio.jobs where id=$1',[J])).rows[0];assert.deepEqual(before.request_snapshot,snapshot);assert.equal(before.payload_hash,'f'.repeat(64));assert.equal(before.school_year,2024);
 assert.equal((await db.query('select studio.conversation_delete_enabled_v2() enabled')).rows[0].enabled,false);
 assert.ok((await db.query('select studio.new_conversation($1,$2) c',[A,'Legacy after delta'])).rows[0].c.id);
 assert.equal((await db.query("select to_regclass('studio.dispatch_intents') runner")).rows[0].runner,null);
 const retryArgs=[A,c.id,C,'e'.repeat(64),{...snapshot,clientRequestId:C},B,R,J,1];
 const q='select studio.submit_job($1,$2,$3,$4,$5,$6,$7,$8,$9) j';const retry=(await db.query(q,retryArgs)).rows[0].j;
 assert.equal(retry.school_year,2024);assert.equal(retry.retry_of,J);assert.equal(retry.run_attempt,2);assert.equal((await db.query(q,retryArgs)).rows[0].j.id,retry.id);
 assert.deepEqual((await db.query('select request_snapshot from studio.jobs where id=$1',[J])).rows[0].request_snapshot,snapshot);
 }finally{await db.close();}
});
