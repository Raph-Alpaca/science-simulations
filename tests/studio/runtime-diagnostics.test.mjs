import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserLaunchIssue,browserLaunchIssues,runtimeDiagnostic} from '../../automation/runner/runtime-diagnostics.mjs';

test('browser launch diagnostics classify infrastructure failures without returning raw data',()=>{
 for(const [message,expected] of [
  ['No usable sandbox! private-path','RUNTIME_SANDBOX_UNAVAILABLE'],
  ['browserType.launch: Target page, context or browser has been closed\nBrowser logs:\nChromium sandboxing failed!\nprivate-path','RUNTIME_SANDBOX_UNAVAILABLE'],
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

test('launch markers distinguish process failures without retaining arbitrary error text',()=>{
 const codes=browserLaunchIssues(Error('browserType.launch: failed\nchrome_crashpad_handler: --database is required\nprivate-path: Read-only file system\n[pid=123] <process did exit: exitCode=null, signal=SIGTRAP>'));
 assert.deepEqual(codes,['RUNTIME_BROWSER_LAUNCH_FAILED','RUNTIME_LAUNCH_READONLY_PATH','RUNTIME_LAUNCH_CRASHPAD','RUNTIME_LAUNCH_SIGTRAP']);
 assert.deepEqual(runtimeDiagnostic({issues:codes}).issueCodes,codes);
 assert.equal(JSON.stringify(codes).includes('private'),false);
 assert.deepEqual(browserLaunchIssues(Error('private payload')),['RUNTIME_BROWSER_LAUNCH_FAILED']);
 assert.deepEqual(browserLaunchIssues(Error('x'.repeat(32768)+' Permission denied')),['RUNTIME_BROWSER_LAUNCH_FAILED']);
 for(const [message,code] of [['spawn private EACCES','RUNTIME_LAUNCH_PERMISSION_DENIED'],['private ENOENT','RUNTIME_LAUNCH_MISSING_PATH'],['private ENOSPC','RUNTIME_LAUNCH_NO_SPACE'],['private EAGAIN','RUNTIME_LAUNCH_PROCESS_LIMIT'],['FATAL:sandbox/linux/services/credentials.cc:1 private','RUNTIME_LAUNCH_NAMESPACE'],['FATAL:zygote_host_impl_linux.cc:1 private','RUNTIME_LAUNCH_ZYGOTE'],['Missing X server private','RUNTIME_LAUNCH_DISPLAY'],['Timeout 10000ms exceeded private','RUNTIME_LAUNCH_TIMEOUT'],['signal=SIGSYS','RUNTIME_LAUNCH_SIGSYS'],['signal=SIGSEGV','RUNTIME_LAUNCH_SIGSEGV'],['signal=SIGABRT','RUNTIME_LAUNCH_SIGABRT']])assert.ok(browserLaunchIssues(Error(message)).includes(code));
});
