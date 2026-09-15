import { NextResponse } from 'next/server';
import { StudioError } from '../../../../lib/domain.mjs';
import { studioConfig } from '../../../../lib/config';
import { login, session, read, write } from '../../../../lib/service';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { logoutConfig, logoutCurrentBrowser } from '../../../../lib/logout.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } });
async function handle(request: Request, context: {params: Promise<{path: string[]}>}) {
  try {
    const { path } = await context.params;
    const isLogout = path.join('/') === 'logout';
    if (isLogout && request.method !== 'POST') return response({error:'METHOD_NOT_ALLOWED'},405);
    const config = isLogout ? logoutConfig(process.env) : studioConfig();
    if (request.method === 'POST') {
      if (request.headers.get('origin') !== config.origin || !request.headers.get('content-type')?.startsWith('application/json')) throw new StudioError('INVALID_ORIGIN', 403);
      if (Number(request.headers.get('content-length') || 0) > 16000) throw new StudioError('REQUEST_TOO_LARGE', 413);
    }
    if (request.method === 'GET' && path.join('/') === 'session') { await session(); return response({ authenticated: true, executionMode: 'mock' }); }
    let body: unknown = null;
    if (request.method === 'POST') {
      // Finite streaming limit also covers requests without Content-Length.
      const reader = request.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
      if (!reader) throw new StudioError('INVALID_REQUEST');
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 16000) { await reader.cancel(); throw new StudioError('REQUEST_TOO_LARGE', 413); } chunks.push(value); }
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new StudioError('INVALID_REQUEST'); }
    }
    if (isLogout) {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new StudioError('INVALID_REQUEST');
      return response(await logoutCurrentBrowser(config as ReturnType<typeof logoutConfig>, await cookies(), createServerClient));
    }
    if (request.method === 'POST' && path.join('/') === 'login') return response(await login(body));
    const s = await session();
    return response(request.method === 'GET' ? await read(s, path) : await write(s, path, body));
  } catch (error) {
    if (error instanceof StudioError) return response({ error: error.code }, error.status);
    // Never serialize upstream messages, requests, cookies, keys or database errors.
    return response({ error: 'SERVICE_UNAVAILABLE' }, 503);
  }
}
export const GET = handle;
export const POST = handle;
