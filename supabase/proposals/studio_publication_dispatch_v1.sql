-- REVIEW ONLY after release_preparation_v1. This queues a verifier workflow,
-- never a Pages deployment or a published release. All activation stays false.
begin;
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
commit;
