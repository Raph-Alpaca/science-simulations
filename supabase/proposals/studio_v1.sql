-- REVIEW ONLY: not applied. New isolated schema; fails instead of overwriting existing objects.
-- After approval, generate a migration via `supabase migration new studio_v1` and place this reviewed SQL there.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create schema studio;
revoke all on schema studio from public, anon, authenticated;
grant usage on schema studio to authenticated, service_role;
-- Per-schema default REVOKE cannot remove global default grants. Restrict the actual
-- new objects below in this same transaction; do not alter Supabase/global defaults.
-- Every future migration must explicitly revoke/grant its new objects before commit.

create table studio.teachers (
  owner_id uuid primary key references auth.users(id), active boolean not null default false
);
create table studio.conversations (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references studio.teachers(owner_id),
  title text not null check (length(title) between 1 and 120),
  target_content_id text, expected_version text,
  created_at timestamptz not null default now(), unique(id,owner_id)
);
create table studio.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null, owner_id uuid not null,
  role text not null check(role in ('user','system')), body text not null check(length(body)<=5000),
  client_request_id uuid not null, created_at timestamptz not null default now(),
  foreign key(conversation_id,owner_id) references studio.conversations(id,owner_id),
  unique(owner_id,conversation_id,client_request_id)
);
create table studio.jobs (
  id uuid primary key, owner_id uuid not null, conversation_id uuid not null,
  operation text not null check(operation='create_simulation'), request_version integer not null default 1 check(request_version=1),
  request_snapshot jsonb not null, school_year integer, target_content_id text, expected_version text,
  client_request_id uuid not null, idempotency_key uuid not null unique, payload_hash text not null check(length(payload_hash)=64),
  execution_mode text not null default 'mock' check(execution_mode='mock'),
  state text not null default 'queued' check(state in ('queued','running','cancel_requested','cancelled','failed','needs_input')),
  state_version integer not null default 0, phase text, error_code text,
  run_id text not null, run_attempt integer not null default 1 check(run_attempt between 1 and 3),
  repair_count integer not null default 0 check(repair_count between 0 and 2),
  retry_of uuid, supersedes_job_id uuid, source_snapshot_hash text,
  policy_version text not null default 'studio-mock-v1', limits_snapshot jsonb not null default '{"maxAttempts":3,"maxEvents":20,"realCalls":0}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,owner_id), unique(owner_id,conversation_id,client_request_id),
  foreign key(conversation_id,owner_id) references studio.conversations(id,owner_id),
  foreign key(retry_of,owner_id) references studio.jobs(id,owner_id),
  foreign key(supersedes_job_id,owner_id) references studio.jobs(id,owner_id)
);
create table studio.job_events (
  id uuid primary key default gen_random_uuid(), job_id uuid not null, owner_id uuid not null,
  sequence integer not null, state_version integer not null, command_id uuid not null,
  command_type text not null check(command_type in ('submit','advance','cancel','simulate_error')),
  from_state text, to_state text not null, phase text, actor_type text not null default 'mock_worker',
  run_id text not null, run_attempt integer not null, error_code text, evidence_ref text,
  occurred_at timestamptz not null default now(), unique(job_id,sequence), unique(job_id,command_id),
  foreign key(job_id,owner_id) references studio.jobs(id,owner_id)
);
create table studio.reviews (
  id uuid primary key default gen_random_uuid(), job_id uuid not null, owner_id uuid not null,
  role text not null, candidate_hash text not null, evidence_version text not null,
  result jsonb not null, checks_not_executed jsonb not null default '[]', run_id text,
  created_at timestamptz not null default now(), foreign key(job_id,owner_id) references studio.jobs(id,owner_id)
);
create table studio.approvals (
  id uuid primary key default gen_random_uuid(), job_id uuid not null, owner_id uuid not null,
  content_id text not null, candidate_hash text not null, artifact_hash text not null,
  policy_version text not null, checks_version text not null, approver uuid not null references auth.users(id),
  approved_at timestamptz not null, invalidated_at timestamptz,
  unique(id,owner_id), foreign key(job_id,owner_id) references studio.jobs(id,owner_id)
);
create table studio.releases (
  id uuid primary key default gen_random_uuid(), job_id uuid not null, owner_id uuid not null,
  content_id text not null, action text not null, approval_id uuid not null,
  source_hash text, candidate_hash text not null, artifact_hash text not null,
  release_commit text not null, run_id text not null, run_attempt integer not null,
  public_url text not null, verification_state text not null, verified_at timestamptz, previous_release_id uuid,
  unique(id,owner_id), foreign key(job_id,owner_id) references studio.jobs(id,owner_id),
  foreign key(approval_id,owner_id) references studio.approvals(id,owner_id),
  foreign key(previous_release_id,owner_id) references studio.releases(id,owner_id)
);

