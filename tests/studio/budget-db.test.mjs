import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const hash='a'.repeat(64);
async function fixture(){
 const db=new PGlite();
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;");
 for(const name of ['studio_v1','studio_v2','studio_budget_v1'])await db.exec(readFileSync('supabase/proposals/'+name+'.sql','utf8'));
 await db.query('insert into auth.users values($1),($2)',[owner,other]);
 await db.query('insert into studio.teachers values($1,true),($2,true)',[owner,other]);
 // Future runner capability is simulated only in this disposable fixture.
 // The budget proposal itself deliberately does not enable real execution.
 await db.exec("alter table studio.jobs drop constraint jobs_execution_mode_check;alter table studio.jobs add constraint jobs_execution_mode_check check(execution_mode in ('real','mock'));");
 const rpc=async(name,args)=>(await db.query('select studio.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
 const make=async(who=owner,mode='real')=>{
  await db.exec('reset role');
  const conversation=await rpc('new_conversation',[who,'Budget fixture']);const job=randomUUID();
  await db.query("insert into studio.jobs(id,owner_id,conversation_id,operation,request_snapshot,client_request_id,idempotency_key,payload_hash,run_id,execution_mode) values($1,$2,$3,'create_simulation','{}',$4,$5,$6,'fixture',$7)",[job,who,conversation.id,randomUUID(),randomUUID(),hash,mode]);
  await db.exec('set role service_role');return job;
 };
 const enable=()=>db.exec('reset role;update studio.budget_policy set enabled=true;set role service_role;');
 const terminal=async job=>{await db.exec('reset role');await db.query("update studio.jobs set state='failed' where id=$1",[job]);await db.exec('set role service_role');};
 return {db,rpc,make,enable,terminal};
}
test('budget disabled by default; no anonymous/browser table or RPC access',async()=>{
 const f=await fixture();try{
  const job=await f.make();await assert.rejects(()=>f.rpc('reserve_job_budget',[owner,job]),e=>e.code==='PT412');
  await f.db.exec('reset role;set role authenticated');
  for(const table of ['budget_policy','budget_jobs','budget_calls'])await assert.rejects(()=>f.db.query('select * from studio.'+table),e=>e.code==='42501');
  await assert.rejects(()=>f.rpc('reserve_job_budget',[owner,job]),e=>e.code==='42501');
 }finally{await f.db.close();}
});
test('job reservation checks ownership and real mode, is idempotent and serializes across owners',async()=>{
 const f=await fixture();try{
  const job=await f.make(),second=await f.make(other),mock=await f.make(owner,'mock');await f.enable();
  await assert.rejects(()=>f.rpc('reserve_job_budget',[other,job]),e=>e.code==='PT409');
  await assert.rejects(()=>f.rpc('reserve_job_budget',[owner,mock]),e=>e.code==='PT409');
  const first=await f.rpc('reserve_job_budget',[owner,job]);assert.equal(first.limit_usd_micros,500000);
  assert.deepEqual(await f.rpc('reserve_job_budget',[owner,job]),first);
  await assert.rejects(()=>f.rpc('reserve_job_budget',[other,second]),e=>e.code==='PT423');
  assert.equal((await f.db.query('select count(*)::int n from studio.budget_jobs')).rows[0].n,1);
 }finally{await f.db.close();}
});
test('reserve before calling; duplicate receipt cannot send again; max cost, calls and cancellation enforced',async()=>{
 const f=await fixture();try{
  const job=await f.make();await f.enable();await f.rpc('reserve_job_budget',[owner,job]);
  const call=randomUUID();const args=[job,call,hash,'developer',100000];
  assert.equal((await f.rpc('reserve_ai_call',args)).newReservation,true);
  assert.equal((await f.rpc('reserve_ai_call',args)).newReservation,false);
  await assert.rejects(()=>f.rpc('reserve_ai_call',[job,call,'b'.repeat(64),'developer',100000]),e=>e.code==='PT409');
  await assert.rejects(()=>f.rpc('reserve_ai_call',[job,randomUUID(),hash,'developer',1]),e=>e.code==='PT423');
  await assert.rejects(()=>f.rpc('reserve_ai_call',[job,randomUUID(),hash,'developer',400001]),e=>e.code==='PT429');
  await f.rpc('settle_ai_call',[job,call,50000,false]);await f.rpc('settle_ai_call',[job,call,50000,false]);
  for(let i=1;i<9;i++){const id=randomUUID();await f.rpc('reserve_ai_call',[job,id,hash,'reviewer',1000]);await f.rpc('settle_ai_call',[job,id,1,false]);}
  await assert.rejects(()=>f.rpc('reserve_ai_call',[job,randomUUID(),hash,'reviewer',1]),e=>e.code==='PT429');
  await assert.rejects(()=>f.rpc('close_job_budget',[job]),e=>e.code==='PT409');
  await f.terminal(job);const closed=await f.rpc('close_job_budget',[job]);assert.equal(closed.spent_usd_micros,50008);assert.equal(closed.held_usd_micros,0);
  await assert.rejects(()=>f.rpc('reserve_ai_call',[job,randomUUID(),hash,'developer',1]),e=>e.code==='PT409');
 }finally{await f.db.close();}
});
test('uncertain response retains funds and global slot; invoice overrun disables the policy',async()=>{
 const f=await fixture();try{
  const job=await f.make(),second=await f.make(other);await f.enable();await f.rpc('reserve_job_budget',[owner,job]);
  const call=randomUUID();await f.rpc('reserve_ai_call',[job,call,hash,'developer',1000]);
  const breach=await f.rpc('settle_ai_call',[job,call,1001,false]);assert.equal(breach.budgetBreach,true);
  assert.equal((await f.db.query('select enabled from studio.budget_policy')).rows[0].enabled,false);
  await f.terminal(job);await assert.rejects(()=>f.rpc('close_job_budget',[job]),e=>e.code==='PT409');
  await f.enable();await assert.rejects(()=>f.rpc('reserve_job_budget',[other,second]),e=>e.code==='PT423');
  assert.equal((await f.db.query('select held_usd_micros from studio.budget_jobs where job_id=$1',[job])).rows[0].held_usd_micros,1000);
  await assert.rejects(()=>f.rpc('settle_ai_call',[job,call,0,false]),e=>e.code==='PT409');
 }finally{await f.db.close();}
});
test('10 attempts per Seoul month even with zero cost; rollover never clears a running job',async()=>{
 const f=await fixture();try{
  await f.enable();
  for(let i=0;i<10;i++){const job=await f.make();await f.rpc('reserve_job_budget',[owner,job]);await f.terminal(job);await f.rpc('close_job_budget',[job]);}
  const eleventh=await f.make();await assert.rejects(()=>f.rpc('reserve_job_budget',[owner,eleventh]),e=>e.code==='PT429');
  await f.db.exec("reset role;update studio.budget_jobs set budget_month=(budget_month-interval '1 month')::date;set role service_role;");
  await f.rpc('reserve_job_budget',[owner,eleventh]);
  await f.db.exec("reset role;update studio.budget_jobs set budget_month=(budget_month-interval '1 month')::date,expires_at=now()-interval '1 second' where state='active';set role service_role;");
  const next=await f.make(other);await assert.rejects(()=>f.rpc('reserve_job_budget',[other,next]),e=>e.code==='PT423');
  await assert.rejects(()=>f.rpc('reserve_ai_call',[eleventh,randomUUID(),hash,'developer',1]),e=>e.code==='PT409');
 }finally{await f.db.close();}
});
test('project monthly money limit includes spent costs and the next full job reservation',async()=>{
 const f=await fixture();try{
  const first=await f.make();await f.db.exec('reset role;update studio.budget_policy set monthly_usd_micros=700000;');await f.enable();
  await f.rpc('reserve_job_budget',[owner,first]);const call=randomUUID();
  await f.rpc('reserve_ai_call',[first,call,hash,'developer',500000]);await f.rpc('settle_ai_call',[first,call,300000,false]);
  await assert.rejects(()=>f.rpc('reserve_ai_call',[first,randomUUID(),hash,'reviewer',200001]),e=>e.code==='PT429');
  await f.terminal(first);await f.rpc('close_job_budget',[first]);
  const next=await f.make(other);await assert.rejects(()=>f.rpc('reserve_job_budget',[other,next]),e=>e.code==='PT429');
 }finally{await f.db.close();}
});
test('lost provider response is uncertain, never refunded or automatically retried',async()=>{
 const f=await fixture();try{
  const job=await f.make();await f.enable();await f.rpc('reserve_job_budget',[owner,job]);const call=randomUUID();
  await f.rpc('reserve_ai_call',[job,call,hash,'developer',100000]);
  assert.equal((await f.rpc('settle_ai_call',[job,call,null,true])).state,'uncertain');
  assert.equal((await f.rpc('settle_ai_call',[job,call,null,true])).state,'uncertain');
  await assert.rejects(()=>f.rpc('reserve_ai_call',[job,call,hash,'developer',100000]),e=>e.code==='PT409');
  await f.terminal(job);await assert.rejects(()=>f.rpc('close_job_budget',[job]),e=>e.code==='PT409');
  const reserved=(await f.db.query('select held_usd_micros,spent_usd_micros from studio.budget_jobs')).rows[0];assert.deepEqual(reserved,{held_usd_micros:100000,spent_usd_micros:0});
 }finally{await f.db.close();}
});
