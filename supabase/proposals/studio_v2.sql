-- 07-1 REVIEW ONLY. Not applied. Apply after studio_v1; one transaction.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table studio.conversations add column deleted_at timestamptz, add column creation_request_id uuid;
create unique index conversation_creation_request on studio.conversations(owner_id,creation_request_id);
alter table studio.jobs drop constraint jobs_request_version_check;
alter table studio.jobs add constraint jobs_request_version_check check(request_version in (1,2));
-- Preserve immutable snapshots/hashes. v2 has no schoolYear; old column remains.
-- A tombstone retains FK identity only; message bodies and title are erased.
grant update(title,deleted_at) on studio.conversations to service_role;
grant delete on studio.messages to service_role;
-- DB-first rollout: old service-role readers do not filter tombstones.
-- Keep deletion closed until compatible deployment AND rollback build are verified.
-- Enabling requires a separately reviewed migration; application roles cannot alter it.
create function studio.conversation_delete_enabled_v2() returns boolean
language sql security invoker set search_path='' as $$ select false $$;
revoke all on function studio.conversation_delete_enabled_v2() from public,anon,authenticated;
grant execute on function studio.conversation_delete_enabled_v2() to service_role;
create function studio.studio_capabilities_v2() returns integer language sql security invoker set search_path='' as $$ select 2 $$;
create function studio.new_conversation_v2(p_owner uuid,p_title text,p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare row studio.conversations;
begin
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 if p_request is null or p_title is null or length(btrim(p_title))=0 or length(p_title)>120 then raise sqlstate 'PT400'; end if;
 select * into row from studio.conversations where owner_id=p_owner and creation_request_id=p_request;
 if found then
  if row.deleted_at is not null then raise sqlstate 'PT404'; end if;
  if row.title<>btrim(p_title) then raise sqlstate 'PT409'; end if;
  return to_jsonb(row);
 end if;
 if (select count(*) from studio.conversations where owner_id=p_owner and deleted_at is null)>=100 then raise sqlstate 'PT429'; end if;
 insert into studio.conversations(owner_id,title,creation_request_id) values(p_owner,btrim(p_title),p_request) returning * into row;
 return to_jsonb(row);
end $$;
create function studio.edit_conversation_v2(p_owner uuid,p_conversation uuid,p_action text,p_title text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare row studio.conversations;
begin
 -- Same lock order as submit_job: teacher then conversation. Serializes deletion/submission.
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 select * into row from studio.conversations where id=p_conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 if p_action='rename' then
  if p_title is null or length(btrim(p_title))=0 or length(p_title)>120 then raise sqlstate 'PT400'; end if;
  update studio.conversations set title=btrim(p_title) where id=p_conversation returning * into row;
 elsif p_action='delete' then
  if not studio.conversation_delete_enabled_v2() then raise sqlstate 'PT412'; end if;
  if exists(select 1 from studio.jobs where conversation_id=p_conversation and owner_id=p_owner and state in ('queued','running','cancel_requested')) then raise sqlstate 'PT423'; end if;
  delete from studio.messages where conversation_id=p_conversation and owner_id=p_owner;
  update studio.conversations set title='[deleted]',deleted_at=now() where id=p_conversation returning * into row;
 else raise sqlstate 'PT400'; end if;
 return to_jsonb(row);
end $$;
create or replace function studio.submit_job(p_owner uuid,p_conversation uuid,p_client_request uuid,p_hash text,p_snapshot jsonb,p_job uuid,p_idempotency uuid,p_retry_of uuid default null,p_retry_expected integer default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare row studio.jobs; prior studio.jobs; attempt integer:=1;
begin
  perform 1 from studio.teachers where owner_id=p_owner and active for update;
  if not found then raise sqlstate 'PT403'; end if;
  perform 1 from studio.conversations where id=p_conversation and owner_id=p_owner and deleted_at is null for update;
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
  insert into studio.jobs(id,owner_id,conversation_id,operation,request_version,request_snapshot,school_year,target_content_id,expected_version,client_request_id,idempotency_key,payload_hash,run_id,run_attempt,retry_of)
    values(p_job,p_owner,p_conversation,'create_simulation',(p_snapshot->>'schemaVersion')::integer,p_snapshot,(p_snapshot#>>'{payload,schoolYear}')::integer,p_snapshot#>>'{payload,targetContentId}',p_snapshot#>>'{payload,expectedVersion}',p_client_request,p_idempotency,p_hash,'mock:'||p_job::text,attempt,p_retry_of) returning * into row;
  insert into studio.messages(conversation_id,owner_id,role,body,client_request_id)
    values(p_conversation,p_owner,'user',p_snapshot#>>'{payload,requirements}',p_client_request);
  insert into studio.job_events(job_id,owner_id,sequence,state_version,command_id,command_type,to_state,run_id,run_attempt)
    values(p_job,p_owner,0,0,p_client_request,'submit','queued',row.run_id,attempt);
  return to_jsonb(row);
end $$;


create function studio.submit_job_v2(p_owner uuid,p_conversation uuid,p_client_request uuid,p_hash text,p_snapshot jsonb,p_job uuid,p_idempotency uuid,p_retry_of uuid default null,p_retry_expected integer default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if (p_snapshot->>'schemaVersion')::integer is distinct from 2 or (p_snapshot->'payload') ? 'schoolYear' then raise sqlstate 'PT400'; end if;
 return studio.submit_job(p_owner,p_conversation,p_client_request,p_hash,p_snapshot,p_job,p_idempotency,p_retry_of,p_retry_expected);
end $$;
-- Hide tombstones also from authenticated Data API reads; job history remains independent.
drop policy owner_read on studio.conversations;
create policy owner_read on studio.conversations for select to authenticated using(owner_id=(select auth.uid()) and deleted_at is null and exists(select 1 from studio.teachers t where t.owner_id=(select auth.uid()) and t.active));
revoke all on function studio.studio_capabilities_v2(),studio.new_conversation_v2(uuid,text,uuid),studio.edit_conversation_v2(uuid,uuid,text,text),studio.submit_job_v2(uuid,uuid,uuid,text,jsonb,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function studio.studio_capabilities_v2(),studio.new_conversation_v2(uuid,text,uuid),studio.edit_conversation_v2(uuid,uuid,text,text),studio.submit_job_v2(uuid,uuid,uuid,text,jsonb,uuid,uuid,uuid,integer) to service_role;
commit;
