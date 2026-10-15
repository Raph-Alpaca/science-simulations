-- Source preparation foundation. Does not issue records or enable execution.
-- Apply only after backup/restore and review of this exact file.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 perform 1 from studio.budget_policy where singleton for update;
 if studio.input_review_version()<>1 or studio.release_approval_version()<>1
 or studio.worker_execution_enabled() or studio.dispatch_execution_enabled()
 or studio.publication_dispatch_enabled() or studio.publication_api_enabled() or studio.publication_deploy_enabled()
 or (select enabled from studio.budget_policy where singleton)
 or exists(select 1 from studio.jobs where execution_mode='real' and state in ('queued','running','cancel_requested'))
 or exists(select 1 from studio.budget_calls where state in ('reserved','uncertain'))
 or (select array_agg(relname::text order by relname) from pg_class where relnamespace='studio'::regnamespace and relkind='r') is distinct from array['approvals','budget_calls','budget_jobs','budget_policy','content_heads','conversations','dispatch_intents','input_reviews','job_events','jobs','messages','publication_authorizations','publication_checks','publication_dispatches','publication_oidc_receipts','publication_outcomes','release_baseline','release_reviews','releases','result_feedback','reviews','source_reviews','teachers','worker_evidence','worker_oidc_receipts','worker_runs']
 then raise exception 'STUDIO_PREPARATION_BASELINE_MISMATCH'; end if;
end
$preflight$;

-- SOURCE supabase/proposals/studio_preparation_sources_v1.sql SHA256-LF 2b6ff405f7312f36b2376f336cffc9ef2e6e39af17af7ba75d3b33b18e83c4c5
-- REVIEW ONLY. Source-library storage; no generation or publication gate enabled.
-- A separate trusted operator records original checks. The application service
-- can read this store but cannot issue, alter or revoke its authority.

set local lock_timeout='5s';
set local statement_timeout='30s';
-- Fixed key order matches preparationSourceFingerprint; jsonb::text does not.
create function studio.preparation_source_fingerprint(s jsonb) returns text
language sql immutable security invoker set search_path='' as $$
 select encode(sha256(convert_to('{"kind":'||(s->'kind')::text||',"title":'||(s->'title')::text||
 ',"url":'||(s->'url')::text||',"location":'||(s->'location')::text||',"summary":'||(s->'summary')::text||'}','UTF8')),'hex')
