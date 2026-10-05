import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareRuntimeBundle,checkRuntimeSource} from '../../automation/runner/runtime-contract.mjs';
import {browserEnvironment} from '../../automation/runner/runtime-browser.mjs';
import {runtimeFixture} from './runtime-fixture.mjs';
import {assertRuntimeReport,runtimeSubmission} from '../../packages/contracts/runtime-report.js';

test('runtime bundle binds approved input, candidate bytes, attempt and trusted baseline',async()=>{
 const f=runtimeFixture(),packet={inputText:f.inputText,candidateText:f.candidateText,expected:f.expected};assert.equal((await checkRuntimeSource(f.bundle.candidate)).files,4);
 assert.ok(Object.isFrozen(f.bundle.candidate.files));
 assert.throws(()=>prepareRuntimeBundle({...packet,inputText:f.inputText+' '}),/RUNTIME_SOURCE_MISMATCH/);
 assert.throws(()=>prepareRuntimeBundle({...packet,expected:{...f.expected,candidateHash:'b'.repeat(64)}}),/RUNTIME_CANDIDATE_MISMATCH/);
 assert.throws(()=>prepareRuntimeBundle({...packet,expected:{...f.expected,attempt:3}}),/RUNTIME_ENVELOPE_INVALID/);
 assert.throws(()=>prepareRuntimeBundle({...packet,unreviewed:'private extra field'}),/RUNTIME_ENVELOPE_INVALID/);
});
test('source checks parse JavaScript without executing it and reject missing/remote assets and inline code',async()=>{
 const valid=runtimeFixture({js:';throw new Error("NOT_EXECUTED_BY_NODE");'});await checkRuntimeSource(valid.bundle.candidate);
 for(const [options,error] of [
  [{html:'<iframe src="index.html"></iframe>'},'RUNTIME_EMBED_REJECTED'],
  [{html:'<script>window.secret=true</script>'},'RUNTIME_INLINE_SCRIPT_REJECTED'],
  [{html:'<button onclick="x()">test</button>'},'RUNTIME_INLINE_RESOURCE_REJECTED'],
  [{html:'<img src="missing.svg">'},'RUNTIME_MISSING_ASSET'],
  [{html:'<script src="https://example.invalid/a.js"></script>'},'RUNTIME_UNSAFE_LINK'],
  [{js:';function {'},'RUNTIME_JS_SYNTAX'],
 ])await assert.rejects(checkRuntimeSource(runtimeFixture(options).bundle.candidate),new RegExp(error));
});
test('browser environment drops provider, database, Actions/OIDC credentials and startup injection',()=>{
 const env={SystemRoot:'synthetic-system',TMP:'synthetic-tmp',OPENAI_API_KEY:'synthetic',SUPABASE_SECRET_KEY:'synthetic',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'synthetic',ACTIONS_RUNTIME_TOKEN:'synthetic',GITHUB_TOKEN:'synthetic',NODE_OPTIONS:'--require=untrusted',HTTPS_PROXY:'https://synthetic.invalid',CHROME_LOG_FILE:'private'};
 assert.deepEqual(browserEnvironment(env),{SystemRoot:'synthetic-system',TMP:'synthetic-tmp'});
});
test('a pass needs measured viewport changes and browser cleanup; text-only or incomplete reports cannot pass',()=>{
 const base=runtimeFixture().bundle;
 const observations=[390,1440].map(width=>({width,controlChanged:true,outputChanged:true,viewChanged:true,resetRestored:true,initialViewHash:'a'.repeat(64),changedViewHash:'b'.repeat(64)}));
 const report=runtimeSubmission({...base,contractVersion:'browser-v1',browserVersion:'150.0.0.0',browserStopped:true,durationMs:100,requests:8,checks:{contract:'pass',runtime:'pass'},checksExecuted:['contract','runtime'],issues:[],observations});
 assertRuntimeReport(report,'interactive_2d');
 for(const details of [{...report.details,observations:[]},{...report.details,browserStopped:false},{...report.details,observations:[observations[0],observations[0]]},{...report.details,contractVersion:'candidate-says-pass'}])assert.throws(()=>assertRuntimeReport({...report,details}),/RUNTIME_REPORT_INVALID/);
 assert.throws(()=>assertRuntimeReport(report,'interactive_3d'),/RUNTIME_REPORT_INVALID/);
 assert.throws(()=>assertRuntimeReport({...report,details:{...report.details,stdout:'candidate text'}}),/RUNTIME_REPORT_INVALID/);
});
