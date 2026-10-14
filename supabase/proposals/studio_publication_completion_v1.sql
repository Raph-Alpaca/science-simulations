-- REVIEW ONLY after publication_authority_v1. No rollout or activation.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table studio.publication_oidc_receipts drop constraint publication_oidc_receipts_role_action_check;
alter table studio.publication_oidc_receipts add constraint publication_oidc_receipts_role_action_check
 check((role='prepare' and action in ('manifest','file')) or (role='report' and action='check-report') or (role='deploy' and action in ('claim','complete')));
create table studio.publication_outcomes (
 id uuid primary key default gen_random_uuid(),publication_id uuid not null references studio.publication_dispatches(id),
 outcome_text text not null check(octet_length(outcome_text) between 2 and 20000),
 outcome_hash text not null check(outcome_hash=encode(sha256(convert_to(outcome_text,'UTF8')),'hex')),
 verified boolean not null,jti_hash text not null unique references studio.publication_oidc_receipts(jti_hash),
 recorded_at timestamptz not null default clock_timestamp(),unique(publication_id,outcome_hash)
);
create unique index publication_verified_once on studio.publication_outcomes(publication_id) where verified;
alter table studio.publication_outcomes enable row level security;
revoke all on studio.publication_outcomes from public,anon,authenticated,service_role;
grant select,insert on studio.publication_outcomes to service_role;
create trigger publication_outcome_immutable before update or delete on studio.publication_outcomes for each row execute function studio.keep_publication_check();
alter table studio.publication_dispatches add column completed_at timestamptz;
alter table studio.publication_dispatches add column resolution text check(resolution in ('verified','check_failed'));
alter table studio.publication_dispatches add constraint publication_completion_pair check((completed_at is null)=(resolution is null));
drop index studio.publication_one_active;
create unique index publication_one_active on studio.publication_dispatches((true)) where state in ('ready','claimed','submitted','uncertain') and completed_at is null;
grant update(completed_at,resolution) on studio.publication_dispatches to service_role;
alter table studio.releases add column publication_id uuid unique references studio.publication_dispatches(id);
alter table studio.releases add column publication_outcome_id uuid unique references studio.publication_outcomes(id);
create unique index publication_release_approval_once on studio.releases(approval_id);
grant insert on studio.releases to service_role;
alter table studio.release_baseline add column publication_id uuid references studio.publication_dispatches(id);
grant update(artifact_hash,publication_id) on studio.release_baseline to service_role;
alter table studio.jobs drop constraint jobs_state_check;
alter table studio.jobs add constraint jobs_state_check check(state in ('queued','running','cancel_requested','cancelled','failed','needs_input','awaiting_approval','published'));
alter table studio.job_events drop constraint job_events_command_type_check;
alter table studio.job_events add constraint job_events_command_type_check check(command_type in ('submit','advance','cancel','simulate_error','worker_start','worker_finish','publication_complete'));