$$;
create function studio.preparation_source_fields_valid(s jsonb,r jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb; a timestamptz; b timestamptz;
begin
 if s is null or r is null or jsonb_typeof(s)<>'object' or jsonb_typeof(r)<>'object' then return false; end if;
 foreach k in array array['kind','title','url','location','summary'] loop
  if jsonb_typeof(s->k) is distinct from 'string' or length(s->>k)=0 or btrim(s->>k)<>s->>k then return false; end if;
 end loop;
 foreach k in array array['purpose','recordId','ownerId','sourceFingerprint','kind','reviewScope','curriculumRevision','documentHash','locator','checkedScope','reviewerId','reviewedAt','validUntil','method','status'] loop
  if jsonb_typeof(r->k) is distinct from 'string' or length(r->>k)=0 or btrim(r->>k)<>r->>k then return false; end if;
 end loop;
 if r->'schemaVersion' is distinct from '1'::jsonb or r->'aiUseAllowed' is distinct from 'true'::jsonb or r->'summaryPublicAllowed' is distinct from 'true'::jsonb
 or r->>'sourceFingerprint' is distinct from studio.preparation_source_fingerprint(s)
 or length(s->>'title')>150 or length(s->>'url')>1000 or length(s->>'location')>160 or length(s->>'summary')>900
 or s->>'url' !~ '^https://[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}([/?#]|$)'
 or s->>'url' ~ '^https://([^/?#]+\.)?(localhost|local|internal|test|invalid)([/?#]|$)'
 or jsonb_typeof(r->'limitations') is distinct from 'array' then return false; end if;
 if jsonb_array_length(r->'limitations')>10 then return false; end if;
 for v in select value from jsonb_array_elements(r->'limitations') loop
  if jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 500 or btrim(v#>>'{}')<>v#>>'{}' then return false; end if;
 end loop;
 if r->>'reviewedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
 or r->>'validUntil' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then return false; end if;
 a:=(r->>'reviewedAt')::timestamptz; b:=(r->>'validUntil')::timestamptz;
 return a<b and to_char(a at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=r->>'reviewedAt'
 and to_char(b at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=r->>'validUntil';
exception when others then return false;
end $$;
create table studio.preparation_sources (
 id uuid primary key,
 owner_id uuid not null references studio.teachers(owner_id),
 source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{64}$'),
 review_scope text not null check(review_scope in ('general_concepts','selected_textbook')),
 curriculum_revision text not null check(length(curriculum_revision) between 1 and 30),
 source_identity jsonb not null,
 record jsonb not null,
 created_at timestamptz not null default now(),
 revoked_at timestamptz,
 check(studio.preparation_source_fields_valid(source_identity,record)),
 check(jsonb_typeof(source_identity)='object' and source_identity ?& array['kind','title','url','location','summary']
   and source_identity-array['kind','title','url','location','summary']='{}'::jsonb),
 check(jsonb_typeof(record)='object'
   and record ?& array['schemaVersion','purpose','recordId','ownerId','sourceFingerprint','kind','reviewScope','curriculumRevision','documentHash','locator','checkedScope','limitations','reviewerId','reviewedAt','validUntil','method','status','aiUseAllowed','summaryPublicAllowed']
   and record-array['schemaVersion','purpose','recordId','ownerId','sourceFingerprint','kind','reviewScope','curriculumRevision','documentHash','locator','checkedScope','limitations','reviewerId','reviewedAt','validUntil','method','status','aiUseAllowed','summaryPublicAllowed']='{}'::jsonb),
 check(record->>'schemaVersion'='1' and record->>'purpose'='generation_source_preparation'
   and record->>'recordId'=id::text and record->>'ownerId'=owner_id::text
   and record->>'sourceFingerprint'=source_fingerprint and record->>'reviewScope'=review_scope
   and record->>'curriculumRevision'=curriculum_revision
   and record->>'kind' in ('curriculum','textbook','science') and record->>'kind'=source_identity->>'kind'
   and record->>'documentHash' ~ '^[a-f0-9]{64}$' and record->>'method'='original_scope_checked'
   and record->>'status'='reviewed' and jsonb_typeof(record->'limitations')='array'
   and record->'aiUseAllowed'='true'::jsonb and record->'summaryPublicAllowed'='true'::jsonb),
 check(length(record->>'locator') between 1 and 500 and length(record->>'checkedScope') between 1 and 2000
   and length(record->>'reviewerId') between 1 and 150 and octet_length(record::text)<=16000
   and octet_length(source_identity::text)<=8000),
 check((record->>'reviewedAt')::timestamptz<=(record->>'validUntil')::timestamptz)
);
create unique index preparation_sources_active_identity on studio.preparation_sources
 (owner_id,source_fingerprint,review_scope,curriculum_revision) where revoked_at is null;
alter table studio.preparation_sources enable row level security;
revoke all on studio.preparation_sources from public,anon,authenticated,service_role;
grant select on studio.preparation_sources to service_role;

-- Statement lock precedes row locks, matching paid admission's budget mutex.
-- Updating the same value also makes stale repeatable-read admissions serialize.
create function studio.lock_preparation_source_change() returns trigger
language plpgsql security invoker set search_path='' as $$
begin update studio.budget_policy set enabled=enabled where singleton; return null; end $$;
create trigger preparation_source_write_lock before insert or update or delete on studio.preparation_sources
for each statement execute function studio.lock_preparation_source_change();
create function studio.preserve_preparation_source() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then raise sqlstate 'PT409'; end if;
 if (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at')
 or old.revoked_at is not null or new.revoked_at is null then raise sqlstate 'PT409'; end if;
 return new;
end $$;
create trigger preparation_source_immutable before update or delete on studio.preparation_sources
for each row execute function studio.preserve_preparation_source();

create function studio.preparation_sources_version() returns integer
language sql security invoker set search_path='' as $$select 1$$;
create function studio.read_preparation_sources(p_owner uuid,p_fingerprints text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from studio.teachers where owner_id=p_owner and active) then raise sqlstate 'PT403'; end if;
 if p_fingerprints is null or cardinality(p_fingerprints)>6 or
 exists(select 1 from unnest(p_fingerprints) x where x is null or x !~ '^[a-f0-9]{64}$')
 then raise sqlstate 'PT400'; end if;
 select coalesce(jsonb_agg(record order by id),'[]'::jsonb) into result from (
  select id,record from studio.preparation_sources
  where owner_id=p_owner and source_fingerprint=any(p_fingerprints) and revoked_at is null
  limit 31
 ) matching;
 return result;
end $$;
revoke all on function studio.preparation_sources_version(),studio.read_preparation_sources(uuid,text[]) from public,anon,authenticated;
grant execute on function studio.preparation_sources_version(),studio.read_preparation_sources(uuid,text[]) to service_role;
revoke all on function studio.preparation_source_fingerprint(jsonb),studio.preparation_source_fields_valid(jsonb,jsonb),studio.lock_preparation_source_change(),studio.preserve_preparation_source() from public,anon,authenticated,service_role;
grant execute on function studio.preparation_source_fingerprint(jsonb),studio.preparation_source_fields_valid(jsonb,jsonb) to service_role;

-- SOURCE supabase/proposals/studio_preparation_admission_v1.sql SHA256-LF 8f42210a5a99b4e3516ade668f6d6ac5d9c6b5e0af90e9081c7b6bcec1ad3e4e
-- REVIEW ONLY. After preparation_sources_v1 and input_review_v1.
-- Strengthens NEW worker admission; does not enable workers or alter existing jobs.

set local lock_timeout='5s';
set local statement_timeout='30s';
create function studio.assert_preparation_input(p_owner uuid,p_input text) returns void
language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; packet jsonb; sources jsonb; source jsonb; supplied jsonb;
 authority studio.preparation_sources; expected jsonb; fingerprints text[]:='{}'; ids text[]:='{}'; kinds text[]:='{}'; fingerprint text; i integer:=0;
begin
 -- Also used by the BEFORE STATEMENT source-write lock. Read authority only
 -- after this mutex; revocation and admission cannot observe a partial update.
 perform 1 from studio.budget_policy where singleton for update;
 if not exists(select 1 from studio.teachers where owner_id=p_owner and active) then raise sqlstate 'PT403'; end if;
 if p_input is null or octet_length(p_input)>50000 then raise sqlstate 'PT422'; end if;
 ctx:=p_input::jsonb->'context'; packet:=ctx->'sourcePreparation'; sources:=ctx->'sources';
 if packet is null or jsonb_typeof(packet) is distinct from 'object' or jsonb_typeof(sources) is distinct from 'array'
 or packet-array['schemaVersion','purpose','reviewScope','curriculumRevision','records']<>'{}'::jsonb
 or packet->'schemaVersion' is distinct from '1'::jsonb or packet->>'purpose' is distinct from 'generation_source_preparation'
 or coalesce(packet->>'reviewScope' not in ('general_concepts','selected_textbook'),true)
 or packet->>'curriculumRevision' is distinct from ctx->>'curriculumRevision'
 or jsonb_typeof(packet->'records') is distinct from 'array' then raise sqlstate 'PT422'; end if;
 if jsonb_array_length(sources) not between 3 and 6 or jsonb_array_length(packet->'records')<>jsonb_array_length(sources) then raise sqlstate 'PT422'; end if;
 for source in select value from jsonb_array_elements(sources) loop
  if jsonb_typeof(source->'id') is distinct from 'string' or length(source->>'id') not between 1 and 150
  or source->>'id'=any(ids) then raise sqlstate 'PT422'; end if;
  fingerprint:=studio.preparation_source_fingerprint(source);
  if fingerprint is null or fingerprint=any(fingerprints) then raise sqlstate 'PT422'; end if;
  fingerprints:=array_append(fingerprints,fingerprint); ids:=array_append(ids,source->>'id'); kinds:=array_append(kinds,source->>'kind');
  supplied:=packet->'records'->i; i:=i+1;
  select * into authority from studio.preparation_sources
  where owner_id=p_owner and source_fingerprint=fingerprint and review_scope=packet->>'reviewScope'
  and curriculum_revision=packet->>'curriculumRevision' and revoked_at is null;
  if not found or (authority.record->>'reviewedAt')::timestamptz>clock_timestamp()
  or (authority.record->>'validUntil')::timestamptz<=clock_timestamp() then raise sqlstate 'PT422'; end if;
  expected:=(authority.record-array['schemaVersion','purpose','ownerId','reviewScope','curriculumRevision','status'])||jsonb_build_object('sourceId',source->>'id');
  if supplied is distinct from expected then raise sqlstate 'PT422'; end if;
 end loop;
 if not (array['curriculum','textbook','science']<@kinds) then raise sqlstate 'PT422'; end if;
end $$;
create function studio.require_preparation_input() returns trigger
language plpgsql security invoker set search_path='' as $$
begin perform studio.assert_preparation_input(new.owner_id,new.approved_input); return new; end $$;
-- Runs before worker_requires_input_review. Any failure rolls back the entire
-- submission, including the earlier job/budget insertion and consent consumption.
create trigger preparation_worker_input before insert on studio.worker_runs
for each row execute function studio.require_preparation_input();
-- Recheck current authority before each NEW provider reservation. Already
-- reserved calls remain settleable; no completed or uncertain call is resent.
create function studio.require_preparation_call() returns trigger
language plpgsql security invoker set search_path='' as $$
declare item studio.worker_runs;
begin
 perform 1 from studio.budget_policy where singleton for update;
 select * into item from studio.worker_runs where job_id=new.job_id;
 if not found then raise sqlstate 'PT422'; end if;
 perform studio.assert_preparation_input(item.owner_id,item.approved_input);
 return new;
end $$;
create trigger preparation_provider_call before insert on studio.budget_calls
for each row execute function studio.require_preparation_call();
create function studio.preparation_admission_version() returns integer
language sql security invoker set search_path='' as $$select 1$$;
revoke all on function studio.assert_preparation_input(uuid,text),studio.require_preparation_input(),studio.require_preparation_call(),studio.preparation_admission_version() from public,anon,authenticated;
grant execute on function studio.assert_preparation_input(uuid,text),studio.require_preparation_input(),studio.require_preparation_call(),studio.preparation_admission_version() to service_role;

commit;
