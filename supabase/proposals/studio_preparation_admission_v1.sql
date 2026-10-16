-- REVIEW ONLY. After preparation_sources_v1 and input_review_v1.
-- Strengthens NEW worker admission; does not enable workers or alter existing jobs.
begin;
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
