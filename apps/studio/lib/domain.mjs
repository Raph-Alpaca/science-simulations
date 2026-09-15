// Pure mock-worker rules. No network, credentials, generation, approval or deployment.
export class StudioError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw new StudioError('INVALID_REQUEST');
}
export function id(value) { if (typeof value !== 'string' || !UUID.test(value)) throw new StudioError('INVALID_ID'); return value; }
export function teacher(user, allowed) {
  if (!user?.id || user.is_anonymous) throw new StudioError('LOGIN_REQUIRED', 401);
  if (!allowed.includes(user.id)) throw new StudioError('TEACHER_NOT_ALLOWED', 403);
  return user.id;
}
export function owner(record, userId) {
  if (!record || record.owner_id !== userId) throw new StudioError('NOT_FOUND', 404);
  return record;
}
export function requestEnvelope(value) {
  fields(value, ['schemaVersion', 'conversationId', 'clientRequestId', 'operation', 'payload']);
  if (value.schemaVersion !== 1 || value.operation !== 'create_simulation') throw new StudioError('INVALID_REQUEST');
  id(value.conversationId); id(value.clientRequestId);
  fields(value.payload, ['topic', 'grade', 'unit', 'requirements', 'schoolYear', 'targetContentId', 'expectedVersion']);
  const p = value.payload;
  const text = (v, max) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new StudioError('INVALID_REQUEST'); return v.trim(); };
  if (![1, 2, 3].includes(p.grade)) throw new StudioError('INVALID_REQUEST');
  if (p.schoolYear !== null && (!Number.isInteger(p.schoolYear) || p.schoolYear < 1900 || p.schoolYear > 2200)) throw new StudioError('INVALID_REQUEST');
  if (p.targetContentId !== null && (typeof p.targetContentId !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(p.targetContentId))) throw new StudioError('INVALID_REQUEST');
  if (p.expectedVersion !== null && (typeof p.expectedVersion !== 'string' || !/^[a-f0-9]{64}$/.test(p.expectedVersion))) throw new StudioError('INVALID_REQUEST');
  return { schemaVersion: 1, conversationId: value.conversationId, clientRequestId: value.clientRequestId, operation: value.operation,
    payload: { topic: text(p.topic, 120), grade: p.grade, unit: text(p.unit, 120), requirements: text(p.requirements, 4000), schoolYear: p.schoolYear, targetContentId: p.targetContentId, expectedVersion: p.expectedVersion } };
}
export const PHASES = ['source_review', 'learning_design', 'development', 'independent_review', 'testing', 'policy_check'];
export function mockNext(job, command, expectedVersion) {
  if (job.execution_mode !== 'mock') throw new StudioError('MOCK_ONLY', 409);
  if (job.state_version !== expectedVersion) throw new StudioError('STATE_CONFLICT', 409);
  let state = job.state, phase = job.phase, errorCode = null;
  if (command === 'cancel' && ['queued', 'running'].includes(state)) state = 'cancel_requested';
  else if (command === 'advance' && state === 'cancel_requested') state = 'cancelled';
  else if (command === 'advance' && state === 'queued') { state = 'running'; phase = PHASES[0]; }
  else if (command === 'advance' && state === 'running') {
    const index = PHASES.indexOf(phase);
    if (index < 0) throw new StudioError('INVALID_STATE', 409);
    if (index === PHASES.length - 1) { state = 'needs_input'; errorCode = 'MOCK_FINISHED_NO_EVIDENCE'; }
    else phase = PHASES[index + 1];
  } else if (command === 'simulate_error' && ['queued', 'running'].includes(state)) { state = 'failed'; errorCode = 'MOCK_SIMULATED_FAILURE'; }
  else throw new StudioError('INVALID_TRANSITION', 409);
  return { state, phase, errorCode, stateVersion: expectedVersion + 1 };
}
export function retryAllowed(job, expectedVersion = job.state_version) {
  if (job.state_version !== expectedVersion) throw new StudioError('STATE_CONFLICT', 409);
  if (!['failed', 'cancelled'].includes(job.state) || job.run_attempt >= 3) throw new StudioError('RETRY_NOT_ALLOWED', 409);
}
export function checkReceipt(receipt, command, expectedVersion) {
  if (receipt.command_type !== command || receipt.state_version !== expectedVersion + 1) throw new StudioError('STATE_CONFLICT', 409);
}
