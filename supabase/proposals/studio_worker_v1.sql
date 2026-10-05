-- REVIEW ONLY: apply after studio_v2 and studio_budget_v1. Not deployed.
-- Service-only boundary; workers must use the authenticated report API, never
-- receive service_role credentials. Runtime gate stays false until integration.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table studio.jobs drop constraint jobs_execution_mode_check;
alter table studio.jobs add constraint jobs_execution_mode_check check(execution_mode in ('mock','real'));
alter table studio.jobs drop constraint jobs_state_check;
alter table studio.jobs add constraint jobs_state_check check(state in ('queued','running','cancel_requested','cancelled','failed','needs_input','awaiting_approval'));
alter table studio.job_events drop constraint job_events_command_type_check;
alter table studio.job_events add constraint job_events_command_type_check check(command_type in ('submit','advance','cancel','simulate_error','worker_start','worker_finish'));
grant update(run_id,source_snapshot_hash,policy_version,limits_snapshot,repair_count) on studio.jobs to service_role;

create table studio.worker_runs (
 job_id uuid primary key, owner_id uuid not null,
 source_snapshot_hash text not null check(source_snapshot_hash ~ '^[a-f0-9]{64}$'),
 approved_input text not null check(octet_length(approved_input) between 2 and 150000),
 input_review_id uuid not null, input_approved_at timestamptz not null default now(),
 repository_id bigint not null default 1368255570 check(repository_id=1368255570),
 workflow_run_id bigint check(workflow_run_id>0), workflow_run_attempt integer check(workflow_run_attempt=1),
 state text not null default 'queued' check(state in ('queued','claimed','finished','uncertain')),
 claimed_at timestamptz, finished_at timestamptz,
 event_count integer not null default 0 check(event_count between 0 and 40),
 evidence_bytes integer not null default 0 check(evidence_bytes between 0 and 16000000),
 outcome text, candidate_hash text, reason text,
 foreign key(job_id,owner_id) references studio.jobs(id,owner_id),
 unique(repository_id,workflow_run_id,workflow_run_attempt),
 check((workflow_run_id is null)=(workflow_run_attempt is null)),
 check(jsonb_typeof(approved_input::jsonb)='object'),
 check(encode(sha256(convert_to(approved_input,'UTF8')),'hex')=source_snapshot_hash)
);
create table studio.worker_evidence (
 job_id uuid not null references studio.worker_runs(job_id), event_id uuid not null,
 sequence integer not null check(sequence between 1 and 40),
 kind text not null check(kind in ('role_output','candidate','runtime_evidence','review')),
 body text not null check(octet_length(body) between 2 and 2100000),
 body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 primary key(job_id,event_id), unique(job_id,sequence),
 check(jsonb_typeof(body::jsonb)='object'),
 check(encode(sha256(convert_to(body,'UTF8')),'hex')=body_hash)
);
alter table studio.worker_runs enable row level security;
alter table studio.worker_evidence enable row level security;
revoke all on studio.worker_runs,studio.worker_evidence from public,anon,authenticated,service_role;
grant select,insert,update on studio.worker_runs to service_role;
grant select,insert on studio.worker_evidence to service_role;
create function studio.worker_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select false$$;

