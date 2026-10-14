import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {publicationFixture} from './publication-dispatch-fixture.mjs';
import {PUBLICATION_TRUST as trust,createPublicationTokenVerifier} from '../../apps/studio/lib/publication-auth.mjs';
import {createPublicationHttpHandler} from '../../apps/studio/lib/publication-http.mjs';
import {createPublicationGateway} from '../../apps/studio/lib/publication-gateway.mjs';
const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk={...await exportJWK(publicKey),kid:'synthetic-publication-api',alg:'RS256',use:'sig'};
const digest=x=>createHash('sha256').update(x).digest('hex');
export async function publicationApiFixture({submitted=true}={}){
 const f=await publicationFixture();
 try{
  await f.admin(async()=>f.db.exec(await readFile('supabase/proposals/studio_publication_artifact_v1.sql','utf8')));
  await f.enable();const intent=await f.request(),claim=randomUUID(),sha='a'.repeat(40);await f.claim(intent.id,claim);
  if(submitted)await f.rpc('finish_publication_dispatch',{p_owner:f.ownerId,p_intent:intent.id,p_claim:claim,p_state:'submitted',p_run:12345,p_sha:sha});
  const enableApi=()=>f.admin(()=>f.db.exec("create or replace function studio.publication_api_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;"));
  const args=(extra={})=>({p_intent:intent.id,p_run:12345,p_attempt:1,p_sha:sha,p_jti_hash:digest(randomUUID()),p_expires:new Date(Date.now()+300000).toISOString(),p_role:'prepare',p_action:'manifest',p_body_hash:'b'.repeat(64),p_path:null,...extra});
  const sign=async(extra={})=>{
   const second=Math.floor(Date.now()/1000);
   return 'Bearer '+await new SignJWT({iss:trust.issuer,aud:trust.audience,sub:trust.subject,iat:second,nbf:second-5,exp:second+300,jti:randomUUID(),
    repository:trust.repository,repository_id:trust.repositoryId,repository_owner:trust.owner,repository_owner_id:trust.ownerId,
    ref:trust.ref,ref_type:'branch',sha,workflow_ref:trust.workflowRef,workflow_sha:sha,job_workflow_ref:trust.prepareWorkflow,job_workflow_sha:sha,
    run_id:'12345',run_attempt:'1',event_name:'workflow_dispatch',runner_environment:'github-hosted',repository_visibility:'public',...extra}).setProtectedHeader({alg:'RS256',typ:'JWT',kid:jwk.kid}).sign(privateKey);
  };
  const verifyToken=createPublicationTokenVerifier({trustedShas:[sha]},{keyResolver:createLocalJWKSet({keys:[jwk]})});
  const handler=createPublicationHttpHandler({verifyToken,gateway:createPublicationGateway(f.client)});
  const request=async(action,payload={},options={})=>handler(new Request(trust.origin+'/api/publication/'+action,{method:'POST',headers:{'content-type':'application/json',authorization:await sign(),...options.headers},body:JSON.stringify({publicationId:intent.id,payload,...options.body})}),action);
  return {...f,intent,sha,enableApi,args,sign,verifyToken,handler,request};
 }catch(error){await f.db.close();throw error;}
}
