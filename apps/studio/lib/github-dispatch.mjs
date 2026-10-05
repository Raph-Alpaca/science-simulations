// Server-only GitHub App boundary. Only the reviewed repository/main/workflow
// can be dispatched. Never log response bodies, JWTs, tokens or private keys.
import {createPrivateKey} from 'node:crypto';
import {SignJWT} from 'jose';
import {StudioError,id} from './domain.mjs';
import {TARGET} from './dispatcher.mjs';
import {WORKER_TRUST,workerTrustConfig} from './worker-auth.mjs';

const API='https://api.github.com',repoPath='/repos/'+TARGET.repository;
const path='.github/workflows/'+TARGET.workflow;
const need=(ok)=>{if(!ok)throw new StudioError('RUNNER_CONNECTION_REQUIRED',503);};
const numeric=value=>typeof value==='string'&&/^[1-9][0-9]{0,15}$/.test(value)&&Number.isSafeInteger(Number(value));
export function githubDispatchConfig(env){
 need(env.STUDIO_DISPATCH_ENABLED==='true'&&env.STUDIO_INPUT_REVIEW_ENABLED==='true');
 let trust;try{trust=workerTrustConfig(env);}catch{need(false);}
 need(typeof env.STUDIO_GITHUB_APP_CLIENT_ID==='string'&&/^[A-Za-z0-9_.-]{1,100}$/.test(env.STUDIO_GITHUB_APP_CLIENT_ID));
 need(numeric(env.STUDIO_GITHUB_INSTALLATION_ID));
 need(typeof env.STUDIO_GITHUB_APP_PRIVATE_KEY==='string'&&env.STUDIO_GITHUB_APP_PRIVATE_KEY.length<=16384);
 let key;try{key=createPrivateKey(env.STUDIO_GITHUB_APP_PRIVATE_KEY.replace(/\\n/g,'\n'));}catch{need(false);}
 need(key.asymmetricKeyType==='rsa'&&key.asymmetricKeyDetails.modulusLength>=2048);
 return Object.freeze({appClientId:env.STUDIO_GITHUB_APP_CLIENT_ID,installationId:env.STUDIO_GITHUB_INSTALLATION_ID,key,trustedShas:trust.trustedShas});
}

