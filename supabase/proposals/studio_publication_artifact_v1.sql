-- REVIEW ONLY after publication_dispatch_v1. Authenticated artifact reads only;
-- this grants neither publication approval nor Pages deployment authority.
begin;
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
commit;
