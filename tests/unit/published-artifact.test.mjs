import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hash, LIMITS} from '../../packages/contracts/content-source.js';
import {PUBLIC_BASE_URL, VERIFY_LIMITS, verifyPublishedArtifact} from '../../automation/publish/verify-artifact.mjs';

// Synthetic public bytes only; these receipts are not curriculum or publication approval.
function fixture(extra = {}) {
  const bodies = {
    'assets/app.js':'document.body.dataset.fixture = "loaded";',
    'assets/styles.css':'body { color: black; }',
    'catalog.json':'{"cards":[]}',
    'index.html':'<!doctype html><html lang="ko"><title>합성 검사</title><h1>검사용</h1></html>',
    ...extra
  };
  const manifest = Object.keys(bodies).sort().map(path => ({path,hash:hash(bodies[path])}));
  return {bodies, manifest, artifactHash:hash(JSON.stringify(manifest))};
}
const mime = name => name.endsWith('.html') ? 'text/html' : name.endsWith('.json') ? 'application/json' :
  name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'text/javascript';
function response(url, body, type, options = {}) {
  const result = new Response(body, {status:options.status || 200, headers:{'content-type':type,...options.headers}});
  Object.defineProperty(result,'url',{value:options.url || url});
  Object.defineProperty(result,'redirected',{value:options.redirected || false});
  return result;
}
function transport(data, transform) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({url,options});
    assert.equal(url.startsWith(PUBLIC_BASE_URL),true);
    const name = url.slice(PUBLIC_BASE_URL.length) || 'index.html';
    const value = response(url,data.bodies[name],mime(name));
    return transform ? transform({url,options,name,value,requests}) : value;
  };
  return {requests,fetchImpl};
}

test('checks the directory entry and every exact file byte, without asserting publication or runtime', async () => {
  const data = fixture({'assets/diagram.png':Buffer.from([0,255,200,13,10])});
  const remote = transport(data);
  const result = await verifyPublishedArtifact(data,remote);
  assert.equal(result.status,'pass');
  assert.equal(result.scope,'published_file_bytes');
  assert.equal(result.filesVerified,data.manifest.length);
  assert.equal(result.requestCount,data.manifest.length+1);
  assert.equal(result.runtime,'not_run');
  assert.equal(Object.hasOwn(result,'published'),false);
  assert.equal(result.failureCode,null);
  assert.equal(result.failedPath,null);
  assert.equal(Object.isFrozen(result),true);
  assert.equal(result.bytesRead,Object.values(data.bodies).reduce((sum,b) => sum+Buffer.byteLength(b),Buffer.byteLength(data.bodies['index.html'])));
  for (const {url,options} of remote.requests) {
    assert.equal(new URL(url).origin,'https://raph-alpaca.github.io');
    assert.equal(options.method,'GET');
    assert.equal(options.redirect,'manual');
    assert.equal(options.credentials,'omit');
    assert.equal(options.cache,'no-store');
    assert.deepEqual(Object.keys(options.headers).sort(),['accept','cache-control','pragma']);
  }
});

test('stale directory or asset bytes stop at the first mismatch, with no retry or response body in the receipt', async () => {
  for (const target of ['./','assets/app.js','catalog.json']) {
    const data = fixture(), remote = transport(data, ({url,name,value}) =>
      (target === './' ? url === PUBLIC_BASE_URL : name === target)
        ? response(url,'PRIVATE_RESPONSE_MUST_NOT_LEAK',mime(name)) : value);
    const result = await verifyPublishedArtifact(data,remote);
    assert.equal(result.status,'fail');
    assert.equal(result.failureCode,'PUBLIC_BYTES_MISMATCH');
    assert.equal(result.failedPath,target);
    assert.equal(result.requestCount,new Set(remote.requests.map(r => r.url)).size);
    assert.equal(JSON.stringify(result).includes('PRIVATE_RESPONSE'),false);
  }
});

test('redirect, misleading final URL, missing asset and wrong MIME type cannot pass as HTTP success', async () => {
  const data = fixture();
  for (const [options, type, code] of [
    [{status:302,headers:{location:'https://other.invalid/'}},'text/html','PUBLIC_HTTP_STATUS'],
    [{status:404},'text/html','PUBLIC_HTTP_STATUS'],
    [{redirected:true},'text/html','PUBLIC_URL_MISMATCH'],
    [{url:'https://other.invalid/'},'text/html','PUBLIC_URL_MISMATCH'],
    [{},'application/octet-stream','PUBLIC_CONTENT_TYPE']
  ]) {
    const remote = transport(data,({url}) => response(url,data.bodies['index.html'],type,options));
    const result = await verifyPublishedArtifact(data,remote);
    assert.equal(result.failureCode,code);
    assert.equal(remote.requests.length,1);
  }
});

test('unsafe, duplicate, colliding, unsorted, incomplete and forged manifests fail before network access', async () => {
  const data = fixture(); let calls = 0;
  const run = manifest => verifyPublishedArtifact({manifest,artifactHash:hash(JSON.stringify(manifest))},{fetchImpl:() => {calls++;}});
  for (const badPath of ['../index.html','/index.html','https://other.invalid/a','x%2fy.js','x\\a.js','a/../b.js','.env','C:/x.js','nul.js','x/COM1.html','index.html?x=1','folder./x.js','private.txt']) {
    await assert.rejects(run([{path:badPath,hash:hash('fixture')},...data.manifest]));
  }
  for (const manifest of [[], [...data.manifest].reverse(), data.manifest.slice(0,-1),
    [{path:'assets/app.js/a.js',hash:hash('nested')},...data.manifest],
    [...data.manifest,{...data.manifest[0]}], [...data.manifest,{path:'INDEX.html',hash:hash('other')}],
    [{...data.manifest[0],content:'not part of a manifest'},...data.manifest.slice(1)]]) await assert.rejects(run(manifest));
  await assert.rejects(verifyPublishedArtifact({...data,artifactHash:hash('forged')},{fetchImpl:()=>{calls++;}}),/ARTIFACT_HASH_MISMATCH/);
  assert.equal(calls,0);
});

