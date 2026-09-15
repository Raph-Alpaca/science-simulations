import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { authClient, database } from './supabase';
import { studioConfig } from './config';
import { loginFailure, loginDiagnostic } from './login-error.mjs';
import { StudioError, teacher, owner, id, fields, requestEnvelope, mockNext, retryAllowed, checkReceipt } from './domain.mjs';

function dbError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === 'PT409' || error.code === '23505') throw new StudioError('STATE_CONFLICT', 409);
  if (error.code === 'PT404') throw new StudioError('NOT_FOUND', 404);
  if (error.code === 'PT403') throw new StudioError('TEACHER_NOT_ALLOWED', 403);
  if (error.code === 'PT429') throw new StudioError('LIMIT_REACHED', 429);
  throw new StudioError('DATABASE_UNAVAILABLE', 503);
}
export async function session() {
  const auth = await authClient();
  const { data, error } = await auth.auth.getUser();
  if (error) {
    console.warn('[studio-auth]', loginDiagnostic('session_user', loginFailure(error)));
    throw new StudioError('LOGIN_REQUIRED', 401);
  }
  let userId: string;
  try { userId = teacher(data.user, studioConfig().allowed); }
  catch (error) { console.warn('[studio-auth]', loginDiagnostic('allowlist', error)); throw error; }
  const db = database();
  const { data: row, error: dbFail } = await db.from('teachers').select('owner_id,active').eq('owner_id', userId).eq('active', true).maybeSingle();
  try {
    dbError(dbFail);
    if (!row) throw new StudioError('TEACHER_NOT_ALLOWED', 403);
  } catch (error) { console.warn('[studio-auth]', loginDiagnostic('active_teacher', error)); throw error; }
  return { userId, auth, db };
}
export async function login(body: unknown) {
  fields(body, ['email', 'password']);
  const input = body as {email: string; password: string};
  if (typeof input.email !== 'string' || input.email.length > 254 || typeof input.password !== 'string' || !input.password || input.password.length > 256) throw new StudioError('INVALID_REQUEST');
  const auth = await authClient();
  const { error } = await auth.auth.signInWithPassword(input);
  if (error) {
    const failure = loginFailure(error);
    console.warn('[studio-auth]', loginDiagnostic('password_sign_in', failure));
    throw new StudioError(failure.code, failure.status);
  }
  try { await session(); } catch (error) { await auth.auth.signOut({ scope: 'local' }); throw error; }
  return { authenticated: true };
}
type Session = Awaited<ReturnType<typeof session>>;
async function conversation(s: Session, conversationId: string) {
  id(conversationId);
  const { data, error } = await s.db.from('conversations').select('*').eq('id', conversationId).eq('owner_id', s.userId).maybeSingle();
  dbError(error); return owner(data, s.userId);
}
async function job(s: Session, jobId: string) {
  id(jobId);
  const { data, error } = await s.db.from('jobs').select('*').eq('id', jobId).eq('owner_id', s.userId).maybeSingle();
  dbError(error); return owner(data, s.userId);
}
export async function read(s: Session, parts: string[]) {
  if (parts.length === 1 && parts[0] === 'conversations') {
    const { data, error } = await s.db.from('conversations').select('id,title,created_at').eq('owner_id', s.userId).order('created_at', { ascending: false }).limit(100);
    dbError(error); return { conversations: data };
  }
  if (parts.length === 2 && parts[0] === 'conversations') {
    const item = await conversation(s, parts[1]);
    const [messages, jobs] = await Promise.all([
      s.db.from('messages').select('*').eq('owner_id', s.userId).eq('conversation_id', item.id).order('created_at').limit(100),
      s.db.from('jobs').select('*').eq('owner_id', s.userId).eq('conversation_id', item.id).order('created_at', { ascending: false }).limit(100),
    ]);
    dbError(messages.error); dbError(jobs.error);
    return { conversation: item, messages: messages.data, jobs: jobs.data };
  }
  if (parts.length === 2 && parts[0] === 'jobs') {
    const item = await job(s, parts[1]);
    const events = await s.db.from('job_events').select('*').eq('owner_id', s.userId).eq('job_id', item.id).order('sequence').limit(100);
    dbError(events.error); return { job: item, events: events.data };
  }
  throw new StudioError('NOT_FOUND', 404);
}
export async function write(s: Session, parts: string[], body: unknown) {
  if (parts.length === 1 && parts[0] === 'conversations') {
    fields(body, ['title']);
    const title = (body as {title: string}).title;
    if (typeof title !== 'string' || !title.trim() || title.length > 120) throw new StudioError('INVALID_REQUEST');
    const { data, error } = await s.db.rpc('new_conversation', { p_owner: s.userId, p_title: title.trim() });
    dbError(error); return { conversation: data };
  }
  if (parts.length === 1 && parts[0] === 'jobs') {
    const envelope = requestEnvelope(body);
    await conversation(s, envelope.conversationId);
    return submit(s, envelope, null);
  }
  if (parts.length === 3 && parts[0] === 'jobs' && parts[2] === 'commands') {
    fields(body, ['command', 'expectedStateVersion', 'clientRequestId']);
    const input = body as {command: string; expectedStateVersion: number; clientRequestId: string};
    id(input.clientRequestId);
    if (!Number.isInteger(input.expectedStateVersion) || input.expectedStateVersion < 0) throw new StudioError('INVALID_REQUEST');
    const item = await job(s, parts[1]);
    if (input.command === 'retry') {
      retryAllowed(item, input.expectedStateVersion);
      // Same request ID retrieves the same successor through submit_job's unique constraint.
      return submit(s, { ...item.request_snapshot, clientRequestId: input.clientRequestId }, item.id, input.expectedStateVersion);
    }
    const previous = await s.db.from('job_events').select('id,command_type,state_version').eq('job_id', item.id).eq('owner_id', s.userId).eq('command_id', input.clientRequestId).maybeSingle();
    dbError(previous.error);
    if (previous.data) { checkReceipt(previous.data, input.command, input.expectedStateVersion); return { job: item }; }
    const next = mockNext(item, input.command, input.expectedStateVersion);
    const { data, error } = await s.db.rpc('transition_mock_job', {
      p_owner: s.userId, p_job: item.id, p_expected: input.expectedStateVersion, p_command_id: input.clientRequestId, p_command: input.command,
      p_state: next.state, p_phase: next.phase, p_error: next.errorCode,
    });
    dbError(error); return { job: data };
  }
  throw new StudioError('NOT_FOUND', 404);
}
async function submit(s: Session, envelope: ReturnType<typeof requestEnvelope>, retryOf: string | null, retryExpected: number | null = null) {
  const hash = createHash('sha256').update(JSON.stringify({ operation: envelope.operation, payload: envelope.payload, retryOf, retryExpected })).digest('hex');
  const { data, error } = await s.db.rpc('submit_job', {
    p_owner: s.userId, p_conversation: envelope.conversationId, p_client_request: envelope.clientRequestId,
    p_hash: hash, p_snapshot: envelope, p_job: randomUUID(), p_idempotency: randomUUID(), p_retry_of: retryOf, p_retry_expected: retryExpected,
  });
  dbError(error); return { job: data };
}
