import {readFile,lstat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {publicationRun} from './prepare-worker.mjs';
import {openPublicationArtifact,publicationBinding,PUBLICATION_TRANSFER_BYTES} from './artifact-transfer.mjs';
import {openPublicationReport,PUBLICATION_REPORT_TRANSFER_BYTES} from './report-transfer.mjs';
import {preparePublicationBundle,assertPublicationRuntimeReport} from './publication-packet.mjs';
import {assertNoLinks,fileManifest} from '../catalog/content.mjs';
import {createPagesDeploymentClient,createPagesTokenProvider} from './pages-client.mjs';
import {verifyPublishedArtifact} from './verify-artifact.mjs';
import {assertPublicationOutcome} from './publication-outcome.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=v=>{if(!v)throw Error('PUBLICATION_DEPLOY_REJECTED');};
async function boundedFile(file,limit){await assertNoLinks(file);const stat=await lstat(file);need(stat.isFile()&&stat.nlink===1&&stat.size<=limit);return readFile(file,'utf8');}
export async function deployPublicationWorker({env=process.env,pages,verify=verifyPublishedArtifact,signal}={}){
 const run=publicationRun(env);need(!env.OPENAI_API_KEY&&path.isAbsolute(env.RUNNER_TEMP||'')&&/^[a-f0-9]{64}$/.test(env.STUDIO_ARTIFACT_HASH)&&/^[1-9][0-9]{0,15}$/.test(env.STUDIO_PAGES_ARTIFACT_ID));
 const artifactId=Number(env.STUDIO_PAGES_ARTIFACT_ID);need(Number.isSafeInteger(artifactId));
 const folder=path.join(env.RUNNER_TEMP,'studio-publication-'+run.publicationId);
 const sealed=await boundedFile(path.join(folder,'artifact.sealed.json'),PUBLICATION_TRANSFER_BYTES),binding=publicationBinding(JSON.parse(sealed).binding);
 need(Object.keys(run).every(k=>binding[k]===run[k])&&binding.artifactHash===env.STUDIO_ARTIFACT_HASH);
 const opened=openPublicationArtifact(sealed,binding,env.STUDIO_TRANSFER_KEY),packet={artifactText:opened.artifactText,inspection:opened.inspection,binding};
 const bundle=preparePublicationBundle(packet).artifact;
 const authority=JSON.parse(await boundedFile(path.join(folder,'authority.json'),8192)),claim=authority.claim;
 need(JSON.stringify(publicationBinding(authority.binding))===JSON.stringify(binding)&&authority.published===false&&claim&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(claim.id));
 const {report}=openPublicationReport(await boundedFile(path.join(folder,'report.sealed.json'),PUBLICATION_REPORT_TRANSFER_BYTES),binding,env.STUDIO_TRANSFER_KEY);
 assertPublicationRuntimeReport(report,packet);need(report.runtime.checks.runtime==='pass'&&report.runtime.details.browserStopped&&claim.reportHash===hash(JSON.stringify(report)));
 const claimedAt=Date.parse(claim.claimedAt);need(Number.isFinite(claimedAt)&&claimedAt<=Date.now()+5000&&Date.now()-claimedAt<=600000);
 need(hash(JSON.stringify(await fileManifest(path.join(folder,'site'))))===binding.artifactHash&&!signal?.aborted);
 // Durable marker precedes all Pages activity; a later process may observe but
 // must never repeat the create request, even if no response was received.
 await writeFile(path.join(folder,'pages-send.claim'),JSON.stringify({binding,claimId:claim.id,artifactId}),{flag:'wx',mode:0o600});
 pages??=createPagesDeploymentClient({runId:run.runId,workflowSha:run.workflowSha,artifactId,token:env.GITHUB_TOKEN,getIdToken:createPagesTokenProvider(env)});
 const deployment=await pages.deploy({signal});
 const verification=deployment.status==='succeeded'?await verify({manifest:bundle.manifest,artifactHash:binding.artifactHash},{signal}):null;
 const outcome={version:'publication-outcome-v1',binding,claimId:claim.id,claimReportHash:claim.reportHash,deployment,verification};
 const context={binding,claim,manifest:bundle.manifest,bytes:bundle.bytes,indexBytes:Buffer.from(bundle.files.find(f=>f.path==='index.html').bytesBase64,'base64').length};
 const {verified}=assertPublicationOutcome(outcome,context);
 await writeFile(path.join(folder,'outcome.json'),JSON.stringify(outcome),{flag:'wx',mode:0o600});
 return {state:verified?'verified':'unconfirmed',published:false};
}
