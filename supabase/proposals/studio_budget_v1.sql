-- REVIEW ONLY: durable project-wide budget; does not enable real execution.
-- Requires studio v2. The runner must support real jobs before reservation.
begin;
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
commit;
