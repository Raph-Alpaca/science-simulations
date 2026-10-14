import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {assertPublicationOutcome} from '../../automation/publish/publication-outcome.mjs';
import {PUBLIC_BASE_URL} from '../../automation/publish/verify-artifact.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
 const manifest=['catalog.json','index.html'].map(path=>({path,hash:hash(path)})),artifactHash=hash(JSON.stringify(manifest)),at=new Date().toISOString();
 const binding={publicationId:randomUUID(),approvalId:randomUUID(),reviewId:randomUUID(),runId:12345,runAttempt:1,workflowSha:'a'.repeat(40),proposalHash:'b'.repeat(64),artifactHash};
 const claim={id:randomUUID(),claimedAt:at,reportHash:'c'.repeat(64)},context={binding,claim,manifest,bytes:100,indexBytes:60};
 const outcome={version:'publication-outcome-v1',binding,claimId:claim.id,claimReportHash:claim.reportHash,deployment:{version:'pages-deployment-v1',runId:12345,workflowSha:binding.workflowSha,artifactId:4321,deploymentId:binding.workflowSha,status:'succeeded',errorCode:null,createRequests:1,statusRequests:1},verification:{schemaVersion:1,scope:'published_file_bytes',status:'pass',failureCode:null,failedPath:null,artifactHash,publicUrl:PUBLIC_BASE_URL,filesVerified:2,requestCount:3,bytesRead:160,startedAt:at,finishedAt:at,runtime:'not_run'}};
 return {context,outcome};
}
test('only provider success plus all public bytes can produce verified evidence',()=>{
 const {context,outcome}=fixture();assert.deepEqual(assertPublicationOutcome(outcome,context),{verified:true});
 for(const mutate of [o=>{o.claimId=randomUUID();},o=>{o.claimReportHash='d'.repeat(64);},o=>{o.deployment.createRequests=0;},o=>{o.deployment.statusRequests=0;},o=>{o.verification.filesVerified--;},o=>{o.verification.bytesRead--;},o=>{o.verification.publicUrl='https://untrusted.invalid/';},o=>{o.verification.finishedAt='2000-01-01T00:00:00Z';},o=>{o.extra='raw source';}]){const changed=structuredClone(outcome);mutate(changed);assert.throws(()=>assertPublicationOutcome(changed,context),/PUBLICATION_OUTCOME_INVALID/);}
});
test('bounded failure receipts preserve measured size-limit overrun without promoting publication',()=>{
 const {context,outcome}=fixture();Object.assign(outcome.verification,{status:'fail',failureCode:'PUBLIC_TOTAL_SIZE_LIMIT',failedPath:'index.html',bytesRead:11*1024*1024});assert.deepEqual(assertPublicationOutcome(outcome,context),{verified:false});
 outcome.verification.failureCode='private upstream text';assert.throws(()=>assertPublicationOutcome(outcome,context),/PUBLICATION_OUTCOME_INVALID/);
});
