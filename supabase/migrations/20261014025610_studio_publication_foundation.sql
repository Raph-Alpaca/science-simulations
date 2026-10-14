-- Reviewed publication foundation. All execution gates remain disabled.
-- One transaction; no source records, release baseline, approvals or jobs are seeded.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if studio.studio_capabilities_v2()<>2 or studio.input_review_version()<>1 or studio.result_review_version()<>1 or studio.revision_version()<>1
 or studio.worker_execution_enabled() or studio.dispatch_execution_enabled() or studio.conversation_delete_enabled_v2()
 or (select enabled from studio.budget_policy where singleton)
 or (select array_agg(relname::text order by relname) from pg_class where relnamespace='studio'::regnamespace and relkind='r') is distinct from array['approvals','budget_calls','budget_jobs','budget_policy','content_heads','conversations','dispatch_intents','input_reviews','job_events','jobs','messages','releases','result_feedback','reviews','teachers','worker_evidence','worker_oidc_receipts','worker_runs']
 then raise exception 'STUDIO_PUBLICATION_BASELINE_MISMATCH';end if;
end
$preflight$;

-- SOURCE supabase/proposals/studio_release_approval_v1.sql SHA256-LF 17e24de652ad06b3e4dc543ab94c8e2b7e34aadbb2e6b16408c5b677ebbb4999
-- REVIEW ONLY, after revision_v1. No rollout, seed, source certification or deploy.
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

-- SOURCE supabase/proposals/studio_release_preparation_v1.sql SHA256-LF f4e82eddb12129b97c0aa77f5c983fdf079a08904dbae5b9a53c123fcdeaaeab
-- REVIEW ONLY after release_approval_v1. Trusted operator issuance only.
-- No browser/worker writer, no source certification, no seed or publication.
set local lock_timeout='5s';
set local statement_timeout='30s';
create table studio.source_reviews (
 id uuid primary key default gen_random_uuid(),job_id uuid not null,owner_id uuid not null,
 candidate_hash text not null check(candidate_hash ~ '^[a-f0-9]{64}$'),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 education_text text not null check(octet_length(education_text) between 2 and 64000),
 education_hash text not null check(education_hash=encode(sha256(convert_to(education_text,'UTF8')),'hex')),
 created_at timestamptz not null default clock_timestamp(),revoked_at timestamptz,
 unique(id,owner_id),foreign key(job_id,owner_id) references studio.jobs(id,owner_id),
 check(education_text::jsonb->>'candidateHash' is not distinct from candidate_hash),
 check(education_text::jsonb->>'sourceSnapshotHash' is not distinct from source_hash)
);
alter table studio.source_reviews enable row level security;
revoke all on studio.source_reviews from public,anon,authenticated,service_role;
grant select on studio.source_reviews to service_role;
create trigger source_reviews_lock before insert or update or delete on studio.source_reviews for each statement execute function studio.lock_release_authority();
-- Generic immutable-row trigger: only first revoked_at transition is allowed.
create trigger source_review_immutable before update or delete on studio.source_reviews for each row execute function studio.keep_release_review();
alter table studio.release_reviews add column source_review_id uuid;
alter table studio.release_reviews add column issue_request_id uuid;
alter table studio.release_reviews add column issue_request_hash text check(issue_request_hash ~ '^[a-f0-9]{64}$');
alter table studio.release_reviews add foreign key(source_review_id,owner_id) references studio.source_reviews(id,owner_id);
alter table studio.release_reviews add constraint release_issuer_pair check((source_review_id is null and issue_request_id is null and issue_request_hash is null) or (source_review_id is not null and issue_request_id is not null and issue_request_hash is not null));
create unique index release_issue_request on studio.release_reviews(owner_id,issue_request_id) where issue_request_id is not null;

