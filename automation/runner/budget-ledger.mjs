import {RunnerError} from './bounded-responses.mjs';

// Server-only adapter. Pass a trusted Supabase client; never a browser client
// or a client supplied by generated code. The credential remains in the caller.
export function createBudgetLedger(client) {
  if (typeof client?.schema !== 'function') throw new RunnerError('DURABLE_LEDGER_REQUIRED');
  const studio = client.schema('studio');
  async function invoke(name, params, expected) {
    let result;
    try {
      result = await studio.rpc(name, params).abortSignal(AbortSignal.timeout(10_000));
    } catch { throw new RunnerError('BUDGET_DATABASE_UNCERTAIN'); }
    if (result?.error || !result?.data || !expected(result.data)) {
      // Do not log raw PostgREST errors, credentials, job bodies or response data.
      throw new RunnerError('BUDGET_DATABASE_REJECTED');
    }
    return result.data;
  }
  return Object.freeze({
    reserveJob({ownerId, jobId}) {
      return invoke('reserve_job_budget', {p_owner:ownerId, p_job:jobId},
        r => r.job_id === jobId && r.owner_id === ownerId && r.state === 'active');
    },
    reserve({jobId, callId, requestHash, role, maxUsdMicros}) {
      return invoke('reserve_ai_call', {
        p_job:jobId, p_call:callId, p_hash:requestHash, p_role:role, p_max_usd_micros:maxUsdMicros,
      }, r => r.job_id === jobId && r.call_id === callId && r.request_hash === requestHash &&
        r.role === role && r.reserved_usd_micros === maxUsdMicros &&
        typeof r.newReservation === 'boolean' && (!r.newReservation || r.state === 'reserved'));
    },
    settle({jobId, callId, chargedUsdMicros, uncertain}) {
      return invoke('settle_ai_call', {
        p_job:jobId, p_call:callId, p_charged_usd_micros:chargedUsdMicros, p_uncertain:uncertain,
      }, r => r.job_id === jobId && r.call_id === callId &&
        ((uncertain && r.state === 'uncertain') ||
          (!uncertain && r.state === 'settled' && r.charged_usd_micros === chargedUsdMicros) ||
          (r.state === 'uncertain' && r.budgetBreach === true)));
    },
    closeJob({jobId}) {
      return invoke('close_job_budget', {p_job:jobId},
        r => r.job_id === jobId && r.state === 'closed' && r.held_usd_micros === 0);
    },
  });
}
