-- Worker foundation, disabled by default. No paid work or publishing.
-- Generated with Supabase CLI; proposal bodies retain their review provenance.
-- One transaction preserves the original studio v1/v2 data on any failure.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if studio.studio_capabilities_v2() <> 2 or studio.conversation_delete_enabled_v2() then
  raise exception 'STUDIO_BASELINE_MISMATCH';
 end if;
end
$preflight$;

-- SOURCE supabase/proposals/studio_runner_v1.sql SHA256-LF 852cdbd77d0439453ec4b2726bf232ade1a03a6b8301e3bf2a3ff9e4411c12d6
-- REVIEW ONLY. Independent optional runner storage, AFTER studio_v2.
-- Does not enable real jobs: existing jobs.execution_mode remains mock-only.
set local lock_timeout='5s';
set local statement_timeout='30s';
create table studio.dispatch_intents (
  job_id uuid primary key,
  owner_id uuid not null,
  execution_mode text not null check(execution_mode='real'),
  source_snapshot_hash text not null check(length(source_snapshot_hash)=64),
  state text not null default 'blocked' check(state in ('blocked','ready','claimed','submitted','uncertain','cancelled','failed')),
  run_id bigint, run_attempt integer,
  lease_until timestamptz, claimed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  foreign key(job_id,owner_id) references studio.jobs(id,owner_id)
);
alter table studio.dispatch_intents enable row level security;
revoke all on studio.dispatch_intents from public,anon,authenticated,service_role;
-- No browser or worker writes. No production insertion/claim function in 07-1.
-- Durable claim/cancel/day-budget RPCs must be reviewed before enabling writes.
grant select on studio.dispatch_intents to service_role;

