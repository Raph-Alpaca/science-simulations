import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hash} from '../../packages/contracts/content-source.js';
import {assertRuntimeScreenshot,captureRecord,SCREENSHOT_LIMITS} from '../../packages/contracts/runtime-screenshot.js';
import {assertRuntimeReport,runtimeSubmission} from '../../packages/contracts/runtime-report.js';
import {evidenceForModel} from '../../automation/runner/pipeline.mjs';
import {runtimeFixture} from './runtime-fixture.mjs';

const images=[390,1440].map(width=>captureRecord(readFileSync(`tests/fixtures/runtime-screenshots/${width}.jpg`),width));
const legacy=runtimeSubmission({...runtimeFixture().expected,contractVersion:'browser-v1',browserVersion:'154.0.0.0',browserStopped:true,durationMs:100,requests:8,checks:{contract:'pass',runtime:'pass'},checksExecuted:['contract','runtime'],issues:[],observations:[390,1440].map(width=>({width,controlChanged:true,outputChanged:true,viewChanged:true,resetRestored:true,initialViewHash:'a'.repeat(64),changedViewHash:'b'.repeat(64)}))});

test('real reviewed-fixture JPEGs have fixed dimensions, byte hashes and bounded report size',()=>{
 for(const image of images)assert.equal(assertRuntimeScreenshot(image),image);
 const report={...legacy,details:{...legacy.details,screenshots:images}};
 assertRuntimeReport(report,'interactive_2d');
 assert.ok(Buffer.byteLength(JSON.stringify(report))<SCREENSHOT_LIMITS.reportBytes);
 assert.notEqual(hash(JSON.stringify(report)),hash(JSON.stringify(legacy)));
 assert.equal(assertRuntimeReport(legacy,'interactive_2d'),legacy);
 assert.equal(Object.hasOwn(legacy.details,'screenshots'),false);
 const projected=evidenceForModel(report);
 assert.equal(JSON.stringify(projected).includes('bytesBase64'),false);
 assert.deepEqual(projected.details.screenshots,images.map(({width,height,hash})=>({width,height,hash})));
 assert.ok(report.details.screenshots[0].bytesBase64);
});

test('screenshots reject changed bytes, arbitrary content, dimensions, duplicate viewports and extra fields',()=>{
 const one=images[0],record=bytes=>({...one,bytesBase64:bytes.toString('base64'),hash:hash(bytes)});
 for(const changed of [
  {...one,hash:'a'.repeat(64)}, {...one,bytesBase64:one.bytesBase64+'\n'},
  {...one,width:1440}, {...one,height:901}, {...one,url:'https://example.invalid/a.jpg'},
  {...one,bytesBase64:'data:image/jpeg;base64,'+one.bytesBase64},
  record(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')),
  record(Buffer.alloc(SCREENSHOT_LIMITS.bytes+1)),
  record(Buffer.from(one.bytesBase64,'base64').subarray(0,100)),
 ])assert.throws(()=>assertRuntimeScreenshot(changed),/RUNTIME_SCREENSHOT_INVALID/);
 for(const screenshots of [[one,one],[...images,one]])assert.throws(()=>assertRuntimeReport({...legacy,details:{...legacy.details,screenshots}}),/RUNTIME_REPORT_INVALID/);
 assert.throws(()=>assertRuntimeReport({...legacy,checks:{runtime:'not_run',contract:'pass'},checksExecuted:['contract'],details:{...legacy.details,screenshots:images}}),/RUNTIME_REPORT_INVALID/);
});
