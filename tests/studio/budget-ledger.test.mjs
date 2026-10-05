import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createBudgetLedger} from '../../automation/runner/budget-ledger.mjs';
import {createBoundedResponses,PRICING} from '../../automation/runner/bounded-responses.mjs';

test('Responses adapter uses actual SQL reservation, settlement and duplicate rejection through ledger',async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;");
  for(const name of ['studio_v1','studio_v2','studio_budget_v1'])await db.exec(readFileSync('supabase/proposals/'+name+'.sql','utf8'));
  const ownerId=randomUUID(),jobId=randomUUID();
  await db.query('insert into auth.users values($1)',[ownerId]);await db.query('insert into studio.teachers values($1,true)',[ownerId]);
  const conversation=(await db.query("select studio.new_conversation($1,'Synthetic ledger fixture') value",[ownerId])).rows[0].value;
  // Real-mode allowance exists only in this disposable test database.
  await db.exec('alter table studio.jobs drop constraint jobs_execution_mode_check;update studio.budget_policy set enabled=true;');
  await db.query("insert into studio.jobs(id,owner_id,conversation_id,operation,request_snapshot,client_request_id,idempotency_key,payload_hash,run_id,execution_mode) values($1,$2,$3,'create_simulation','{}',$4,$5,$6,'fixture','real')",[jobId,ownerId,conversation.id,randomUUID(),randomUUID(),'a'.repeat(64)]);
  await db.exec('set role service_role');
  const names=new Set(['reserve_job_budget','reserve_ai_call','settle_ai_call','close_job_budget']);
  const client={schema(schema){assert.equal(schema,'studio');return {rpc(name,params){assert.ok(names.has(name));return {async abortSignal(signal){
   assert.ok(signal instanceof AbortSignal);
   try{return {data:(await db.query('select studio.'+name+'('+Object.keys(params).map((p,i)=>p+'=> $'+(i+1)).join(',')+') value',Object.values(params))).rows[0].value,error:null};}
   catch(error){return {data:null,error};}
  }};}};}};
  const ledger=createBudgetLedger(client);await ledger.reserveJob({ownerId,jobId});
  let requests=0;const call=createBoundedResponses({apiKey:'sk-'+'fixture-only'.repeat(3),ledger,now:()=>Date.parse('2026-10-04T00:00:00Z'),transport:async url=>{
   requests++;return new Response(JSON.stringify(url.endsWith('/input_tokens')?{object:'response.input_tokens',input_tokens:100}:
    {model:PRICING.model,service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:200},output:[{type:'message',content:[{type:'output_text',text:'{}'}]}]}));
  }});
  const args={jobId,callId:randomUUID(),role:'developer',instructions:'Synthetic fixture.',input:'Synthetic fixture.'};
  await call(args);await assert.rejects(()=>call(args),/CALL_ALREADY_RESERVED/);assert.equal(requests,2);
  const budget=(await db.query('select * from studio.budget_jobs where job_id=$1',[jobId])).rows[0];
  assert.equal(budget.call_count,1);assert.equal(budget.spent_usd_micros,975);assert.equal(budget.held_usd_micros,0);
  await assert.rejects(()=>ledger.closeJob({jobId}),/BUDGET_DATABASE_REJECTED/);
  await db.exec('reset role');await db.query("update studio.jobs set state='needs_input' where id=$1",[jobId]);await db.exec('set role service_role');
  assert.equal((await ledger.closeJob({jobId})).state,'closed');
 }finally{await db.close();}
});
test('wrong receipt identity and raw database errors are never accepted or disclosed',async()=>{
 for(const response of [{data:{job_id:'wrong',state:'active'},error:null},{data:null,error:{message:'private error'}}]){
  const ledger=createBudgetLedger({schema(){return {rpc(){return {abortSignal:async()=>response};}};}});
  await assert.rejects(()=>ledger.reserveJob({ownerId:randomUUID(),jobId:randomUUID()}),e=>e.code==='BUDGET_DATABASE_REJECTED'&&!e.message.includes('private'));
 }
});
