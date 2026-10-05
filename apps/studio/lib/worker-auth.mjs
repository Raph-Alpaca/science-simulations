import {createHash} from 'node:crypto';
import {createRemoteJWKSet,customFetch,decodeProtectedHeader,jwtVerify} from 'jose';

// IDs and immutable subject prefix read from GitHub's repository/OIDC APIs.
export const WORKER_TRUST=Object.freeze({
 issuer:'https://token.actions.githubusercontent.com',
 jwks:'https://token.actions.githubusercontent.com/.well-known/jwks',
 repository:'Raph-Alpaca/science-simulations',repositoryId:'1368255570',owner:'Raph-Alpaca',ownerId:'248908443',
 ref:'refs/heads/main',origin:'https://science-simulations-studio.vercel.app',
 audience:'https://science-simulations-studio.vercel.app/api/worker',
 subject:'repo:Raph-Alpaca@248908443/science-simulations@1368255570:ref:refs/heads/main',
 workflowRef:'Raph-Alpaca/science-simulations/.github/workflows/studio-worker.yml@refs/heads/main',
 generationWorkflow:'Raph-Alpaca/science-simulations/.github/workflows/studio-generate.yml@refs/heads/main',
 reportWorkflow:'Raph-Alpaca/science-simulations/.github/workflows/studio-report.yml@refs/heads/main',
});
export class WorkerAuthError extends Error{constructor(code,status=401){super(code);this.name='WorkerAuthError';this.code=code;this.status=status;}}
const need=(value,code='WORKER_TOKEN_REJECTED',status=401)=>{if(!value)throw new WorkerAuthError(code,status);};
const hash=value=>createHash('sha256').update(value).digest('hex');
const numericId=value=>typeof value==='string'&&/^[1-9][0-9]{0,15}$/.test(value)&&Number.isSafeInteger(Number(value));
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);

export function workerTrustConfig(env){
 need(env.STUDIO_WORKER_API_ENABLED==='true','WORKER_SETUP_REQUIRED',503);
 const trustedShas=(env.STUDIO_WORKER_TRUSTED_SHAS||'').split(',').map(s=>s.trim());
 need(trustedShas.length>=1&&trustedShas.length<=2&&trustedShas.every(sha)&&new Set(trustedShas).size===trustedShas.length,'WORKER_SETUP_REQUIRED',503);
 return Object.freeze({trustedShas:Object.freeze(trustedShas)});
}

// The only network address usable for verification is the fixed GitHub JWKS.
// Token headers cannot nominate a key server. No Authorization header is sent.
export function githubKeyResolver(transport=fetch){
 return createRemoteJWKSet(new URL(WORKER_TRUST.jwks),{
  timeoutDuration:5000,cooldownDuration:30000,cacheMaxAge:600000,
  [customFetch]:async(url,options)=>{
   need(url===WORKER_TRUST.jwks,'WORKER_JWKS_UNAVAILABLE',503);
   let response;
   try{response=await transport(url,{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:options.signal,cache:'no-store'});}
   catch{throw new WorkerAuthError('WORKER_JWKS_UNAVAILABLE',503);}
   if(response.status!==200||!response.body){await response.body?.cancel();throw new WorkerAuthError('WORKER_JWKS_UNAVAILABLE',503);}
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>262144){await reader.cancel();throw new WorkerAuthError('WORKER_JWKS_UNAVAILABLE',503);}chunks.push(item.value);}}
   catch(error){throw error instanceof WorkerAuthError?error:new WorkerAuthError('WORKER_JWKS_UNAVAILABLE',503);}
   finally{reader.releaseLock();}
   return new Response(Buffer.concat(chunks),{status:200,headers:{'Content-Type':'application/json'}});
  },
 });
}

