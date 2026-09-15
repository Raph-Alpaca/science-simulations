import 'server-only';
import { StudioError, UUID } from './domain.mjs';
export function studioConfig() {
  const url = process.env.SUPABASE_URL || '';
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const secret = process.env.SUPABASE_SECRET_KEY || '';
  const origin = process.env.STUDIO_ORIGIN || '';
  const allowed = (process.env.ALLOWED_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  let valid = false;
  try { valid = new URL(url).protocol === 'https:' && new URL(origin).origin === origin; } catch { /* Missing/malformed configuration is a closed state. */ }
  if (!valid || !publishable.startsWith('sb_publishable_') || !secret.startsWith('sb_secret_') || !allowed.length || allowed.some(x => !UUID.test(x)) || process.env.STUDIO_DB_READY !== 'true') throw new StudioError('SETUP_REQUIRED', 503);
  return { url, publishable, secret, origin, allowed };
}
