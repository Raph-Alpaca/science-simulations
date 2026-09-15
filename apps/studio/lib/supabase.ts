import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { studioConfig } from './config';
// Only Route Handlers call this: all cookie refresh writes are allowed here.
export async function authClient() {
  const config = studioConfig();
  const store = await cookies();
  return createServerClient(config.url, config.publishable, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: config.origin.startsWith('https://'), path: '/' },
    cookies: { getAll: () => store.getAll(), setAll: values => { for (const {name, value, options} of values) store.set(name, value, options); } },
    global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(10000) }) },
  });
}
// Never reuse the cookie Auth client for privileged database operations.
export function database() {
  const config = studioConfig();
  return createClient(config.url, config.secret, { db: { schema: 'studio' }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(10000) }) } });
}