// keyResolver/now are injectable only by trusted application code/tests.
// This verifies identity; callers must ALSO atomically consume jti in the DB
// and compare the persisted job/run binding before carrying out an operation.
export function createWorkerTokenVerifier(config,{keyResolver=githubKeyResolver(),now=()=>new Date()}={}){
 need(config?.trustedShas?.length>=1&&config.trustedShas.length<=2&&config.trustedShas.every(sha),'WORKER_SETUP_REQUIRED',503);
 const allowed=new Set(config.trustedShas);
 return async function verify(header){
  need(typeof header==='string'&&header.length<=20000&&/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(header),'WORKER_AUTH_REQUIRED');
  const token=header.slice(7);let payload,protectedHeader;
  try{
   const untrusted=decodeProtectedHeader(token);
   need(untrusted.alg==='RS256'&&untrusted.typ==='JWT'&&typeof untrusted.kid==='string'&&untrusted.kid.length<=200&&untrusted.kid.length>0);
   need(!('jku' in untrusted)&&!('jwk' in untrusted)&&!('x5u' in untrusted)&&!('crit' in untrusted));
   ({payload,protectedHeader}=await jwtVerify(token,keyResolver,{algorithms:['RS256'],issuer:WORKER_TRUST.issuer,audience:WORKER_TRUST.audience,subject:WORKER_TRUST.subject,
    requiredClaims:['exp','iat','nbf','jti','repository','repository_id','repository_owner','repository_owner_id','ref','ref_type','sha','workflow_ref','workflow_sha','job_workflow_ref','job_workflow_sha','run_id','run_attempt','event_name','runner_environment','repository_visibility'],
    maxTokenAge:120,clockTolerance:5,currentDate:now()}));
  }catch(error){
   if(error instanceof WorkerAuthError)throw error;
   if(['ERR_JWKS_TIMEOUT','ERR_JWKS_INVALID'].includes(error?.code))throw new WorkerAuthError('WORKER_JWKS_UNAVAILABLE',503);
   throw new WorkerAuthError('WORKER_TOKEN_REJECTED');
  }
  need(protectedHeader.alg==='RS256'&&payload.aud===WORKER_TRUST.audience);
  need([payload.iat,payload.nbf,payload.exp].every(Number.isSafeInteger)&&payload.exp>payload.iat&&payload.exp-payload.iat<=1200&&payload.nbf<=payload.iat+5);
  need(typeof payload.jti==='string'&&payload.jti.length>=8&&payload.jti.length<=200);
  need(payload.repository===WORKER_TRUST.repository&&payload.repository_id===WORKER_TRUST.repositoryId&&payload.repository_owner===WORKER_TRUST.owner&&payload.repository_owner_id===WORKER_TRUST.ownerId,
   'WORKER_IDENTITY_REJECTED',403);
  need(payload.ref===WORKER_TRUST.ref&&payload.ref_type==='branch'&&payload.repository_visibility==='public'&&payload.runner_environment==='github-hosted'&&payload.event_name==='workflow_dispatch'&&
   !payload.environment&&!payload.head_ref&&!payload.base_ref,'WORKER_WORKFLOW_REJECTED',403);
  need(payload.workflow_ref===WORKER_TRUST.workflowRef&&allowed.has(payload.workflow_sha)&&payload.sha===payload.workflow_sha&&payload.job_workflow_sha===payload.workflow_sha,'WORKER_VERSION_REJECTED',403);
  const role=payload.job_workflow_ref===WORKER_TRUST.generationWorkflow?'generation':payload.job_workflow_ref===WORKER_TRUST.reportWorkflow?'report':null;
  need(role,'WORKER_WORKFLOW_REJECTED',403);
  need(numericId(payload.run_id)&&payload.run_attempt==='1','WORKER_RUN_REJECTED',403);
  return Object.freeze({repositoryId:Number(WORKER_TRUST.repositoryId),runId:Number(payload.run_id),runAttempt:1,workflowSha:payload.workflow_sha,role,
   jtiHash:hash(WORKER_TRUST.issuer+'\0'+payload.jti),expiresAt:new Date(payload.exp*1000).toISOString()});
 };
}
