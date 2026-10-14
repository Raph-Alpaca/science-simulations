import {mkdir,writeFile,appendFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {PUBLICATION_TRUST} from '../../apps/studio/lib/publication-auth.mjs';
import {assertNoLinks} from '../catalog/content.mjs';
import {createPublicationTokenProvider,createPublicationApiClient,downloadPublicationArtifact} from './artifact-client.mjs';
import {sealPublicationArtifact} from './artifact-transfer.mjs';
const need=v=>{if(!v)throw Error('PUBLICATION_PREPARE_CONFIGURATION');};
export function publicationRun(env){
 need(env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY===PUBLICATION_TRUST.repository&&env.GITHUB_REPOSITORY_ID===PUBLICATION_TRUST.repositoryId&&env.GITHUB_REPOSITORY_OWNER_ID===PUBLICATION_TRUST.ownerId&&env.GITHUB_REF===PUBLICATION_TRUST.ref&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_RUN_ATTEMPT==='1');
 need(typeof env.STUDIO_PUBLICATION_ID==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(env.STUDIO_PUBLICATION_ID)&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA)&&/^[1-9][0-9]{0,15}$/.test(env.GITHUB_RUN_ID)&&Number.isSafeInteger(Number(env.GITHUB_RUN_ID)));
 const secret=env.STUDIO_TRANSFER_KEY;need(typeof secret==='string'&&secret.length===44&&Buffer.from(secret,'base64').length===32&&Buffer.from(secret,'base64').toString('base64')===secret);
 return {publicationId:env.STUDIO_PUBLICATION_ID,runId:Number(env.GITHUB_RUN_ID),workflowSha:env.GITHUB_SHA};
}
export async function preparePublicationWorker({env=process.env,client,signal}={}){
 const run=publicationRun(env);need(path.isAbsolute(env.RUNNER_TEMP||'')&&path.isAbsolute(env.GITHUB_OUTPUT||''));
 await assertNoLinks(env.RUNNER_TEMP);await assertNoLinks(env.GITHUB_OUTPUT);
 const output=await lstat(env.GITHUB_OUTPUT);need(output.isFile()&&!output.isSymbolicLink()&&output.nlink===1);
 client??=createPublicationApiClient({...run,getToken:createPublicationTokenProvider(env)});
 const artifact=await downloadPublicationArtifact(client,{signal});need(Object.keys(run).every(k=>artifact.binding[k]===run[k]));
 const sealed=sealPublicationArtifact(artifact.artifactText,artifact.binding,env.STUDIO_TRANSFER_KEY,artifact.inspection);
 need(!signal?.aborted);const folder=path.join(env.RUNNER_TEMP,'studio-publication-'+run.publicationId);
 await assertNoLinks(folder);await mkdir(folder,{mode:0o700});
 await writeFile(path.join(folder,'artifact.sealed.json'),sealed,{flag:'wx',mode:0o600});
 await appendFile(env.GITHUB_OUTPUT,'artifact_hash='+artifact.artifactHash+'\n');
 return {state:'prepared',published:false};
}
