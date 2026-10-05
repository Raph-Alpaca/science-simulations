// Public diagnostics use a closed vocabulary, never browser stderr, paths,
// source, environment values or arbitrary strings from a report.
const launchMarkers=[
 ['RUNTIME_LAUNCH_PERMISSION_DENIED',/\b(?:EACCES|EPERM)\b|Permission denied|Operation not permitted/i],
 ['RUNTIME_LAUNCH_READONLY_PATH',/\bEROFS\b|Read-only file system/i],
 ['RUNTIME_LAUNCH_NO_SPACE',/\bENOSPC\b|No space left on device/i],
 ['RUNTIME_LAUNCH_MISSING_PATH',/\bENOENT\b|No such file or directory/i],
 ['RUNTIME_LAUNCH_PROCESS_LIMIT',/\bEAGAIN\b|Resource temporarily unavailable|Too many open files/i],
 ['RUNTIME_LAUNCH_CRASHPAD',/chrome_crashpad_handler:|(?:ERROR|FATAL):[^\n]*crashpad|crashpad[^\n]*--database is required/i],
 ['RUNTIME_LAUNCH_NAMESPACE',/Failed to (?:move to|unshare)[^\n]*namespace|(?:ERROR|FATAL):[^\n]*(?:namespace|credentials\.cc)/i],
 ['RUNTIME_LAUNCH_ZYGOTE',/(?:ERROR|FATAL):[^\n]*zygote/i],
 ['RUNTIME_LAUNCH_DISPLAY',/Missing X server|cannot open display/i],
 ['RUNTIME_LAUNCH_TIMEOUT',/Timeout \d+ms exceeded|timed out/i],
 ['RUNTIME_LAUNCH_SIGTRAP',/signal=SIGTRAP\b/],
 ['RUNTIME_LAUNCH_SIGSYS',/signal=SIGSYS\b/],
 ['RUNTIME_LAUNCH_SIGSEGV',/signal=SIGSEGV\b/],
 ['RUNTIME_LAUNCH_SIGABRT',/signal=SIGABRT\b/],
];
const launchMessage=error=>typeof error?.message==='string'?error.message.slice(0,32768):'';
const issues=new Set([
 ...launchMarkers.map(([code])=>code),
 'RUNTIME_CANCELLED','RUNTIME_TIME_LIMIT','RUNTIME_BROWSER_FAILED','RUNTIME_BROWSER_STOP_UNVERIFIED',
 'RUNTIME_BROWSER_LAUNCH_FAILED','RUNTIME_SANDBOX_UNAVAILABLE','RUNTIME_BROWSER_EXECUTABLE_MISSING','RUNTIME_BROWSER_LIBRARY_MISSING','RUNTIME_BROWSER_PROCESS_LIMIT',
 'RUNTIME_ENVELOPE_INVALID','RUNTIME_SOURCE_MISMATCH','RUNTIME_SOURCE_INVALID','RUNTIME_CANDIDATE_INVALID','RUNTIME_CANDIDATE_MISMATCH',
 'RUNTIME_DOCUMENT_TOO_COMPLEX','RUNTIME_UNSAFE_LINK','RUNTIME_MISSING_ASSET','RUNTIME_EMBED_REJECTED','RUNTIME_INLINE_SCRIPT_REJECTED','RUNTIME_INLINE_STYLE_REJECTED','RUNTIME_INLINE_RESOURCE_REJECTED','RUNTIME_REDIRECT_REJECTED','RUNTIME_JS_SYNTAX',
 'RUNTIME_REQUIRED_CONTROL','RUNTIME_CONTROL_NO_RANGE','RUNTIME_CONTROL_UNSUPPORTED','RUNTIME_REQUEST_LIMIT','RUNTIME_NETWORK_OR_ASSET_REJECTED','RUNTIME_WEBSOCKET_REJECTED','RUNTIME_POPUP_REJECTED','RUNTIME_PAGE_ERROR','RUNTIME_PAGE_CRASH','RUNTIME_CONSOLE_ERROR','RUNTIME_DIALOG_REJECTED','RUNTIME_DOWNLOAD_REJECTED',
 'RUNTIME_ALTERNATIVE_EMPTY','RUNTIME_VIEW_TOO_SMALL','RUNTIME_VIEW_TYPE','RUNTIME_ASSUMPTIONS_EMPTY','RUNTIME_CONTROL_LABEL','RUNTIME_OUTPUT_EMPTY','RUNTIME_OUTPUT_UNCHANGED','RUNTIME_VIEW_UNCHANGED','RUNTIME_RESET_FAILED','RUNTIME_RESET_VIEW_FAILED','RUNTIME_WEBGL_REQUIRED','RUNTIME_CAMERA_UNCHANGED','RUNTIME_HORIZONTAL_OVERFLOW','RUNTIME_NAVIGATION_REJECTED',
]);
export function browserLaunchIssue(error){
 const message=launchMessage(error);
 // Playwright rewrites some Chromium sandbox stderr into this summary before
 // returning the public launch error. Recognize both forms without logging it.
 if(/Chromium sandboxing failed|No usable sandbox|Failed to move to new namespace|apparmor[^\n]*DENIED[^\n]*userns/i.test(message))return 'RUNTIME_SANDBOX_UNAVAILABLE';
 if(/Executable doesn.t exist|browser executable.*(?:not found|does not exist)/i.test(message))return 'RUNTIME_BROWSER_EXECUTABLE_MISSING';
 if(/error while loading shared libraries|Host system is missing dependencies/i.test(message))return 'RUNTIME_BROWSER_LIBRARY_MISSING';
 if(/pthread_create[^\n]*Resource temporarily unavailable|fork[^\n]*Resource temporarily unavailable/i.test(message))return 'RUNTIME_BROWSER_PROCESS_LIMIT';
 return 'RUNTIME_BROWSER_LAUNCH_FAILED';
}
// These are observed markers, not independent claims about the root cause.
export function browserLaunchIssues(error){
 const message=launchMessage(error);
 return [browserLaunchIssue(error),...launchMarkers.filter(([,pattern])=>pattern.test(message)).map(([code])=>code)];
}
export function runtimeDiagnostic(report){
 const state=value=>['pass','fail','not_run'].includes(value)?value:'unknown';
 const bounded=(value,max)=>Number.isInteger(value)&&value>=0&&value<=max?value:null;
 const details=report?.details;
 return {
  contract:state(report?.checks?.contract),runtime:state(report?.checks?.runtime),
  issueCodes:Array.isArray(report?.issues)?report.issues.slice(0,30).map(code=>issues.has(code)?code:'RUNTIME_UNRECOGNIZED_ISSUE'):['RUNTIME_UNRECOGNIZED_ISSUE'],
  browserStarted:typeof details?.browserVersion==='string'&&/^\d{1,3}(?:\.\d{1,6}){1,3}$/.test(details.browserVersion),
  browserStopped:details?.browserStopped===true,durationMs:bounded(details?.durationMs,60000),requests:bounded(details?.requests,201),
 };
}
