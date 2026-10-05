-- REVIEW ONLY. After runner_v1, worker_auth_v1 and input_review_v1.
-- No data backfill, external request or activation. Existing jobs are preserved.
begin;
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
commit;
