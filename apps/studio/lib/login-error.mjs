// Only fixed categories/statuses may reach logs. Never log an Auth error object or message.
export function loginFailure(error) {
  if (error?.code === 'invalid_credentials') return { code: 'LOGIN_FAILED', status: 401 };
  if (error?.status === 429 || error?.code === 'over_request_rate_limit') return { code: 'AUTH_RATE_LIMITED', status: 429 };
  if (error?.name === 'AuthRetryableFetchError' || error?.status === 0 || error?.status >= 500) return { code: 'AUTH_UNAVAILABLE', status: 503 };
  return { code: 'AUTH_REJECTED', status: 401 };
}
export function loginDiagnostic(stage, error) {
  const stages = ['password_sign_in', 'session_user', 'allowlist', 'active_teacher'];
  const codes = ['LOGIN_FAILED', 'AUTH_RATE_LIMITED', 'AUTH_UNAVAILABLE', 'AUTH_REJECTED', 'LOGIN_REQUIRED', 'TEACHER_NOT_ALLOWED', 'DATABASE_UNAVAILABLE'];
  return {
    stage: stages.includes(stage) ? stage : 'unknown',
    code: codes.includes(error?.code) ? error.code : 'UNKNOWN',
    status: Number.isInteger(error?.status) && error.status >= 0 && error.status <= 599 ? error.status : null,
  };
}
