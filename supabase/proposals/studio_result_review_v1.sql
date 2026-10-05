-- REVIEW ONLY. After worker_auth_v1. No publication authority or paid rerun.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table studio.result_feedback (
 id uuid primary key default gen_random_uuid(), job_id uuid not null, owner_id uuid not null,
 client_request_id uuid not null, decision text not null check(decision in ('note','request_changes')),
 note text not null check(length(btrim(note)) between 1 and 2000),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 candidate_hash text check(candidate_hash ~ '^[a-f0-9]{64}$'),
 evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'),
 state_version integer not null check(state_version>=0),
 created_at timestamptz not null default clock_timestamp(),
 unique(job_id,client_request_id),
 foreign key(job_id,owner_id) references studio.jobs(id,owner_id),
 check(decision<>'request_changes' or candidate_hash is not null)
);
alter table studio.result_feedback enable row level security;
revoke all on studio.result_feedback from public,anon,authenticated,service_role;
grant select,insert on studio.result_feedback to service_role;
create function studio.result_review_version() returns integer language sql security invoker set search_path='' as $$select 1$$;
create function studio.worker_evidence_hash(p_job uuid) returns text language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(coalesce(string_agg(sequence::text||':'||body_hash,E'\n' order by sequence),''),'UTF8')),'hex') from studio.worker_evidence where job_id=p_job
$$;

-- One statement/MVCC snapshot. No privileged view, dynamic SQL or browser grant.
create function studio.read_worker_result(p_owner uuid,p_job uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'job',jsonb_build_object('id',j.id,'state',j.state,'state_version',j.state_version,'error_code',j.error_code,'run_id',j.run_id),
  'worker',jsonb_build_object('state',w.state,'source_hash',w.source_snapshot_hash,'input_text',w.approved_input,'verified_sha',w.verified_sha,'event_count',w.event_count,'candidate_hash',w.candidate_hash,'reason',w.reason),
  'evidence_hash',studio.worker_evidence_hash(j.id),
  'evidence',coalesce((select jsonb_agg(jsonb_build_object('sequence',e.sequence,'kind',e.kind,'body',e.body,'body_hash',e.body_hash,'created_at',e.created_at) order by e.sequence) from studio.worker_evidence e where e.job_id=j.id),'[]'::jsonb),
  'budget',(select jsonb_build_object('state',b.state,'limit_usd_micros',b.limit_usd_micros,'held_usd_micros',b.held_usd_micros,'spent_usd_micros',b.spent_usd_micros,'call_count',b.call_count) from studio.budget_jobs b where b.job_id=j.id),
  'feedback',coalesce((select jsonb_agg(to_jsonb(f)-'owner_id'-'client_request_id' order by f.created_at,f.id) from studio.result_feedback f where f.job_id=j.id),'[]'::jsonb)
 ) from studio.jobs j join studio.worker_runs w on w.job_id=j.id and w.owner_id=j.owner_id
 join studio.teachers t on t.owner_id=j.owner_id and t.active
 join studio.conversations c on c.id=j.conversation_id and c.owner_id=j.owner_id and c.deleted_at is null
 where j.id=p_job and j.owner_id=p_owner and j.execution_mode='real'
$$;

-- Feedback is version-bound private teacher input, NOT a release approval and
-- NOT a second AI job. It cannot erase failed checks or change a worker result.
create function studio.record_result_feedback(p_owner uuid,p_job uuid,p_client uuid,p_state_version integer,p_source text,p_candidate text,p_evidence text,p_decision text,p_note text) returns jsonb
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
 if work.state not in ('needs_input','failed','cancelled','awaiting_approval') or worker.state not in ('finished','uncertain') then raise sqlstate 'PT409'; end if;
 select body::jsonb->>'candidateHash' into current_candidate from studio.worker_evidence where job_id=p_job and kind='candidate' order by sequence desc limit 1;
 if work.state_version<>p_state_version or worker.source_snapshot_hash<>p_source or current_candidate is distinct from p_candidate or studio.worker_evidence_hash(p_job)<>p_evidence then raise sqlstate 'PT409'; end if;
 if (select count(*) from studio.result_feedback where job_id=p_job)>=20 then raise sqlstate 'PT429'; end if;
 insert into studio.result_feedback(job_id,owner_id,client_request_id,decision,note,source_hash,candidate_hash,evidence_hash,state_version)
 values(p_job,p_owner,p_client,p_decision,btrim(p_note),p_source,p_candidate,p_evidence,p_state_version) returning * into item;
 return to_jsonb(item)-'owner_id'-'client_request_id';
end $$;
revoke all on function studio.result_review_version(),studio.worker_evidence_hash(uuid),studio.read_worker_result(uuid,uuid),studio.record_result_feedback(uuid,uuid,uuid,integer,text,text,text,text,text) from public,anon,authenticated;
grant execute on function studio.result_review_version(),studio.worker_evidence_hash(uuid),studio.read_worker_result(uuid,uuid),studio.record_result_feedback(uuid,uuid,uuid,integer,text,text,text,text,text) to service_role;
commit;
