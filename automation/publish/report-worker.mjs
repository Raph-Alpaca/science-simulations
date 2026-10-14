import {readFile,lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {publicationRun} from './prepare-worker.mjs';
import {assertNoLinks} from '../catalog/content.mjs';
import {publicationBinding} from './artifact-transfer.mjs';
import {openPublicationReport,PUBLICATION_REPORT_TRANSFER_BYTES} from './report-transfer.mjs';
import {createPublicationApiClient,createPublicationTokenProvider} from './artifact-client.mjs';
const need=v=>{if(!v)throw Error('PUBLICATION_REPORT_REJECTED');};
export async function reportPublicationWorker({env=process.env,client,signal}={}){
 const run=publicationRun(env);need(!env.OPENAI_API_KEY&&path.isAbsolute(env.RUNNER_TEMP||'')&&/^[a-f0-9]{64}$/.test(env.STUDIO_ARTIFACT_HASH));
 const folder=path.join(env.RUNNER_TEMP,'studio-publication-'+run.publicationId),file=path.join(folder,'report.sealed.json');await assertNoLinks(file);
 const stat=await lstat(file);need(stat.isFile()&&stat.nlink===1&&stat.size<=PUBLICATION_REPORT_TRANSFER_BYTES);
 const text=await readFile(file,'utf8'),binding=publicationBinding(JSON.parse(text).binding);need(Object.keys(run).every(k=>binding[k]===run[k])&&binding.artifactHash===env.STUDIO_ARTIFACT_HASH);
 const {report}=openPublicationReport(text,binding,env.STUDIO_TRANSFER_KEY);need(!signal?.aborted);
 // Preserve uncertainty after any attempted send; retries require observation.
 await writeFile(path.join(folder,'report-send.claim'),'claimed\n',{flag:'wx',mode:0o600});
 client??=createPublicationApiClient({...run,purpose:'report',getToken:createPublicationTokenProvider(env)});
 const receipt=await client.post('check-report',{report},{signal});need(Object.keys(binding).every(k=>receipt.binding?.[k]===binding[k]));
 return {state:'reported',passed:receipt.passed,published:false};
}
