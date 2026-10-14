import {publicationBinding} from './artifact-transfer.mjs';
import {snapshotArtifactManifest,PUBLIC_BASE_URL,VERIFY_LIMITS} from './verify-artifact.mjs';
const need=v=>{if(!v)throw Error('PUBLICATION_OUTCOME_INVALID');};
const exact=(v,keys)=>need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(','));
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const date=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
const publicCodes=['PUBLIC_BODY_INVALID','PUBLIC_BODY_MISSING','PUBLIC_BYTES_MISMATCH','PUBLIC_CONTENT_TYPE','PUBLIC_FILE_SIZE_LIMIT','PUBLIC_HTTP_STATUS','PUBLIC_REQUEST_LIMIT','PUBLIC_REQUEST_TIME_LIMIT','PUBLIC_TOTAL_SIZE_LIMIT','PUBLIC_TRANSPORT_FAILED','PUBLIC_URL_MISMATCH','VERIFICATION_CANCELLED','VERIFICATION_TIME_LIMIT'];
const pagesCodes=['PAGES_TIMEOUT','PAGES_HTTP_REJECTED','PAGES_RESPONSE_INVALID','PAGES_RESPONSE_LIMIT','PAGES_ARTIFACT_REJECTED','PAGES_OIDC_INVALID','PAGES_DEPLOYMENT_INVALID','PAGES_STATUS_INVALID','PAGES_STATUS_UNCONFIRMED','PAGES_TRANSPORT_UNCERTAIN','PAGES_DEPLOYMENT_FAILED'];
export function assertPublicationOutcome(value,context,{now=Date.now()}={}){
 exact(value,['version','binding','claimId','claimReportHash','deployment','verification']);need(value.version==='publication-outcome-v1');
 const binding=publicationBinding(value.binding);need(JSON.stringify(binding)===JSON.stringify(publicationBinding(context.binding))&&value.claimId===context.claim.id&&value.claimReportHash===context.claim.reportHash);
 const manifest=snapshotArtifactManifest(context.manifest,binding.artifactHash);
 need(integer(context.bytes,1,VERIFY_LIMITS.bytes)&&integer(context.indexBytes,1,context.bytes)&&date(context.claim.claimedAt));
 const d=value.deployment;
 exact(d,['version','runId','workflowSha','artifactId','deploymentId','status','errorCode','createRequests','statusRequests']);
 need(d.version==='pages-deployment-v1'&&d.runId===binding.runId&&d.workflowSha===binding.workflowSha&&integer(d.artifactId,1,Number.MAX_SAFE_INTEGER)&&['succeeded','failed','uncertain'].includes(d.status)&&integer(d.createRequests,0,1)&&integer(d.statusRequests,0,12));
 need(d.deploymentId===null||typeof d.deploymentId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(d.deploymentId));
 need((d.status==='succeeded')===(d.errorCode===null));if(d.errorCode!==null)need(pagesCodes.includes(d.errorCode));
 if(d.status==='succeeded')need(d.createRequests===1&&d.statusRequests>0&&d.deploymentId!==null);
 if(d.statusRequests>0)need(d.createRequests===1&&d.deploymentId!==null);
 const v=value.verification;
 if(d.status!=='succeeded'){need(v===null);return {verified:false};}
 exact(v,['schemaVersion','scope','status','failureCode','failedPath','artifactHash','publicUrl','filesVerified','requestCount','bytesRead','startedAt','finishedAt','runtime']);
 need(v.schemaVersion===1&&v.scope==='published_file_bytes'&&['pass','fail'].includes(v.status)&&v.artifactHash===binding.artifactHash&&v.publicUrl===PUBLIC_BASE_URL&&v.runtime==='not_run');
 need(integer(v.filesVerified,0,manifest.length)&&integer(v.requestCount,0,manifest.length+1)&&integer(v.bytesRead,0,v.status==='pass'?VERIFY_LIMITS.bytes:Number.MAX_SAFE_INTEGER));
 need(date(v.startedAt)&&date(v.finishedAt)&&Date.parse(v.startedAt)>=Date.parse(context.claim.claimedAt)-5000&&Date.parse(v.finishedAt)>=Date.parse(v.startedAt)&&Date.parse(v.finishedAt)<=now+5000&&Date.parse(v.finishedAt)-Date.parse(v.startedAt)<=VERIFY_LIMITS.totalMs+1000);
 if(v.status==='pass')need(v.failureCode===null&&v.failedPath===null&&v.filesVerified===manifest.length&&v.requestCount===manifest.length+1&&v.bytesRead===context.bytes+context.indexBytes);
 else need(publicCodes.includes(v.failureCode)&&(v.failedPath==='./'||manifest.some(f=>f.path===v.failedPath)));
 return {verified:v.status==='pass'};
}
