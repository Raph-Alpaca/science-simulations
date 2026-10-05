import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studioRequestBody} from '../../apps/studio/lib/request-body.mjs';
const request=body=>new Request('https://example.org/api/studio/input-reviews',{method:'POST',body,duplex:'half'});
test('source summaries use a bounded larger body; original routes retain their smaller bound and invalid UTF-8 is rejected',async()=>{
 const body=JSON.stringify({summary:'가'.repeat(6000)});assert.deepEqual(await studioRequestBody(request(body),{limit:64000}),JSON.parse(body));await assert.rejects(studioRequestBody(request(body)),/REQUEST_TOO_LARGE/);
 await assert.rejects(studioRequestBody(request(new Uint8Array([123,34,97,34,58,34,0xff,34,125]))),/INVALID_REQUEST/);
});
test('a stalled input stream times out and cancels, without a content-length header',async()=>{
 let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});
 await assert.rejects(studioRequestBody(request(stream),{timeoutMs:20}),/REQUEST_TIMEOUT/);assert.equal(cancelled,true);
});
