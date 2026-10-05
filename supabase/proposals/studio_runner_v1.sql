-- REVIEW ONLY. Independent optional runner storage, AFTER studio_v2.
-- Does not enable real jobs: existing jobs.execution_mode remains mock-only.
begin;
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
commit;