-- SOURCE supabase/proposals/studio_budget_v1.sql SHA256-LF f48ae8db19fa1c09d35e74e541d07fdc3f6ecccc023200df5d10a1066b1a2ac5
-- REVIEW ONLY: durable project-wide budget; does not enable real execution.
-- Requires studio v2. The runner must support real jobs before reservation.
set local lock_timeout='5s';
set local statement_timeout='30s';
create table studio.budget_policy (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 version text not null default 'studio-budget-2026-10-04',
 monthly_usd_micros bigint not null default 5000000 check(monthly_usd_micros between 1 and 5000000),
 job_usd_micros bigint not null default 500000 check(job_usd_micros between 1 and 500000),
 monthly_jobs integer not null default 10 check(monthly_jobs between 1 and 10),
 calls_per_job integer not null default 9 check(calls_per_job between 1 and 9)
);
insert into studio.budget_policy(singleton) values(true);
create table studio.budget_jobs (
 job_id uuid primary key,
 owner_id uuid not null,
 budget_month date not null,
 policy_version text not null,
 limit_usd_micros bigint not null check(limit_usd_micros between 1 and 500000),
 held_usd_micros bigint not null default 0 check(held_usd_micros>=0),
 spent_usd_micros bigint not null default 0 check(spent_usd_micros>=0),
 call_count integer not null default 0 check(call_count between 0 and 9),
 state text not null default 'active' check(state in ('active','closed','uncertain')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '20 minutes',
 foreign key(job_id,owner_id) references studio.jobs(id,owner_id),
 check(held_usd_micros+spent_usd_micros<=limit_usd_micros)
);
create table studio.budget_calls (
 call_id uuid primary key,
 job_id uuid not null references studio.budget_jobs(job_id),
 request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
 role text not null check(role in ('curriculum','subject','design','developer','reviewer')),
 reserved_usd_micros bigint not null check(reserved_usd_micros between 1 and 500000),
 charged_usd_micros bigint check(charged_usd_micros>=0 and charged_usd_micros<=reserved_usd_micros),
 state text not null default 'reserved' check(state in ('reserved','settled','uncertain')),
 created_at timestamptz not null default now(),
 settled_at timestamptz
);
alter table studio.budget_policy enable row level security;
alter table studio.budget_jobs enable row level security;
alter table studio.budget_calls enable row level security;
revoke all on studio.budget_policy,studio.budget_jobs,studio.budget_calls from public,anon,authenticated,service_role;
grant select on studio.budget_policy,studio.budget_jobs,studio.budget_calls to service_role;
grant update(enabled) on studio.budget_policy to service_role;
grant insert,update on studio.budget_jobs,studio.budget_calls to service_role;
-- All budget RPCs serialize through this single policy row: project-wide,
-- including different owners and Seoul month rollover. No browser access.
create function studio.reserve_job_budget(p_owner uuid,p_job uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare policy studio.budget_policy; item studio.budget_jobs;
 month_start date:=date_trunc('month',now() at time zone 'Asia/Seoul')::date;
 total bigint; count_jobs integer;
begin
 select * into policy from studio.budget_policy where singleton for update;
 if not found or not policy.enabled then raise sqlstate 'PT412'; end if;
 perform 1 from studio.teachers where owner_id=p_owner and active;
 if not found then raise sqlstate 'PT403'; end if;
 perform 1 from studio.jobs where id=p_job and owner_id=p_owner and execution_mode='real' and state in ('queued','running');
 if not found then raise sqlstate 'PT409'; end if;
 select * into item from studio.budget_jobs where job_id=p_job;
 if found then
  if item.owner_id<>p_owner then raise sqlstate 'PT403'; end if;
  if item.state<>'active' or item.expires_at<=now() then raise sqlstate 'PT409'; end if;
  return to_jsonb(item);
 end if;
 -- Unknown/expired runs keep their slot until an explicit reconciliation.
 if exists(select 1 from studio.budget_jobs where state in ('active','uncertain')) then raise sqlstate 'PT423'; end if;
 select count(*),coalesce(sum(case when state='closed' then spent_usd_micros else limit_usd_micros end),0)
 into count_jobs,total from studio.budget_jobs where budget_month=month_start;
 if count_jobs>=policy.monthly_jobs or total+policy.job_usd_micros>policy.monthly_usd_micros then raise sqlstate 'PT429'; end if;
 insert into studio.budget_jobs(job_id,owner_id,budget_month,policy_version,limit_usd_micros)
 values(p_job,p_owner,month_start,policy.version,policy.job_usd_micros) returning * into item;
 return to_jsonb(item);
end $$;
create function studio.reserve_ai_call(p_job uuid,p_call uuid,p_hash text,p_role text,p_max_usd_micros bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare policy studio.budget_policy; job studio.budget_jobs; receipt studio.budget_calls;
begin
 select * into policy from studio.budget_policy where singleton for update;
 if not found or not policy.enabled then raise sqlstate 'PT412'; end if;
 select * into job from studio.budget_jobs where job_id=p_job for update;
 if not found or job.state<>'active' or job.expires_at<=now() or job.budget_month<>date_trunc('month',now() at time zone 'Asia/Seoul')::date then raise sqlstate 'PT409'; end if;
 perform 1 from studio.jobs j join studio.teachers t on t.owner_id=j.owner_id
 where j.id=p_job and j.owner_id=job.owner_id and j.execution_mode='real' and j.state in ('queued','running') and t.active;
 if not found then raise sqlstate 'PT409'; end if;
 select * into receipt from studio.budget_calls where call_id=p_call;
 if found then
  if receipt.job_id<>p_job or receipt.request_hash is distinct from p_hash or receipt.role is distinct from p_role or receipt.reserved_usd_micros is distinct from p_max_usd_micros then raise sqlstate 'PT409'; end if;
  -- A receipt only proves reservation. The caller MUST NOT resend a call.
  return to_jsonb(receipt)||jsonb_build_object('newReservation',false);
 end if;
 if p_max_usd_micros is null or p_max_usd_micros<=0 or job.call_count>=policy.calls_per_job or job.held_usd_micros+job.spent_usd_micros+p_max_usd_micros>job.limit_usd_micros then raise sqlstate 'PT429'; end if;
 if exists(select 1 from studio.budget_calls where job_id=p_job and state in ('reserved','uncertain')) then raise sqlstate 'PT423'; end if;
 insert into studio.budget_calls(call_id,job_id,request_hash,role,reserved_usd_micros)
 values(p_call,p_job,p_hash,p_role,p_max_usd_micros) returning * into receipt;
 update studio.budget_jobs set held_usd_micros=held_usd_micros+p_max_usd_micros,call_count=call_count+1 where job_id=p_job;
 return to_jsonb(receipt)||jsonb_build_object('newReservation',true);
end $$;
create function studio.settle_ai_call(p_job uuid,p_call uuid,p_charged_usd_micros bigint,p_uncertain boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare receipt studio.budget_calls;
begin
 perform 1 from studio.budget_policy where singleton for update;
 select * into receipt from studio.budget_calls where call_id=p_call and job_id=p_job for update;
 if not found then raise sqlstate 'PT404'; end if;
 if p_uncertain is null then raise sqlstate 'PT400'; end if;
 if receipt.state<>'reserved' then
  if (receipt.state='uncertain' and p_uncertain) or (receipt.state='settled' and not p_uncertain and receipt.charged_usd_micros=p_charged_usd_micros) then return to_jsonb(receipt); end if;
  raise sqlstate 'PT409';
 end if;
 if p_uncertain then
  update studio.budget_calls set state='uncertain' where call_id=p_call returning * into receipt;
  update studio.budget_jobs set state='uncertain' where job_id=p_job;
  return to_jsonb(receipt);
 end if;
 if p_charged_usd_micros is null or p_charged_usd_micros<0 then raise sqlstate 'PT400'; end if;
 if p_charged_usd_micros>receipt.reserved_usd_micros then
  -- Never silently discard an overrun or release its reservation.
  update studio.budget_policy set enabled=false where singleton;
  update studio.budget_calls set state='uncertain' where call_id=p_call returning * into receipt;
  update studio.budget_jobs set state='uncertain' where job_id=p_job;
  return to_jsonb(receipt)||jsonb_build_object('budgetBreach',true);
 end if;
 update studio.budget_calls set state='settled',charged_usd_micros=p_charged_usd_micros,settled_at=now() where call_id=p_call returning * into receipt;
 update studio.budget_jobs set held_usd_micros=held_usd_micros-receipt.reserved_usd_micros,spent_usd_micros=spent_usd_micros+p_charged_usd_micros where job_id=p_job;
 return to_jsonb(receipt);
end $$;
create function studio.close_job_budget(p_job uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.budget_jobs;
begin
 perform 1 from studio.budget_policy where singleton for update;
 select * into item from studio.budget_jobs where job_id=p_job for update;
 if not found then raise sqlstate 'PT404'; end if;
 if item.state='uncertain' or item.held_usd_micros<>0 then raise sqlstate 'PT409'; end if;
 -- Only a terminal/approval-waiting job can free global concurrency capacity.
 if not exists(select 1 from studio.jobs where id=p_job and state not in ('queued','running','cancel_requested')) then raise sqlstate 'PT409'; end if;
 update studio.budget_jobs set state='closed' where job_id=p_job returning * into item;
 return to_jsonb(item);
end $$;
revoke all on function studio.reserve_job_budget(uuid,uuid),studio.reserve_ai_call(uuid,uuid,text,text,bigint),studio.settle_ai_call(uuid,uuid,bigint,boolean),studio.close_job_budget(uuid) from public,anon,authenticated;
grant execute on function studio.reserve_job_budget(uuid,uuid),studio.reserve_ai_call(uuid,uuid,text,text,bigint),studio.settle_ai_call(uuid,uuid,bigint,boolean),studio.close_job_budget(uuid) to service_role;

-- SOURCE supabase/proposals/studio_worker_v1.sql SHA256-LF b96863d7e688b23dc51ba3ac841c9bccb4677cdf8efd05d19b3ad2bb454d6e11
-- REVIEW ONLY: apply after studio_v2 and studio_budget_v1. Not deployed.
-- Service-only boundary; workers must use the authenticated report API, never
-- receive service_role credentials. Runtime gate stays false until integration.
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

-- SOURCE supabase/proposals/studio_worker_auth_v1.sql SHA256-LF 09ae700c238a3f204d0c301d57fdced77761cbced7180998053ef3769034e73b
-- REVIEW ONLY. After studio_worker_v1; no deployment or gate activation.
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table studio.worker_runs add column verified_sha text check(verified_sha ~ '^[a-f0-9]{40}$');
create table studio.worker_oidc_receipts (
 jti_hash text primary key check(jti_hash ~ '^[a-f0-9]{64}$'),
 job_id uuid not null references studio.worker_runs(job_id),
 run_id bigint not null check(run_id>0), run_attempt integer not null check(run_attempt=1),
 workflow_sha text not null check(workflow_sha ~ '^[a-f0-9]{40}$'),
 role text not null check(role in ('generation','report')),
 action text not null, body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null, received_at timestamptz not null default clock_timestamp()
);
create index worker_oidc_job on studio.worker_oidc_receipts(job_id);
alter table studio.worker_oidc_receipts enable row level security;
revoke all on studio.worker_oidc_receipts from public,anon,authenticated,service_role;
grant select,insert on studio.worker_oidc_receipts to service_role;

-- Called ONLY after signature/issuer/audience/subject/workflow/ref/SHA/role
-- verification by the server. A run ID or jti hash is not authentication.
create function studio.consume_worker_identity(p_job uuid,p_run bigint,p_attempt integer,p_sha text,p_jti_hash text,p_expires timestamptz,p_role text,p_action text,p_body_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.worker_runs; row studio.jobs; written integer;
begin
 if p_role is null or p_action is null or
 not ((p_role='generation' and p_action in ('input','claim','checkpoint','reserve','settle','evidence','runtime','finish')) or (p_role='report' and p_action in ('verification','candidate','runtime-report')))
 or p_sha is null or p_sha !~ '^[a-f0-9]{40}$' or p_jti_hash is null or p_jti_hash !~ '^[a-f0-9]{64}$'
 or p_body_hash is null or p_body_hash !~ '^[a-f0-9]{64}$' or p_expires is null or p_expires<=clock_timestamp() or p_expires>clock_timestamp()+interval '21 minutes'
 then raise sqlstate 'PT400'; end if;
 perform 1 from studio.budget_policy where singleton for update;
 select * into row from studio.jobs where id=p_job and execution_mode='real' for update;
 if not found then raise sqlstate 'PT403'; end if;
 select * into item from studio.worker_runs where job_id=p_job for update;
 if not found or p_run is null or item.workflow_run_id is distinct from p_run or item.workflow_run_attempt is distinct from p_attempt then raise sqlstate 'PT403'; end if;
 if item.verified_sha is not null and item.verified_sha<>p_sha then raise sqlstate 'PT403'; end if;
 -- Allow settlement/failure acknowledgement after a kill switch, cancellation
 -- or teacher revocation. Final approval-wait checks remain in finish RPC.
 if p_action not in ('settle','finish') then
  if not studio.worker_execution_enabled() or not exists(select 1 from studio.budget_policy where singleton and enabled) then raise sqlstate 'PT412'; end if;
  if not exists(select 1 from studio.teachers where owner_id=row.owner_id and active) then raise sqlstate 'PT403'; end if;
  -- The reporter can observe a terminal job and stop polling. This action never
  -- resumes it or returns source for that terminal state.
  if p_action<>'verification' and row.state not in ('queued','running','cancel_requested') then raise sqlstate 'PT409'; end if;
 end if;
 if (select count(*) from studio.worker_oidc_receipts where job_id=p_job)>=512 then raise sqlstate 'PT429'; end if;
 insert into studio.worker_oidc_receipts(jti_hash,job_id,run_id,run_attempt,workflow_sha,role,action,body_hash,expires_at)
 values(p_jti_hash,p_job,p_run,p_attempt,p_sha,p_role,p_action,p_body_hash,p_expires) on conflict(jti_hash) do nothing;
 get diagnostics written=row_count;
 if written<>1 then raise sqlstate 'PT409'; end if;
 update studio.worker_runs set verified_sha=p_sha where job_id=p_job and verified_sha is null;
 return jsonb_build_object('jobId',p_job,'sourceSnapshotHash',item.source_snapshot_hash,'runId',p_run,'runAttempt',p_attempt,'workflowSha',p_sha,'role',p_role);
end $$;
revoke all on function studio.consume_worker_identity(uuid,bigint,integer,text,text,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function studio.consume_worker_identity(uuid,bigint,integer,text,text,timestamptz,text,text,text) to service_role;

-- SOURCE supabase/proposals/studio_input_review_v1.sql SHA256-LF 86e88f4615455809efe929ff50c7baadf5da5943e0bc521dafc4d4bf19344f5a
-- REVIEW ONLY. After worker_v1; not applied to production. No execution gate is enabled.
set local lock_timeout='5s';
set local statement_timeout='30s';
create table studio.input_reviews (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 conversation_id uuid not null, client_request_id uuid not null,
 request_snapshot jsonb not null, input_text text not null,
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 content_id text not null unique check(content_id ~ '^sim-[a-f0-9]{28}$'),
 state text not null default 'prepared' check(state in ('prepared','approved','consumed')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '24 hours',
 approved_at timestamptz, consent jsonb, job_id uuid unique,
 foreign key(conversation_id,owner_id) references studio.conversations(id,owner_id),
 foreign key(job_id,owner_id) references studio.jobs(id,owner_id),
 unique(owner_id,conversation_id,client_request_id),
 check(octet_length(input_text) between 2 and 50000),
 check(encode(sha256(convert_to(input_text,'UTF8')),'hex')=source_hash),
 check(jsonb_typeof(input_text::jsonb->'input') is not distinct from 'object' and jsonb_typeof(input_text::jsonb->'context') is not distinct from 'object'),
 check(input_text::jsonb#>>'{context,contentId}' is not distinct from content_id),
 check(consent is null or consent='{"version":1,"aiProcessingAllowed":true,"publicInputAllowed":true,"noPrivateData":true,"budgetAccepted":true}'::jsonb),
 check((state='prepared' and approved_at is null and consent is null and job_id is null) or
       (state='approved' and approved_at is not null and consent is not null and job_id is null) or
       (state='consumed' and approved_at is not null and consent is not null and job_id is not null))
);
alter table studio.input_reviews enable row level security;
revoke all on studio.input_reviews from public,anon,authenticated,service_role;
grant select on studio.input_reviews to service_role;
grant insert(owner_id,conversation_id,client_request_id,request_snapshot,input_text,source_hash,content_id),update(state,approved_at,consent,job_id) on studio.input_reviews to service_role;

create function studio.input_review_version() returns integer language sql security invoker set search_path='' as $$select 1$$;
create function studio.prepare_worker_input(p_owner uuid,p_conversation uuid,p_client uuid,p_request jsonb,p_input text,p_hash text,p_content text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews;
begin
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 perform 1 from studio.conversations where id=p_conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 if p_client is null or p_input is null or p_request is null or p_hash is null or p_content is null or
 octet_length(p_input)>50000 or encode(sha256(convert_to(p_input,'UTF8')),'hex')<>p_hash or
 p_input::jsonb#>>'{context,contentId}' is distinct from p_content or
 coalesce(p_input::jsonb#>>'{input,generationKind}' not in ('interactive_2d','interactive_3d'),true) or
 p_request->>'schemaVersion' is distinct from '2' or p_request->>'conversationId' is distinct from p_conversation::text or
 p_request->>'clientRequestId' is distinct from p_client::text or p_request->'payload' ? 'schoolYear' then raise sqlstate 'PT400'; end if;
 select * into item from studio.input_reviews where owner_id=p_owner and conversation_id=p_conversation and client_request_id=p_client;
 if found then
  if item.source_hash<>p_hash or item.input_text<>p_input or item.request_snapshot<>p_request or item.content_id<>p_content then raise sqlstate 'PT409'; end if;
  return to_jsonb(item);
 end if;
 if (select count(*) from studio.input_reviews where owner_id=p_owner)>=500 or
    (select count(*) from studio.input_reviews where owner_id=p_owner and created_at>=now()-interval '24 hours')>=30 then raise sqlstate 'PT429'; end if;
 insert into studio.input_reviews(owner_id,conversation_id,client_request_id,request_snapshot,input_text,source_hash,content_id)
 values(p_owner,p_conversation,p_client,p_request,p_input,p_hash,p_content) returning * into item;
 return to_jsonb(item);
end $$;

create function studio.read_worker_input(p_owner uuid,p_review uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews;
begin
 if not exists(select 1 from studio.teachers where owner_id=p_owner and active) then raise sqlstate 'PT403'; end if;
 select r.* into item from studio.input_reviews r join studio.conversations c on c.id=r.conversation_id and c.owner_id=r.owner_id
 where r.id=p_review and r.owner_id=p_owner and c.deleted_at is null;
 if not found then raise sqlstate 'PT404'; end if;
 return to_jsonb(item);
end $$;

create function studio.approve_worker_input(p_owner uuid,p_review uuid,p_hash text,p_consent jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews; conversation uuid;
begin
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 select conversation_id into conversation from studio.input_reviews where id=p_review and owner_id=p_owner;
 perform 1 from studio.conversations where id=conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 select * into item from studio.input_reviews where id=p_review and owner_id=p_owner for update;
 if not found then raise sqlstate 'PT404'; end if;
 if item.source_hash is distinct from p_hash or p_consent is distinct from '{"version":1,"aiProcessingAllowed":true,"publicInputAllowed":true,"noPrivateData":true,"budgetAccepted":true}'::jsonb then raise sqlstate 'PT409'; end if;
 if item.state in ('approved','consumed') then return to_jsonb(item); end if;
 if item.expires_at<=clock_timestamp() then raise sqlstate 'PT410'; end if;
 update studio.input_reviews set state='approved',approved_at=clock_timestamp(),consent=p_consent where id=p_review returning * into item;
 return to_jsonb(item);
end $$;

-- Every NEW worker row must consume exactly the confirmed input. An arbitrary
-- UUID can no longer serve as an input approval. Earlier rows are not rewritten.
create function studio.consume_input_review() returns trigger language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews; work studio.jobs;
begin
 select * into work from studio.jobs where id=new.job_id;
 select * into item from studio.input_reviews where id=new.input_review_id and owner_id=new.owner_id for update;
 if not found or item.state<>'approved' or item.job_id is not null or item.expires_at<=clock_timestamp() or
 item.conversation_id<>work.conversation_id or item.request_snapshot<>work.request_snapshot or
 item.source_hash<>new.source_snapshot_hash or item.input_text<>new.approved_input then raise sqlstate 'PT409'; end if;
 update studio.input_reviews set state='consumed',job_id=new.job_id where id=item.id;
 new.input_approved_at:=item.approved_at;
 return new;
end $$;
create trigger worker_requires_input_review before insert on studio.worker_runs for each row execute function studio.consume_input_review();

create function studio.submit_reviewed_worker_job(p_owner uuid,p_review uuid,p_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews; conversation uuid; work studio.jobs;
begin
 -- Same order as submit_worker_job: budget -> teacher -> conversation -> review.
 perform 1 from studio.budget_policy where singleton for update;
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 select conversation_id into conversation from studio.input_reviews where id=p_review and owner_id=p_owner;
 perform 1 from studio.conversations where id=conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 select * into item from studio.input_reviews where id=p_review and owner_id=p_owner for update;
 if not found then raise sqlstate 'PT404'; end if;
 if item.source_hash is distinct from p_hash then raise sqlstate 'PT409'; end if;
 if item.state='consumed' then
  select * into work from studio.jobs where id=item.job_id and owner_id=p_owner;
  if not found then raise sqlstate 'PT409'; end if;
  return to_jsonb(work);
 end if;
 if item.state<>'approved' then raise sqlstate 'PT409'; end if;
 if item.expires_at<=clock_timestamp() then raise sqlstate 'PT410'; end if;
 return studio.submit_worker_job(p_owner,item.conversation_id,item.client_request_id,gen_random_uuid(),gen_random_uuid(),item.request_snapshot,item.input_text,item.source_hash,item.id);
end $$;
revoke all on function studio.input_review_version(),studio.prepare_worker_input(uuid,uuid,uuid,jsonb,text,text,text),studio.read_worker_input(uuid,uuid),studio.approve_worker_input(uuid,uuid,text,jsonb),studio.consume_input_review(),studio.submit_reviewed_worker_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function studio.input_review_version(),studio.prepare_worker_input(uuid,uuid,uuid,jsonb,text,text,text),studio.read_worker_input(uuid,uuid),studio.approve_worker_input(uuid,uuid,text,jsonb),studio.consume_input_review(),studio.submit_reviewed_worker_job(uuid,uuid,text) to service_role;

-- SOURCE supabase/proposals/studio_dispatch_v1.sql SHA256-LF 62c8a192f119f093baa1a299c9410a3c49cd0115eedb47111ae131ed80486d97
-- REVIEW ONLY. After runner_v1, worker_auth_v1 and input_review_v1.
-- No data backfill, external request or activation. Existing jobs are preserved.
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table studio.dispatch_intents add column claim_id uuid unique;
alter table studio.dispatch_intents add column verified_sha text check(verified_sha ~ '^[a-f0-9]{40}$');
alter table studio.dispatch_intents add column observed_run_id bigint check(observed_run_id>0);
alter table studio.dispatch_intents add constraint dispatch_run_pair check((run_id is null and run_attempt is null) or (run_id>0 and run_attempt=1));
grant insert(job_id,owner_id,execution_mode,source_snapshot_hash,state),update(state,run_id,run_attempt,lease_until,claimed_at,error_code,claim_id,verified_sha,observed_run_id) on studio.dispatch_intents to service_role;
create function studio.dispatch_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select false$$;
create function studio.dispatch_version() returns integer language sql security invoker set search_path='' as $$select 1$$;

-- The intent and approved source consumption commit with the budget reservation.
-- This trigger does not require activation; it creates no network side effect.
create function studio.create_dispatch_intent() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into studio.dispatch_intents(job_id,owner_id,execution_mode,source_snapshot_hash,state) values(new.job_id,new.owner_id,'real',new.source_snapshot_hash,'ready');
 return new;
end $$;
create trigger worker_dispatch_intent after insert on studio.worker_runs for each row execute function studio.create_dispatch_intent();

create function studio.cancel_dispatch_intent() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.execution_mode='real' and new.state='cancelled' then update studio.dispatch_intents set state='cancelled',error_code='JOB_CANCELLED' where job_id=new.id; end if;
 return new;
end $$;
create trigger cancelled_dispatch after update of state on studio.jobs for each row execute function studio.cancel_dispatch_intent();

create function studio.read_dispatch_intent(p_owner uuid,p_job uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item studio.dispatch_intents;
begin
 if not exists(select 1 from studio.teachers where owner_id=p_owner and active) then raise sqlstate 'PT403'; end if;
 select d.* into item from studio.dispatch_intents d join studio.jobs j on j.id=d.job_id join studio.conversations c on c.id=j.conversation_id
 where d.job_id=p_job and d.owner_id=p_owner and c.owner_id=p_owner and c.deleted_at is null;
 if not found then raise sqlstate 'PT404'; end if;
 return to_jsonb(item)-'claim_id'-'owner_id';
end $$;

-- Lock order: budget -> teacher -> conversation -> job -> worker -> intent.
-- Claimed/uncertain intents are NEVER leased again, even after lease expiry.
create function studio.claim_dispatch_intent(p_owner uuid,p_job uuid,p_claim uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item studio.dispatch_intents; work studio.jobs; worker studio.worker_runs; conversation uuid;
begin
 perform 1 from studio.budget_policy where singleton and enabled for update;
 if not found or not studio.dispatch_execution_enabled() or not studio.worker_execution_enabled() then raise sqlstate 'PT412'; end if;
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 select conversation_id into conversation from studio.jobs where id=p_job and owner_id=p_owner and execution_mode='real';
 perform 1 from studio.conversations where id=conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 select * into work from studio.jobs where id=p_job and owner_id=p_owner for update;
 select * into worker from studio.worker_runs where job_id=p_job for update;
 select * into item from studio.dispatch_intents where job_id=p_job and owner_id=p_owner for update;
 if not found then raise sqlstate 'PT404'; end if;
 if p_claim is null then raise sqlstate 'PT400'; end if;
 if item.state<>'ready' then return jsonb_build_object('claimed',false,'dispatch',to_jsonb(item)-'claim_id'-'owner_id'); end if;
 if work.state<>'queued' or worker.state<>'queued' or worker.workflow_run_id is not null or item.source_snapshot_hash<>worker.source_snapshot_hash then raise sqlstate 'PT409'; end if;
 perform studio.reserve_job_budget(p_owner,p_job);
 update studio.dispatch_intents set state='claimed',claim_id=p_claim,claimed_at=clock_timestamp(),lease_until=clock_timestamp()+interval '60 seconds' where job_id=p_job returning * into item;
 return jsonb_build_object('claimed',true,'dispatch',to_jsonb(item)-'claim_id'-'owner_id');
end $$;

create function studio.finish_dispatch_intent(p_owner uuid,p_job uuid,p_claim uuid,p_state text,p_run bigint,p_sha text,p_observed bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item studio.dispatch_intents; work studio.jobs; worker studio.worker_runs;
begin
 -- Completion may safely record a result after gate disable/teacher revocation.
 perform 1 from studio.budget_policy where singleton for update;
 select * into work from studio.jobs where id=p_job and owner_id=p_owner and execution_mode='real' for update;
 if not found then raise sqlstate 'PT404'; end if;
 select * into worker from studio.worker_runs where job_id=p_job for update;
 select * into item from studio.dispatch_intents where job_id=p_job and owner_id=p_owner for update;
 if not found then raise sqlstate 'PT404'; end if;
 if p_claim is null or item.claim_id is distinct from p_claim then raise sqlstate 'PT403'; end if;
 if p_state is null or p_state not in ('submitted','uncertain','failed') or
 (p_state='submitted' and (p_run is null or p_run<=0 or p_sha is null or p_sha !~ '^[a-f0-9]{40}$' or p_observed is not null)) or
 (p_state<>'submitted' and (p_run is not null or p_sha is not null)) or
 (p_observed is not null and (p_state<>'uncertain' or p_observed<=0)) then raise sqlstate 'PT400'; end if;
 if item.state not in ('claimed','cancelled') then
  if item.state=p_state and item.run_id is not distinct from p_run and item.verified_sha is not distinct from p_sha and item.observed_run_id is not distinct from p_observed then return to_jsonb(item)-'claim_id'-'owner_id'; end if;
  raise sqlstate 'PT409';
 end if;
 -- Cancellation wins. A late verified run can be retained for inspection but
 -- is never bound to the worker, and therefore cannot read input or call AI.
 if work.state='cancelled' then
  if item.run_id is not null and item.run_id is distinct from p_run then raise sqlstate 'PT409'; end if;
  update studio.dispatch_intents set state='cancelled',run_id=p_run,run_attempt=case when p_run is not null then 1 end,verified_sha=p_sha,observed_run_id=p_observed,error_code='JOB_CANCELLED' where job_id=p_job returning * into item;
  return to_jsonb(item)-'claim_id'-'owner_id';
 end if;
 if work.state<>'queued' or worker.state<>'queued' or worker.workflow_run_id is not null then raise sqlstate 'PT409'; end if;
 if p_state='submitted' then
  perform studio.bind_worker_run(p_job,p_run,1);
  update studio.worker_runs set verified_sha=p_sha where job_id=p_job;
 elsif p_state='failed' then
  -- This result is accepted ONLY for a failure before the HTTP dispatch POST.
  -- Unknown/after-POST outcomes retain the full reservation instead.
  if exists(select 1 from studio.budget_calls where job_id=p_job) then raise sqlstate 'PT409'; end if;
  update studio.worker_runs set state='finished',outcome='failed',reason='RUNNER_PREFLIGHT_FAILED',finished_at=clock_timestamp() where job_id=p_job;
  update studio.jobs set state='failed',state_version=state_version+1,error_code='RUNNER_PREFLIGHT_FAILED',updated_at=now() where id=p_job returning * into work;
  insert into studio.job_events(job_id,owner_id,sequence,state_version,command_id,command_type,from_state,to_state,actor_type,run_id,run_attempt)
  values(p_job,p_owner,work.state_version,work.state_version,p_claim,'worker_finish','queued','failed','server',work.run_id,1);
  perform studio.close_job_budget(p_job);
 end if;
 update studio.dispatch_intents set state=p_state,run_id=p_run,run_attempt=case when p_run is not null then 1 end,verified_sha=p_sha,observed_run_id=p_observed,
 error_code=case p_state when 'failed' then 'RUNNER_PREFLIGHT_FAILED' when 'uncertain' then 'DISPATCH_UNCERTAIN' else null end where job_id=p_job returning * into item;
 return to_jsonb(item)-'claim_id'-'owner_id';
end $$;
revoke all on function studio.dispatch_execution_enabled(),studio.dispatch_version(),studio.create_dispatch_intent(),studio.cancel_dispatch_intent(),studio.read_dispatch_intent(uuid,uuid),studio.claim_dispatch_intent(uuid,uuid,uuid),studio.finish_dispatch_intent(uuid,uuid,uuid,text,bigint,text,bigint) from public,anon,authenticated;
grant execute on function studio.dispatch_execution_enabled(),studio.dispatch_version(),studio.create_dispatch_intent(),studio.cancel_dispatch_intent(),studio.read_dispatch_intent(uuid,uuid),studio.claim_dispatch_intent(uuid,uuid,uuid),studio.finish_dispatch_intent(uuid,uuid,uuid,text,bigint,text,bigint) to service_role;

-- SOURCE supabase/proposals/studio_result_review_v1.sql SHA256-LF 61eb2f08bd23c0288aeaf399cfb00f2429d4abd465b5099fa5878f1d23e111b4
-- REVIEW ONLY. After worker_auth_v1. No publication authority or paid rerun.
set local lock_timeout='5s';
set local statement_timeout='30s';
create table studio.result_feedback (
 id uuid primary key default gen_random_uuid(), job_id uuid not null, owner_id uuid not null,
 client_request_id uuid not null, decision text not null check(decision in ('note','request_changes')),
 note text not null check(length(btrim(note)) between 1 and 2000),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 candidate_hash text check(candidate_hash ~ '^[a-f0-9]{64}$'),
 evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'),
 state_version integer not null check(state_version>=0),
 created_at timestamptz not null default clock_timestamp(),
 unique(job_id,client_request_id),
 foreign key(job_id,owner_id) references studio.jobs(id,owner_id),
 check(decision<>'request_changes' or candidate_hash is not null)
);
alter table studio.result_feedback enable row level security;
revoke all on studio.result_feedback from public,anon,authenticated,service_role;
grant select,insert on studio.result_feedback to service_role;
create function studio.result_review_version() returns integer language sql security invoker set search_path='' as $$select 1$$;
create function studio.worker_evidence_hash(p_job uuid) returns text language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(coalesce(string_agg(sequence::text||':'||body_hash,E'\n' order by sequence),''),'UTF8')),'hex') from studio.worker_evidence where job_id=p_job
$$;

-- One statement/MVCC snapshot. No privileged view, dynamic SQL or browser grant.
create function studio.read_worker_result(p_owner uuid,p_job uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'job',jsonb_build_object('id',j.id,'state',j.state,'state_version',j.state_version,'error_code',j.error_code,'run_id',j.run_id),
  'worker',jsonb_build_object('state',w.state,'source_hash',w.source_snapshot_hash,'input_text',w.approved_input,'verified_sha',w.verified_sha,'event_count',w.event_count,'candidate_hash',w.candidate_hash,'reason',w.reason),
  'evidence_hash',studio.worker_evidence_hash(j.id),
  'evidence',coalesce((select jsonb_agg(jsonb_build_object('sequence',e.sequence,'kind',e.kind,'body',e.body,'body_hash',e.body_hash,'created_at',e.created_at) order by e.sequence) from studio.worker_evidence e where e.job_id=j.id),'[]'::jsonb),
  'budget',(select jsonb_build_object('state',b.state,'limit_usd_micros',b.limit_usd_micros,'held_usd_micros',b.held_usd_micros,'spent_usd_micros',b.spent_usd_micros,'call_count',b.call_count) from studio.budget_jobs b where b.job_id=j.id),
  'feedback',coalesce((select jsonb_agg(to_jsonb(f)-'owner_id'-'client_request_id' order by f.created_at,f.id) from studio.result_feedback f where f.job_id=j.id),'[]'::jsonb)
 ) from studio.jobs j join studio.worker_runs w on w.job_id=j.id and w.owner_id=j.owner_id
 join studio.teachers t on t.owner_id=j.owner_id and t.active
 join studio.conversations c on c.id=j.conversation_id and c.owner_id=j.owner_id and c.deleted_at is null
 where j.id=p_job and j.owner_id=p_owner and j.execution_mode='real'
$$;

-- Feedback is version-bound private teacher input, NOT a release approval and
-- NOT a second AI job. It cannot erase failed checks or change a worker result.
create function studio.record_result_feedback(p_owner uuid,p_job uuid,p_client uuid,p_state_version integer,p_source text,p_candidate text,p_evidence text,p_decision text,p_note text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare work studio.jobs; worker studio.worker_runs; conversation uuid; prior studio.result_feedback; current_candidate text; item studio.result_feedback;
begin
 perform 1 from studio.budget_policy where singleton for update;
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 select conversation_id into conversation from studio.jobs where id=p_job and owner_id=p_owner and execution_mode='real';
 perform 1 from studio.conversations where id=conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 select * into work from studio.jobs where id=p_job and owner_id=p_owner for update;
 select * into worker from studio.worker_runs where job_id=p_job for update;
 if not found then raise sqlstate 'PT404'; end if;
 if p_client is null or p_state_version is null or p_source is null or p_source !~ '^[a-f0-9]{64}$' or p_evidence is null or p_evidence !~ '^[a-f0-9]{64}$'
 or (p_candidate is not null and p_candidate !~ '^[a-f0-9]{64}$') or p_decision is null or p_decision not in ('note','request_changes') or
 p_note is null or length(btrim(p_note)) not between 1 and 2000 or (p_decision='request_changes' and p_candidate is null) then raise sqlstate 'PT400'; end if;
 select * into prior from studio.result_feedback where job_id=p_job and client_request_id=p_client;
 if found then
  if prior.decision is distinct from p_decision or prior.note is distinct from btrim(p_note) or prior.source_hash is distinct from p_source or prior.candidate_hash is distinct from p_candidate or prior.evidence_hash is distinct from p_evidence or prior.state_version is distinct from p_state_version then raise sqlstate 'PT409'; end if;
  return to_jsonb(prior)-'owner_id'-'client_request_id';
 end if;
 if work.state not in ('needs_input','failed','cancelled','awaiting_approval') or worker.state not in ('finished','uncertain') then raise sqlstate 'PT409'; end if;
 select body::jsonb->>'candidateHash' into current_candidate from studio.worker_evidence where job_id=p_job and kind='candidate' order by sequence desc limit 1;
 if work.state_version<>p_state_version or worker.source_snapshot_hash<>p_source or current_candidate is distinct from p_candidate or studio.worker_evidence_hash(p_job)<>p_evidence then raise sqlstate 'PT409'; end if;
 if (select count(*) from studio.result_feedback where job_id=p_job)>=20 then raise sqlstate 'PT429'; end if;
 insert into studio.result_feedback(job_id,owner_id,client_request_id,decision,note,source_hash,candidate_hash,evidence_hash,state_version)
 values(p_job,p_owner,p_client,p_decision,btrim(p_note),p_source,p_candidate,p_evidence,p_state_version) returning * into item;
 return to_jsonb(item)-'owner_id'-'client_request_id';
end $$;
revoke all on function studio.result_review_version(),studio.worker_evidence_hash(uuid),studio.read_worker_result(uuid,uuid),studio.record_result_feedback(uuid,uuid,uuid,integer,text,text,text,text,text) from public,anon,authenticated;
grant execute on function studio.result_review_version(),studio.worker_evidence_hash(uuid),studio.read_worker_result(uuid,uuid),studio.record_result_feedback(uuid,uuid,uuid,integer,text,text,text,text,text) to service_role;

-- SOURCE supabase/proposals/studio_revision_v1.sql SHA256-LF a1ff471f6795a8c8b0fbe9b01df970f76ab58f3526a531710cf0375d81cd30b1
-- REVIEW ONLY. After result_review_v1, input_review_v1 and dispatch_v1.
-- Immutable revision inputs; no activation, migration history or external calls.
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table studio.input_reviews drop constraint input_reviews_content_id_key;
alter table studio.input_reviews drop constraint input_reviews_content_id_check;
alter table studio.input_reviews add constraint input_content_id check(content_id ~ '^[a-z0-9][a-z0-9-]{0,63}$');
alter table studio.input_reviews add column parent_job_id uuid;
alter table studio.input_reviews add column feedback_id uuid references studio.result_feedback(id);
alter table studio.input_reviews add column head_job_id uuid;
alter table studio.input_reviews add column base_candidate text;
alter table studio.input_reviews add foreign key(parent_job_id,owner_id) references studio.jobs(id,owner_id);
alter table studio.input_reviews add foreign key(head_job_id,owner_id) references studio.jobs(id,owner_id);
alter table studio.input_reviews add constraint revision_input_shape check(
 (parent_job_id is null and feedback_id is null and head_job_id is null and base_candidate is null and not (input_text::jsonb->'input' ? 'revision')) or
 (parent_job_id is not null and feedback_id is not null and head_job_id is not null and base_candidate is not null and octet_length(base_candidate) between 2 and 2000000
 and input_text::jsonb#>>'{input,revision,parentJobId}' is not distinct from parent_job_id::text
 and input_text::jsonb#>>'{input,revision,feedbackId}' is not distinct from feedback_id::text
 and input_text::jsonb#>>'{input,revision,headJobId}' is not distinct from head_job_id::text
 and input_text::jsonb#>>'{input,revision,candidateTextHash}' is not distinct from encode(sha256(convert_to(base_candidate,'UTF8')),'hex')));
create unique index input_original_content on studio.input_reviews(content_id) where parent_job_id is null;
create unique index input_consumed_feedback on studio.input_reviews(feedback_id) where job_id is not null and feedback_id is not null;
grant insert(parent_job_id,feedback_id,head_job_id,base_candidate) on studio.input_reviews to service_role;

create table studio.content_heads (
 content_id text primary key, owner_id uuid not null, conversation_id uuid not null,
 head_job_id uuid not null, generation integer not null default 0 check(generation between 0 and 20),
 foreign key(conversation_id,owner_id) references studio.conversations(id,owner_id),
 foreign key(head_job_id,owner_id) references studio.jobs(id,owner_id)
);
alter table studio.content_heads enable row level security;
revoke all on studio.content_heads from public,anon,authenticated,service_role;
grant select,insert on studio.content_heads to service_role;
grant update(head_job_id,generation) on studio.content_heads to service_role;
create function studio.revision_version() returns integer language sql security invoker set search_path='' as $$select 1$$;

-- Read-only context; the caller must still validate the full parent evidence.
create function studio.read_revision_context(p_owner uuid,p_job uuid,p_client uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('conversationId',j.conversation_id,'contentId',j.target_content_id,
 'headJobId',coalesce((select r.head_job_id from studio.input_reviews r where r.owner_id=p_owner and r.conversation_id=j.conversation_id and r.client_request_id=p_client and r.parent_job_id=j.id),h.head_job_id,j.id),'generation',coalesce(h.generation,0))
 from studio.jobs j join studio.worker_runs w on w.job_id=j.id
 join studio.teachers t on t.owner_id=j.owner_id and t.active
 join studio.conversations c on c.id=j.conversation_id and c.owner_id=j.owner_id and c.deleted_at is null
 left join studio.content_heads h on h.content_id=j.target_content_id and h.owner_id=j.owner_id
 where j.id=p_job and j.owner_id=p_owner and j.execution_mode='real'
$$;

-- All callers lock budget -> teacher -> conversation before taking lineage locks.
-- The head is the last SUBMITTED job, not merely the last successful candidate.
create function studio.assert_revision_ready(p_review uuid) returns void language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews; parent studio.jobs; worker studio.worker_runs; feedback studio.result_feedback; head studio.content_heads; latest studio.jobs; base_source jsonb; candidate_event jsonb; candidate_sequence integer; source_output text; descriptor jsonb;
begin
 select * into item from studio.input_reviews where id=p_review;
 if not found then raise sqlstate 'PT404'; end if;
 if item.parent_job_id is null then return; end if;
 select * into parent from studio.jobs where id=item.parent_job_id and owner_id=item.owner_id for update;
 if not found or parent.execution_mode<>'real' or parent.conversation_id<>item.conversation_id or parent.target_content_id<>item.content_id then raise sqlstate 'PT409'; end if;
 select * into worker from studio.worker_runs where job_id=parent.id for update;
 if not found or worker.state<>'finished' or parent.state not in ('needs_input','failed','cancelled','awaiting_approval') then raise sqlstate 'PT409'; end if;
 if not exists(select 1 from studio.budget_jobs where job_id=parent.id and state='closed') then raise sqlstate 'PT423'; end if;
 select * into feedback from studio.result_feedback where id=item.feedback_id and owner_id=item.owner_id and job_id=parent.id;
 if not found or feedback.decision<>'request_changes' then raise sqlstate 'PT409'; end if;
 select body::jsonb,sequence into candidate_event,candidate_sequence from studio.worker_evidence where job_id=parent.id and kind='candidate' order by sequence desc limit 1;
 if not found then raise sqlstate 'PT409'; end if;
 select body::jsonb->>'output' into source_output from studio.worker_evidence where job_id=parent.id and kind='role_output' and sequence<candidate_sequence and body::jsonb->>'role'='developer' order by sequence desc limit 1;
 if source_output is distinct from item.base_candidate or feedback.candidate_hash is distinct from candidate_event->>'candidateHash'
 or feedback.source_hash<>worker.source_snapshot_hash or feedback.state_version<>parent.state_version or feedback.evidence_hash<>studio.worker_evidence_hash(parent.id) then raise sqlstate 'PT409'; end if;
 descriptor:=item.input_text::jsonb#>'{input,revision}';
 if descriptor is distinct from jsonb_build_object('parentJobId',parent.id,'feedbackId',feedback.id,'headJobId',item.head_job_id,
 'stateVersion',parent.state_version,'sourceHash',worker.source_snapshot_hash,'candidateHash',feedback.candidate_hash,'evidenceHash',feedback.evidence_hash,
 'candidateTextHash',encode(sha256(convert_to(source_output,'UTF8')),'hex')) then raise sqlstate 'PT409'; end if;
 base_source:=worker.approved_input::jsonb;
 if item.input_text::jsonb->'context' is distinct from base_source->'context'
 or ((item.input_text::jsonb->'input')-'revision'-'requirements') is distinct from ((base_source->'input')-'revision'-'requirements')
 or item.input_text::jsonb#>'{input,requirements}' is distinct from ((base_source#>'{input,requirements}')||jsonb_build_array(jsonb_build_object('id','revision-'||feedback.id::text,'text',feedback.note)))
 or item.request_snapshot#>>'{payload,targetContentId}' is distinct from item.content_id
 or item.request_snapshot#>>'{payload,expectedVersion}' is distinct from feedback.candidate_hash then raise sqlstate 'PT409'; end if;
 -- Lazy adoption of a sole pre-proposal job preserves its bytes. Ambiguous
 -- historical branches require reconciliation, never guessed "latest" dates.
 if not exists(select 1 from studio.content_heads where content_id=item.content_id) then
  if (select count(*) from studio.jobs where execution_mode='real' and target_content_id=item.content_id)<>1 then raise sqlstate 'PT409'; end if;
  insert into studio.content_heads(content_id,owner_id,conversation_id,head_job_id) values(item.content_id,item.owner_id,item.conversation_id,parent.id);
 end if;
 select * into head from studio.content_heads where content_id=item.content_id for update;
 if head.owner_id<>item.owner_id or head.conversation_id<>item.conversation_id or head.head_job_id<>item.head_job_id then raise sqlstate 'PT409'; end if;
 if head.generation>=20 then raise sqlstate 'PT429'; end if;
 if head.head_job_id<>parent.id then
  select * into latest from studio.jobs where id=head.head_job_id;
  -- Explicit retry from the unchanged base is possible only after a child
  -- ended without producing ANY candidate. A newer candidate must be reviewed.
  if latest.state not in ('needs_input','failed','cancelled') or exists(select 1 from studio.worker_evidence where job_id=latest.id and kind='candidate')
  or not exists(select 1 from studio.input_reviews where job_id=latest.id and parent_job_id=parent.id)
  or not exists(select 1 from studio.budget_jobs where job_id=latest.id and state='closed') then raise sqlstate 'PT409'; end if;
 end if;
 if exists(select 1 from studio.input_reviews where feedback_id=item.feedback_id and job_id is not null and id<>item.id) then raise sqlstate 'PT409'; end if;
end $$;

create function studio.prepare_worker_revision(p_owner uuid,p_parent uuid,p_feedback uuid,p_client uuid,p_head uuid,p_request jsonb,p_input text,p_hash text,p_candidate text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare parent studio.jobs; item studio.input_reviews;
begin
 perform 1 from studio.budget_policy where singleton for update;
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 select * into parent from studio.jobs where id=p_parent and owner_id=p_owner and execution_mode='real';
 if not found then raise sqlstate 'PT404'; end if;
 perform 1 from studio.conversations where id=parent.conversation_id and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 if p_client is null or p_feedback is null or p_head is null or p_input is null or p_hash is null or p_candidate is null or p_request is null
 or octet_length(p_input)>50000 or octet_length(p_candidate)>2000000 or encode(sha256(convert_to(p_input,'UTF8')),'hex')<>p_hash
 or p_request->>'schemaVersion' is distinct from '2' or p_request->>'operation' is distinct from 'create_simulation'
 or p_request->>'conversationId' is distinct from parent.conversation_id::text or p_request->>'clientRequestId' is distinct from p_client::text
 or p_request->'payload' ? 'schoolYear' then raise sqlstate 'PT400'; end if;
 select * into item from studio.input_reviews where owner_id=p_owner and conversation_id=parent.conversation_id and client_request_id=p_client for update;
 if found then
  if item.parent_job_id is distinct from p_parent or item.feedback_id is distinct from p_feedback or item.head_job_id is distinct from p_head or item.input_text<>p_input or item.source_hash<>p_hash or item.base_candidate is distinct from p_candidate or item.request_snapshot<>p_request then raise sqlstate 'PT409'; end if;
  return to_jsonb(item);
 end if;
 if (select count(*) from studio.input_reviews where owner_id=p_owner)>=500 or (select count(*) from studio.input_reviews where owner_id=p_owner and created_at>=now()-interval '24 hours')>=30 then raise sqlstate 'PT429'; end if;
 insert into studio.input_reviews(owner_id,conversation_id,client_request_id,request_snapshot,input_text,source_hash,content_id,parent_job_id,feedback_id,head_job_id,base_candidate)
 values(p_owner,parent.conversation_id,p_client,p_request,p_input,p_hash,parent.target_content_id,p_parent,p_feedback,p_head,p_candidate) returning * into item;
 perform studio.assert_revision_ready(item.id);
 return to_jsonb(item);
end $$;

-- This BEFORE UPDATE trigger also covers callers using the original approval
-- and submission RPCs; a separate route cannot bypass the lineage guard.
create function studio.guard_revision_input() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.parent_job_id is not null and old.state<>'consumed' and new.state in ('approved','consumed') then
  perform studio.assert_revision_ready(old.id);
 end if;
 return new;
end $$;
create trigger input_revision_guard before update on studio.input_reviews for each row execute function studio.guard_revision_input();

-- Approval takes the global lock first, matching submissions/cancellation.
create or replace function studio.approve_worker_input(p_owner uuid,p_review uuid,p_hash text,p_consent jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews; conversation uuid;
begin
 perform 1 from studio.budget_policy where singleton for update;
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 select conversation_id into conversation from studio.input_reviews where id=p_review and owner_id=p_owner;
 perform 1 from studio.conversations where id=conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 select * into item from studio.input_reviews where id=p_review and owner_id=p_owner for update;
 if not found then raise sqlstate 'PT404'; end if;
 if item.source_hash is distinct from p_hash or p_consent is distinct from '{"version":1,"aiProcessingAllowed":true,"publicInputAllowed":true,"noPrivateData":true,"budgetAccepted":true}'::jsonb then raise sqlstate 'PT409'; end if;
 if item.state='consumed' then return to_jsonb(item); end if;
 if item.expires_at<=clock_timestamp() then raise sqlstate 'PT410'; end if;
 perform studio.assert_revision_ready(item.id);
 if item.state='approved' then return to_jsonb(item); end if;
 update studio.input_reviews set state='approved',approved_at=clock_timestamp(),consent=p_consent where id=item.id returning * into item;
 return to_jsonb(item);
end $$;

create function studio.advance_content_head() returns trigger language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews;
begin
 select * into item from studio.input_reviews where id=new.input_review_id and job_id=new.job_id;
 if not found then raise sqlstate 'PT409'; end if;
 if item.parent_job_id is null then
  insert into studio.content_heads(content_id,owner_id,conversation_id,head_job_id) values(item.content_id,item.owner_id,item.conversation_id,new.job_id);
 else
  update studio.content_heads set head_job_id=new.job_id,generation=generation+1
  where content_id=item.content_id and owner_id=item.owner_id and head_job_id=item.head_job_id and generation<20;
  if not found then raise sqlstate 'PT409'; end if;
 end if;
 return new;
end $$;
create trigger worker_revision_head after insert on studio.worker_runs for each row execute function studio.advance_content_head();

create function studio.read_revision_base(p_job uuid,p_run bigint,p_attempt integer,p_source text) returns text language sql stable security invoker set search_path='' as $$
 select r.base_candidate from studio.worker_runs w join studio.input_reviews r on r.id=w.input_review_id and r.job_id=w.job_id
 join studio.jobs j on j.id=w.job_id join studio.teachers t on t.owner_id=w.owner_id and t.active
 join studio.conversations c on c.id=j.conversation_id and c.deleted_at is null
 where w.job_id=p_job and w.workflow_run_id=p_run and w.workflow_run_attempt=p_attempt and w.source_snapshot_hash=p_source
 and j.state in ('queued','running') and r.state='consumed' and studio.worker_execution_enabled()
 and exists(select 1 from studio.budget_policy where singleton and enabled)
$$;
revoke all on function studio.revision_version(),studio.read_revision_context(uuid,uuid,uuid),studio.assert_revision_ready(uuid),studio.prepare_worker_revision(uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text),studio.guard_revision_input(),studio.advance_content_head(),studio.read_revision_base(uuid,bigint,integer,text) from public,anon,authenticated;
grant execute on function studio.revision_version(),studio.read_revision_context(uuid,uuid,uuid),studio.assert_revision_ready(uuid),studio.prepare_worker_revision(uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text),studio.guard_revision_input(),studio.advance_content_head(),studio.read_revision_base(uuid,bigint,integer,text) to service_role;

commit;
