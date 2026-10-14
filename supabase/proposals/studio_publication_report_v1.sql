-- REVIEW ONLY after publication_artifact_v1. Records measured evidence;
-- neither consumes teacher approval nor authorizes/deploys a public release.
begin;
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
commit;