create function studio.read_publication_completion_context(p_intent uuid,p_run bigint,p_attempt integer,p_sha text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare context jsonb;grant_row studio.publication_authorizations;review studio.release_reviews;manifest jsonb;size bigint;index_size bigint;
begin
 context=studio.read_publication_report_context(p_intent,p_run,p_attempt,p_sha);
 select * into grant_row from studio.publication_authorizations where publication_id=p_intent;
 if not found then raise sqlstate 'PT409';end if;
 select r.* into review from studio.release_reviews r join studio.publication_dispatches d on d.review_id=r.id where d.id=p_intent;
 select jsonb_agg(jsonb_build_object('path',f->>'path','hash',encode(sha256(decode(f->>'bytesBase64','base64')),'hex')) order by ord),
  sum(octet_length(decode(f->>'bytesBase64','base64'))),sum(case when f->>'path'='index.html' then octet_length(decode(f->>'bytesBase64','base64')) else 0 end)
 into manifest,size,index_size from jsonb_array_elements(review.artifact_text::jsonb->'files') with ordinality as files(f,ord);
 return jsonb_build_object('binding',context->'binding','claim',jsonb_build_object('id',grant_row.id,'claimedAt',grant_row.claimed_at,'reportHash',grant_row.report_hash),'manifest',manifest,'bytes',size,'indexBytes',index_size);
end $$;

create function studio.guard_publication_release() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise sqlstate 'PT409';end if;
 if not exists(select 1 from studio.publication_dispatches d join studio.publication_authorizations g on g.publication_id=d.id
  join studio.publication_outcomes o on o.id=new.publication_outcome_id and o.publication_id=d.id and o.verified
  join studio.release_reviews r on r.id=d.review_id
  where d.id=new.publication_id and new.approval_id=g.approval_id and new.owner_id=d.owner_id and new.job_id=d.job_id
  and new.content_id=r.proposal_text::jsonb->>'contentId' and new.candidate_hash=r.candidate_hash and new.source_hash=r.source_hash and new.artifact_hash=d.artifact_hash
  and new.release_commit=d.verified_sha and new.run_id=d.run_id::text and new.run_attempt=1 and new.verification_state='verified'
  and new.verified_at=(o.outcome_text::jsonb#>>'{verification,finishedAt}')::timestamptz
  and new.public_url='https://raph-alpaca.github.io/science-simulations/simulations/'||new.content_id||'/'||(r.proposal_text::jsonb->>'entry')) then raise sqlstate 'PT409';end if;
 return new;
end $$;
create trigger publication_release_guard before insert or update or delete on studio.releases for each row execute function studio.guard_publication_release();
create function studio.advance_verified_publication_baseline() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='service_role' and (new.publication_id is null or new.publication_id is not distinct from old.publication_id or
  not exists(select 1 from studio.releases rel join studio.publication_dispatches d on d.id=rel.publication_id join studio.release_reviews r on r.id=d.review_id
   where rel.publication_id=new.publication_id and rel.verification_state='verified' and rel.verified_at is not null and rel.artifact_hash=new.artifact_hash and r.base_artifact_hash=old.artifact_hash)) then raise sqlstate 'PT403';end if;
 return new;
end $$;
create trigger publication_baseline_advance before update on studio.release_baseline for each row execute function studio.advance_verified_publication_baseline();
revoke all on function studio.guard_publication_release(),studio.advance_verified_publication_baseline() from public,anon,authenticated,service_role;

create function studio.record_publication_outcome(p_intent uuid,p_run bigint,p_attempt integer,p_sha text,p_jti_hash text,p_expires timestamptz,p_body_hash text,p_outcome_text text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item studio.publication_dispatches;context jsonb;body jsonb;stored studio.publication_outcomes;digest text;is_verified boolean;written integer;
 work studio.jobs;review studio.release_reviews;release_row studio.releases;prior uuid;
begin
 if p_jti_hash is null or p_jti_hash !~ '^[a-f0-9]{64}$' or p_body_hash is null or p_body_hash !~ '^[a-f0-9]{64}$' or p_expires is null or p_expires<=clock_timestamp() or p_expires>clock_timestamp()+interval '21 minutes'
 or p_outcome_text is null or octet_length(p_outcome_text) not between 2 and 20000 then raise sqlstate 'PT400';end if;
 -- Historical observations remain recordable after teacher/source withdrawal.
 -- All public authority was consumed before the external transfer began.
 perform 1 from studio.budget_policy where singleton for update;
 select * into item from studio.publication_dispatches where id=p_intent for update;
 if not found then raise sqlstate 'PT403';end if;
 context=studio.read_publication_completion_context(p_intent,p_run,p_attempt,p_sha);body=p_outcome_text::jsonb;
 if body->>'version' is distinct from 'publication-outcome-v1' or body->'binding' is distinct from context->'binding'
 or body->>'claimId' is distinct from context#>>'{claim,id}' or body->>'claimReportHash' is distinct from context#>>'{claim,reportHash}'
 or body#>'{deployment,runId}' is distinct from to_jsonb(p_run) or body#>>'{deployment,workflowSha}' is distinct from p_sha then raise sqlstate 'PT409';end if;
 is_verified=coalesce(body#>>'{deployment,status}'='succeeded' and body#>>'{verification,status}'='pass',false);
 if is_verified and (body#>>'{verification,artifactHash}' is distinct from item.artifact_hash or body#>>'{verification,publicUrl}' is distinct from 'https://raph-alpaca.github.io/science-simulations/'
 or body#>'{deployment,createRequests}' is distinct from '1'::jsonb or coalesce(body#>>'{deployment,deploymentId}','') !~ '^[A-Za-z0-9_-]{1,128}$'
 or body#>'{verification,filesVerified}' is distinct from to_jsonb(jsonb_array_length(context->'manifest'))
 or body#>'{verification,requestCount}' is distinct from to_jsonb(jsonb_array_length(context->'manifest')+1)
 or body#>'{verification,bytesRead}' is distinct from to_jsonb((context->>'bytes')::bigint+(context->>'indexBytes')::bigint)
 or body#>'{verification,failureCode}' is distinct from 'null'::jsonb or body#>'{verification,failedPath}' is distinct from 'null'::jsonb
 or (body#>>'{verification,startedAt}')::timestamptz<(context#>>'{claim,claimedAt}')::timestamptz-interval '5 seconds'
 or (body#>>'{verification,finishedAt}')::timestamptz>clock_timestamp()+interval '5 seconds') then raise sqlstate 'PT409';end if;
 digest=encode(sha256(convert_to(p_outcome_text,'UTF8')),'hex');select * into stored from studio.publication_outcomes where publication_id=p_intent and outcome_hash=digest;
 if stored.id is null and (exists(select 1 from studio.publication_outcomes where publication_id=p_intent and verified) or (select count(*) from studio.publication_outcomes where publication_id=p_intent)>=8) then raise sqlstate 'PT409';end if;
 if (select count(*) from studio.publication_oidc_receipts where publication_id=p_intent)>=256 then raise sqlstate 'PT429';end if;
 insert into studio.publication_oidc_receipts(jti_hash,publication_id,run_id,run_attempt,workflow_sha,role,action,body_hash,expires_at)
 values(p_jti_hash,p_intent,p_run,p_attempt,p_sha,'deploy','complete',p_body_hash,p_expires) on conflict(jti_hash) do nothing;
 get diagnostics written=row_count;if written<>1 then raise sqlstate 'PT409';end if;
 if stored.id is null then
  insert into studio.publication_outcomes(publication_id,outcome_text,outcome_hash,verified,jti_hash) values(p_intent,p_outcome_text,digest,is_verified,p_jti_hash) returning * into stored;
  if is_verified then
   select * into work from studio.jobs where id=item.job_id for update;
   select * into review from studio.release_reviews where id=item.review_id;
   if work.state<>'awaiting_approval' or not exists(select 1 from studio.release_baseline where singleton and artifact_hash=review.base_artifact_hash) then raise sqlstate 'PT409';end if;
   select id into prior from studio.releases where owner_id=item.owner_id and content_id=work.target_content_id and verification_state='verified' order by verified_at desc,id desc limit 1;
   insert into studio.releases(job_id,owner_id,content_id,action,approval_id,source_hash,candidate_hash,artifact_hash,release_commit,run_id,run_attempt,public_url,verification_state,verified_at,previous_release_id,publication_id,publication_outcome_id)
   values(item.job_id,item.owner_id,work.target_content_id,case when prior is null then 'create' else 'update' end,item.approval_id,review.source_hash,review.candidate_hash,item.artifact_hash,p_sha,p_run::text,1,
    'https://raph-alpaca.github.io/science-simulations/simulations/'||work.target_content_id||'/'||(review.proposal_text::jsonb->>'entry'),'verified',(body#>>'{verification,finishedAt}')::timestamptz,prior,item.id,stored.id) returning * into release_row;
   update studio.release_baseline set artifact_hash=item.artifact_hash,publication_id=item.id where singleton;
   update studio.jobs set state='published',state_version=state_version+1,phase='publication_verified',error_code=null,updated_at=clock_timestamp() where id=work.id returning * into work;
   insert into studio.job_events(job_id,owner_id,sequence,state_version,command_id,command_type,from_state,to_state,phase,actor_type,run_id,run_attempt)
   values(work.id,work.owner_id,work.state_version,work.state_version,(context#>>'{claim,id}')::uuid,'publication_complete','awaiting_approval','published','publication_verified','publisher',p_run::text,1);
   update studio.publication_dispatches set completed_at=stored.recorded_at,resolution='verified' where id=item.id;
  end if;
 end if;
 if stored.verified then select * into release_row from studio.releases where publication_id=item.id;end if;
 return jsonb_build_object('binding',context->'binding','outcomeHash',stored.outcome_hash,'published',stored.verified,'releaseId',release_row.id,'recordedAt',stored.recorded_at);
end $$;
revoke all on function studio.read_publication_completion_context(uuid,bigint,integer,text),studio.record_publication_outcome(uuid,bigint,integer,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function studio.read_publication_completion_context(uuid,bigint,integer,text),studio.record_publication_outcome(uuid,bigint,integer,text,text,timestamptz,text,text) to service_role;

-- Existing lifecycle functions below retain all original guards. Only verified
-- publication completion, failed immutable checks and published revision input
-- are added. Source authority issuance and activation permissions stay intact.

create or replace function studio.keep_publication_dispatch() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.completed_at is distinct from old.completed_at then
  if old.completed_at is not null or old.state<>'submitted' or new.completed_at is null or
   (to_jsonb(new)-array['completed_at','resolution']) is distinct from (to_jsonb(old)-array['completed_at','resolution']) then raise sqlstate 'PT409';end if;
  if new.resolution='verified' and exists(select 1 from studio.releases where publication_id=old.id and verification_state='verified' and verified_at is not null) then return new;end if;
  if new.resolution='check_failed' and exists(select 1 from studio.publication_checks where publication_id=old.id and not passed) and not exists(select 1 from studio.publication_authorizations where publication_id=old.id) then return new;end if;
  raise sqlstate 'PT409';
 end if;
 if tg_op='DELETE' then raise sqlstate 'PT409'; end if;
 if tg_op='UPDATE' then
  if (to_jsonb(new)-array['state','claim_id','claimed_at','finished_at','run_id','verified_sha','error_code']) is distinct from
     (to_jsonb(old)-array['state','claim_id','claimed_at','finished_at','run_id','verified_sha','error_code']) then raise sqlstate 'PT409'; end if;
  if not ((old.state='ready' and new.state in ('claimed','cancelled')) or (old.state='claimed' and new.state in ('submitted','uncertain','failed'))) then raise sqlstate 'PT409'; end if;
  if old.claim_id is not null and (old.claim_id is distinct from new.claim_id or old.claimed_at is distinct from new.claimed_at) then raise sqlstate 'PT409'; end if;
 end if;
 if tg_op='INSERT' or new.state='claimed' then
  if not studio.publication_dispatch_enabled() then raise sqlstate 'PT412'; end if;
  if not studio.publication_approval_current(new.owner_id,new.approval_id) then raise sqlstate 'PT409'; end if;
  if not exists(select 1 from studio.approvals a join studio.release_reviews r on r.id=a.release_review_id and r.owner_id=a.owner_id
   where a.id=new.approval_id and a.owner_id=new.owner_id and a.job_id=new.job_id and r.id=new.review_id
   and r.proposal_hash=new.proposal_hash and r.artifact_hash=new.artifact_hash) then raise sqlstate 'PT409'; end if;
 end if;
 return new;
end $$;

create or replace function studio.request_publication_dispatch(p_owner uuid,p_approval uuid,p_client uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare approval studio.approvals; review studio.release_reviews; item studio.publication_dispatches;
begin
 if p_owner is null or p_approval is null or p_client is null then raise sqlstate 'PT400'; end if;
 select * into approval from studio.approvals where id=p_approval and owner_id=p_owner and release_review_id is not null;
 if not found then raise sqlstate 'PT404'; end if;
 perform studio.lock_release_job(p_owner,approval.job_id);
 select * into item from studio.publication_dispatches where owner_id=p_owner and request_id=p_client;
 if found then
  if item.approval_id<>p_approval then raise sqlstate 'PT409'; end if;
  return to_jsonb(item)-'owner_id'-'claim_id'-'request_id';
 end if;
 -- A new browser request ID must not create a second execution for the approval.
 select * into item from studio.publication_dispatches where approval_id=p_approval and owner_id=p_owner;
 if found then return to_jsonb(item)-'owner_id'-'claim_id'-'request_id'; end if;
 if not studio.publication_dispatch_enabled() then raise sqlstate 'PT412'; end if;
 if not studio.publication_approval_current(p_owner,p_approval) then raise sqlstate 'PT409'; end if;
 if exists(select 1 from studio.publication_dispatches where state in ('ready','claimed','submitted','uncertain') and completed_at is null) then raise sqlstate 'PT423'; end if;
 if (select count(*) from studio.publication_dispatches where job_id=approval.job_id)>=20 then raise sqlstate 'PT429'; end if;
 select * into review from studio.release_reviews where id=approval.release_review_id;
 insert into studio.publication_dispatches(owner_id,job_id,approval_id,review_id,request_id,proposal_hash,artifact_hash)
 values(p_owner,approval.job_id,p_approval,review.id,p_client,review.proposal_hash,review.artifact_hash) returning * into item;
 return to_jsonb(item)-'owner_id'-'claim_id'-'request_id';
end $$;

create or replace function studio.record_publication_check(p_intent uuid,p_run bigint,p_attempt integer,p_sha text,p_jti_hash text,p_expires timestamptz,p_body_hash text,p_report_text text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item studio.publication_dispatches;context jsonb;proposal jsonb;report jsonb;stored studio.publication_checks;digest text;written integer;
begin
 if p_jti_hash is null or p_jti_hash !~ '^[a-f0-9]{64}$' or p_body_hash is null or p_body_hash !~ '^[a-f0-9]{64}$' or p_expires is null or p_expires<=clock_timestamp() or p_expires>clock_timestamp()+interval '21 minutes'
 or p_report_text is null or octet_length(p_report_text) not between 2 and 16384 then raise sqlstate 'PT400';end if;
 perform 1 from studio.budget_policy where singleton for update;
 select * into item from studio.publication_dispatches where id=p_intent for update;
 if not found then raise sqlstate 'PT403';end if;
 context=studio.read_publication_report_context(p_intent,p_run,p_attempt,p_sha);proposal=(context#>>'{inspection,proposalText}')::jsonb;report=p_report_text::jsonb;
 if report->>'version' is distinct from 'publication-runtime-v1' or report->>'artifactHash' is distinct from item.artifact_hash
 or report#>>'{runtime,candidateHash}' is distinct from proposal->>'candidateHash' or report#>>'{runtime,sourceSnapshotHash}' is distinct from proposal->>'sourceSnapshotHash'
 or report#>>'{runtime,baselineSha}' is distinct from proposal->>'baselineSha' or report#>'{runtime,attempt}' is distinct from proposal->'attempt'
 or report#>'{runtime,details,browserStopped}' is distinct from 'true'::jsonb or coalesce(report#>>'{runtime,checks,runtime}','') not in ('pass','fail','not_run')
 then raise sqlstate 'PT409';end if;
 digest=encode(sha256(convert_to(p_report_text,'UTF8')),'hex');
 select * into stored from studio.publication_checks where publication_id=p_intent;
 if found and stored.report_hash<>digest then raise sqlstate 'PT409';end if;
 if (select count(*) from studio.publication_oidc_receipts where publication_id=p_intent)>=256 then raise sqlstate 'PT429';end if;
 insert into studio.publication_oidc_receipts(jti_hash,publication_id,run_id,run_attempt,workflow_sha,role,action,body_hash,expires_at)
 values(p_jti_hash,p_intent,p_run,p_attempt,p_sha,'report','check-report',p_body_hash,p_expires) on conflict(jti_hash) do nothing;
 get diagnostics written=row_count;if written<>1 then raise sqlstate 'PT409';end if;
 if stored.publication_id is null then
  insert into studio.publication_checks(publication_id,report_text,report_hash,passed,jti_hash)
  values(p_intent,p_report_text,digest,report#>>'{runtime,checks,runtime}'='pass',p_jti_hash) returning * into stored;
 end if;
 if not stored.passed then update studio.publication_dispatches set completed_at=stored.recorded_at,resolution='check_failed' where id=p_intent and completed_at is null;end if;
 return jsonb_build_object('publicationId',p_intent,'reportHash',stored.report_hash,'passed',stored.passed,'recordedAt',stored.recorded_at,'published',false);
end $$;

create or replace function studio.record_result_feedback(p_owner uuid,p_job uuid,p_client uuid,p_state_version integer,p_source text,p_candidate text,p_evidence text,p_decision text,p_note text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare work studio.jobs; worker studio.worker_runs; conversation uuid; prior studio.result_feedback; current_candidate text; item studio.result_feedback;
begin
 perform 1 from studio.budget_policy where singleton for update;
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 select conversation_id into conversation from studio.jobs where id=p_job and owner_id=p_owner and execution_mode='real';
 perform 1 from studio.conversations where id=conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 select * into work from studio.jobs where id=p_job and owner_id=p_owner for update;
 select * into worker from studio.worker_runs where job_id=p_job for update;
 if not found then raise sqlstate 'PT404'; end if;
 if p_client is null or p_state_version is null or p_source is null or p_source !~ '^[a-f0-9]{64}$' or p_evidence is null or p_evidence !~ '^[a-f0-9]{64}$'
 or (p_candidate is not null and p_candidate !~ '^[a-f0-9]{64}$') or p_decision is null or p_decision not in ('note','request_changes') or
 p_note is null or length(btrim(p_note)) not between 1 and 2000 or (p_decision='request_changes' and p_candidate is null) then raise sqlstate 'PT400'; end if;
 select * into prior from studio.result_feedback where job_id=p_job and client_request_id=p_client;
 if found then
  if prior.decision is distinct from p_decision or prior.note is distinct from btrim(p_note) or prior.source_hash is distinct from p_source or prior.candidate_hash is distinct from p_candidate or prior.evidence_hash is distinct from p_evidence or prior.state_version is distinct from p_state_version then raise sqlstate 'PT409'; end if;
  return to_jsonb(prior)-'owner_id'-'client_request_id';
 end if;
 if work.state not in ('needs_input','failed','cancelled','awaiting_approval','published') or worker.state not in ('finished','uncertain') then raise sqlstate 'PT409'; end if;
 select body::jsonb->>'candidateHash' into current_candidate from studio.worker_evidence where job_id=p_job and kind='candidate' order by sequence desc limit 1;
 if work.state_version<>p_state_version or worker.source_snapshot_hash<>p_source or current_candidate is distinct from p_candidate or studio.worker_evidence_hash(p_job)<>p_evidence then raise sqlstate 'PT409'; end if;
 if (select count(*) from studio.result_feedback where job_id=p_job)>=20 then raise sqlstate 'PT429'; end if;
 insert into studio.result_feedback(job_id,owner_id,client_request_id,decision,note,source_hash,candidate_hash,evidence_hash,state_version)
 values(p_job,p_owner,p_client,p_decision,btrim(p_note),p_source,p_candidate,p_evidence,p_state_version) returning * into item;
 return to_jsonb(item)-'owner_id'-'client_request_id';
end $$;

create or replace function studio.assert_revision_ready(p_review uuid) returns void language plpgsql security invoker set search_path='' as $$
declare item studio.input_reviews; parent studio.jobs; worker studio.worker_runs; feedback studio.result_feedback; head studio.content_heads; latest studio.jobs; base_source jsonb; candidate_event jsonb; candidate_sequence integer; source_output text; descriptor jsonb;
begin
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

create function studio.publication_state(p_intent uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('state',case when r.verification_state='verified' then 'published' when d.resolution='check_failed' then 'check_failed' when g.id is not null and o.recorded_at is not null then 'unconfirmed' when g.id is not null then 'transferring' else 'checking' end,
  'publicUrl',case when r.verification_state='verified' then r.public_url else null end,'updatedAt',coalesce(r.verified_at,o.recorded_at,g.claimed_at,d.finished_at,d.created_at))
 from studio.publication_dispatches d left join studio.publication_authorizations g on g.publication_id=d.id left join studio.releases r on r.publication_id=d.id
 left join lateral(select recorded_at from studio.publication_outcomes where publication_id=d.id order by recorded_at desc,id desc limit 1) o on true where d.id=p_intent
$$;
revoke all on function studio.publication_state(uuid) from public,anon,authenticated;
grant execute on function studio.publication_state(uuid) to service_role;

create or replace function studio.read_publication_dispatch(p_owner uuid,p_approval uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item studio.publication_dispatches;
begin
 if not exists(select 1 from studio.teachers where owner_id=p_owner and active) then raise sqlstate 'PT403'; end if;
 if not exists(select 1 from studio.approvals a join studio.jobs j on j.id=a.job_id and j.owner_id=a.owner_id
  join studio.conversations c on c.id=j.conversation_id and c.owner_id=j.owner_id and c.deleted_at is null
  where a.id=p_approval and a.owner_id=p_owner and a.release_review_id is not null) then raise sqlstate 'PT404'; end if;
 select * into item from studio.publication_dispatches where owner_id=p_owner and approval_id=p_approval;
 if not found then return null; end if;
 return (to_jsonb(item)-'owner_id'-'claim_id'-'request_id')||jsonb_build_object('publication',studio.publication_state(item.id));
end $$;

create or replace function studio.read_release_review(p_owner uuid,p_job uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('review',to_jsonb(r),'current',studio.release_review_current(p_owner,r.id),'result',studio.read_worker_result(p_owner,p_job),
  'publicationStartedAt',(select g.claimed_at from studio.publication_authorizations g join studio.publication_dispatches d on d.id=g.publication_id where d.review_id=r.id),
  'publication',(select studio.publication_state(d.id) from studio.publication_dispatches d where d.review_id=r.id),
  'approval',(select to_jsonb(a)-'owner_id'-'release_request_id' from studio.approvals a where a.release_review_id=r.id and a.owner_id=p_owner))
 from studio.release_reviews r join studio.teachers t on t.owner_id=r.owner_id and t.active
 join studio.jobs j on j.id=r.job_id and j.owner_id=r.owner_id
 join studio.conversations c on c.id=j.conversation_id and c.owner_id=j.owner_id and c.deleted_at is null
 where r.owner_id=p_owner and r.job_id=p_job order by r.created_at desc,r.id desc limit 1
$$;
commit;
