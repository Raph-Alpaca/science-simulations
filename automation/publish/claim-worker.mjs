import {readFile,lstat,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {publicationRun} from './prepare-worker.mjs';
import {assertNoLinks,fileManifest} from '../catalog/content.mjs';
import {openPublicationArtifact,publicationBinding,PUBLICATION_TRANSFER_BYTES} from './artifact-transfer.mjs';
import {openPublicationReport,PUBLICATION_REPORT_TRANSFER_BYTES} from './report-transfer.mjs';
import {preparePublicationBundle,assertPublicationRuntimeReport} from './publication-packet.mjs';
import {createPublicationApiClient,createPublicationTokenProvider} from './artifact-client.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=v=>{if(!v)throw Error('PUBLICATION_CLAIM_REJECTED');};
async function boundedFile(file,limit){await assertNoLinks(file);const stat=await lstat(file);need(stat.isFile()&&stat.nlink===1&&stat.size<=limit);return readFile(file,'utf8');}
// Trusted host only. No candidate execution. This stages public bytes only after
// the server consumes the current teacher approval; a lost response stops here.
export async function claimPublicationWorker({env=process.env,client,signal}={}){
 const run=publicationRun(env);need(!env.OPENAI_API_KEY&&path.isAbsolute(env.RUNNER_TEMP||'')&&path.isAbsolute(env.GITHUB_OUTPUT||'')&&/^[a-f0-9]{64}$/.test(env.STUDIO_ARTIFACT_HASH));
 await assertNoLinks(env.GITHUB_OUTPUT);const output=await lstat(env.GITHUB_OUTPUT);need(output.isFile()&&output.nlink===1);
 const folder=path.join(env.RUNNER_TEMP,'studio-publication-'+run.publicationId);
 const sealed=await boundedFile(path.join(folder,'artifact.sealed.json'),PUBLICATION_TRANSFER_BYTES),binding=publicationBinding(JSON.parse(sealed).binding);
 need(Object.keys(run).every(k=>binding[k]===run[k])&&binding.artifactHash===env.STUDIO_ARTIFACT_HASH);
 const artifact=openPublicationArtifact(sealed,binding,env.STUDIO_TRANSFER_KEY),packet={artifactText:artifact.artifactText,inspection:artifact.inspection,binding};
 const checked=preparePublicationBundle(packet);
 const encryptedReport=await boundedFile(path.join(folder,'report.sealed.json'),PUBLICATION_REPORT_TRANSFER_BYTES);
 const {report}=openPublicationReport(encryptedReport,binding,env.STUDIO_TRANSFER_KEY);
 assertPublicationRuntimeReport(report,packet);need(report.runtime.checks.runtime==='pass'&&report.runtime.details.browserStopped&&!signal?.aborted);
 await writeFile(path.join(folder,'authority-send.claim'),'claimed\n',{flag:'wx',mode:0o600});
 client??=createPublicationApiClient({...run,purpose:'deploy',getToken:createPublicationTokenProvider(env)});
 const receipt=await client.post('claim',{artifactHash:binding.artifactHash,reportHash:hash(JSON.stringify(report))},{signal});
 need(Object.keys(binding).every(k=>receipt.binding?.[k]===binding[k])&&!signal?.aborted);
 await writeFile(path.join(folder,'authority.json'),JSON.stringify(receipt),{flag:'wx',mode:0o600});
 const site=path.join(folder,'site');await mkdir(site,{mode:0o700});
 for(const file of checked.artifact.files){
  need(!signal?.aborted);const target=path.join(site,...file.path.split('/'));await assertNoLinks(target);await mkdir(path.dirname(target),{recursive:true,mode:0o700});
  await writeFile(target,Buffer.from(file.bytesBase64,'base64'),{flag:'wx',mode:0o600});
 }
 need(hash(JSON.stringify(await fileManifest(site)))===binding.artifactHash);
 await appendFile(env.GITHUB_OUTPUT,'artifact_path='+site+'\n');
 return {state:'claimed',published:false};
}