-- One MVCC snapshot for the trusted preparation process. App service_role is
-- deliberately not granted this operation or the issuance operation below.
create function studio.read_release_preparation(p_owner uuid,p_job uuid,p_source_review uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('result',studio.read_worker_result(p_owner,p_job),'sourceReview',to_jsonb(s),'baseline',to_jsonb(b))
 from studio.source_reviews s cross join studio.release_baseline b
 where s.id=p_source_review and s.owner_id=p_owner and s.job_id=p_job and b.singleton
$$;
revoke all on function studio.read_release_preparation(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Source-ledger coupling replaces the predicate below. Old unlinked review
-- records remain in history but cannot authorize new publication after rollout.
create or replace function studio.release_review_current(p_owner uuid,p_review uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
  select 1 from studio.release_reviews r join studio.jobs j on j.id=r.job_id and j.owner_id=r.owner_id
  join studio.worker_runs w on w.job_id=j.id and w.owner_id=j.owner_id
  join studio.budget_jobs b on b.job_id=j.id and b.owner_id=j.owner_id
  join studio.teachers t on t.owner_id=j.owner_id and t.active
  join studio.conversations c on c.id=j.conversation_id and c.owner_id=j.owner_id and c.deleted_at is null
  join studio.release_baseline base on base.singleton and base.enabled
  join studio.source_reviews s on s.id=r.source_review_id and s.owner_id=r.owner_id and s.job_id=r.job_id
  where r.id=p_review and r.owner_id=p_owner and r.revoked_at is null and s.revoked_at is null
   and s.source_hash=r.source_hash and s.candidate_hash=r.candidate_hash and s.education_hash=r.education_hash and s.created_at<=r.created_at
   and j.execution_mode='real' and j.state='awaiting_approval' and j.state_version=r.state_version
   and w.state='finished' and b.state='closed' and b.held_usd_micros=0
   and w.source_snapshot_hash=r.source_hash and w.candidate_hash=r.candidate_hash
   and studio.worker_evidence_hash(j.id)=r.evidence_hash and studio.release_feedback_hash(j.id)=r.feedback_hash
   and base.artifact_hash=r.base_artifact_hash and base.lock_hash=r.lock_hash and base.policy_version=r.policy_version
   and r.proposal_text::jsonb->>'contentId'=j.target_content_id and r.proposal_text::jsonb->>'baselineSha'=w.verified_sha
   and not exists(select 1 from studio.release_reviews newer where newer.job_id=r.job_id and newer.owner_id=r.owner_id and (newer.created_at,newer.id)>(r.created_at,r.id))
   and not exists(select 1 from studio.content_heads h where h.content_id=j.target_content_id and (h.owner_id<>p_owner or h.head_job_id<>j.id))
   and not exists(select 1 from studio.result_feedback f where f.job_id=j.id and f.candidate_hash=r.candidate_hash and f.decision='request_changes')
 )
$$;

create function studio.issue_release_review(p_owner uuid,p_job uuid,p_client uuid,p_source_review uuid,p_record jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare src studio.source_reviews; prior studio.release_reviews; item studio.release_reviews; fingerprint text;
begin
 if p_client is null or p_source_review is null or p_record is null or jsonb_typeof(p_record)<>'object' or octet_length(p_record::text)>14200000 then raise sqlstate 'PT400'; end if;
 if (select array_agg(k order by k) from jsonb_object_keys(p_record) k) is distinct from array['artifact_hash','artifact_text','base_artifact_hash','candidate_hash','checks_hash','evidence_hash','feedback_hash','lock_hash','policy_version','proposal_hash','proposal_text','source_hash','state_version']::text[] then raise sqlstate 'PT400'; end if;
 perform studio.lock_release_job(p_owner,p_job);
 fingerprint:=encode(sha256(convert_to(p_record::text,'UTF8')),'hex');
 select * into prior from studio.release_reviews where owner_id=p_owner and issue_request_id=p_client;
 if found then
  if prior.job_id<>p_job or prior.source_review_id<>p_source_review or prior.issue_request_hash<>fingerprint then raise sqlstate 'PT409'; end if;
  return jsonb_build_object('id',prior.id,'proposalHash',prior.proposal_hash,'current',studio.release_review_current(p_owner,prior.id));
 end if;
 select * into src from studio.source_reviews where id=p_source_review and owner_id=p_owner and job_id=p_job and revoked_at is null;
 if not found then raise sqlstate 'PT404'; end if;
 if (select count(*) from studio.release_reviews where job_id=p_job)>=20 then raise sqlstate 'PT429'; end if;
 if src.source_hash is distinct from p_record->>'source_hash' or src.candidate_hash is distinct from p_record->>'candidate_hash' then raise sqlstate 'PT409'; end if;
 insert into studio.release_reviews(job_id,owner_id,state_version,source_hash,candidate_hash,evidence_hash,feedback_hash,proposal_text,proposal_hash,artifact_text,artifact_hash,base_artifact_hash,education_text,education_hash,checks_hash,lock_hash,policy_version,source_review_id,issue_request_id,issue_request_hash)
 values(p_job,p_owner,(p_record->>'state_version')::integer,p_record->>'source_hash',p_record->>'candidate_hash',p_record->>'evidence_hash',p_record->>'feedback_hash',p_record->>'proposal_text',p_record->>'proposal_hash',p_record->>'artifact_text',p_record->>'artifact_hash',p_record->>'base_artifact_hash',src.education_text,src.education_hash,p_record->>'checks_hash',p_record->>'lock_hash',p_record->>'policy_version',src.id,p_client,fingerprint) returning * into item;
 -- Every failure rolls the insert back. Concurrent feedback, baseline changes
 -- and source revocation use the same authority lock before this recheck.
 if not studio.release_review_current(p_owner,item.id) then raise sqlstate 'PT409'; end if;
 return jsonb_build_object('id',item.id,'proposalHash',item.proposal_hash,'current',true);
end $$;
revoke all on function studio.issue_release_review(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- SOURCE supabase/proposals/studio_publication_dispatch_v1.sql SHA256-LF 5e5937703e164001b173962c967e6628ab612bcab36c78e1432b03237caef5f5
-- REVIEW ONLY after release_preparation_v1. This queues a verifier workflow,
-- never a Pages deployment or a published release. All activation stays false.
set local lock_timeout='5s';
set local statement_timeout='30s';
create table studio.publication_dispatches (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,job_id uuid not null,
 approval_id uuid not null unique,review_id uuid not null,request_id uuid not null,
 proposal_hash text not null check(proposal_hash ~ '^[a-f0-9]{64}$'),
 artifact_hash text not null check(artifact_hash ~ '^[a-f0-9]{64}$'),
 state text not null default 'ready' check(state in ('ready','claimed','submitted','uncertain','failed','cancelled')),
 claim_id uuid unique,created_at timestamptz not null default clock_timestamp(),claimed_at timestamptz,finished_at timestamptz,
 run_id bigint unique check(run_id>0),verified_sha text check(verified_sha ~ '^[a-f0-9]{40}$'),
 error_code text check(error_code in ('APPROVAL_CHANGED','PUBLICATION_PREFLIGHT_FAILED','PUBLICATION_DISPATCH_UNCERTAIN')),
 unique(owner_id,request_id),foreign key(job_id,owner_id) references studio.jobs(id,owner_id),
 foreign key(approval_id,owner_id) references studio.approvals(id,owner_id),
 foreign key(review_id,owner_id) references studio.release_reviews(id,owner_id),
 check((claim_id is null)=(claimed_at is null)),check((run_id is null)=(verified_sha is null)),
 check((state in ('submitted','uncertain','failed','cancelled'))=(finished_at is not null)),
 check((state='submitted')=(run_id is not null)),
 check((state in ('ready','cancelled') and claim_id is null) or (state in ('claimed','submitted','uncertain','failed') and claim_id is not null))
);
-- Only one whole-catalog execution may be outstanding. Unknown outcomes retain
-- this slot indefinitely; elapsed time never authorizes a duplicate dispatch.
create unique index publication_one_active on studio.publication_dispatches((true)) where state in ('ready','claimed','submitted','uncertain');
alter table studio.publication_dispatches enable row level security;
revoke all on studio.publication_dispatches from public,anon,authenticated,service_role;
grant select on studio.publication_dispatches to service_role;
grant insert(owner_id,job_id,approval_id,review_id,request_id,proposal_hash,artifact_hash),update(state,claim_id,claimed_at,finished_at,run_id,verified_sha,error_code) on studio.publication_dispatches to service_role;
create trigger publication_dispatch_lock before insert or update or delete on studio.publication_dispatches for each statement execute function studio.lock_release_authority();

create function studio.publication_dispatch_enabled() returns boolean language sql security invoker set search_path='' as $$select false$$;
create function studio.publication_dispatch_version() returns integer language sql security invoker set search_path='' as $$select 1$$;
create function studio.read_publication_dispatch(p_owner uuid,p_approval uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item studio.publication_dispatches;
begin
 if not exists(select 1 from studio.teachers where owner_id=p_owner and active) then raise sqlstate 'PT403'; end if;
 if not exists(select 1 from studio.approvals a join studio.jobs j on j.id=a.job_id and j.owner_id=a.owner_id
  join studio.conversations c on c.id=j.conversation_id and c.owner_id=j.owner_id and c.deleted_at is null
  where a.id=p_approval and a.owner_id=p_owner and a.release_review_id is not null) then raise sqlstate 'PT404'; end if;
 select * into item from studio.publication_dispatches where owner_id=p_owner and approval_id=p_approval;
 if not found then return null; end if;
 return to_jsonb(item)-'owner_id'-'claim_id'-'request_id';
end $$;
create function studio.publication_approval_current(p_owner uuid,p_approval uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from studio.approvals a join studio.release_reviews r on r.id=a.release_review_id and r.owner_id=a.owner_id
 where a.id=p_approval and a.owner_id=p_owner and a.approver=p_owner and a.invalidated_at is null
 and a.approved_at<=clock_timestamp() and a.job_id=r.job_id and a.candidate_hash=r.candidate_hash and a.artifact_hash=r.artifact_hash
 and a.content_id=r.proposal_text::jsonb->>'contentId' and a.policy_version=r.policy_version and a.checks_version=r.checks_hash
 and studio.release_review_current(p_owner,r.id))
$$;

create function studio.keep_publication_dispatch() returns trigger language plpgsql security invoker set search_path='' as $$
begin
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
create trigger publication_dispatch_immutable before insert or update or delete on studio.publication_dispatches for each row execute function studio.keep_publication_dispatch();
revoke all on function studio.keep_publication_dispatch() from public,anon,authenticated,service_role;

create function studio.request_publication_dispatch(p_owner uuid,p_approval uuid,p_client uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 if exists(select 1 from studio.publication_dispatches where state in ('ready','claimed','submitted','uncertain')) then raise sqlstate 'PT423'; end if;
 if (select count(*) from studio.publication_dispatches where job_id=approval.job_id)>=20 then raise sqlstate 'PT429'; end if;
 select * into review from studio.release_reviews where id=approval.release_review_id;
 insert into studio.publication_dispatches(owner_id,job_id,approval_id,review_id,request_id,proposal_hash,artifact_hash)
 values(p_owner,approval.job_id,p_approval,review.id,p_client,review.proposal_hash,review.artifact_hash) returning * into item;
 return to_jsonb(item)-'owner_id'-'claim_id'-'request_id';
end $$;

create function studio.claim_publication_dispatch(p_owner uuid,p_intent uuid,p_claim uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item studio.publication_dispatches;
begin
 if p_claim is null then raise sqlstate 'PT400'; end if;
 select * into item from studio.publication_dispatches where id=p_intent and owner_id=p_owner;
 if not found then raise sqlstate 'PT404'; end if;
 perform studio.lock_release_job(p_owner,item.job_id);
 select * into item from studio.publication_dispatches where id=p_intent for update;
 if item.state<>'ready' then return jsonb_build_object('claimed',false,'dispatch',to_jsonb(item)-'owner_id'-'claim_id'-'request_id'); end if;
 if not studio.publication_dispatch_enabled() then raise sqlstate 'PT412'; end if;
 if not studio.publication_approval_current(p_owner,item.approval_id) then
  update studio.publication_dispatches set state='cancelled',finished_at=clock_timestamp(),error_code='APPROVAL_CHANGED' where id=item.id returning * into item;
  return jsonb_build_object('claimed',false,'dispatch',to_jsonb(item)-'owner_id'-'claim_id'-'request_id');
 end if;
 update studio.publication_dispatches set state='claimed',claim_id=p_claim,claimed_at=clock_timestamp() where id=item.id returning * into item;
 return jsonb_build_object('claimed',true,'dispatch',to_jsonb(item)-'owner_id'-'claim_id'-'request_id');
end $$;

create function studio.finish_publication_dispatch(p_owner uuid,p_intent uuid,p_claim uuid,p_state text,p_run bigint,p_sha text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item studio.publication_dispatches;
begin
 -- Preserve late transport results after gate/teacher/source/approval changes.
 -- A submitted verifier workflow still needs fresh approval before deployment.
 perform 1 from studio.budget_policy where singleton for update;
 select * into item from studio.publication_dispatches where id=p_intent and owner_id=p_owner for update;
 if not found then raise sqlstate 'PT404'; end if;
 if p_claim is null or item.claim_id is distinct from p_claim then raise sqlstate 'PT403'; end if;
 if p_state is null or p_state not in ('submitted','uncertain','failed') or
 (p_state='submitted' and (p_run is null or p_run<=0 or p_sha is null or p_sha !~ '^[a-f0-9]{40}$')) or
 (p_state<>'submitted' and (p_run is not null or p_sha is not null)) then raise sqlstate 'PT400'; end if;
 if item.state<>'claimed' then
  if item.state=p_state and item.run_id is not distinct from p_run and item.verified_sha is not distinct from p_sha then return to_jsonb(item)-'owner_id'-'claim_id'-'request_id'; end if;
  raise sqlstate 'PT409';
 end if;
 update studio.publication_dispatches set state=p_state,run_id=p_run,verified_sha=p_sha,finished_at=clock_timestamp(),
 error_code=case p_state when 'failed' then 'PUBLICATION_PREFLIGHT_FAILED' when 'uncertain' then 'PUBLICATION_DISPATCH_UNCERTAIN' else null end where id=item.id returning * into item;
 return to_jsonb(item)-'owner_id'-'claim_id'-'request_id';
end $$;
revoke all on function studio.publication_dispatch_version(),studio.read_publication_dispatch(uuid,uuid),studio.publication_dispatch_enabled(),studio.publication_approval_current(uuid,uuid),studio.request_publication_dispatch(uuid,uuid,uuid),studio.claim_publication_dispatch(uuid,uuid,uuid),studio.finish_publication_dispatch(uuid,uuid,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function studio.publication_dispatch_version(),studio.read_publication_dispatch(uuid,uuid),studio.publication_dispatch_enabled(),studio.publication_approval_current(uuid,uuid),studio.request_publication_dispatch(uuid,uuid,uuid),studio.claim_publication_dispatch(uuid,uuid,uuid),studio.finish_publication_dispatch(uuid,uuid,uuid,text,bigint,text) to service_role;

-- SOURCE supabase/proposals/studio_publication_artifact_v1.sql SHA256-LF dc38461d570f85fd948bbc293459d9e750d3689872486f5c681ef0ff4c87ed5e
-- REVIEW ONLY after publication_dispatch_v1. Authenticated artifact reads only;
-- this grants neither publication approval nor Pages deployment authority.
set local lock_timeout='5s';
set local statement_timeout='30s';
create table studio.publication_oidc_receipts (
 jti_hash text primary key check(jti_hash ~ '^[a-f0-9]{64}$'),
 publication_id uuid not null references studio.publication_dispatches(id),
 run_id bigint not null check(run_id>0),run_attempt integer not null check(run_attempt=1),
 workflow_sha text not null check(workflow_sha ~ '^[a-f0-9]{40}$'),
 role text not null check(role='prepare'),action text not null check(action in ('manifest','file')),
 body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,received_at timestamptz not null default clock_timestamp()
);
create index publication_oidc_intent on studio.publication_oidc_receipts(publication_id);
alter table studio.publication_oidc_receipts enable row level security;
revoke all on studio.publication_oidc_receipts from public,anon,authenticated,service_role;
grant select,insert on studio.publication_oidc_receipts to service_role;
create function studio.publication_api_enabled() returns boolean language sql security invoker set search_path='' as $$select false$$;

-- The server verifies RSA signature and fixed GitHub claims BEFORE this call.
-- Receipt, current authority and exact artifact snapshot share one transaction.
create function studio.read_publication_artifact(p_intent uuid,p_run bigint,p_attempt integer,p_sha text,p_jti_hash text,p_expires timestamptz,p_role text,p_action text,p_body_hash text,p_path text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item studio.publication_dispatches;review studio.release_reviews;packet jsonb;binding jsonb;written integer;
begin
 if p_role is distinct from 'prepare' or p_action is null or p_action not in ('manifest','file') or p_intent is null or p_run is null or p_run<=0 or p_attempt is distinct from 1
  or p_sha is null or p_sha !~ '^[a-f0-9]{40}$' or p_jti_hash is null or p_jti_hash !~ '^[a-f0-9]{64}$'
  or p_body_hash is null or p_body_hash !~ '^[a-f0-9]{64}$' or p_expires is null or p_expires<=clock_timestamp() or p_expires>clock_timestamp()+interval '21 minutes'
  or (p_action='manifest' and p_path is not null) or (p_action='file' and (p_path is null or octet_length(p_path)>200)) then raise sqlstate 'PT400'; end if;
 select * into item from studio.publication_dispatches where id=p_intent;
 if not found then raise sqlstate 'PT403'; end if;
 perform studio.lock_release_job(item.owner_id,item.job_id);
 select * into item from studio.publication_dispatches where id=p_intent for update;
 if not studio.publication_api_enabled() then raise sqlstate 'PT412'; end if;
 if item.state<>'submitted' or item.run_id is distinct from p_run or item.verified_sha is distinct from p_sha then raise sqlstate 'PT403'; end if;
 if not studio.publication_approval_current(item.owner_id,item.approval_id) then raise sqlstate 'PT409'; end if;
 select * into review from studio.release_reviews where id=item.review_id and owner_id=item.owner_id;
 if not found or review.proposal_hash<>item.proposal_hash or review.artifact_hash<>item.artifact_hash then raise sqlstate 'PT409'; end if;
 if (select count(*) from studio.publication_oidc_receipts where publication_id=p_intent)>=256 then raise sqlstate 'PT429'; end if;
 binding=jsonb_build_object('publicationId',item.id,'approvalId',item.approval_id,'reviewId',item.review_id,'runId',item.run_id,'runAttempt',1,'workflowSha',item.verified_sha,'proposalHash',item.proposal_hash,'artifactHash',item.artifact_hash);
 if p_action='manifest' then
  packet=jsonb_build_object('binding',binding,'ownerId',item.owner_id,'snapshot',studio.read_release_review(item.owner_id,item.job_id));
 else
  select value into packet from jsonb_array_elements(review.artifact_text::jsonb->'files') as files(value) where value->>'path'=p_path;
  if packet is null then raise sqlstate 'PT404'; end if;
  packet=jsonb_build_object('binding',binding,'file',packet);
 end if;
 insert into studio.publication_oidc_receipts(jti_hash,publication_id,run_id,run_attempt,workflow_sha,role,action,body_hash,expires_at)
 values(p_jti_hash,p_intent,p_run,p_attempt,p_sha,p_role,p_action,p_body_hash,p_expires) on conflict(jti_hash) do nothing;
 get diagnostics written=row_count;if written<>1 then raise sqlstate 'PT409'; end if;
 return packet;
end $$;
revoke all on function studio.publication_api_enabled(),studio.read_publication_artifact(uuid,bigint,integer,text,text,timestamptz,text,text,text,text) from public,anon,authenticated;
grant execute on function studio.publication_api_enabled(),studio.read_publication_artifact(uuid,bigint,integer,text,text,timestamptz,text,text,text,text) to service_role;

-- SOURCE supabase/proposals/studio_publication_report_v1.sql SHA256-LF 07eae73a31942c8ca80dd0979e01b88f679df65dbb78e12d175d3b8496b93ab0
-- REVIEW ONLY after publication_artifact_v1. Records measured evidence;
-- neither consumes teacher approval nor authorizes/deploys a public release.
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table studio.publication_oidc_receipts drop constraint publication_oidc_receipts_role_check;
alter table studio.publication_oidc_receipts drop constraint publication_oidc_receipts_action_check;
alter table studio.publication_oidc_receipts add constraint publication_oidc_receipts_role_action_check
 check((role='prepare' and action in ('manifest','file')) or (role='report' and action='check-report'));
create table studio.publication_checks (
 publication_id uuid primary key references studio.publication_dispatches(id),
 report_text text not null check(octet_length(report_text) between 2 and 16384),
 report_hash text not null check(report_hash ~ '^[a-f0-9]{64}$' and report_hash=encode(sha256(convert_to(report_text,'UTF8')),'hex')),
 passed boolean not null,jti_hash text not null unique references studio.publication_oidc_receipts(jti_hash),
 recorded_at timestamptz not null default clock_timestamp(),
 check(jsonb_typeof(report_text::jsonb)='object'),
 check(passed=((report_text::jsonb#>>'{runtime,checks,runtime}')='pass'))
);
alter table studio.publication_checks enable row level security;
revoke all on studio.publication_checks from public,anon,authenticated,service_role;
grant select,insert on studio.publication_checks to service_role;
create function studio.keep_publication_check() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise sqlstate 'PT409';end $$;
create trigger publication_check_immutable before update or delete on studio.publication_checks for each row execute function studio.keep_publication_check();
revoke all on function studio.keep_publication_check() from public,anon,authenticated,service_role;

-- Server-authenticated reporter reads only immutable hashes and inspection
-- metadata, even after withdrawal; no private source or new authority is issued.
create function studio.read_publication_report_context(p_intent uuid,p_run bigint,p_attempt integer,p_sha text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item studio.publication_dispatches;review studio.release_reviews;kind text;
begin
 if not studio.publication_api_enabled() then raise sqlstate 'PT412';end if;
 select * into item from studio.publication_dispatches where id=p_intent;
 if not found or item.state<>'submitted' or p_run is null or item.run_id is distinct from p_run or p_attempt is distinct from 1 or p_sha is null or item.verified_sha is distinct from p_sha then raise sqlstate 'PT403';end if;
 select * into review from studio.release_reviews where id=item.review_id and owner_id=item.owner_id;
 if not found or review.proposal_hash<>item.proposal_hash or review.artifact_hash<>item.artifact_hash then raise sqlstate 'PT409';end if;
 select approved_input::jsonb#>>'{input,generationKind}' into kind from studio.worker_runs where job_id=item.job_id and owner_id=item.owner_id;
 if kind is null or kind not in ('interactive_2d','interactive_3d') then raise sqlstate 'PT409';end if;
 return jsonb_build_object('binding',jsonb_build_object('publicationId',item.id,'approvalId',item.approval_id,'reviewId',item.review_id,'runId',item.run_id,'runAttempt',1,'workflowSha',item.verified_sha,'proposalHash',item.proposal_hash,'artifactHash',item.artifact_hash),
  'inspection',jsonb_build_object('proposalText',review.proposal_text,'generationKind',kind));
end $$;

-- Full runtime schema is checked by the trusted server against the above
-- immutable context before this call. This transaction pins that context again,
-- consumes one signed-token receipt and records one immutable result.
create function studio.record_publication_check(p_intent uuid,p_run bigint,p_attempt integer,p_sha text,p_jti_hash text,p_expires timestamptz,p_body_hash text,p_report_text text)
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
 return jsonb_build_object('publicationId',p_intent,'reportHash',stored.report_hash,'passed',stored.passed,'recordedAt',stored.recorded_at,'published',false);
end $$;
revoke all on function studio.read_publication_report_context(uuid,bigint,integer,text),studio.record_publication_check(uuid,bigint,integer,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function studio.read_publication_report_context(uuid,bigint,integer,text),studio.record_publication_check(uuid,bigint,integer,text,text,timestamptz,text,text) to service_role;

-- SOURCE supabase/proposals/studio_publication_authority_v1.sql SHA256-LF ebbf1130ddd80f05127ca4254c32b9aa5ecb60cb28d251243b24b7e10de88916
-- REVIEW ONLY after publication_report_v1. No deployment or feature activation.
-- A durable claim consumes the exact teacher approval before any public upload.
set local lock_timeout='5s';
set local statement_timeout='30s';
create function studio.publication_deploy_enabled() returns boolean language sql security invoker set search_path='' as $$select false$$;
alter table studio.publication_oidc_receipts drop constraint publication_oidc_receipts_role_action_check;
alter table studio.publication_oidc_receipts add constraint publication_oidc_receipts_role_action_check
 check((role='prepare' and action in ('manifest','file')) or (role='report' and action='check-report') or (role='deploy' and action='claim'));
create table studio.publication_authorizations (
 publication_id uuid primary key references studio.publication_dispatches(id),
 id uuid not null unique default gen_random_uuid(),approval_id uuid not null unique references studio.approvals(id),
 report_hash text not null check(report_hash ~ '^[a-f0-9]{64}$'),
 jti_hash text not null unique references studio.publication_oidc_receipts(jti_hash),
 claimed_at timestamptz not null default clock_timestamp()
);
alter table studio.publication_authorizations enable row level security;
revoke all on studio.publication_authorizations from public,anon,authenticated,service_role;
grant select,insert on studio.publication_authorizations to service_role;
create trigger publication_authority_lock before insert or update or delete on studio.publication_authorizations for each statement execute function studio.lock_release_authority();
create function studio.keep_publication_authorization() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise sqlstate 'PT409';end if;
 if not studio.publication_api_enabled() or not studio.publication_deploy_enabled() then raise sqlstate 'PT412';end if;
 if not exists(select 1 from studio.publication_dispatches d join studio.publication_checks c on c.publication_id=d.id
  join studio.publication_oidc_receipts token on token.jti_hash=new.jti_hash and token.publication_id=d.id
  where d.id=new.publication_id and d.approval_id=new.approval_id and d.state='submitted'
  and c.passed and c.report_hash=new.report_hash and token.role='deploy' and token.action='claim'
  and token.run_id=d.run_id and token.run_attempt=1 and token.workflow_sha=d.verified_sha and token.expires_at>clock_timestamp()
  and studio.publication_approval_current(d.owner_id,d.approval_id)) then raise sqlstate 'PT409';end if;
 return new;
end $$;
create trigger publication_authorization_immutable before insert or update or delete on studio.publication_authorizations for each row execute function studio.keep_publication_authorization();

-- Once a public transfer may have begun, ordinary approval revocation must not
-- falsely promise to retract it. Any withdrawal/removal is a separate operation.
create trigger approval_publication_lock before update on studio.approvals for each statement execute function studio.lock_release_authority();
create function studio.protect_consumed_approval() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.invalidated_at is distinct from old.invalidated_at and exists(select 1 from studio.publication_authorizations where approval_id=old.id) then raise sqlstate 'PT423';end if;
 return new;
end $$;
create trigger approval_publication_consumed before update on studio.approvals for each row execute function studio.protect_consumed_approval();
revoke all on function studio.keep_publication_authorization(),studio.protect_consumed_approval() from public,anon,authenticated,service_role;

-- A whole-catalog transfer holds its base until a matching verified release is
-- recorded. A future completion transaction must do that before advancing it.
create function studio.protect_publication_baseline() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from studio.publication_authorizations g where not exists(select 1 from studio.releases r where r.approval_id=g.approval_id and r.verification_state='verified' and r.verified_at is not null)) then raise sqlstate 'PT423';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger publication_baseline_frozen before update or delete on studio.release_baseline for each row execute function studio.protect_publication_baseline();
revoke all on function studio.protect_publication_baseline() from public,anon,authenticated,service_role;

create function studio.claim_publication_authority(p_intent uuid,p_run bigint,p_attempt integer,p_sha text,p_jti_hash text,p_expires timestamptz,p_body_hash text,p_artifact_hash text,p_report_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item studio.publication_dispatches;context jsonb;grant_row studio.publication_authorizations;written integer;
begin
 if p_jti_hash is null or p_jti_hash !~ '^[a-f0-9]{64}$' or p_body_hash is null or p_body_hash !~ '^[a-f0-9]{64}$'
 or p_artifact_hash is null or p_artifact_hash !~ '^[a-f0-9]{64}$' or p_report_hash is null or p_report_hash !~ '^[a-f0-9]{64}$'
 or p_expires is null or p_expires<=clock_timestamp() or p_expires>clock_timestamp()+interval '21 minutes' then raise sqlstate 'PT400';end if;
 select * into item from studio.publication_dispatches where id=p_intent;
 if not found then raise sqlstate 'PT403';end if;
 perform studio.lock_release_job(item.owner_id,item.job_id);
 select * into item from studio.publication_dispatches where id=p_intent for update;
 context=studio.read_publication_report_context(p_intent,p_run,p_attempt,p_sha);
 if not studio.publication_deploy_enabled() then raise sqlstate 'PT412';end if;
 if item.artifact_hash<>p_artifact_hash or not studio.publication_approval_current(item.owner_id,item.approval_id)
 or not exists(select 1 from studio.publication_checks where publication_id=p_intent and passed and report_hash=p_report_hash)
 or exists(select 1 from studio.publication_authorizations where publication_id=p_intent) then raise sqlstate 'PT409';end if;
 if (select count(*) from studio.publication_oidc_receipts where publication_id=p_intent)>=256 then raise sqlstate 'PT429';end if;
 insert into studio.publication_oidc_receipts(jti_hash,publication_id,run_id,run_attempt,workflow_sha,role,action,body_hash,expires_at)
 values(p_jti_hash,p_intent,p_run,p_attempt,p_sha,'deploy','claim',p_body_hash,p_expires) on conflict(jti_hash) do nothing;
 get diagnostics written=row_count;if written<>1 then raise sqlstate 'PT409';end if;
 insert into studio.publication_authorizations(publication_id,approval_id,report_hash,jti_hash)
 values(p_intent,item.approval_id,p_report_hash,p_jti_hash) returning * into grant_row;
 return jsonb_build_object('binding',context->'binding','claim',jsonb_build_object('id',grant_row.id,'claimedAt',grant_row.claimed_at,'reportHash',grant_row.report_hash),'published',false);
end $$;

create or replace function studio.read_release_review(p_owner uuid,p_job uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('review',to_jsonb(r),'current',studio.release_review_current(p_owner,r.id),
  'result',studio.read_worker_result(p_owner,p_job),
  'publicationStartedAt',(select g.claimed_at from studio.publication_authorizations g join studio.publication_dispatches d on d.id=g.publication_id where d.review_id=r.id),
  'approval',(select to_jsonb(a)-'owner_id'-'release_request_id' from studio.approvals a where a.release_review_id=r.id and a.owner_id=p_owner))
 from studio.release_reviews r join studio.teachers t on t.owner_id=r.owner_id and t.active
 join studio.jobs j on j.id=r.job_id and j.owner_id=r.owner_id
 join studio.conversations c on c.id=j.conversation_id and c.owner_id=j.owner_id and c.deleted_at is null
 where r.owner_id=p_owner and r.job_id=p_job order by r.created_at desc,r.id desc limit 1
$$;
revoke all on function studio.publication_deploy_enabled(),studio.claim_publication_authority(uuid,bigint,integer,text,text,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function studio.publication_deploy_enabled(),studio.claim_publication_authority(uuid,bigint,integer,text,text,timestamptz,text,text,text) to service_role;

-- SOURCE supabase/proposals/studio_publication_completion_v1.sql SHA256-LF 40d1fc88240cf06d8774e883a08e9e9cd37536cbfe3951e6f42b2d01f3ef082b
-- REVIEW ONLY after publication_authority_v1. No rollout or activation.
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