-- Lock order across worker RPCs: project budget, teacher/conversation when
-- submitting, job, worker row. No worker RPC acquires the budget lock last.
create function studio.submit_worker_job(p_owner uuid,p_conversation uuid,p_client uuid,p_job uuid,p_idempotency uuid,p_request jsonb,p_input text,p_hash text,p_input_review uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare row studio.jobs; prior studio.worker_runs;
begin
 if not studio.worker_execution_enabled() then raise sqlstate 'PT412'; end if;
 perform 1 from studio.budget_policy where singleton and enabled for update;
 if not found then raise sqlstate 'PT412'; end if;
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 perform 1 from studio.conversations where id=p_conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 if p_input_review is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_input is null or octet_length(p_input)>150000
 or encode(sha256(convert_to(p_input,'UTF8')),'hex')<>p_hash
 or (p_request->>'schemaVersion')::integer is distinct from 2 or p_request->'payload' ? 'schoolYear'
 or jsonb_typeof(p_input::jsonb->'input') is distinct from 'object' or jsonb_typeof(p_input::jsonb->'context') is distinct from 'object'
 then raise sqlstate 'PT400'; end if;
 select * into row from studio.jobs where owner_id=p_owner and conversation_id=p_conversation and client_request_id=p_client;
 if found then
  select * into prior from studio.worker_runs where job_id=row.id;
  if not found or row.execution_mode<>'real' or row.request_snapshot is distinct from p_request or prior.source_snapshot_hash<>p_hash or prior.input_review_id<>p_input_review then raise sqlstate 'PT409'; end if;
  return to_jsonb(row);
 end if;
 if (select count(*) from studio.jobs where owner_id=p_owner and conversation_id=p_conversation)>=100 then raise sqlstate 'PT429'; end if;
 if exists(select 1 from studio.jobs where owner_id=p_owner and state in ('queued','running','cancel_requested')) then raise sqlstate 'PT423'; end if;
 insert into studio.jobs(id,owner_id,conversation_id,operation,request_version,request_snapshot,target_content_id,expected_version,client_request_id,idempotency_key,payload_hash,execution_mode,run_id,source_snapshot_hash,policy_version,limits_snapshot)
 values(p_job,p_owner,p_conversation,'create_simulation',2,p_request,p_input::jsonb#>>'{context,contentId}',p_request#>>'{payload,expectedVersion}',p_client,p_idempotency,p_hash,'real','pending:'||p_job,p_hash,'studio-budget-2026-10-04','{"maxCalls":9,"maxRepairs":2,"maxSeconds":1200}') returning * into row;
 insert into studio.worker_runs(job_id,owner_id,source_snapshot_hash,approved_input,input_review_id) values(p_job,p_owner,p_hash,p_input,p_input_review);
 perform studio.reserve_job_budget(p_owner,p_job);
 insert into studio.messages(conversation_id,owner_id,role,body,client_request_id) values(p_conversation,p_owner,'user',p_request#>>'{payload,requirements}',p_client);
 insert into studio.job_events(job_id,owner_id,sequence,state_version,command_id,command_type,to_state,actor_type,run_id,run_attempt)
 values(p_job,p_owner,0,0,p_client,'submit','queued','server',row.run_id,1);
 return to_jsonb(row);
end $$;

-- Binding is performed by the trusted dispatcher after a verified GitHub result.
-- This RPC alone does not verify a JWT or authorize an HTTP request.
create function studio.bind_worker_run(p_job uuid,p_run bigint,p_attempt integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.worker_runs;
begin
 perform 1 from studio.budget_policy where singleton for update;
 perform 1 from studio.jobs where id=p_job and execution_mode='real' for update;
 if not found then raise sqlstate 'PT404'; end if;
 select * into item from studio.worker_runs where job_id=p_job for update;
 if not found then raise sqlstate 'PT404'; end if;
 if p_run is null or p_run<=0 or p_attempt is distinct from 1 then raise sqlstate 'PT400'; end if;
 if item.workflow_run_id is not null then
  if item.workflow_run_id<>p_run or item.workflow_run_attempt<>p_attempt then raise sqlstate 'PT409'; end if;
  return to_jsonb(item)-'approved_input';
 end if;
 if item.state<>'queued' or not exists(select 1 from studio.jobs where id=p_job and state='queued') then raise sqlstate 'PT409'; end if;
 update studio.worker_runs set workflow_run_id=p_run,workflow_run_attempt=p_attempt where job_id=p_job returning * into item;
 update studio.jobs set run_id=p_run::text where id=p_job;
 return to_jsonb(item)-'approved_input';
end $$;

create function studio.claim_worker_run(p_job uuid,p_run bigint,p_attempt integer,p_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.worker_runs; row studio.jobs;
begin
 perform 1 from studio.budget_policy where singleton and enabled for update;
 if not found or not studio.worker_execution_enabled() then raise sqlstate 'PT412'; end if;
 select * into row from studio.jobs where id=p_job and execution_mode='real' for update;
 if not found then raise sqlstate 'PT404'; end if;
 select * into item from studio.worker_runs where job_id=p_job for update;
 if item.workflow_run_id is distinct from p_run or item.workflow_run_attempt is distinct from p_attempt or item.source_snapshot_hash is distinct from p_hash or p_run is null then raise sqlstate 'PT403'; end if;
 if item.state<>'queued' then return jsonb_build_object('claimed',false); end if;
 if row.state<>'queued' then raise sqlstate 'PT409'; end if;
 perform studio.reserve_job_budget(row.owner_id,p_job);
 update studio.worker_runs set state='claimed',claimed_at=clock_timestamp() where job_id=p_job;
 update studio.jobs set state='running',state_version=state_version+1,phase='source_review',updated_at=now() where id=p_job returning * into row;
 insert into studio.job_events(job_id,owner_id,sequence,state_version,command_id,command_type,from_state,to_state,phase,actor_type,run_id,run_attempt)
 values(p_job,row.owner_id,row.state_version,row.state_version,gen_random_uuid(),'worker_start','queued','running',row.phase,'worker',row.run_id,1);
 return jsonb_build_object('claimed',true);
end $$;

create function studio.worker_checkpoint(p_job uuid,p_run bigint,p_attempt integer,p_hash text) returns boolean
language sql security invoker set search_path='' as $$
 select studio.worker_execution_enabled() and exists(
 select 1 from studio.worker_runs r join studio.jobs j on j.id=r.job_id join studio.teachers t on t.owner_id=j.owner_id
 join studio.budget_jobs b on b.job_id=j.id join studio.budget_policy p on p.singleton
 where r.job_id=p_job and r.workflow_run_id=p_run and r.workflow_run_attempt=p_attempt and r.source_snapshot_hash=p_hash
 and r.state='claimed' and j.state='running' and j.execution_mode='real' and t.active and p.enabled
 and b.state='active' and b.expires_at>clock_timestamp() and b.budget_month=date_trunc('month',now() at time zone 'Asia/Seoul')::date)
$$;

create function studio.append_worker_evidence(p_job uuid,p_run bigint,p_attempt integer,p_hash text,p_event uuid,p_body text,p_body_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.worker_runs; receipt studio.worker_evidence; body jsonb; n integer;
begin
 perform 1 from studio.budget_policy where singleton for update;
 perform 1 from studio.jobs where id=p_job for update;
 select * into item from studio.worker_runs where job_id=p_job for update;
 if not found or p_run is null or item.workflow_run_id is distinct from p_run or item.workflow_run_attempt is distinct from p_attempt or item.source_snapshot_hash is distinct from p_hash then raise sqlstate 'PT403'; end if;
 if p_event is null or p_body is null or octet_length(p_body)>2100000 or p_body_hash is null or encode(sha256(convert_to(p_body,'UTF8')),'hex')<>p_body_hash then raise sqlstate 'PT400'; end if;
 body:=p_body::jsonb;
 if body->>'jobId' is distinct from p_job::text or body->>'sourceSnapshotHash' is distinct from p_hash then raise sqlstate 'PT409'; end if;
 select * into receipt from studio.worker_evidence where job_id=p_job and event_id=p_event;
 if found then
  if receipt.body_hash<>p_body_hash then raise sqlstate 'PT409'; end if;
  return jsonb_build_object('sequence',receipt.sequence,'bodyHash',receipt.body_hash,'newEvent',false);
 end if;
 if not studio.worker_checkpoint(p_job,p_run,p_attempt,p_hash) then raise sqlstate 'PT409'; end if;
 if item.event_count>=40 or item.evidence_bytes+octet_length(p_body)>16000000 then raise sqlstate 'PT429'; end if;
 if body->>'kind'='role_output' then
  perform 1 from studio.budget_calls where job_id=p_job and call_id=(body->>'callId')::uuid and role=body->>'role' and state='settled';
  if not found then raise sqlstate 'PT409'; end if;
 end if;
 n:=item.event_count+1;
 insert into studio.worker_evidence(job_id,event_id,sequence,kind,body,body_hash) values(p_job,p_event,n,body->>'kind',p_body,p_body_hash);
 update studio.worker_runs set event_count=n,evidence_bytes=evidence_bytes+octet_length(p_body) where job_id=p_job;
 return jsonb_build_object('sequence',n,'bodyHash',p_body_hash,'newEvent',true);
end $$;

create function studio.cancel_worker_job(p_owner uuid,p_job uuid,p_expected integer,p_command uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare row studio.jobs; receipt studio.job_events; prior text;
begin
 perform 1 from studio.budget_policy where singleton for update;
 select * into row from studio.jobs where id=p_job and owner_id=p_owner and execution_mode='real' for update;
 if not found then raise sqlstate 'PT404'; end if;
 select * into receipt from studio.job_events where job_id=p_job and command_id=p_command;
 if found then
  if receipt.command_type<>'cancel' or receipt.state_version is distinct from p_expected+1 then raise sqlstate 'PT409'; end if;
  return to_jsonb(row);
 end if;
 if p_command is null or row.state_version is distinct from p_expected or row.state not in ('queued','running') then raise sqlstate 'PT409'; end if;
 prior:=row.state;
 update studio.jobs set state=case when prior='queued' then 'cancelled' else 'cancel_requested' end,state_version=state_version+1,updated_at=now() where id=p_job returning * into row;
 insert into studio.job_events(job_id,owner_id,sequence,state_version,command_id,command_type,from_state,to_state,phase,actor_type,run_id,run_attempt)
 values(p_job,row.owner_id,row.state_version,row.state_version,p_command,'cancel',prior,row.state,row.phase,'teacher',row.run_id,1);
 if prior='queued' then
  update studio.worker_runs set state='finished',outcome='cancelled',reason='JOB_CANCELLED',finished_at=clock_timestamp() where job_id=p_job;
  perform studio.close_job_budget(p_job);
 end if;
 return to_jsonb(row);
end $$;

-- The worker cannot approve/publish. Missing evidence can only lead to a hold.
create function studio.finish_worker_run(p_job uuid,p_run bigint,p_attempt integer,p_outcome text,p_candidate text,p_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare row studio.jobs; item studio.worker_runs; pending record; prior text; target text; candidate jsonb; runtime jsonb; review jsonb; runtime_body jsonb; review_body jsonb; candidate_seq integer; runtime_seq integer; review_seq integer; uncertain boolean;
begin
 perform 1 from studio.budget_policy where singleton for update;
 select * into row from studio.jobs where id=p_job and execution_mode='real' for update;
 select * into item from studio.worker_runs where job_id=p_job for update;
 if not found or p_run is null or item.workflow_run_id is distinct from p_run or item.workflow_run_attempt is distinct from p_attempt then raise sqlstate 'PT403'; end if;
 if p_outcome is null or p_outcome not in ('needs_input','failed','cancelled','candidate_for_human_review') or (p_reason is not null and p_reason !~ '^[A-Z][A-Z0-9_]{0,79}$')
 or (p_candidate is not null and p_candidate !~ '^[a-f0-9]{64}$')
 or (p_outcome<>'candidate_for_human_review' and (p_candidate is not null or p_reason is null)) then raise sqlstate 'PT400'; end if;
 if item.state in ('finished','uncertain') then
  if item.outcome is distinct from p_outcome or item.candidate_hash is distinct from p_candidate or item.reason is distinct from p_reason then raise sqlstate 'PT409'; end if;
  return to_jsonb(row);
 end if;
 if item.state<>'claimed' or row.state not in ('running','cancel_requested') then raise sqlstate 'PT409'; end if;
 if p_outcome='candidate_for_human_review' and row.state<>'cancel_requested' then
  if not studio.worker_checkpoint(p_job,p_run,p_attempt,item.source_snapshot_hash) or p_candidate is null or p_candidate !~ '^[a-f0-9]{64}$' or p_reason is not null then raise sqlstate 'PT409'; end if;
  select body::jsonb,sequence into candidate,candidate_seq from studio.worker_evidence where job_id=p_job and kind='candidate' order by sequence desc limit 1;
  select body::jsonb,sequence into runtime_body,runtime_seq from studio.worker_evidence where job_id=p_job and kind='runtime_evidence' order by sequence desc limit 1;
  select body::jsonb,sequence into review_body,review_seq from studio.worker_evidence where job_id=p_job and kind='review' order by sequence desc limit 1;
  runtime:=runtime_body->'evidence'; review:=review_body->'review';
  if candidate->>'candidateHash' is distinct from p_candidate or runtime->>'candidateHash' is distinct from p_candidate or review->>'candidateHash' is distinct from p_candidate
  or (candidate_seq<runtime_seq and runtime_seq<review_seq and review_seq=item.event_count) is not true
  or ((candidate->>'attempt')::integer between 0 and 2) is not true or candidate->>'attempt' is distinct from runtime_body->>'attempt' or candidate->>'attempt' is distinct from review_body->>'attempt'
  or review_body->>'checksHash' is distinct from runtime->>'checksHash' or (runtime->>'checksHash' ~ '^[a-f0-9]{64}$') is not true
  or runtime->>'sourceSnapshotHash' is distinct from item.source_snapshot_hash or runtime#>>'{checks,runtime}' is distinct from 'pass' or runtime#>>'{checks,contract}' is distinct from 'pass'
  or runtime->'issues' is distinct from '[]'::jsonb or review->>'status' is distinct from 'pass' or review->'blockingIssues' is distinct from '[]'::jsonb
  or review#>>'{checks,science}' is distinct from 'pass' or review#>>'{checks,learning}' is distinct from 'pass' or review#>>'{checks,curriculum}' is distinct from 'pass' or review#>>'{checks,textbook}' is distinct from 'pass'
  then raise sqlstate 'PT409'; end if;
 end if;
 select state='uncertain' or held_usd_micros>0 into uncertain from studio.budget_jobs where job_id=p_job;
 if uncertain is null then raise sqlstate 'PT409'; end if;
 if uncertain then
  if p_outcome='candidate_for_human_review' and row.state<>'cancel_requested' then raise sqlstate 'PT409'; end if;
  for pending in select call_id from studio.budget_calls where job_id=p_job and state='reserved' loop
   perform studio.settle_ai_call(p_job,pending.call_id,null,true);
  end loop;
 end if;
 prior:=row.state;
 target:=case when prior='cancel_requested' or p_outcome='cancelled' then 'cancelled' when p_outcome='candidate_for_human_review' then 'awaiting_approval' else p_outcome end;
 update studio.jobs set state=target,state_version=state_version+1,phase=case when target='awaiting_approval' then 'policy_check' else phase end,error_code=case when uncertain then 'COST_UNCERTAIN' else p_reason end,updated_at=now() where id=p_job returning * into row;
 update studio.worker_runs set state=case when uncertain then 'uncertain' else 'finished' end,outcome=p_outcome,candidate_hash=p_candidate,reason=p_reason,finished_at=clock_timestamp() where job_id=p_job;
 insert into studio.job_events(job_id,owner_id,sequence,state_version,command_id,command_type,from_state,to_state,phase,actor_type,run_id,run_attempt,error_code)
 values(p_job,row.owner_id,row.state_version,row.state_version,gen_random_uuid(),'worker_finish',prior,target,row.phase,'worker',row.run_id,1,row.error_code);
 if not uncertain then perform studio.close_job_budget(p_job); end if;
 return to_jsonb(row);
end $$;

revoke all on function studio.worker_execution_enabled(),studio.submit_worker_job(uuid,uuid,uuid,uuid,uuid,jsonb,text,text,uuid),studio.bind_worker_run(uuid,bigint,integer),studio.claim_worker_run(uuid,bigint,integer,text),studio.worker_checkpoint(uuid,bigint,integer,text),studio.append_worker_evidence(uuid,bigint,integer,text,uuid,text,text),studio.cancel_worker_job(uuid,uuid,integer,uuid),studio.finish_worker_run(uuid,bigint,integer,text,text,text) from public,anon,authenticated;
grant execute on function studio.worker_execution_enabled(),studio.submit_worker_job(uuid,uuid,uuid,uuid,uuid,jsonb,text,text,uuid),studio.bind_worker_run(uuid,bigint,integer),studio.claim_worker_run(uuid,bigint,integer,text),studio.worker_checkpoint(uuid,bigint,integer,text),studio.append_worker_evidence(uuid,bigint,integer,text,uuid,text,text),studio.cancel_worker_job(uuid,uuid,integer,uuid),studio.finish_worker_run(uuid,bigint,integer,text,text,text) to service_role;
commit;
