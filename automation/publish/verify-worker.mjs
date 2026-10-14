import {readFile,lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {publicationRun} from './prepare-worker.mjs';
import {assertNoLinks} from '../catalog/content.mjs';
import {openPublicationArtifact,PUBLICATION_TRANSFER_BYTES,publicationBinding} from './artifact-transfer.mjs';
import {assertPublicationRuntimeReport} from './publication-packet.mjs';
import {sealPublicationReport} from './report-transfer.mjs';
import {runRuntimeContainer} from '../runner/runtime-container.mjs';
const need=v=>{if(!v)throw Error('PUBLICATION_VERIFY_REJECTED');};
export async function verifyPublicationWorker({env=process.env,verify=runRuntimeContainer,signal}={}){
 const run=publicationRun(env);need(path.isAbsolute(env.RUNNER_TEMP||'')&&typeof env.STUDIO_ARTIFACT_HASH==='string'&&/^[a-f0-9]{64}$/.test(env.STUDIO_ARTIFACT_HASH));
 need(!env.OPENAI_API_KEY&&!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN&&!env.ACTIONS_ID_TOKEN_REQUEST_URL);
 const folder=path.join(env.RUNNER_TEMP,'studio-publication-'+run.publicationId),file=path.join(folder,'artifact.sealed.json');await assertNoLinks(file);
 const stat=await lstat(file);need(stat.isFile()&&stat.nlink===1&&stat.size<=PUBLICATION_TRANSFER_BYTES);
 const sealed=await readFile(file,'utf8'),binding=publicationBinding(JSON.parse(sealed).binding);
 need(Object.keys(run).every(k=>binding[k]===run[k])&&binding.artifactHash===env.STUDIO_ARTIFACT_HASH);
 const opened=openPublicationArtifact(sealed,binding,env.STUDIO_TRANSFER_KEY),packet={artifactText:opened.artifactText,binding,inspection:opened.inspection};
 const output=path.join(folder,'report.sealed.json');await assertNoLinks(output);
 try{await lstat(output);throw Error('PUBLICATION_REPORT_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}
 need(!signal?.aborted);await writeFile(path.join(folder,'verification.claim'),'claimed\n',{flag:'wx',mode:0o600});
 const report=assertPublicationRuntimeReport(await verify(packet,{image:env.STUDIO_CHECKER_IMAGE,publication:true,signal}),packet);
 need(report.runtime.details.browserStopped&&!signal?.aborted);
 const ciphertext=sealPublicationReport(report,packet,env.STUDIO_TRANSFER_KEY);await assertNoLinks(output);await writeFile(output,ciphertext,{flag:'wx',mode:0o600});
 return {state:'checked',passed:report.runtime.checks.runtime==='pass',published:false};
}
