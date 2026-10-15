// Produces reviewable SQL only. No database client, credentials or execution.
// Apply to the first approved input only, after backup/restore and explicit scope review.
const need=(ok)=>{if(!ok)throw Error('FIRST_GENERATION_SCOPE_INVALID');};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function firstGenerationSql({reviewId,sourceHash,admitUntil},now=Date.now()){
 need(uuid.test(reviewId)&&/^[a-f0-9]{64}$/.test(sourceHash));
 const end=Date.parse(admitUntil);
 need(Number.isFinite(now)&&Number.isFinite(end)&&new Date(end).toISOString()===admitUntil&&end>now&&end-now<=3600000);
 const workerUntil=new Date(end+1200000).toISOString();
 return `begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $guard$
begin
 perform 1 from studio.budget_policy where singleton for update;
 lock table studio.worker_runs in share row exclusive mode;
 if not exists(select 1 from studio.budget_policy where singleton and not enabled
   and version='studio-budget-2026-10-04' and monthly_usd_micros=5000000
   and job_usd_micros=500000 and monthly_jobs=10 and calls_per_job=9)
   or studio.worker_execution_enabled() or studio.dispatch_execution_enabled()
   or exists(select 1 from studio.worker_runs) or exists(select 1 from studio.budget_jobs)
   or exists(select 1 from studio.budget_calls)
   or '${admitUntil}'::timestamptz<=clock_timestamp()
   or '${admitUntil}'::timestamptz>clock_timestamp()+interval '1 hour'
 then raise exception 'FIRST_GENERATION_PREFLIGHT_FAILED'; end if;
 if not exists(select 1 from studio.input_reviews r join studio.teachers t on t.owner_id=r.owner_id
   where r.id='${reviewId}'::uuid and r.source_hash='${sourceHash}' and r.state='approved'
   and r.job_id is null and r.expires_at>'${admitUntil}'::timestamptz and t.active
   and r.consent='{"version":1,"aiProcessingAllowed":true,"publicInputAllowed":true,"noPrivateData":true,"budgetAccepted":true}'::jsonb)
 then raise exception 'FIRST_GENERATION_CONSENT_REQUIRED'; end if;
end $guard$;
create function studio.guard_first_worker_run() returns trigger language plpgsql security invoker set search_path='' as $guard$
begin
 -- The same budget mutex as submission serializes this check and insert.
 perform 1 from studio.budget_policy where singleton and enabled for update;
 if not found or clock_timestamp()>='${admitUntil}'::timestamptz
   or new.input_review_id is distinct from '${reviewId}'::uuid
   or new.source_snapshot_hash is distinct from '${sourceHash}'
   or exists(select 1 from studio.worker_runs)
   or not exists(select 1 from studio.input_reviews r where r.id=new.input_review_id
     and r.owner_id=new.owner_id and r.source_hash=new.source_snapshot_hash
     and r.input_text=new.approved_input and r.state='approved' and r.job_id is null
     and r.expires_at>clock_timestamp())
 then raise sqlstate 'PT412'; end if;
 return new;
end $guard$;
revoke all on function studio.guard_first_worker_run() from public,anon,authenticated,service_role;
create trigger first_worker_run_only before insert on studio.worker_runs
for each row execute function studio.guard_first_worker_run();
create or replace function studio.worker_execution_enabled() returns boolean language sql security invoker set search_path='' as $gate$
 select clock_timestamp()<'${workerUntil}'::timestamptz
$gate$;
create or replace function studio.dispatch_execution_enabled() returns boolean language sql security invoker set search_path='' as $gate$
 select clock_timestamp()<'${admitUntil}'::timestamptz
$gate$;
update studio.budget_policy set enabled=true where singleton;
commit;
`;
}

// Keep the admission guard and all evidence. Stop new reservations immediately;
// previously sent provider requests may still incur cost and must be settled.
export const STOP_FIRST_GENERATION_SQL=`begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
update studio.budget_policy set enabled=false where singleton;
create or replace function studio.worker_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select false$$;
create or replace function studio.dispatch_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select false$$;
commit;
`;
