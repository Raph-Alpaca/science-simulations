-- REVIEW ONLY. After publication completion and source preparation.
-- Renews authority only; no source replacement, activation or paid calls.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function studio.read_revision_context(p_owner uuid,p_job uuid,p_client uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('conversationId',j.conversation_id,'contentId',j.target_content_id,
 'headJobId',coalesce((select r.head_job_id from studio.input_reviews r where r.owner_id=p_owner and r.conversation_id=j.conversation_id and r.client_request_id=p_client and r.parent_job_id=j.id),h.head_job_id,j.id),'generation',coalesce(h.generation,0),
 'inputReviewId',(select r.id from studio.input_reviews r where r.owner_id=p_owner and r.conversation_id=j.conversation_id and r.client_request_id=p_client and r.parent_job_id=j.id))
 from studio.jobs j join studio.worker_runs w on w.job_id=j.id
 join studio.teachers t on t.owner_id=j.owner_id and t.active
 join studio.conversations c on c.id=j.conversation_id and c.owner_id=j.owner_id and c.deleted_at is null
 left join studio.content_heads h on h.content_id=j.target_content_id and h.owner_id=j.owner_id
 where j.id=p_job and j.owner_id=p_owner and j.execution_mode='real'
$$;

create or replace function studio.assert_revision_ready(p_review uuid) returns void language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews; parent studio.jobs; worker studio.worker_runs; feedback studio.result_feedback; head studio.content_heads; latest studio.jobs; base_source jsonb; candidate_event jsonb; candidate_sequence integer; source_output text; descriptor jsonb;
begin
 -- Keep the same order even for a direct server-side assertion call.
 perform 1 from studio.budget_policy where singleton for update;
 select * into item from studio.input_reviews where id=p_review;
 if not found then raise sqlstate 'PT404'; end if;
 if item.parent_job_id is null then return; end if;
 select * into parent from studio.jobs where id=item.parent_job_id and owner_id=item.owner_id for update;
 if not found or parent.execution_mode<>'real' or parent.conversation_id<>item.conversation_id or parent.target_content_id<>item.content_id then raise sqlstate 'PT409'; end if;
 select * into worker from studio.worker_runs where job_id=parent.id for update;
 if not found or worker.state<>'finished' or parent.state not in ('needs_input','failed','cancelled','awaiting_approval','published') then raise sqlstate 'PT409'; end if;
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
 -- A revision may renew only the authority packet for the SAME sources,
 -- scope, curriculum, content and original requirements. The packet must
 -- match current trusted records under the existing budget/source mutex.
 if item.input_text::jsonb->'context' is distinct from base_source->'context' then
  if ((item.input_text::jsonb->'context')-'sourcePreparation') is distinct from ((base_source->'context')-'sourcePreparation')
  or item.input_text::jsonb#>>'{context,sourcePreparation,reviewScope}' is distinct from coalesce(base_source#>>'{context,sourcePreparation,reviewScope}','general_concepts') then raise sqlstate 'PT409'; end if;
  perform studio.assert_preparation_input(item.owner_id,item.input_text);
 end if;
 if ((item.input_text::jsonb->'input')-'revision'-'requirements') is distinct from ((base_source->'input')-'revision'-'requirements')
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

create function studio.revision_preparation_version() returns integer
language sql security invoker set search_path='' as $$select 1$$;
revoke all on function studio.revision_preparation_version() from public,anon,authenticated;
grant execute on function studio.revision_preparation_version() to service_role;
commit;
