// Operator preflight only. GET metadata; never mint an installation token,
// dispatch a workflow, enable a gate, call a model, or accept provider URLs.
import {createPrivateKey} from 'node:crypto';
import {SignJWT} from 'jose';
import {WORKER_TRUST} from '../../apps/studio/lib/worker-auth.mjs';

const API='https://api.github.com',repoPath='/repos/'+WORKER_TRUST.repository;
const workflows=['studio-worker.yml','studio-publication.yml'];
const remaining=['installation_repository_count','remote_secret_registration','actions_oidc_roundtrip','paid_generation','teacher_approval_and_publication'];
const numeric=v=>typeof v==='string'&&/^[1-9][0-9]{0,15}$/.test(v)&&Number.isSafeInteger(Number(v));
const owner=v=>v?.id===Number(WORKER_TRUST.ownerId)&&v?.login===WORKER_TRUST.owner&&v?.type==='User';
const permissions=v=>v?.actions==='write'&&v?.contents==='read'&&v?.metadata==='read'&&Object.keys(v).length===3;
const noEvents=v=>Array.isArray(v)&&v.length===0;
const requireValue=ok=>{if(!ok)throw Error('METADATA_REJECTED');};

function bounded(promise,signal){
 if(signal.aborted)return Promise.reject(Error('ABORTED'));
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(Error('ABORTED'));signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}

// Secrets come from the caller's protected memory, never CLI arguments or files
// selected by a remote response. expectedSha is the separately reviewed main.
export async function probeAppConnection({env,expectedSha,transport=fetch,now=()=>Date.now(),signal}={}){
 const checks=[];let stage='configuration',requests=0,jwt;
 const result=(status,code)=>({status,code,stage,requests,checks:[...checks],executionReady:false,remaining:[...remaining]});
 const overall=AbortSignal.any([AbortSignal.timeout(20000),...(signal?[signal]:[])]);
 try{
  requireValue(env&&/^[a-f0-9]{40}$/.test(expectedSha)&&typeof env.STUDIO_GITHUB_APP_CLIENT_ID==='string'&&/^[A-Za-z0-9_.-]{1,100}$/.test(env.STUDIO_GITHUB_APP_CLIENT_ID)&&numeric(env.STUDIO_GITHUB_INSTALLATION_ID));
  requireValue(typeof env.STUDIO_GITHUB_APP_PRIVATE_KEY==='string'&&env.STUDIO_GITHUB_APP_PRIVATE_KEY.length<=16384);
  const key=createPrivateKey(env.STUDIO_GITHUB_APP_PRIVATE_KEY.replace(/\\n/g,'\n'));
  requireValue(key.asymmetricKeyType==='rsa'&&key.asymmetricKeyDetails.modulusLength>=2048);
  overall.throwIfAborted();checks.push(stage);
  const seconds=Math.floor(now()/1000);
  jwt=await bounded(new SignJWT({}).setProtectedHeader({alg:'RS256'}).setIssuer(env.STUDIO_GITHUB_APP_CLIENT_ID).setIssuedAt(seconds-60).setExpirationTime(seconds+300).sign(key),overall);
  const get=async(endpoint,authenticated=false)=>{
   overall.throwIfAborted();requireValue(requests<6);requests++;
   const requestSignal=AbortSignal.any([overall,AbortSignal.timeout(5000)]);
   const response=await bounded(transport(API+endpoint,{method:'GET',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'science-studio-connection-check',...(authenticated?{Authorization:'Bearer '+jwt}:{})},redirect:'error',cache:'no-store',signal:requestSignal}),requestSignal);
   if(response.status!==200||!response.body){response.body?.cancel().catch(()=>{});throw Error('HTTP_REJECTED');}
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{
    while(true){const item=await bounded(reader.read(),requestSignal);if(item.done)break;size+=item.value.length;requireValue(size<=131072);chunks.push(item.value);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
   }finally{reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{}}
  };
  stage='app';const app=await get('/app',true);
  requireValue(Number.isSafeInteger(app.id)&&app.id>0&&app.client_id===env.STUDIO_GITHUB_APP_CLIENT_ID&&owner(app.owner)&&permissions(app.permissions)&&noEvents(app.events));checks.push(stage);
  stage='installation';const installation=await get(repoPath+'/installation',true);
  requireValue(installation.id===Number(env.STUDIO_GITHUB_INSTALLATION_ID)&&installation.app_id===app.id&&installation.client_id===app.client_id&&owner(installation.account)&&installation.target_id===Number(WORKER_TRUST.ownerId)&&installation.target_type==='User'&&installation.repository_selection==='selected'&&installation.suspended_at===null&&permissions(installation.permissions)&&noEvents(installation.events));checks.push(stage);
  // Public metadata needs no credential. The JWT is sent only to the two fixed
  // App endpoints above; none of the response's URLs is ever followed.
  stage='repository';const repo=await get(repoPath);
  requireValue(repo.id===Number(WORKER_TRUST.repositoryId)&&repo.full_name===WORKER_TRUST.repository&&owner(repo.owner)&&repo.private===false&&repo.archived===false&&repo.disabled===false&&repo.default_branch==='main');checks.push(stage);
  stage='main';const ref=await get(repoPath+'/git/ref/heads/main');
  requireValue(ref.ref==='refs/heads/main'&&ref.object?.type==='commit'&&ref.object.sha===expectedSha);checks.push(stage);
  for(const workflow of workflows){
   stage=workflow;const record=await get(repoPath+'/actions/workflows/'+workflow);
   requireValue(Number.isSafeInteger(record.id)&&record.id>0&&record.path==='.github/workflows/'+workflow&&record.state==='active');checks.push(stage);
  }
  stage='complete';return result('metadata_verified','APP_METADATA_VERIFIED');
 }catch{return result('blocked','APP_CONNECTION_UNVERIFIED');}
 finally{jwt=undefined;}
}
