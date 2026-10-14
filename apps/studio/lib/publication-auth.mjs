import {createHash} from 'node:crypto';
import {decodeProtectedHeader,jwtVerify} from 'jose';
import {WORKER_TRUST,WorkerAuthError,githubKeyResolver} from './worker-auth.mjs';

// Publication has its own audience, activation gate and reviewed versions.
// Sharing the fixed GitHub key resolver does not expand the worker verifier.
const workflow=name=>WORKER_TRUST.repository+'/.github/workflows/'+name+'.yml@refs/heads/main';
export const PUBLICATION_TRUST=Object.freeze({
 issuer:WORKER_TRUST.issuer,jwks:WORKER_TRUST.jwks,
 repository:WORKER_TRUST.repository,repositoryId:WORKER_TRUST.repositoryId,owner:WORKER_TRUST.owner,ownerId:WORKER_TRUST.ownerId,
 origin:WORKER_TRUST.origin,ref:WORKER_TRUST.ref,audience:WORKER_TRUST.origin+'/api/publication',
 subject:WORKER_TRUST.subject,
 deploySubject:'repo:Raph-Alpaca@248908443/science-simulations@1368255570:environment:github-pages',
 workflowRef:workflow('studio-publication'),
 prepareWorkflow:workflow('studio-publication-prepare'),reportWorkflow:workflow('studio-publication-report'),deployWorkflow:workflow('studio-publication-deploy'),
});
export class PublicationAuthError extends Error{constructor(code,status=401){super(code);this.name='PublicationAuthError';this.code=code;this.status=status;}}
const need=(value,code='PUBLICATION_TOKEN_REJECTED',status=401)=>{if(!value)throw new PublicationAuthError(code,status);};
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const numeric=value=>typeof value==='string'&&/^[1-9][0-9]{0,15}$/.test(value)&&Number.isSafeInteger(Number(value));
const validShas=value=>Array.isArray(value)&&value.length>=1&&value.length<=2&&value.every(sha)&&new Set(value).size===value.length;
export function publicationTrustConfig(env){
 const trustedShas=(env.STUDIO_PUBLICATION_TRUSTED_SHAS||'').split(',').map(s=>s.trim());
 need(env.STUDIO_PUBLICATION_API_ENABLED==='true'&&validShas(trustedShas),'PUBLICATION_SETUP_REQUIRED',503);
 return Object.freeze({trustedShas:Object.freeze(trustedShas)});
}

// Identity alone is not permission to read files or publish. A caller must
// atomically consume jti and match the stored intent/run/approval before acting.
export function createPublicationTokenVerifier(config,{keyResolver=githubKeyResolver(),now=()=>new Date()}={}){
 need(validShas(config?.trustedShas),'PUBLICATION_SETUP_REQUIRED',503);
 const allowed=new Set(config.trustedShas);
 return async header=>{
  need(typeof header==='string'&&header.length<=20000&&/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(header),'PUBLICATION_AUTH_REQUIRED');
  let payload;
  try{
   const token=header.slice(7),untrusted=decodeProtectedHeader(token);
   need(untrusted.alg==='RS256'&&untrusted.typ==='JWT'&&typeof untrusted.kid==='string'&&untrusted.kid.length>0&&untrusted.kid.length<=200);
   need(!['jku','jwk','x5u','crit'].some(key=>key in untrusted));
   ({payload}=await jwtVerify(token,keyResolver,{algorithms:['RS256'],issuer:PUBLICATION_TRUST.issuer,audience:PUBLICATION_TRUST.audience,
    requiredClaims:['sub','exp','iat','nbf','jti','repository','repository_id','repository_owner','repository_owner_id','ref','ref_type','sha','workflow_ref','workflow_sha','job_workflow_ref','job_workflow_sha','run_id','run_attempt','event_name','runner_environment','repository_visibility'],
    maxTokenAge:120,clockTolerance:5,currentDate:now()}));
  }catch(error){
   if(error instanceof PublicationAuthError)throw error;
   if(error instanceof WorkerAuthError&&error.code==='WORKER_JWKS_UNAVAILABLE'||['ERR_JWKS_TIMEOUT','ERR_JWKS_INVALID'].includes(error?.code))throw new PublicationAuthError('PUBLICATION_JWKS_UNAVAILABLE',503);
   throw new PublicationAuthError('PUBLICATION_TOKEN_REJECTED');
  }
  need(payload.aud===PUBLICATION_TRUST.audience&&[payload.iat,payload.nbf,payload.exp].every(Number.isSafeInteger)&&payload.exp>payload.iat&&payload.exp-payload.iat<=1200&&payload.nbf<=payload.iat+5);
  need(typeof payload.jti==='string'&&payload.jti.length>=8&&payload.jti.length<=200);
  need(payload.repository===PUBLICATION_TRUST.repository&&payload.repository_id===PUBLICATION_TRUST.repositoryId&&payload.repository_owner===PUBLICATION_TRUST.owner&&payload.repository_owner_id===PUBLICATION_TRUST.ownerId,'PUBLICATION_IDENTITY_REJECTED',403);
  need(payload.ref===PUBLICATION_TRUST.ref&&payload.ref_type==='branch'&&payload.repository_visibility==='public'&&payload.runner_environment==='github-hosted'&&payload.event_name==='workflow_dispatch'&&!payload.head_ref&&!payload.base_ref,'PUBLICATION_WORKFLOW_REJECTED',403);
  need(payload.workflow_ref===PUBLICATION_TRUST.workflowRef&&allowed.has(payload.workflow_sha)&&payload.sha===payload.workflow_sha&&payload.job_workflow_sha===payload.workflow_sha,'PUBLICATION_VERSION_REJECTED',403);
  const role=payload.job_workflow_ref===PUBLICATION_TRUST.prepareWorkflow?'prepare':payload.job_workflow_ref===PUBLICATION_TRUST.reportWorkflow?'report':payload.job_workflow_ref===PUBLICATION_TRUST.deployWorkflow?'deploy':null;
  need(role,'PUBLICATION_WORKFLOW_REJECTED',403);
  need(role==='deploy'?payload.environment==='github-pages'&&payload.sub===PUBLICATION_TRUST.deploySubject:!payload.environment&&payload.sub===PUBLICATION_TRUST.subject,'PUBLICATION_ENVIRONMENT_REJECTED',403);
  need(numeric(payload.run_id)&&payload.run_attempt==='1','PUBLICATION_RUN_REJECTED',403);
  return Object.freeze({purpose:'publication',repositoryId:Number(PUBLICATION_TRUST.repositoryId),runId:Number(payload.run_id),runAttempt:1,workflowSha:payload.workflow_sha,role,
   jtiHash:createHash('sha256').update(PUBLICATION_TRUST.issuer+'\0'+payload.jti).digest('hex'),expiresAt:new Date(payload.exp*1000).toISOString()});
 };
}
