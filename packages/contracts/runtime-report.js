import {RUNTIME_CONTRACT} from './runtime-spec.js';
const need=value=>{if(!value)throw new Error('RUNTIME_REPORT_INVALID');};
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const exact=(value,keys)=>need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','));
const list=value=>Array.isArray(value)&&value.length<=30&&value.every(s=>typeof s==='string'&&s.length<=2000);

// Only measurement fields from trusted checker code; no HTML, source, URLs or
// arbitrary page messages can enter the report through this schema.
export function assertRuntimeReport(report,generationKind){
 exact(report,['candidateHash','sourceSnapshotHash','baselineSha','attempt','checks','checksExecuted','issues','details']);
 need(sha(report.candidateHash)&&sha(report.sourceSnapshotHash)&&/^[a-f0-9]{40}$/.test(report.baselineSha)&&Number.isInteger(report.attempt)&&report.attempt>=0&&report.attempt<=2);
 exact(report.checks,['runtime','contract']);need(Object.values(report.checks).every(s=>['pass','fail','not_run'].includes(s))&&list(report.checksExecuted)&&list(report.issues));
 need(new Set(report.checksExecuted).size===report.checksExecuted.length&&report.checksExecuted.every(s=>['runtime','contract'].includes(s)));
 for(const key of ['runtime','contract'])if(report.checks[key]!=='not_run')need(report.checksExecuted.includes(key));
 const d=report.details;exact(d,['contractVersion','browserVersion','browserStopped','durationMs','requests','observations']);
 need(typeof d.browserStopped==='boolean');
 need(d.contractVersion===RUNTIME_CONTRACT.version&&(d.browserVersion===null||typeof d.browserVersion==='string'&&/^\d{1,3}(?:\.\d{1,6}){1,3}$/.test(d.browserVersion)));
 need(Number.isInteger(d.durationMs)&&d.durationMs>=0&&d.durationMs<=60000&&Number.isInteger(d.requests)&&d.requests>=0&&d.requests<=201&&Array.isArray(d.observations)&&d.observations.length<=3);
 for(const o of d.observations){
  need(RUNTIME_CONTRACT.limits.viewports.includes(o.width));
  if(o.webglUnavailable===true){exact(o,['width','webglUnavailable','alternativeVisible']);need(o.width===390&&o.alternativeVisible===true);}
  else{
   exact(o,['width','controlChanged','outputChanged','viewChanged','resetRestored','initialViewHash','changedViewHash',...(o.webgl?['webgl','cameraChanged','alternativeVisible']:[])]);
   need(['controlChanged','outputChanged','viewChanged','resetRestored'].every(k=>o[k]===true)&&sha(o.initialViewHash)&&sha(o.changedViewHash)&&o.initialViewHash!==o.changedViewHash);
   if(o.webgl){exact(o.webgl,['width','height','lost']);need(Number.isInteger(o.webgl.width)&&o.webgl.width>0&&o.webgl.width<=8192&&Number.isInteger(o.webgl.height)&&o.webgl.height>0&&o.webgl.height<=8192&&o.webgl.lost===false&&o.cameraChanged===true&&o.alternativeVisible===true);}
  }
 }
 if(report.checks.runtime==='pass'){
  need(report.checks.contract==='pass'&&report.issues.length===0&&d.browserVersion!==null&&d.browserStopped&&d.requests>0&&d.requests<=200);
  const normal=d.observations.filter(o=>!o.webglUnavailable);need(normal.map(o=>o.width).sort((a,b)=>a-b).join(',')==='390,1440');
  if(generationKind==='interactive_3d')need(normal.every(o=>o.webgl)&&d.observations.length===3&&d.observations.some(o=>o.webglUnavailable));
  if(generationKind==='interactive_2d')need(d.observations.length===2&&normal.every(o=>!o.webgl));
 }
 return report;
}
export function runtimeSubmission(result){
 const report={candidateHash:result.candidateHash,sourceSnapshotHash:result.sourceSnapshotHash,baselineSha:result.baselineSha,attempt:result.attempt,
  checks:result.checks,checksExecuted:result.checksExecuted,issues:result.issues,
  details:{contractVersion:result.contractVersion,browserVersion:result.browserVersion??null,browserStopped:result.browserStopped,durationMs:result.durationMs,requests:result.requests??0,observations:result.observations}};
 return assertRuntimeReport(report);
}
