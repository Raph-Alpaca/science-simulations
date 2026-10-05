-- REVIEW ONLY. After worker_v1; not applied to production. No execution gate is enabled.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table studio.input_reviews (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 conversation_id uuid not null, client_request_id uuid not null,
 request_snapshot jsonb not null, input_text text not null,
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 content_id text not null unique check(content_id ~ '^sim-[a-f0-9]{28}$'),
 state text not null default 'prepared' check(state in ('prepared','approved','consumed')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '24 hours',
 approved_at timestamptz, consent jsonb, job_id uuid unique,
 foreign key(conversation_id,owner_id) references studio.conversations(id,owner_id),
 foreign key(job_id,owner_id) references studio.jobs(id,owner_id),
 unique(owner_id,conversation_id,client_request_id),
 check(octet_length(input_text) between 2 and 50000),
 check(encode(sha256(convert_to(input_text,'UTF8')),'hex')=source_hash),
 check(jsonb_typeof(input_text::jsonb->'input') is not distinct from 'object' and jsonb_typeof(input_text::jsonb->'context') is not distinct from 'object'),
 check(input_text::jsonb#>>'{context,contentId}' is not distinct from content_id),
 check(consent is null or consent='{"version":1,"aiProcessingAllowed":true,"publicInputAllowed":true,"noPrivateData":true,"budgetAccepted":true}'::jsonb),
 check((state='prepared' and approved_at is null and consent is null and job_id is null) or
       (state='approved' and approved_at is not null and consent is not null and job_id is null) or
       (state='consumed' and approved_at is not null and consent is not null and job_id is not null))
);
alter table studio.input_reviews enable row level security;
revoke all on studio.input_reviews from public,anon,authenticated,service_role;
grant select on studio.input_reviews to service_role;
grant insert(owner_id,conversation_id,client_request_id,request_snapshot,input_text,source_hash,content_id),update(state,approved_at,consent,job_id) on studio.input_reviews to service_role;

create function studio.input_review_version() returns integer language sql security invoker set search_path='' as $$select 1$$;
create function studio.prepare_worker_input(p_owner uuid,p_conversation uuid,p_client uuid,p_request jsonb,p_input text,p_hash text,p_content text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews;
begin
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 perform 1 from studio.conversations where id=p_conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 if p_client is null or p_input is null or p_request is null or p_hash is null or p_content is null or
 octet_length(p_input)>50000 or encode(sha256(convert_to(p_input,'UTF8')),'hex')<>p_hash or
 p_input::jsonb#>>'{context,contentId}' is distinct from p_content or
 coalesce(p_input::jsonb#>>'{input,generationKind}' not in ('interactive_2d','interactive_3d'),true) or
 p_request->>'schemaVersion' is distinct from '2' or p_request->>'conversationId' is distinct from p_conversation::text or
 p_request->>'clientRequestId' is distinct from p_client::text or p_request->'payload' ? 'schoolYear' then raise sqlstate 'PT400'; end if;
 select * into item from studio.input_reviews where owner_id=p_owner and conversation_id=p_conversation and client_request_id=p_client;
 if found then
  if item.source_hash<>p_hash or item.input_text<>p_input or item.request_snapshot<>p_request or item.content_id<>p_content then raise sqlstate 'PT409'; end if;
  return to_jsonb(item);
 end if;
 if (select count(*) from studio.input_reviews where owner_id=p_owner)>=500 or
    (select count(*) from studio.input_reviews where owner_id=p_owner and created_at>=now()-interval '24 hours')>=30 then raise sqlstate 'PT429'; end if;
 insert into studio.input_reviews(owner_id,conversation_id,client_request_id,request_snapshot,input_text,source_hash,content_id)
 values(p_owner,p_conversation,p_client,p_request,p_input,p_hash,p_content) returning * into item;
 return to_jsonb(item);
end $$;

create function studio.read_worker_input(p_owner uuid,p_review uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews;
begin
 if not exists(select 1 from studio.teachers where owner_id=p_owner and active) then raise sqlstate 'PT403'; end if;
 select r.* into item from studio.input_reviews r join studio.conversations c on c.id=r.conversation_id and c.owner_id=r.owner_id
 where r.id=p_review and r.owner_id=p_owner and c.deleted_at is null;
 if not found then raise sqlstate 'PT404'; end if;
 return to_jsonb(item);
end $$;

create function studio.approve_worker_input(p_owner uuid,p_review uuid,p_hash text,p_consent jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews; conversation uuid;
begin
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 select conversation_id into conversation from studio.input_reviews where id=p_review and owner_id=p_owner;
 perform 1 from studio.conversations where id=conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 select * into item from studio.input_reviews where id=p_review and owner_id=p_owner for update;
 if not found then raise sqlstate 'PT404'; end if;
 if item.source_hash is distinct from p_hash or p_consent is distinct from '{"version":1,"aiProcessingAllowed":true,"publicInputAllowed":true,"noPrivateData":true,"budgetAccepted":true}'::jsonb then raise sqlstate 'PT409'; end if;
 if item.state in ('approved','consumed') then return to_jsonb(item); end if;
 if item.expires_at<=clock_timestamp() then raise sqlstate 'PT410'; end if;
 update studio.input_reviews set state='approved',approved_at=clock_timestamp(),consent=p_consent where id=p_review returning * into item;
 return to_jsonb(item);
end $$;

-- Every NEW worker row must consume exactly the confirmed input. An arbitrary
-- UUID can no longer serve as an input approval. Earlier rows are not rewritten.
create function studio.consume_input_review() returns trigger language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews; work studio.jobs;
begin
 select * into work from studio.jobs where id=new.job_id;
 select * into item from studio.input_reviews where id=new.input_review_id and owner_id=new.owner_id for update;
 if not found or item.state<>'approved' or item.job_id is not null or item.expires_at<=clock_timestamp() or
 item.conversation_id<>work.conversation_id or item.request_snapshot<>work.request_snapshot or
 item.source_hash<>new.source_snapshot_hash or item.input_text<>new.approved_input then raise sqlstate 'PT409'; end if;
 update studio.input_reviews set state='consumed',job_id=new.job_id where id=item.id;
 new.input_approved_at:=item.approved_at;
 return new;
end $$;
create trigger worker_requires_input_review before insert on studio.worker_runs for each row execute function studio.consume_input_review();

create function studio.submit_reviewed_worker_job(p_owner uuid,p_review uuid,p_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews; conversation uuid; work studio.jobs;
begin
 -- Same order as submit_worker_job: budget -> teacher -> conversation -> review.
 perform 1 from studio.budget_policy where singleton for update;
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 select conversation_id into conversation from studio.input_reviews where id=p_review and owner_id=p_owner;
 perform 1 from studio.conversations where id=conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 select * into item from studio.input_reviews where id=p_review and owner_id=p_owner for update;
 if not found then raise sqlstate 'PT404'; end if;
 if item.source_hash is distinct from p_hash then raise sqlstate 'PT409'; end if;
 if item.state='consumed' then
  select * into work from studio.jobs where id=item.job_id and owner_id=p_owner;
  if not found then raise sqlstate 'PT409'; end if;
  return to_jsonb(work);
 end if;
 if item.state<>'approved' then raise sqlstate 'PT409'; end if;
 if item.expires_at<=clock_timestamp() then raise sqlstate 'PT410'; end if;
 return studio.submit_worker_job(p_owner,item.conversation_id,item.client_request_id,gen_random_uuid(),gen_random_uuid(),item.request_snapshot,item.input_text,item.source_hash,item.id);
end $$;
revoke all on function studio.input_review_version(),studio.prepare_worker_input(uuid,uuid,uuid,jsonb,text,text,text),studio.read_worker_input(uuid,uuid),studio.approve_worker_input(uuid,uuid,text,jsonb),studio.consume_input_review(),studio.submit_reviewed_worker_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function studio.input_review_version(),studio.prepare_worker_input(uuid,uuid,uuid,jsonb,text,text,text),studio.read_worker_input(uuid,uuid),studio.approve_worker_input(uuid,uuid,text,jsonb),studio.consume_input_review(),studio.submit_reviewed_worker_job(uuid,uuid,text) to service_role;
commit;
