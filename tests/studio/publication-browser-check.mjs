// Actual Chrome, reviewed synthetic content only. No Docker/remote dispatch.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {publicationRuntimeFixture} from './publication-runtime-fixture.mjs';
import {preparePublicationBundle,assertPublicationRuntimeReport} from '../../automation/publish/publication-packet.mjs';
import {verifyRuntimeBrowser} from '../../automation/runner/runtime-browser.mjs';
import {runtimeSubmission} from '../../packages/contracts/runtime-report.js';
const evidence='.local/evidence/worker/publication-browser-'+randomUUID();await mkdir(evidence,{recursive:true});const results=[];
for(const [name,options,expected,code] of [['catalog-2d',{},'pass'],['catalog-3d',{kind:'interactive_3d'},'pass'],['catalog-missing-link',{missingLink:true},'fail','RUNTIME_PUBLICATION_CATALOG_REJECTED'],['catalog-network',{extraCatalogJs:';fetch("https://external.invalid/test").catch(()=>{});'},'fail'],['broken-target-reset',{brokenReset:true},'fail','RUNTIME_RESET_FAILED']]){
 const packet=await publicationRuntimeFixture(options),bundle=preparePublicationBundle(packet),result=await verifyRuntimeBrowser(bundle.runtime,{publicationPacket:packet});results.push({name,result});
 try{assertPublicationRuntimeReport({version:'publication-runtime-v1',artifactHash:packet.binding.artifactHash,runtime:runtimeSubmission(result)},packet);assert.equal(result.checks.runtime,expected);assert.equal(result.browserStopped,true);if(code)assert.ok(result.issues.includes(code));}catch{process.exitCode=1;}
 console.log(JSON.stringify({name,checks:result.checks,issues:result.issues,browserStopped:result.browserStopped,durationMs:result.durationMs}));
}
await writeFile(evidence+'/result.json',JSON.stringify({at:new Date().toISOString(),status:process.exitCode?'FAIL':'PASS',results},null,2));console.log(JSON.stringify({evidence}));
