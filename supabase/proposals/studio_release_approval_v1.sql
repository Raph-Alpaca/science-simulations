-- REVIEW ONLY, after revision_v1. No rollout, seed, source certification or deploy.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Populated only by a separately reviewed trusted release/source issuer.
-- App/worker service_role cannot create a baseline or a reviewed preparation.
create table studio.release_baseline (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 artifact_hash text not null check(artifact_hash ~ '^[a-f0-9]{64}$'),
 lock_hash text not null check(lock_hash ~ '^[a-f0-9]{64}$'),
 policy_version text not null check(length(policy_version) between 1 and 100)
);
create table studio.release_reviews (
 id uuid primary key default gen_random_uuid(), job_id uuid not null, owner_id uuid not null,
 state_version integer not null check(state_version>=0),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 candidate_hash text not null check(candidate_hash ~ '^[a-f0-9]{64}$'),
 evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'),
 feedback_hash text not null check(feedback_hash ~ '^[a-f0-9]{64}$'),
 proposal_text text not null check(octet_length(proposal_text) between 2 and 4000),
 proposal_hash text not null check(proposal_hash=encode(sha256(convert_to(proposal_text,'UTF8')),'hex')),
 artifact_text text not null check(octet_length(artifact_text) between 2 and 14100000),
 artifact_hash text not null check(artifact_hash ~ '^[a-f0-9]{64}$'),
 base_artifact_hash text not null check(base_artifact_hash ~ '^[a-f0-9]{64}$'),
 education_text text not null check(octet_length(education_text) between 2 and 64000),
 education_hash text not null check(education_hash=encode(sha256(convert_to(education_text,'UTF8')),'hex')),
 checks_hash text not null check(checks_hash ~ '^[a-f0-9]{64}$'),
 lock_hash text not null check(lock_hash ~ '^[a-f0-9]{64}$'),
 policy_version text not null check(length(policy_version) between 1 and 100),
 created_at timestamptz not null default clock_timestamp(), revoked_at timestamptz,
 unique(id,owner_id),foreign key(job_id,owner_id) references studio.jobs(id,owner_id),
 check(proposal_text::jsonb->>'jobId' is not distinct from job_id::text),
 check(proposal_text::jsonb->>'candidateHash' is not distinct from candidate_hash),
 check(proposal_text::jsonb->>'sourceSnapshotHash' is not distinct from source_hash),
 check(proposal_text::jsonb->>'artifactHash' is not distinct from artifact_hash),
 check(proposal_text::jsonb->>'baseArtifactHash' is not distinct from base_artifact_hash),
 check(artifact_text::jsonb->>'artifactHash' is not distinct from artifact_hash)
);
create index release_reviews_job_owner on studio.release_reviews(job_id,owner_id,created_at desc,id);
alter table studio.release_baseline enable row level security;
alter table studio.release_reviews enable row level security;
revoke all on studio.release_baseline,studio.release_reviews from public,anon,authenticated,service_role;
grant select on studio.release_baseline,studio.release_reviews to service_role;

-- A trusted issuer must share the approval/feedback/revision lock. These
-- triggers enforce that ordering without granting app writes to authority data.
create function studio.lock_release_authority() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from studio.budget_policy where singleton for update;
 return null;
