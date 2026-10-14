import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {PUBLICATION_TRUST as trust,PublicationAuthError,publicationTrustConfig,createPublicationTokenVerifier} from '../../apps/studio/lib/publication-auth.mjs';
import {WORKER_TRUST,createWorkerTokenVerifier,githubKeyResolver} from '../../apps/studio/lib/worker-auth.mjs';
const now=new Date('2026-10-14T00:00:00Z'),second=now.getTime()/1000,sha='a'.repeat(40);
const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk={...await exportJWK(publicKey),kid:'synthetic-publication-key',alg:'RS256',use:'sig'};
const config=publicationTrustConfig({STUDIO_PUBLICATION_API_ENABLED:'true',STUDIO_PUBLICATION_TRUSTED_SHAS:sha});
const options={keyResolver:createLocalJWKSet({keys:[jwk]}),now:()=>now};
const verify=createPublicationTokenVerifier(config,options);
const claims=()=>({iss:trust.issuer,aud:trust.audience,sub:trust.subject,iat:second,nbf:second-5,exp:second+300,jti:randomUUID(),
 repository:trust.repository,repository_id:trust.repositoryId,repository_owner:trust.owner,repository_owner_id:trust.ownerId,
 ref:trust.ref,ref_type:'branch',sha,workflow_ref:trust.workflowRef,workflow_sha:sha,job_workflow_ref:trust.prepareWorkflow,job_workflow_sha:sha,
 run_id:'12345',run_attempt:'1',event_name:'workflow_dispatch',runner_environment:'github-hosted',repository_visibility:'public'});
const sign=async(extra={},header={})=>'Bearer '+await new SignJWT({...claims(),...extra}).setProtectedHeader({alg:'RS256',typ:'JWT',kid:jwk.kid,...header}).sign(privateKey);
const rejected=e=>e instanceof PublicationAuthError&&e.status>=401;

test('publication RSA identity separates preparation, reporting and environment-bound deployment',async()=>{
 for(const [role,extra] of [['prepare',{}],['report',{job_workflow_ref:trust.reportWorkflow}],['deploy',{job_workflow_ref:trust.deployWorkflow,environment:'github-pages',sub:trust.deploySubject}]]){
  const token=await sign(extra),identity=await verify(token);
  assert.equal(identity.purpose,'publication');assert.equal(identity.role,role);assert.equal(identity.runId,12345);assert.equal(identity.repositoryId,1368255570);assert.equal(identity.workflowSha,sha);
  assert.match(identity.jtiHash,/^[a-f0-9]{64}$/);assert.ok(Object.isFrozen(identity));assert.ok(!JSON.stringify(identity).includes(token));
 }
});

test('publication activation and reviewed versions are independent from generation and dispatch switches',()=>{
 for(const env of [{},{STUDIO_WORKER_API_ENABLED:'true',STUDIO_WORKER_TRUSTED_SHAS:sha},{STUDIO_PUBLICATION_DISPATCH_ENABLED:'true',STUDIO_PUBLICATION_TRUSTED_SHAS:sha}])assert.throws(()=>publicationTrustConfig(env),/PUBLICATION_SETUP_REQUIRED/);
 for(const value of ['', 'main',sha+','+sha,[sha,'b'.repeat(40),'c'.repeat(40)].join(',')])assert.throws(()=>publicationTrustConfig({STUDIO_PUBLICATION_API_ENABLED:'true',STUDIO_PUBLICATION_TRUSTED_SHAS:value}));
 assert.throws(()=>createPublicationTokenVerifier({trustedShas:[sha,sha]},options));
});

test('generation and publication tokens cannot cross authentication boundaries',async()=>{
 const worker=createWorkerTokenVerifier({trustedShas:[sha]},options);
 await assert.rejects(async()=>worker(await sign()),/WORKER_TOKEN_REJECTED/);
 const generation={aud:WORKER_TRUST.audience,workflow_ref:WORKER_TRUST.workflowRef,job_workflow_ref:WORKER_TRUST.generationWorkflow};
 await assert.rejects(async()=>verify(await sign(generation)),rejected);
 await assert.rejects(async()=>verify(await sign({...generation,aud:trust.audience})),rejected);
 await assert.rejects(async()=>verify(await sign({job_workflow_ref:WORKER_TRUST.reportWorkflow})),rejected);
});

