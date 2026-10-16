// Real local Chromium, reviewed fixtures, no provider or production data.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {runtimeFixture} from './runtime-fixture.mjs';
import {runRuntimeProcess} from '../../automation/runner/runtime-process.mjs';
import {evidenceForModel} from '../../automation/runner/pipeline.mjs';
import {assertRuntimeScreenshot,SCREENSHOT_LIMITS} from '../../packages/contracts/runtime-screenshot.js';
const results=[];await mkdir('.local/evidence/screenshots',{recursive:true});
for(const kind of ['interactive_2d','interactive_3d']){
 const f=runtimeFixture({kind}),report=await runRuntimeProcess({inputText:f.inputText,candidateText:f.candidateText,expected:f.expected});
 assert.equal(report.checks.runtime,'pass');assert.equal(report.details.browserStopped,true);
 assert.deepEqual(report.details.screenshots.map(s=>s.width),[390,1440]);
 for(const image of report.details.screenshots)assertRuntimeScreenshot(image);
 assert(Buffer.byteLength(JSON.stringify(report))<SCREENSHOT_LIMITS.reportBytes);
 assert(!JSON.stringify(evidenceForModel(report)).includes('bytesBase64'));
 await writeFile('.local/evidence/screenshots/'+kind+'.json',JSON.stringify(report));
 if(process.env.WRITE_SCREENSHOT_FIXTURES==='true'&&kind==='interactive_2d'){
  await mkdir('tests/fixtures/runtime-screenshots',{recursive:true});
  for(const image of report.details.screenshots)await writeFile('tests/fixtures/runtime-screenshots/'+image.width+'.jpg',Buffer.from(image.bytesBase64,'base64'));
 }
 results.push({kind,screenshots:report.details.screenshots.map(s=>({width:s.width,bytes:Buffer.from(s.bytesBase64,'base64').length,hash:s.hash})),browserStopped:true});
}
await writeFile('.local/evidence/screenshots/capture-result.json',JSON.stringify({state:'PASS',results,paidCalls:0},null,2));
console.log(JSON.stringify({state:'PASS',results,paidCalls:0}));
