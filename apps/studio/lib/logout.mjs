import { StudioError } from './domain.mjs';

// Logout needs only the project's Auth namespace and same-origin boundary, never teacher privileges.
export function logoutConfig(env) {
  try {
    const url = new URL(env.SUPABASE_URL);
    const origin = new URL(env.STUDIO_ORIGIN);
    if (url.protocol !== 'https:' || origin.origin !== env.STUDIO_ORIGIN || !env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) throw Error();
    return {url: url.origin, origin: origin.origin, publishable: env.SUPABASE_PUBLISHABLE_KEY, storageKey: `sb-${url.hostname.split('.')[0]}-auth-token`};
  } catch { throw new StudioError('SETUP_REQUIRED', 503); }
}

export function projectAuthCookie(name, key) {
  if (!name.startsWith(key)) return false;
  return /^(?:-user|-code-verifier|-flows-code-verifier|-flow-[A-Za-z0-9_-]{8,64}-code-verifier)?(?:\.\d+)?$/.test(name.slice(key.length));
}

export async function logoutCurrentBrowser(config, store, createClient, fetchAuth = fetch) {
  const own = name => projectAuthCookie(name, config.storageKey);
  const initial = store.getAll().filter(c => own(c.name));
  let remoteSignOut = initial.some(c => c.value) ? 'unconfirmed' : 'not_required';
  let confirmed = false;
  const options = {path:'/', httpOnly:true, sameSite:'lax', secure:config.origin.startsWith('https://')};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    if (remoteSignOut !== 'not_required') {
      const client = createClient(config.url, config.publishable, {
        cookieOptions: options,
        cookies: {
          getAll: () => store.getAll().filter(c => own(c.name)),
          setAll: values => { for (const c of values) if (own(c.name)) store.set(c.name, c.value, c.options); },
        },
        global: {fetch: async (url, init) => {
          const target = new URL(url);
          const logout = target.pathname === '/auth/v1/logout';
          if (logout && target.searchParams.get('scope') !== 'local') throw Error('NON_LOCAL_LOGOUT');
          const result = await fetchAuth(url, {...init, cache:'no-store', signal:controller.signal});
          if (logout && result.ok) confirmed = true;
          return result;
        }},
      });
      const {error} = await client.auth.signOut({scope:'local'});
      // The SDK also returns success for some missing/expired session errors. Only an actual
      // successful logout response is evidence of remote session termination.
      if (!error && confirmed) remoteSignOut = 'confirmed';
    }
  } catch { /* Local cleanup still runs; no upstream credentials or errors are serialized. */ }
  finally {
    clearTimeout(timeout);
    const names = new Set([...initial, ...store.getAll()].filter(c => own(c.name)).map(c => c.name));
    for (const name of names) store.set(name, '', {...options, maxAge:0, expires:new Date(0)});
  }
  return {authenticated:false, localSessionCleared:true, remoteSignOut};
}
