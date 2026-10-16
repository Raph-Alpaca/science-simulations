-- REVIEW ONLY. Source-library storage; no generation or publication gate enabled.
-- A separate trusted operator records original checks. The application service
-- can read this store but cannot issue, alter or revoke its authority.
begin;
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
commit;
