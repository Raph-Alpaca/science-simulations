// Local integration check of the REAL catalog shell plus reviewed synthetic
// programs. Never load credentials, model output, production DB or an AI client.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
import {runtimeFixture} from './runtime-fixture.mjs';
import {ROOT,hash} from '../../automation/catalog/content.mjs';
import {serveDirectory} from '../../automation/catalog/serve.mjs';
import {parseCandidate} from '../../automation/runner/candidate.mjs';
import {prepareCatalogRelease} from '../../automation/publish/artifact-bundle.mjs';
import {captureArtifactBundle,stageArtifactBundle,assertStagedArtifact} from '../../automation/publish/artifact-storage.mjs';

const config=JSON.parse(await fs.readFile(path.join(ROOT,'config/catalog.json'),'utf8'));
const base=await captureArtifactBundle(path.join(ROOT,'dist/catalog'));
const cases=[{kind:'interactive_2d',id:'release-fixture-2d'},{kind:'interactive_3d',id:'release-fixture-3d'}];
let prepared=base;
for(const item of cases) {
  const f=runtimeFixture({kind:item.kind}),source=JSON.parse(f.inputText),data=JSON.parse(f.candidateText);
  const metaFile=data.files.find(file=>file.path==='meta.json'),meta=JSON.parse(metaFile.content);
  meta.id=item.id;meta.title='합성 게시 검사 '+item.kind;meta.unit=config.units[0].label;
  source.context={...source.context,contentId:meta.id,unit:meta.unit,config};
  metaFile.content=JSON.stringify(meta);
  const inputText=JSON.stringify(source),candidateText=JSON.stringify(data);
  const candidate=parseCandidate(candidateText,source.context);
  const packet={inputText,candidateText,expected:{...f.expected,candidateHash:candidate.candidateHash,sourceSnapshotHash:hash(inputText)}};
  prepared=prepareCatalogRelease({jobId:randomUUID(),baseArtifactText:prepared.artifactText,expectedBaseArtifactHash:prepared.artifactHash,packet,config});
}
const staged=await stageArtifactBundle({artifactText:prepared.artifactText,expectedArtifactHash:prepared.artifactHash});
const origin='http://127.0.0.1:4192',observations=[],errors=[],outside=[];
let server,browser,finished=false;
// Reviewed fixtures only; a bounded watchdog also closes resources on a hang.
const watchdog=setTimeout(()=>{if(!finished){process.exitCode=1;void browser?.close();server?.closeAllConnections();server?.close();}},60_000);
try {
  server=await serveDirectory(staged.site,config.basePath,4192);
  browser=await chromium.launch({channel:'chrome',timeout:10000});
  for(const width of [390,1440]) {
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
    try {
      await context.route('**/*',async route=>{
        if(new URL(route.request().url()).origin===origin)await route.continue();
        else {outside.push('EXTERNAL_REQUEST');await route.abort();}
      });
      const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',()=>errors.push('PAGE_ERROR'));
      for(const item of cases) {
        await page.goto(origin+config.basePath,{timeout:5000});
        await expect(page.locator('.card')).toHaveCount(2);
        const link=page.getByRole('link',{name:'합성 게시 검사 '+item.kind+' 탐구 시작하기'});
        await link.click();await expect(page).toHaveURL(origin+config.basePath+'simulations/'+item.id+'/index.html');
        const control=page.locator('[data-sim-control]'),canvas=page.locator('canvas'),output=page.locator('[data-sim-output]');
        await expect(output).toHaveText('크기 1');
        const initial=hash(await canvas.screenshot());
        await control.focus();await control.press('ArrowRight');await expect(output).toHaveText('크기 2');
        const changed=hash(await canvas.screenshot());assert.notEqual(changed,initial);
        if(item.kind==='interactive_3d') {
          const camera=page.locator('[data-sim-camera]');await camera.focus();await camera.press('End');
          assert.notEqual(hash(await canvas.screenshot()),changed);
          await page.locator('[data-sim-fallback]').click();await expect(page.locator('[data-sim-alternative]')).toBeVisible();
        }
        await page.locator('[data-sim-reset]').click();await expect(output).toHaveText('크기 1');
        assert.equal(hash(await canvas.screenshot()),initial);
        observations.push({kind:item.kind,width,cardOpened:true,controlChanged:true,viewChanged:true,resetRestored:true,
          ...(item.kind==='interactive_3d'?{cameraChanged:true,alternativeVisible:true}:{})});
      }
    } finally {await context.close();}
  }
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  await assertStagedArtifact(staged.directory,prepared.artifactHash);
  console.log(JSON.stringify({result:'PASS',observations,artifactUnchanged:true,paidCalls:0}));
} catch(error) {
  process.exitCode=1;
  errors.push(error instanceof assert.AssertionError?'ASSERTION_FAILED':'BROWSER_CHECK_FAILED');
  console.log(JSON.stringify({result:'FAIL',code:errors.at(-1)}));
} finally {
  await browser?.close();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  finished=true;clearTimeout(watchdog);
  const evidence={at:new Date().toISOString(),passed:!process.exitCode,scope:'trusted synthetic 2D/3D in actual catalog bundle; not publication approval',
    observations,errors,outside,artifactHash:prepared.artifactHash,baseArtifactHash:base.artifactHash,
    stagedDirectory:staged.directory,resourcesStopped:true,paidCalls:0};
  await fs.writeFile(path.join(staged.directory,'browser-check.json'),JSON.stringify(evidence,null,2),{flag:'wx'});
  console.log(JSON.stringify({evidence:path.relative(ROOT,path.join(staged.directory,'browser-check.json')),resourcesStopped:true}));
}
