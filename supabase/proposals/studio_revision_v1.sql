-- REVIEW ONLY. After result_review_v1, input_review_v1 and dispatch_v1.
-- Immutable revision inputs; no activation, migration history or external calls.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table studio.input_reviews drop constraint input_reviews_content_id_key;
alter table studio.input_reviews drop constraint input_reviews_content_id_check;
alter table studio.input_reviews add constraint input_content_id check(content_id ~ '^[a-z0-9][a-z0-9-]{0,63}$');
alter table studio.input_reviews add column parent_job_id uuid;
alter table studio.input_reviews add column feedback_id uuid references studio.result_feedback(id);
alter table studio.input_reviews add column head_job_id uuid;
alter table studio.input_reviews add column base_candidate text;
alter table studio.input_reviews add foreign key(parent_job_id,owner_id) references studio.jobs(id,owner_id);
alter table studio.input_reviews add foreign key(head_job_id,owner_id) references studio.jobs(id,owner_id);
alter table studio.input_reviews add constraint revision_input_shape check(
 (parent_job_id is null and feedback_id is null and head_job_id is null and base_candidate is null and not (input_text::jsonb->'input' ? 'revision')) or
 (parent_job_id is not null and feedback_id is not null and head_job_id is not null and base_candidate is not null and octet_length(base_candidate) between 2 and 2000000
 and input_text::jsonb#>>'{input,revision,parentJobId}' is not distinct from parent_job_id::text
 and input_text::jsonb#>>'{input,revision,feedbackId}' is not distinct from feedback_id::text
 and input_text::jsonb#>>'{input,revision,headJobId}' is not distinct from head_job_id::text
 and input_text::jsonb#>>'{input,revision,candidateTextHash}' is not distinct from encode(sha256(convert_to(base_candidate,'UTF8')),'hex')));
create unique index input_original_content on studio.input_reviews(content_id) where parent_job_id is null;
create unique index input_consumed_feedback on studio.input_reviews(feedback_id) where job_id is not null and feedback_id is not null;
grant insert(parent_job_id,feedback_id,head_job_id,base_candidate) on studio.input_reviews to service_role;

create table studio.content_heads (
 content_id text primary key, owner_id uuid not null, conversation_id uuid not null,
 head_job_id uuid not null, generation integer not null default 0 check(generation between 0 and 20),
 foreign key(conversation_id,owner_id) references studio.conversations(id,owner_id),
 foreign key(head_job_id,owner_id) references studio.jobs(id,owner_id)
);
alter table studio.content_heads enable row level security;
revoke all on studio.content_heads from public,anon,authenticated,service_role;
grant select,insert on studio.content_heads to service_role;
grant update(head_job_id,generation) on studio.content_heads to service_role;
create function studio.revision_version() returns integer language sql security invoker set search_path='' as $$select 1$$;

-- Read-only context; the caller must still validate the full parent evidence.
create function studio.read_revision_context(p_owner uuid,p_job uuid,p_client uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('conversationId',j.conversation_id,'contentId',j.target_content_id,
 'headJobId',coalesce((select r.head_job_id from studio.input_reviews r where r.owner_id=p_owner and r.conversation_id=j.conversation_id and r.client_request_id=p_client and r.parent_job_id=j.id),h.head_job_id,j.id),'generation',coalesce(h.generation,0))
 from studio.jobs j join studio.worker_runs w on w.job_id=j.id
 join studio.teachers t on t.owner_id=j.owner_id and t.active
 join studio.conversations c on c.id=j.conversation_id and c.owner_id=j.owner_id and c.deleted_at is null
 left join studio.content_heads h on h.content_id=j.target_content_id and h.owner_id=j.owner_id
 where j.id=p_job and j.owner_id=p_owner and j.execution_mode='real'
$$;

-- All callers lock budget -> teacher -> conversation before taking lineage locks.
-- The head is the last SUBMITTED job, not merely the last successful candidate.
create function studio.assert_revision_ready(p_review uuid) returns void language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews; parent studio.jobs; worker studio.worker_runs; feedback studio.result_feedback; head studio.content_heads; latest studio.jobs; base_source jsonb; candidate_event jsonb; candidate_sequence integer; source_output text; descriptor jsonb;
begin
 select * into item from studio.input_reviews where id=p_review;
 if not found then raise sqlstate 'PT404'; end if;
 if item.parent_job_id is null then return; end if;
 select * into parent from studio.jobs where id=item.parent_job_id and owner_id=item.owner_id for update;
 if not found or parent.execution_mode<>'real' or parent.conversation_id<>item.conversation_id or parent.target_content_id<>item.content_id then raise sqlstate 'PT409'; end if;
 select * into worker from studio.worker_runs where job_id=parent.id for update;
 if not found or worker.state<>'finished' or parent.state not in ('needs_input','failed','cancelled','awaiting_approval') then raise sqlstate 'PT409'; end if;
 if not exists(select 1 from studio.budget_jobs where job_id=parent.id and state='closed') then raise sqlstate 'PT423'; end if;
 select * into feedback from studio.result_feedback where id=item.feedback_id and owner_id=item.owner_id and job_id=parent.id;
 if not found or feedback.decision<>'request_changes' then raise sqlstate 'PT409'; end if;
 select body::jsonb,sequence into candidate_event,candidate_sequence from studio.worker_evidence where job_id=parent.id and kind='candidate' order by sequence desc limit 1;
 if not found then raise sqlstate 'PT409'; end if;
 select body::jsonb->>'output' into source_output from studio.worker_evidence where job_id=parent.id and kind='role_output' and sequence<candidate_sequence and body::jsonb->>'role'='developer' order by sequence desc limit 1;
 if source_output is distinct from item.base_candidate or feedback.candidate_hash is distinct from candidate_event->>'candidateHash'
 or feedback.source_hash<>worker.source_snapshot_hash or feedback.state_version<>parent.state_version or feedback.evidence_hash<>studio.worker_evidence_hash(parent.id) then raise sqlstate 'PT409'; end if;
 descriptor:=item.input_text::jsonb#>'{input,revision}';
 if descriptor is distinct from jsonb_build_object('parentJobId',parent.id,'feedbackId',feedback.id,'headJobId',item.head_job_id,
 'stateVersion',parent.state_version,'sourceHash',worker.source_snapshot_hash,'candidateHash',feedback.candidate_hash,'evidenceHash',feedback.evidence_hash,
 'candidateTextHash',encode(sha256(convert_to(source_output,'UTF8')),'hex')) then raise sqlstate 'PT409'; end if;
 base_source:=worker.approved_input::jsonb;
 if item.input_text::jsonb->'context' is distinct from base_source->'context'
 or ((item.input_text::jsonb->'input')-'revision'-'requirements') is distinct from ((base_source->'input')-'revision'-'requirements')
 or item.input_text::jsonb#>'{input,requirements}' is distinct from ((base_source#>'{input,requirements}')||jsonb_build_array(jsonb_build_object('id','revision-'||feedback.id::text,'text',feedback.note)))
 or item.request_snapshot#>>'{payload,targetContentId}' is distinct from item.content_id
 or item.request_snapshot#>>'{payload,expectedVersion}' is distinct from feedback.candidate_hash then raise sqlstate 'PT409'; end if;
 -- Lazy adoption of a sole pre-proposal job preserves its bytes. Ambiguous
 -- historical branches require reconciliation, never guessed "latest" dates.
 if not exists(select 1 from studio.content_heads where content_id=item.content_id) then
  if (select count(*) from studio.jobs where execution_mode='real' and target_content_id=item.content_id)<>1 then raise sqlstate 'PT409'; end if;
  insert into studio.content_heads(content_id,owner_id,conversation_id,head_job_id) values(item.content_id,item.owner_id,item.conversation_id,parent.id);
 end if;
 select * into head from studio.content_heads where content_id=item.content_id for update;
 if head.owner_id<>item.owner_id or head.conversation_id<>item.conversation_id or head.head_job_id<>item.head_job_id then raise sqlstate 'PT409'; end if;
 if head.generation>=20 then raise sqlstate 'PT429'; end if;
 if head.head_job_id<>parent.id then
  select * into latest from studio.jobs where id=head.head_job_id;
  -- Explicit retry from the unchanged base is possible only after a child
  -- ended without producing ANY candidate. A newer candidate must be reviewed.
  if latest.state not in ('needs_input','failed','cancelled') or exists(select 1 from studio.worker_evidence where job_id=latest.id and kind='candidate')
  or not exists(select 1 from studio.input_reviews where job_id=latest.id and parent_job_id=parent.id)
  or not exists(select 1 from studio.budget_jobs where job_id=latest.id and state='closed') then raise sqlstate 'PT409'; end if;
 end if;
 if exists(select 1 from studio.input_reviews where feedback_id=item.feedback_id and job_id is not null and id<>item.id) then raise sqlstate 'PT409'; end if;
end $$;

create function studio.prepare_worker_revision(p_owner uuid,p_parent uuid,p_feedback uuid,p_client uuid,p_head uuid,p_request jsonb,p_input text,p_hash text,p_candidate text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare parent studio.jobs; item studio.input_reviews;
begin
 perform 1 from studio.budget_policy where singleton for update;
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 select * into parent from studio.jobs where id=p_parent and owner_id=p_owner and execution_mode='real';
 if not found then raise sqlstate 'PT404'; end if;
 perform 1 from studio.conversations where id=parent.conversation_id and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 if p_client is null or p_feedback is null or p_head is null or p_input is null or p_hash is null or p_candidate is null or p_request is null
 or octet_length(p_input)>50000 or octet_length(p_candidate)>2000000 or encode(sha256(convert_to(p_input,'UTF8')),'hex')<>p_hash
 or p_request->>'schemaVersion' is distinct from '2' or p_request->>'operation' is distinct from 'create_simulation'
 or p_request->>'conversationId' is distinct from parent.conversation_id::text or p_request->>'clientRequestId' is distinct from p_client::text
 or p_request->'payload' ? 'schoolYear' then raise sqlstate 'PT400'; end if;
 select * into item from studio.input_reviews where owner_id=p_owner and conversation_id=parent.conversation_id and client_request_id=p_client for update;
 if found then
  if item.parent_job_id is distinct from p_parent or item.feedback_id is distinct from p_feedback or item.head_job_id is distinct from p_head or item.input_text<>p_input or item.source_hash<>p_hash or item.base_candidate is distinct from p_candidate or item.request_snapshot<>p_request then raise sqlstate 'PT409'; end if;
  return to_jsonb(item);
 end if;
 if (select count(*) from studio.input_reviews where owner_id=p_owner)>=500 or (select count(*) from studio.input_reviews where owner_id=p_owner and created_at>=now()-interval '24 hours')>=30 then raise sqlstate 'PT429'; end if;
 insert into studio.input_reviews(owner_id,conversation_id,client_request_id,request_snapshot,input_text,source_hash,content_id,parent_job_id,feedback_id,head_job_id,base_candidate)
 values(p_owner,parent.conversation_id,p_client,p_request,p_input,p_hash,parent.target_content_id,p_parent,p_feedback,p_head,p_candidate) returning * into item;
 perform studio.assert_revision_ready(item.id);
 return to_jsonb(item);
end $$;

-- This BEFORE UPDATE trigger also covers callers using the original approval
-- and submission RPCs; a separate route cannot bypass the lineage guard.
create function studio.guard_revision_input() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.parent_job_id is not null and old.state<>'consumed' and new.state in ('approved','consumed') then
  perform studio.assert_revision_ready(old.id);
 end if;
 return new;
end $$;
create trigger input_revision_guard before update on studio.input_reviews for each row execute function studio.guard_revision_input();

-- Approval takes the global lock first, matching submissions/cancellation.
create or replace function studio.approve_worker_input(p_owner uuid,p_review uuid,p_hash text,p_consent jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews; conversation uuid;
begin
 perform 1 from studio.budget_policy where singleton for update;
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 select conversation_id into conversation from studio.input_reviews where id=p_review and owner_id=p_owner;
 perform 1 from studio.conversations where id=conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 select * into item from studio.input_reviews where id=p_review and owner_id=p_owner for update;
 if not found then raise sqlstate 'PT404'; end if;
 if item.source_hash is distinct from p_hash or p_consent is distinct from '{"version":1,"aiProcessingAllowed":true,"publicInputAllowed":true,"noPrivateData":true,"budgetAccepted":true}'::jsonb then raise sqlstate 'PT409'; end if;
 if item.state='consumed' then return to_jsonb(item); end if;
 if item.expires_at<=clock_timestamp() then raise sqlstate 'PT410'; end if;
 perform studio.assert_revision_ready(item.id);
 if item.state='approved' then return to_jsonb(item); end if;
 update studio.input_reviews set state='approved',approved_at=clock_timestamp(),consent=p_consent where id=item.id returning * into item;
 return to_jsonb(item);
end $$;

create function studio.advance_content_head() returns trigger language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews;
begin
 select * into item from studio.input_reviews where id=new.input_review_id and job_id=new.job_id;
 if not found then raise sqlstate 'PT409'; end if;
 if item.parent_job_id is null then
  insert into studio.content_heads(content_id,owner_id,conversation_id,head_job_id) values(item.content_id,item.owner_id,item.conversation_id,new.job_id);
 else
  update studio.content_heads set head_job_id=new.job_id,generation=generation+1
  where content_id=item.content_id and owner_id=item.owner_id and head_job_id=item.head_job_id and generation<20;
  if not found then raise sqlstate 'PT409'; end if;
 end if;
 return new;
end $$;
create trigger worker_revision_head after insert on studio.worker_runs for each row execute function studio.advance_content_head();

create function studio.read_revision_base(p_job uuid,p_run bigint,p_attempt integer,p_source text) returns text language sql stable security invoker set search_path='' as $$
 select r.base_candidate from studio.worker_runs w join studio.input_reviews r on r.id=w.input_review_id and r.job_id=w.job_id
 join studio.jobs j on j.id=w.job_id join studio.teachers t on t.owner_id=w.owner_id and t.active
 join studio.conversations c on c.id=j.conversation_id and c.deleted_at is null
 where w.job_id=p_job and w.workflow_run_id=p_run and w.workflow_run_attempt=p_attempt and w.source_snapshot_hash=p_source
 and j.state in ('queued','running') and r.state='consumed' and studio.worker_execution_enabled()
 and exists(select 1 from studio.budget_policy where singleton and enabled)
$$;
revoke all on function studio.revision_version(),studio.read_revision_context(uuid,uuid,uuid),studio.assert_revision_ready(uuid),studio.prepare_worker_revision(uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text),studio.guard_revision_input(),studio.advance_content_head(),studio.read_revision_base(uuid,bigint,integer,text) from public,anon,authenticated;
grant execute on function studio.revision_version(),studio.read_revision_context(uuid,uuid,uuid),studio.assert_revision_ready(uuid),studio.prepare_worker_revision(uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text),studio.guard_revision_input(),studio.advance_content_head(),studio.read_revision_base(uuid,bigint,integer,text) to service_role;
commit;