end $$;
create trigger release_baseline_lock before insert or update or delete on studio.release_baseline for each statement execute function studio.lock_release_authority();
create trigger release_reviews_lock before insert or update or delete on studio.release_reviews for each statement execute function studio.lock_release_authority();
create function studio.keep_release_review() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then raise sqlstate 'PT409'; end if;
 if (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then raise sqlstate 'PT409'; end if;
 return new;
end $$;
create trigger release_review_immutable before update or delete on studio.release_reviews for each row execute function studio.keep_release_review();
revoke all on function studio.lock_release_authority(),studio.keep_release_review() from public,anon,authenticated,service_role;

alter table studio.approvals add column release_review_id uuid;
alter table studio.approvals add column release_request_id uuid;
alter table studio.approvals add foreign key(release_review_id,owner_id) references studio.release_reviews(id,owner_id);
alter table studio.approvals add constraint release_approval_pair check((release_review_id is null)=(release_request_id is null));
create unique index approval_release_request on studio.approvals(owner_id,release_request_id) where release_request_id is not null;
create unique index approval_release_review on studio.approvals(release_review_id) where release_review_id is not null;
grant insert(id,job_id,owner_id,content_id,candidate_hash,artifact_hash,policy_version,checks_version,approver,approved_at,release_review_id,release_request_id) on studio.approvals to service_role;
grant update(invalidated_at) on studio.approvals to service_role;

create function studio.release_approval_version() returns integer language sql security invoker set search_path='' as $$select 1$$;
create function studio.release_feedback_hash(p_job uuid) returns text language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(coalesce(string_agg(id::text,',' order by id),''),'UTF8')),'hex') from studio.result_feedback where job_id=p_job
$$;

-- Same global lock order as worker, feedback and revision commands. This helper
-- never enables publishing or changes worker/job state.
create function studio.lock_release_job(p_owner uuid,p_job uuid) returns void language plpgsql security invoker set search_path='' as $$
declare conversation uuid;
begin
 perform 1 from studio.budget_policy where singleton for update;
 perform 1 from studio.teachers where owner_id=p_owner and active for update;
 if not found then raise sqlstate 'PT403'; end if;
 select conversation_id into conversation from studio.jobs where id=p_job and owner_id=p_owner and execution_mode='real';
 perform 1 from studio.conversations where id=conversation and owner_id=p_owner and deleted_at is null for update;
 if not found then raise sqlstate 'PT404'; end if;
 perform 1 from studio.jobs where id=p_job and owner_id=p_owner for update;
 perform 1 from studio.worker_runs where job_id=p_job and owner_id=p_owner for update;
 if not found then raise sqlstate 'PT404'; end if;
end $$;

-- A receipt stays in history even when this effective-current predicate becomes
-- false. The future publisher must recheck it under its atomic publish claim.
create function studio.release_review_current(p_owner uuid,p_review uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
  select 1 from studio.release_reviews r join studio.jobs j on j.id=r.job_id and j.owner_id=r.owner_id
  join studio.worker_runs w on w.job_id=j.id and w.owner_id=j.owner_id
  join studio.budget_jobs b on b.job_id=j.id and b.owner_id=j.owner_id
  join studio.teachers t on t.owner_id=j.owner_id and t.active
  join studio.conversations c on c.id=j.conversation_id and c.owner_id=j.owner_id and c.deleted_at is null
  join studio.release_baseline base on base.singleton and base.enabled
  where r.id=p_review and r.owner_id=p_owner and r.revoked_at is null
   and j.execution_mode='real' and j.state='awaiting_approval' and j.state_version=r.state_version
   and w.state='finished' and b.state='closed' and b.held_usd_micros=0
   and w.source_snapshot_hash=r.source_hash and w.candidate_hash=r.candidate_hash
   and studio.worker_evidence_hash(j.id)=r.evidence_hash and studio.release_feedback_hash(j.id)=r.feedback_hash
   and base.artifact_hash=r.base_artifact_hash and base.lock_hash=r.lock_hash and base.policy_version=r.policy_version
   and r.proposal_text::jsonb->>'contentId'=j.target_content_id
   and r.proposal_text::jsonb->>'baselineSha'=w.verified_sha
   and not exists(select 1 from studio.release_reviews newer where newer.job_id=r.job_id and newer.owner_id=r.owner_id and (newer.created_at,newer.id)>(r.created_at,r.id))
   and not exists(select 1 from studio.content_heads h where h.content_id=j.target_content_id and (h.owner_id<>p_owner or h.head_job_id<>j.id))
 )
$$;

