-- REVIEW ONLY after publication_report_v1. No deployment or feature activation.
-- A durable claim consumes the exact teacher approval before any public upload.
begin;
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
commit;
