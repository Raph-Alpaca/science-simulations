-- REVIEW ONLY after release_approval_v1. Trusted operator issuance only.
-- No browser/worker writer, no source certification, no seed or publication.
begin;
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
commit;