function abortable(promise,signal){
 if(signal.aborted)return Promise.reject(new Error('REQUEST_ABORTED'));
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(new Error('REQUEST_ABORTED'));signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}
async function responseJson(response,signal){
 if(!response.body)throw new Error('EMPTY_RESPONSE');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const part=await abortable(reader.read(),signal);if(part.done)break;size+=part.value.length;if(size>131072)throw new Error('RESPONSE_TOO_LARGE');chunks.push(part.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 finally{reader.cancel().catch(()=>{});reader.releaseLock();}
}
const trustedRepository=value=>value?.id===Number(WORKER_TRUST.repositoryId)&&value?.full_name===TARGET.repository&&value?.owner?.id===Number(WORKER_TRUST.ownerId)&&value?.owner?.login===WORKER_TRUST.owner;
function permissionsMatch(value){return value?.actions==='write'&&value?.contents==='read'&&Object.entries(value).every(([key,v])=>key==='actions'||key==='contents'||(key==='metadata'&&v==='read'));}

export function createGitHubDispatcher(config,{transport=fetch,now=()=>Date.now()}={}){
 need(config?.key?.type==='private'&&numeric(config.installationId)&&config.trustedShas?.length>=1&&config.trustedShas.length<=2&&config.trustedShas.every(s=>/^[a-f0-9]{40}$/.test(s)));
 return Object.freeze({async dispatch(jobId,{signal}={}){
  id(jobId);let token,posted=false,verifiedRun=null;
  const overall=AbortSignal.any([AbortSignal.timeout(30000),...(signal?[signal]:[])]);
  const request=async(endpoint,{method='GET',credential=token,body,cleanup=false}={})=>{
   const requestSignal=cleanup?AbortSignal.timeout(2000):AbortSignal.any([overall,AbortSignal.timeout(5000)]);
   const response=await abortable(transport(API+endpoint,{method,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'science-studio-dispatch',Authorization:'Bearer '+credential,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',cache:'no-store',signal:requestSignal}),requestSignal);
   if(cleanup||response.status!==200&&response.status!==201){response.body?.cancel().catch(()=>{});return {status:response.status};}
   return {status:response.status,body:await responseJson(response,requestSignal)};
  };
  let result;
  try{
   const seconds=Math.floor(now()/1000);
   const jwt=await new SignJWT({}).setProtectedHeader({alg:'RS256'}).setIssuer(config.appClientId).setIssuedAt(seconds-60).setExpirationTime(seconds+300).sign(config.key);
   const minted=await request('/app/installations/'+config.installationId+'/access_tokens',{method:'POST',credential:jwt,body:{repository_ids:[Number(WORKER_TRUST.repositoryId)],permissions:{actions:'write',contents:'read'}}});
   // A malformed scope never reaches a dispatch; keep the returned token only
   // long enough to attempt revocation in finally.
   if(typeof minted.body?.token==='string'&&minted.body.token.length<=4096)token=minted.body.token;
   const expires=Date.parse(minted.body?.expires_at);
   if(minted.status!==201||!token||!permissionsMatch(minted.body?.permissions)||!Array.isArray(minted.body?.repositories)||minted.body.repositories.length!==1||!trustedRepository(minted.body.repositories[0])||!(expires>now()+60000&&expires<=now()+3660000))throw new Error('APP_TOKEN_REJECTED');
   const repo=await request(repoPath);
   if(repo.status!==200||!trustedRepository(repo.body)||repo.body.archived||repo.body.disabled||repo.body.default_branch!=='main')throw new Error('REPOSITORY_REJECTED');
   const workflow=await request(repoPath+'/actions/workflows/'+TARGET.workflow);
   if(workflow.status!==200||workflow.body?.path!==path||workflow.body.state!=='active'||!Number.isSafeInteger(workflow.body.id)||workflow.body.id<1)throw new Error('WORKFLOW_REJECTED');
   const ref=await request(repoPath+'/git/ref/heads/main');
   const sha=ref.body?.object?.sha;
   if(ref.status!==200||ref.body?.ref!=='refs/heads/main'||ref.body.object?.type!=='commit'||!config.trustedShas.includes(sha))throw new Error('HEAD_REJECTED');
   overall.throwIfAborted();posted=true;
   const sent=await request(repoPath+'/actions/workflows/'+TARGET.workflow+'/dispatches',{method:'POST',body:{ref:'main',inputs:{mode:'generate',job_id:jobId}}});
   // Even rejection/timeout after POST is retained. This avoids guessing that
   // an intermediary or provider definitely did not accept an execution.
   const run=sent.body?.workflow_run_id;
   if(sent.status!==200||!Number.isSafeInteger(run)||run<1)throw new Error('DISPATCH_RESPONSE_REJECTED');
   verifiedRun=String(run);
   const read=await request(repoPath+'/actions/runs/'+run),v=read.body;
   if(read.status!==200||v?.id!==run||!trustedRepository(v.repository)||!trustedRepository(v.head_repository)||v.workflow_id!==workflow.body.id||![path,path+'@main'].includes(v.path)||v.event!=='workflow_dispatch'||v.head_branch!=='main'||v.head_sha!==sha||v.run_attempt!==1)throw new Error('RUN_REJECTED');
   result={state:'submitted',runId:String(run),trustedSha:sha};
  }catch{result={state:posted?'uncertain':'failed',code:posted?'DISPATCH_UNCERTAIN':'RUNNER_PREFLIGHT_FAILED',...(verifiedRun?{observedRunId:verifiedRun}:{})};}
  finally{if(token){try{await request('/installation/token',{method:'DELETE',cleanup:true});}catch{/* Expiry still applies. Never turn cleanup into a second dispatch. */}token=undefined;}}
  return result;
 }});
}
