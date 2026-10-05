// Only fixed check fields may leave the private connection process.
export function redactConnectionChecks(value) {
  const result = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const flag = key => typeof result[key] === 'boolean' ? result[key] : null;
  return {
    database_ok: flag('database_ok'),
    read_only: flag('read_only'),
    tls: flag('tls'),
    tls_version: ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'].includes(result.tls_version) ? result.tls_version : null,
    server_major: Number.isInteger(result.server_major) && result.server_major >= 1 && result.server_major <= 99 ? result.server_major : null,
    studio_exists: flag('studio_exists'),
  };
}

// pg_stat_ssl describes the database backend's peer, not the client-to-pooler hop.
// Official Supabase backup guidance supports the session pooler. Its upstream
// observation remains visible; client certificate verification is still required.
export function assessBackupConnection(value, {mode, clientVerifyFull} = {}) {
  const checks = redactConnectionChecks(value);
  const failures = [];
  if (!['direct', 'session'].includes(mode)) failures.push('connection_mode');
  if (clientVerifyFull !== true) failures.push('client_tls');
  for (const key of ['database_ok', 'read_only', 'studio_exists']) {
    if (checks[key] !== true) failures.push(key);
  }
  if (checks.server_major !== 17) failures.push('server_major');
  if (checks.tls === null) failures.push('database_tls_observation');
  if (mode === 'direct' && checks.tls !== true) failures.push('direct_database_tls');
  return {accepted: failures.length === 0, connectionMode: mode, clientTlsVerified: clientVerifyFull === true, databaseSideTls: checks.tls, checks, failures};
}
