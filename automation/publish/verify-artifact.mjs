import {createHash} from 'node:crypto';
import path from 'node:path';
import {hash, LIMITS, relativeFile} from '../../packages/contracts/content-source.js';

// Trusted control-plane tool, never a model-selected URL or an approval issuer.
// The caller must load the manifest/hash from the reviewed artifact store.
export const PUBLIC_BASE_URL = 'https://raph-alpaca.github.io/science-simulations/';
export const VERIFY_LIMITS = Object.freeze({totalMs:20_000, requestMs:5_000, requests:LIMITS.files + 1, bytes:LIMITS.bytes});
const types = new Map([
  ['.html',['text/html']], ['.css',['text/css']],
  ['.js',['text/javascript','application/javascript']], ['.json',['application/json']],
  ['.svg',['image/svg+xml']], ['.png',['image/png']], ['.jpg',['image/jpeg']],
  ['.jpeg',['image/jpeg']], ['.webp',['image/webp']], ['.woff2',['font/woff2','application/font-woff2']]
]);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
class VerificationError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function need(value, code) { if (!value) throw new VerificationError(code); }

export function snapshotArtifactManifest(manifest, artifactHash) {
  need(sha(artifactHash) && Array.isArray(manifest) && manifest.length > 0 && manifest.length <= LIMITS.files, 'ARTIFACT_MANIFEST_INVALID');
  const seen = new Set();
  const snapshot = manifest.map(file => {
    need(file && Object.keys(file).sort().join(',') === 'hash,path' && sha(file.hash), 'ARTIFACT_MANIFEST_INVALID');
    try { relativeFile(file.path); } catch { throw new VerificationError('ARTIFACT_PATH_REJECTED'); }
    need(file.path.length <= 200 && file.path.split('/').length <= LIMITS.depth + 1 &&
      file.path.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) &&
        !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) &&
      types.has(path.posix.extname(file.path)) && !seen.has(file.path.toLowerCase()), 'ARTIFACT_PATH_REJECTED');
    seen.add(file.path.toLowerCase());
    return Object.freeze({path:file.path, hash:file.hash});
  });
  for (const name of seen) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) need(!seen.has(parts.slice(0,i).join('/')), 'ARTIFACT_PATH_REJECTED');
  }
  need(snapshot.some(file => file.path === 'index.html') && snapshot.some(file => file.path === 'catalog.json'), 'ARTIFACT_ENTRY_MISSING');
  const sorted = [...snapshot].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  need(snapshot.every((file,i) => file.path === sorted[i].path), 'ARTIFACT_MANIFEST_UNSORTED');
  need(hash(JSON.stringify(snapshot)) === artifactHash, 'ARTIFACT_HASH_MISMATCH');
  return Object.freeze(snapshot);
}

