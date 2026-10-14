import {readFile,lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {publicationRun} from './prepare-worker.mjs';
import {assertNoLinks} from '../catalog/content.mjs';
import {openPublicationArtifact,publicationBinding,PUBLICATION_TRANSFER_BYTES} from './artifact-transfer.mjs';
import {preparePublicationBundle} from './publication-packet.mjs';
import {assertPublicationOutcome} from './publication-outcome.mjs';
import {createPublicationApiClient,createPublicationTokenProvider} from './artifact-client.mjs';
const need=v=>{if(!v)throw Error('PUBLICATION_COMPLETION_REJECTED');};
async function boundedFile(file,limit){await assertNoLinks(file);const stat=await lstat(file);need(stat.isFile()&&stat.nlink===1&&stat.size<=limit);return readFile(file,'utf8');}
export async function completePublicationWorker({env=process.env,client,signal}={}){
 const run=publicationRun(env);need(!env.OPENAI_API_KEY&&path.isAbsolute(env.RUNNER_TEMP||'')&&/^[a-f0-9]{64}$/.test(env.STUDIO_ARTIFACT_HASH));
 const folder=path.join(env.RUNNER_TEMP,'studio-publication-'+run.publicationId),outcome=JSON.parse(await boundedFile(path.join(folder,'outcome.json'),20000)),binding=publicationBinding(outcome.binding);
 need(Object.keys(run).every(k=>binding[k]===run[k])&&binding.artifactHash===env.STUDIO_ARTIFACT_HASH);
 const authority=JSON.parse(await boundedFile(path.join(folder,'authority.json'),8192));need(JSON.stringify(publicationBinding(authority.binding))===JSON.stringify(binding)&&authority.published===false);
 const opened=openPublicationArtifact(await boundedFile(path.join(folder,'artifact.sealed.json'),PUBLICATION_TRANSFER_BYTES),binding,env.STUDIO_TRANSFER_KEY);
 const bundle=preparePublicationBundle({artifactText:opened.artifactText,inspection:opened.inspection,binding}).artifact;
 const checked=assertPublicationOutcome(outcome,{binding,claim:authority.claim,manifest:bundle.manifest,bytes:bundle.bytes,indexBytes:Buffer.from(bundle.files.find(f=>f.path==='index.html').bytesBase64,'base64').length});need(!signal?.aborted);
 await writeFile(path.join(folder,'completion-send.claim'),'claimed\n',{flag:'wx',mode:0o600});
 client??=createPublicationApiClient({...run,purpose:'complete',getToken:createPublicationTokenProvider(env)});
 const receipt=await client.post('complete',{outcome},{signal});need(Object.keys(binding).every(k=>receipt.binding?.[k]===binding[k])&&receipt.published===checked.verified);
 await writeFile(path.join(folder,'completion.json'),JSON.stringify(receipt),{flag:'wx',mode:0o600});
 return {state:receipt.published?'published':'unconfirmed',published:receipt.published};
}