test('deployment requires the exact environment subject; other roles cannot use its environment',async()=>{
 for(const extra of [
  {job_workflow_ref:trust.deployWorkflow},{job_workflow_ref:trust.deployWorkflow,environment:'production',sub:trust.deploySubject},
  {job_workflow_ref:trust.deployWorkflow,environment:'github-pages'},
  {environment:'github-pages',sub:trust.deploySubject},{job_workflow_ref:trust.reportWorkflow,environment:'github-pages',sub:trust.deploySubject},
  {sub:'repo:Raph-Alpaca/science-simulations:ref:refs/heads/main'}
 ])await assert.rejects(async()=>verify(await sign(extra)),rejected);
});

test('unreviewed workflows, forks, pull requests, reruns and oversized run identifiers fail closed',async()=>{
 for(const extra of [{repository_id:'1'},{repository_owner_id:'1'},{repository:'attacker/fork'},{repository_owner:'attacker'},
  {ref:'refs/heads/other'},{ref_type:'tag'},{event_name:'pull_request_target'},{runner_environment:'self-hosted'},{repository_visibility:'private'},
  {head_ref:'other'},{base_ref:'main'},{workflow_ref:WORKER_TRUST.workflowRef},{job_workflow_ref:trust.workflowRef},
  {workflow_sha:'b'.repeat(40)},{job_workflow_sha:'b'.repeat(40)},{sha:'b'.repeat(40)},{run_attempt:'2'},{run_id:'9007199254740993'},
 ])await assert.rejects(async()=>verify(await sign(extra)),rejected);
});

test('signature, age, audience and protected header must verify before any identity is accepted',async()=>{
 for(const extra of [{exp:second-10},{iat:second-130},{iat:second+30},{nbf:second+30},{exp:second+1201},{jti:null},{iss:'https://attacker.invalid'},{aud:[trust.audience]},{aud:WORKER_TRUST.audience}])await assert.rejects(async()=>verify(await sign(extra)),rejected);
 const parts=(await sign()).slice(7).split('.');parts[1]=Buffer.from(JSON.stringify({...claims(),run_id:'54321'})).toString('base64url');await assert.rejects(()=>verify('Bearer '+parts.join('.')),rejected);
 let lookups=0;const noHeaderKeys=createPublicationTokenVerifier(config,{keyResolver:()=>{lookups++;throw Error('SHOULD_NOT_LOOK_UP');},now:()=>now});
 for(const header of [{jku:'https://attacker.invalid/jwks'},{jwk},{x5u:'https://attacker.invalid/key'},{typ:'OTHER'}])await assert.rejects(async()=>noHeaderKeys(await sign({},header)),rejected);
 const hmac='Bearer '+await new SignJWT(claims()).setProtectedHeader({alg:'HS256',typ:'JWT',kid:jwk.kid}).sign(new TextEncoder().encode('synthetic-key'.repeat(4)));
 await assert.rejects(()=>noHeaderKeys(hmac),rejected);assert.equal(lookups,0);
 await assert.rejects(()=>verify('Bearer '+'x'.repeat(21000)),/PUBLICATION_AUTH_REQUIRED/);
});

test('fixed shared JWKS resolver caches keys and exposes only publication-safe errors',async()=>{
 let calls=0;const resolver=githubKeyResolver(async(url,init)=>{calls++;assert.equal(url,trust.jwks);assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).has('authorization'),false);return Response.json({keys:[jwk]});});
 const online=createPublicationTokenVerifier(config,{keyResolver:resolver,now:()=>now});await online(await sign());await online(await sign());assert.equal(calls,1);
 const bad=createPublicationTokenVerifier(config,{keyResolver:githubKeyResolver(async()=>{throw Error('synthetic-private-message');}),now:()=>now});
 await assert.rejects(async()=>bad(await sign()),e=>e.code==='PUBLICATION_JWKS_UNAVAILABLE'&&e.status===503&&!e.message.includes('synthetic'));
});