// fetchImpl and reduced time limits are seams for credential-free fault tests.
// No remote caller may supply these options. Both limits can only be reduced.
export async function verifyPublishedArtifact({manifest, artifactHash}, {
  signal, fetchImpl = globalThis.fetch, totalMs = VERIFY_LIMITS.totalMs, requestMs = VERIFY_LIMITS.requestMs
} = {}) {
  const files = snapshotArtifactManifest(manifest, artifactHash);
  need(Number.isInteger(totalMs) && totalMs > 0 && totalMs <= VERIFY_LIMITS.totalMs &&
    Number.isInteger(requestMs) && requestMs > 0 && requestMs <= VERIFY_LIMITS.requestMs &&
    typeof fetchImpl === 'function', 'VERIFICATION_OPTIONS_INVALID');
  const startedAt = new Date().toISOString();
  const controller = new AbortController();
  const cancel = () => controller.abort(new VerificationError('VERIFICATION_CANCELLED'));
  signal?.addEventListener('abort', cancel, {once:true});
  if (signal?.aborted) cancel();
  const totalTimer = setTimeout(() => controller.abort(new VerificationError('VERIFICATION_TIME_LIMIT')), totalMs);
  let requestCount = 0, filesVerified = 0, bytesRead = 0, failedPath = null;

  async function check(file, directoryEntry = false) {
    const url = directoryEntry ? PUBLIC_BASE_URL : PUBLIC_BASE_URL + file.path;
    failedPath = directoryEntry ? './' : file.path;
    need(!controller.signal.aborted, controller.signal.reason?.code || 'VERIFICATION_CANCELLED');
    const requestController = new AbortController();
    const abort = () => requestController.abort(controller.signal.reason);
    controller.signal.addEventListener('abort', abort, {once:true});
    const timer = setTimeout(() => requestController.abort(new VerificationError('PUBLIC_REQUEST_TIME_LIMIT')), requestMs);
    let reader, response, onAbort;
    // Bound even a transport/reader that fails to settle after AbortSignal.
    const aborted = new Promise((resolve,reject) => {
      onAbort = () => reject(requestController.signal.reason);
      requestController.signal.addEventListener('abort', onAbort, {once:true});
    });
    try {
      requestCount++;
      need(requestCount <= VERIFY_LIMITS.requests, 'PUBLIC_REQUEST_LIMIT');
      response = await Promise.race([fetchImpl(url, {
        method:'GET', redirect:'manual', credentials:'omit', cache:'no-store', signal:requestController.signal,
        headers:{accept:'*/*', 'cache-control':'no-cache', pragma:'no-cache'}
      }), aborted]);
      need(response && response.status === 200, 'PUBLIC_HTTP_STATUS');
      need(response.url === url && response.redirected === false, 'PUBLIC_URL_MISMATCH');
      const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      need(types.get(path.posix.extname(file.path)).includes(mime), 'PUBLIC_CONTENT_TYPE');
      const length = response.headers.get('content-length');
      if (length !== null) need(/^\d+$/.test(length) && Number(length) <= LIMITS.fileBytes, 'PUBLIC_FILE_SIZE_LIMIT');
      need(response.body && typeof response.body.getReader === 'function', 'PUBLIC_BODY_MISSING');
      reader = response.body.getReader();
      let size = 0;
      const digest = createHash('sha256');
      while (true) {
        const {done,value} = await Promise.race([reader.read(), aborted]);
        if (done) break;
        need(value instanceof Uint8Array, 'PUBLIC_BODY_INVALID');
        size += value.byteLength; bytesRead += value.byteLength;
        need(size <= LIMITS.fileBytes, 'PUBLIC_FILE_SIZE_LIMIT');
        need(bytesRead <= VERIFY_LIMITS.bytes, 'PUBLIC_TOTAL_SIZE_LIMIT');
        digest.update(value);
      }
      need(digest.digest('hex') === file.hash, 'PUBLIC_BYTES_MISMATCH');
      if (!directoryEntry) filesVerified++;
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', abort);
      requestController.signal.removeEventListener('abort', onAbort);
      requestController.abort();
      // Best-effort cancellation must not outlive the bounded verification call.
      if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
      else if (response?.body) void response.body.cancel().catch(() => {});
    }
  }

  let status = 'pass', failureCode = null;
  try {
    // Check the URL users open as well as the explicit entry and every asset.
    await check(files.find(file => file.path === 'index.html'), true);
    for (const file of files) await check(file);
    failedPath = null;
  } catch (error) {
    status = 'fail';
    failureCode = error instanceof VerificationError ? error.code : 'PUBLIC_TRANSPORT_FAILED';
  } finally {
    clearTimeout(totalTimer);
    signal?.removeEventListener('abort', cancel);
  }
  // Byte equality is one prerequisite. It is NOT approval, runtime behavior,
  // proof of absent extra files, or authority to transition a job to published.
  return Object.freeze({schemaVersion:1, scope:'published_file_bytes', status, failureCode, failedPath,
    artifactHash, publicUrl:PUBLIC_BASE_URL, filesVerified, requestCount, bytesRead,
    startedAt, finishedAt:new Date().toISOString(), runtime:'not_run'});
}
