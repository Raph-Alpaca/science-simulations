import {WORKER_TRUST,createWorkerTokenVerifier,githubKeyResolver,WorkerAuthError} from '../../apps/studio/lib/worker-auth.mjs';
import {createGitHubTokenProvider,WorkerClientError} from './worker-client.mjs';

export const OIDC_CONNECTION_LIMITS=Object.freeze({totalMs:15000,requests:2});
const configuration=env=>env.GITHUB_ACTIONS==='true'&&env.STUDIO_OIDC_CONNECTION==='true'&&
 env.GITHUB_REPOSITORY===WORKER_TRUST.repository&&env.GITHUB_REPOSITORY_ID===WORKER_TRUST.repositoryId&&
 env.GITHUB_REPOSITORY_OWNER_ID===WORKER_TRUST.ownerId&&env.GITHUB_REF===WORKER_TRUST.ref&&
 env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_RUN_ATTEMPT==='1'&&
 /^[1-9][0-9]{0,15}$/.test(env.GITHUB_RUN_ID||'')&&Number.isSafeInteger(Number(env.GITHUB_RUN_ID))&&
 /^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')&&env.GITHUB_WORKFLOW_SHA===env.GITHUB_SHA&&
 env.GITHUB_WORKFLOW_REF===WORKER_TRUST.workflowRef&&
 !env.OPENAI_API_KEY&&!env.STUDIO_TRANSFER_KEY&&!env.STUDIO_GITHUB_APP_PRIVATE_KEY&&!env.SUPABASE_SECRET_KEY&&
 !env.STUDIO_JOB_ID&&env.STUDIO_GENERATION_ENABLED!=='true';
const safeCodes=new Set(['WORKER_AUTH_REQUIRED','WORKER_TOKEN_REJECTED','WORKER_IDENTITY_REJECTED','WORKER_WORKFLOW_REJECTED',
 'WORKER_VERSION_REJECTED','WORKER_RUN_REJECTED','WORKER_JWKS_UNAVAILABLE','GITHUB_OIDC_UNAVAILABLE',
 'GITHUB_OIDC_URL_REJECTED','GITHUB_OIDC_TIMEOUT','GITHUB_OIDC_UNCERTAIN','GITHUB_OIDC_REJECTED',
 'GITHUB_OIDC_INVALID_RESPONSE','GITHUB_OIDC_RESPONSE_LIMIT']);

// Verifies actual GitHub-issued credentials using the production verifier in
// this isolated process. It neither calls the Studio API nor authorizes a job.
export async function checkOidcConnection({env,role,transport=fetch,now=()=>new Date()}){
 let stage='configuration',requests=0,token=null,timer;
 const controller=new AbortController();
 const result=(status,code)=>({status,code,stage,role:['generation','report'].includes(role)?role:null,requests,executionReady:false});
 try{
  if(!env||!configuration(env)||!['generation','report'].includes(role))return result('blocked','OIDC_CONNECTION_CONFIGURATION');
  const boundedTransport=async(url,options)=>{
   if(controller.signal.aborted||++requests>OIDC_CONNECTION_LIMITS.requests)throw new Error('request bound');
   return transport(url,{...options,signal:AbortSignal.any([controller.signal,...(options.signal?[options.signal]:[])])});
  };
  const getToken=createGitHubTokenProvider(env,{transport:boundedTransport});
  const verify=createWorkerTokenVerifier({trustedShas:[env.GITHUB_SHA]},{keyResolver:githubKeyResolver(boundedTransport),now});
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('connection timeout'));},OIDC_CONNECTION_LIMITS.totalMs);});
  return await Promise.race([timeout,(async()=>{
   stage='token';token=await getToken({signal:controller.signal});
   stage='signature-and-claims';const identity=await verify('Bearer '+token);token=null;
   stage='role-and-run';
   if(identity.role!==role||identity.runId!==Number(env.GITHUB_RUN_ID))return result('blocked','OIDC_CONNECTION_IDENTITY_MISMATCH');
   stage='complete';
   return {...result('verified','OIDC_CONNECTION_VERIFIED'),runId:identity.runId,workflowSha:identity.workflowSha};
  })()]);
 }catch(error){
  const code=controller.signal.aborted?'OIDC_CONNECTION_TIMEOUT':
   (error instanceof WorkerAuthError||error instanceof WorkerClientError)&&safeCodes.has(error.code)?error.code:'OIDC_CONNECTION_FAILED';
  return result('blocked',code);
 }finally{clearTimeout(timer);controller.abort();token=null;}
}