create function studio.read_release_review(p_owner uuid,p_job uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('review',to_jsonb(r),'current',studio.release_review_current(p_owner,r.id),
  'result',studio.read_worker_result(p_owner,p_job),
  'approval',(select to_jsonb(a)-'owner_id'-'release_request_id' from studio.approvals a where a.release_review_id=r.id and a.owner_id=p_owner))
 from studio.release_reviews r join studio.teachers t on t.owner_id=r.owner_id and t.active
 join studio.jobs j on j.id=r.job_id and j.owner_id=r.owner_id
 join studio.conversations c on c.id=j.conversation_id and c.owner_id=j.owner_id and c.deleted_at is null
 where r.owner_id=p_owner and r.job_id=p_job order by r.created_at desc,r.id desc limit 1
$$;

create function studio.approve_release_review(p_owner uuid,p_review uuid,p_client uuid,p_proposal text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.release_reviews; prior studio.approvals; row studio.approvals;
begin
 if p_owner is null or p_review is null or p_client is null or p_proposal is null or p_proposal !~ '^[a-f0-9]{64}$' then raise sqlstate 'PT400'; end if;
 select * into item from studio.release_reviews where id=p_review and owner_id=p_owner;
 if not found then raise sqlstate 'PT404'; end if;
 perform studio.lock_release_job(p_owner,item.job_id);
 -- Authority-table triggers serialize issuer changes on the same budget lock.
 if item.proposal_hash<>p_proposal then raise sqlstate 'PT409'; end if;
 select * into prior from studio.approvals where owner_id=p_owner and release_request_id=p_client;
 if found then
  if prior.release_review_id<>p_review then raise sqlstate 'PT409'; end if;
  return jsonb_build_object('approval',to_jsonb(prior)-'owner_id'-'release_request_id','effective',prior.invalidated_at is null and studio.release_review_current(p_owner,p_review));
 end if;
 if not studio.release_review_current(p_owner,p_review) then raise sqlstate 'PT409'; end if;
 if exists(select 1 from studio.approvals where release_review_id=p_review) then raise sqlstate 'PT409'; end if;
 insert into studio.approvals(job_id,owner_id,content_id,candidate_hash,artifact_hash,policy_version,checks_version,approver,approved_at,release_review_id,release_request_id)
 values(item.job_id,p_owner,item.proposal_text::jsonb->>'contentId',item.candidate_hash,item.artifact_hash,item.policy_version,item.checks_hash,p_owner,clock_timestamp(),p_review,p_client) returning * into row;
 return jsonb_build_object('approval',to_jsonb(row)-'owner_id'-'release_request_id','effective',true);
end $$;

create function studio.revoke_release_approval(p_owner uuid,p_approval uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item studio.approvals;
begin
 select * into item from studio.approvals where id=p_approval and owner_id=p_owner and release_review_id is not null;
 if not found then raise sqlstate 'PT404'; end if;
 perform studio.lock_release_job(p_owner,item.job_id);
 if exists(select 1 from studio.releases where approval_id=item.id) then raise sqlstate 'PT409'; end if;
 update studio.approvals set invalidated_at=coalesce(invalidated_at,clock_timestamp()) where id=item.id returning * into item;
 return jsonb_build_object('approval',to_jsonb(item)-'owner_id'-'release_request_id','effective',false);
end $$;

revoke all on function studio.release_approval_version(),studio.release_feedback_hash(uuid),studio.lock_release_job(uuid,uuid),studio.release_review_current(uuid,uuid),studio.read_release_review(uuid,uuid),studio.approve_release_review(uuid,uuid,uuid,text),studio.revoke_release_approval(uuid,uuid) from public,anon,authenticated;
grant execute on function studio.release_approval_version(),studio.release_feedback_hash(uuid),studio.lock_release_job(uuid,uuid),studio.release_review_current(uuid,uuid),studio.read_release_review(uuid,uuid),studio.approve_release_review(uuid,uuid,uuid,text),studio.revoke_release_approval(uuid,uuid) to service_role;
commit;