test('caller mutation during a request cannot replace the snapshot or expected hashes', async () => {
  const data = fixture(), originalHash = data.artifactHash;
  const remote = transport(data,({value,requests}) => {
    if (requests.length === 1) {
      data.manifest[0].hash = hash('attacker');
      data.manifest[1].path = '../changed.css';
      data.artifactHash = hash('attacker');
    }
    return value;
  });
  const result = await verifyPublishedArtifact(data,remote);
  assert.equal(result.status,'pass');
  assert.equal(result.artifactHash,originalHash);
  assert.equal(remote.requests.some(r => r.url.includes('changed')),false);
});

test('both declared and streamed oversized bodies are rejected and cancelled', async () => {
  const data = fixture();
  const declared = transport(data,({url}) => response(url,'small','text/html',{headers:{'content-length':String(LIMITS.fileBytes+1)}}));
  assert.equal((await verifyPublishedArtifact(data,declared)).failureCode,'PUBLIC_FILE_SIZE_LIMIT');
  let cancelled = false;
  const stream = new ReadableStream({start(c){c.enqueue(new Uint8Array(LIMITS.fileBytes+1));},cancel(){cancelled=true;}});
  const streamed = transport(data,({url}) => response(url,stream,'text/html'));
  const result = await verifyPublishedArtifact(data,streamed);
  assert.equal(result.failureCode,'PUBLIC_FILE_SIZE_LIMIT');
  assert.equal(result.requestCount,1);
  assert.equal(cancelled,true);
});

test('total bytes include the public directory entry and cannot be bypassed with many small files', async () => {
  const data = fixture(Object.fromEntries(Array.from({length:6},(_,i)=>['assets/large'+i+'.js','x'.repeat(LIMITS.fileBytes)])));
  const result = await verifyPublishedArtifact(data,transport(data));
  assert.equal(result.failureCode,'PUBLIC_TOTAL_SIZE_LIMIT');
  assert.equal(result.filesVerified < data.manifest.length,true);
});

test('network errors are sanitized and never retried', async () => {
  let calls = 0;
  const result = await verifyPublishedArtifact(fixture(),{fetchImpl:async()=>{calls++;throw new Error('PRIVATE_TOKEN_OR_URL');}});
  assert.equal(result.failureCode,'PUBLIC_TRANSPORT_FAILED');
  assert.equal(calls,1);
  assert.equal(JSON.stringify(result).includes('PRIVATE_TOKEN'),false);
});

test('a pre-cancelled operation does not make a request', async () => {
  const controller = new AbortController(); controller.abort();
  const remote = transport(fixture());
  const result = await verifyPublishedArtifact(fixture(),{...remote,signal:controller.signal});
  assert.equal(result.failureCode,'VERIFICATION_CANCELLED');
  assert.equal(result.requestCount,0);
});

test('a transport that ignores abort is still bounded by the request deadline', async () => {
  let signal;
  const result = await verifyPublishedArtifact(fixture(),{requestMs:20,totalMs:200,fetchImpl:(_url,options)=>{
    signal = options.signal; return new Promise(()=>{});
  }});
  assert.equal(result.failureCode,'PUBLIC_REQUEST_TIME_LIMIT');
  assert.equal(result.requestCount,1);
  assert.equal(signal.aborted,true);
});

test('a response stream that never finishes is bounded and cancelled', async () => {
  let cancelled = false;
  const stream = new ReadableStream({cancel(){cancelled=true;}});
  const result = await verifyPublishedArtifact(fixture(),{requestMs:20,totalMs:200,
    fetchImpl:async url=>response(url,stream,'text/html')});
  assert.equal(result.failureCode,'PUBLIC_REQUEST_TIME_LIMIT');
  assert.equal(cancelled,true);
});

test('overall deadline and user cancellation interrupt an outstanding request', async () => {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),20);
  try {
    const cancelled = await verifyPublishedArtifact(fixture(),{signal:controller.signal,requestMs:200,totalMs:300,fetchImpl:()=>new Promise(()=>{})});
    assert.equal(cancelled.failureCode,'VERIFICATION_CANCELLED');
  } finally { clearTimeout(timer); }
  const limited = await verifyPublishedArtifact(fixture(),{requestMs:200,totalMs:20,fetchImpl:()=>new Promise(()=>{})});
  assert.equal(limited.failureCode,'VERIFICATION_TIME_LIMIT');
});

test('request/file limits and execution time caps cannot be increased by a caller', async () => {
  const data = fixture(); let calls = 0;
  const fetchImpl = () => {calls++;};
  for (const options of [{totalMs:VERIFY_LIMITS.totalMs+1},{requestMs:VERIFY_LIMITS.requestMs+1},{totalMs:0},{requestMs:NaN}])
    await assert.rejects(verifyPublishedArtifact(data,{...options,fetchImpl}),/VERIFICATION_OPTIONS_INVALID/);
  await assert.rejects(verifyPublishedArtifact({manifest:Array.from({length:LIMITS.files+1},()=>data.manifest[0]),artifactHash:data.artifactHash},{fetchImpl}),/ARTIFACT_MANIFEST_INVALID/);
  assert.equal(calls,0);
});
