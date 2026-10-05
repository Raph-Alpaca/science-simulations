-- REVIEW ONLY. After studio_worker_v1; no deployment or gate activation.
begin;
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
commit;
