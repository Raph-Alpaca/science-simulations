import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserLaunchIssue,runtimeDiagnostic} from '../../automation/runner/runtime-diagnostics.mjs';

test('browser launch diagnostics classify infrastructure failures without returning raw data',()=>{
 for(const [message,expected] of [
  ['No usable sandbox! private-path','RUNTIME_SANDBOX_UNAVAILABLE'],
  ['Failed to move to new namespace: Operation not permitted private-path','RUNTIME_SANDBOX_UNAVAILABLE'],
  ['Executable doesn\'t exist at private-path','RUNTIME_BROWSER_EXECUTABLE_MISSING'],
  ['error while loading shared libraries: private-path','RUNTIME_BROWSER_LIBRARY_MISSING'],
  ['pthread_create: Resource temporarily unavailable private-path','RUNTIME_BROWSER_PROCESS_LIMIT'],
  ['private unknown error','RUNTIME_BROWSER_LAUNCH_FAILED'],
 ]){
  const code=browserLaunchIssue(Error(message));assert.equal(code,expected);assert.equal(code.includes('private'),false);
 }
 assert.equal(browserLaunchIssue(null),'RUNTIME_BROWSER_LAUNCH_FAILED');
 assert.equal(browserLaunchIssue({message:{private:'value'}}),'RUNTIME_BROWSER_LAUNCH_FAILED');
});
test('runtime report diagnostics expose known issues and bounded measurements only',()=>{
 const report={checks:{contract:'pass',runtime:'not_run'},issues:['RUNTIME_SANDBOX_UNAVAILABLE','RUNTIME_SECRET_PAYLOAD','private source'],details:{browserVersion:null,browserStopped:true,durationMs:345,requests:0,observations:['private scene'],source:'private source'}};
 assert.deepEqual(runtimeDiagnostic(report),{contract:'pass',runtime:'not_run',issueCodes:['RUNTIME_SANDBOX_UNAVAILABLE','RUNTIME_UNRECOGNIZED_ISSUE','RUNTIME_UNRECOGNIZED_ISSUE'],browserStarted:false,browserStopped:true,durationMs:345,requests:0});
 assert.equal(JSON.stringify(runtimeDiagnostic(report)).includes('private'),false);
 const bad=runtimeDiagnostic({checks:{contract:'private'},issues:Array(50).fill('private'),details:{browserVersion:'private version',durationMs:Infinity,requests:-1}});
 assert.equal(bad.contract,'unknown');assert.equal(bad.issueCodes.length,30);assert.equal(bad.durationMs,null);assert.equal(bad.requests,null);assert.equal(bad.browserStarted,false);
});
