// Explicit credential-free Linux integration: reviewed synthetic fixtures only.
import assert from 'node:assert/strict';
import {publicationRuntimeFixture} from './publication-runtime-fixture.mjs';
import {runRuntimeContainer} from '../../automation/runner/runtime-container.mjs';
const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),300000);
try{
 assert.equal(process.platform,'linux');assert.match(process.env.STUDIO_CHECKER_IMAGE||'',/^sha256:[a-f0-9]{64}$/);
 for(const name of ['OPENAI_API_KEY','STUDIO_TRANSFER_KEY','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL'])assert.ok(!process.env[name]);
 for(const [name,options,expected,code] of [['catalog-2d',{},'pass'],['catalog-3d',{kind:'interactive_3d'},'pass'],['catalog-link-negative',{missingLink:true},'fail','RUNTIME_PUBLICATION_CATALOG_REJECTED'],['reset-negative',{brokenReset:true},'fail','RUNTIME_RESET_FAILED']]){
  assert.ok(!controller.signal.aborted);const packet=await publicationRuntimeFixture(options),report=await runRuntimeContainer(packet,{publication:true,image:process.env.STUDIO_CHECKER_IMAGE,signal:controller.signal});
  assert.equal(report.runtime.checks.runtime,expected);assert.equal(report.runtime.details.browserStopped,true);if(code)assert.ok(report.runtime.issues.includes(code));
  console.log(JSON.stringify({name,checks:report.runtime.checks,issues:report.runtime.issues,browserStopped:true,cleanup:'confirmed'}));
 }
}catch{console.error('PUBLICATION_CONTAINER_CHECK_FAILED');process.exitCode=1;}
finally{clearTimeout(timer);}