-- Object-level Data API grants and row-level ownership policies are separate.
revoke all on all tables in schema studio from public, anon, authenticated, service_role;
grant select on all tables in schema studio to authenticated, service_role;
grant insert on studio.conversations, studio.messages, studio.jobs, studio.job_events to service_role;
grant update(state,state_version,phase,error_code,updated_at) on studio.jobs to service_role;
-- No service-role INSERT grant for teachers/reviews/approvals/releases in this phase.
alter table studio.teachers enable row level security;
create policy teacher_self on studio.teachers for select to authenticated
  using(owner_id=(select auth.uid()) and active);
do $$ declare tab text; begin
  foreach tab in array array['conversations','messages','jobs','job_events','reviews','approvals','releases'] loop
    execute format('alter table studio.%I enable row level security',tab);
    execute format('create policy owner_read on studio.%I for select to authenticated using (owner_id=(select auth.uid()) and exists(select 1 from studio.teachers t where t.owner_id=(select auth.uid()) and t.active))',tab);
    execute format('create index on studio.%I(owner_id)',tab);
  end loop;
end $$;

-- Invoker RPCs: only server service_role gets EXECUTE. No SECURITY DEFINER or user-supplied status API.
create function studio.new_conversation(p_owner uuid,p_title text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare row studio.conversations;
begin
  perform 1 from studio.teachers where owner_id=p_owner and active for update;
  if not found then raise sqlstate 'PT403'; end if;
  if (select count(*) from studio.conversations where owner_id=p_owner)>=100 then raise sqlstate 'PT429'; end if;
  insert into studio.conversations(owner_id,title) values(p_owner,p_title) returning * into row;
  return to_jsonb(row);
end $$;

create function studio.submit_job(p_owner uuid,p_conversation uuid,p_client_request uuid,p_hash text,p_snapshot jsonb,p_job uuid,p_idempotency uuid,p_retry_of uuid default null,p_retry_expected integer default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare row studio.jobs; prior studio.jobs; attempt integer:=1;
begin
  perform 1 from studio.teachers where owner_id=p_owner and active for update;
  if not found then raise sqlstate 'PT403'; end if;
  perform 1 from studio.conversations where id=p_conversation and owner_id=p_owner;
  if not found then raise sqlstate 'PT404'; end if;
  select * into row from studio.jobs where owner_id=p_owner and conversation_id=p_conversation and client_request_id=p_client_request;
  if found then
    if row.payload_hash<>p_hash then raise sqlstate 'PT409'; end if;
    return to_jsonb(row);
  end if;
  if (select count(*) from studio.jobs where owner_id=p_owner and conversation_id=p_conversation)>=100 then raise sqlstate 'PT429'; end if;
  if exists(select 1 from studio.jobs where owner_id=p_owner and state in ('queued','running','cancel_requested')) then raise sqlstate 'PT409'; end if;
  if p_retry_of is not null then
    select * into prior from studio.jobs where id=p_retry_of and owner_id=p_owner and conversation_id=p_conversation;
    if not found then raise sqlstate 'PT404'; end if;
    if p_retry_expected is null or prior.state_version<>p_retry_expected or prior.state not in ('failed','cancelled') or prior.run_attempt>=3 or exists(select 1 from studio.jobs where retry_of=p_retry_of) then raise sqlstate 'PT409'; end if;
    attempt:=prior.run_attempt+1;
  end if;
  insert into studio.jobs(id,owner_id,conversation_id,operation,request_snapshot,school_year,target_content_id,expected_version,client_request_id,idempotency_key,payload_hash,run_id,run_attempt,retry_of)
    values(p_job,p_owner,p_conversation,'create_simulation',p_snapshot,(p_snapshot#>>'{payload,schoolYear}')::integer,p_snapshot#>>'{payload,targetContentId}',p_snapshot#>>'{payload,expectedVersion}',p_client_request,p_idempotency,p_hash,'mock:'||p_job::text,attempt,p_retry_of) returning * into row;
  insert into studio.messages(conversation_id,owner_id,role,body,client_request_id)
    values(p_conversation,p_owner,'user',p_snapshot#>>'{payload,requirements}',p_client_request);
  insert into studio.job_events(job_id,owner_id,sequence,state_version,command_id,command_type,to_state,run_id,run_attempt)
    values(p_job,p_owner,0,0,p_client_request,'submit','queued',row.run_id,attempt);
  return to_jsonb(row);
end $$;

create function studio.transition_mock_job(p_owner uuid,p_job uuid,p_expected integer,p_command_id uuid,p_command text,p_state text,p_phase text,p_error text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare row studio.jobs; receipt studio.job_events; old_state text; phases text[]:=array['source_review','learning_design','development','independent_review','testing','policy_check']; idx integer;
begin
  perform 1 from studio.teachers where owner_id=p_owner and active;
  if not found then raise sqlstate 'PT403'; end if;
  select * into row from studio.jobs where id=p_job and owner_id=p_owner for update;
  if not found then raise sqlstate 'PT404'; end if;
  select * into receipt from studio.job_events where job_id=p_job and command_id=p_command_id;
  if found then
    if receipt.command_type is distinct from p_command or receipt.state_version is distinct from p_expected+1 or receipt.to_state is distinct from p_state or receipt.phase is distinct from p_phase or receipt.error_code is distinct from p_error then raise sqlstate 'PT409'; end if;
    return to_jsonb(row);
  end if;
  if row.state_version is distinct from p_expected or row.state_version>=19 or row.execution_mode<>'mock' then raise sqlstate 'PT409'; end if;
  idx:=array_position(phases,row.phase);
  if (
    (p_command='cancel' and row.state in ('queued','running') and p_state='cancel_requested' and p_phase is not distinct from row.phase and p_error is null) or
    (p_command='simulate_error' and row.state in ('queued','running') and p_state='failed' and p_phase is not distinct from row.phase and p_error='MOCK_SIMULATED_FAILURE') or
    (p_command='advance' and row.state='cancel_requested' and p_state='cancelled' and p_phase is not distinct from row.phase and p_error is null) or
    (p_command='advance' and row.state='queued' and p_state='running' and p_phase='source_review' and p_error is null) or
    (p_command='advance' and row.state='running' and idx<6 and p_state='running' and p_phase=phases[idx+1] and p_error is null) or
    (p_command='advance' and row.state='running' and idx=6 and p_state='needs_input' and p_phase='policy_check' and p_error='MOCK_FINISHED_NO_EVIDENCE')
  ) is not true then raise sqlstate 'PT409'; end if;
  old_state:=row.state;
  update studio.jobs set state=p_state,phase=p_phase,error_code=p_error,state_version=state_version+1,updated_at=now() where id=p_job returning * into row;
  insert into studio.job_events(job_id,owner_id,sequence,state_version,command_id,command_type,from_state,to_state,phase,run_id,run_attempt,error_code)
    values(p_job,p_owner,row.state_version,row.state_version,p_command_id,p_command,old_state,p_state,p_phase,row.run_id,row.run_attempt,p_error);
  return to_jsonb(row);
end $$;
revoke all on all functions in schema studio from public, anon, authenticated;
grant execute on function studio.new_conversation(uuid,text), studio.submit_job(uuid,uuid,uuid,text,jsonb,uuid,uuid,uuid,integer), studio.transition_mock_job(uuid,uuid,integer,uuid,text,text,text,text) to service_role;
-- SELECT FOR UPDATE requires UPDATE permission; teacher rows are never changed by application RPCs.
grant update(active) on studio.teachers to service_role;
commit;
