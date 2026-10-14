import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPublicKey} from 'node:crypto';
import {spawn} from 'node:child_process';
import {jwtVerify} from 'jose';
import {probeAppConnection} from '../../automation/studio/app-connection.mjs';
import {syntheticDispatchEnv} from './github-dispatch-fixture.mjs';

const env={...syntheticDispatchEnv,STUDIO_DISPATCH_ENABLED:'false',STUDIO_INPUT_REVIEW_ENABLED:'false',STUDIO_WORKER_API_ENABLED:'false'};
const expectedSha='a'.repeat(40),base='/repos/Raph-Alpaca/science-simulations';
const owner={id:248908443,login:'Raph-Alpaca',type:'User'},permissions={actions:'write',contents:'read',metadata:'read'};
const publicKey=createPublicKey(env.STUDIO_GITHUB_APP_PRIVATE_KEY);
function provider(change){
 const calls=[];
 return {calls,transport:async(url,options)=>{
  const endpoint=new URL(url).pathname;calls.push({endpoint,method:options.method});
  assert.equal(new URL(url).origin,'https://api.github.com');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.body,undefined);assert.ok(options.signal instanceof AbortSignal);
  if(endpoint==='/app'||endpoint===base+'/installation'){
   const verified=await jwtVerify(options.headers.Authorization.slice(7),publicKey,{algorithms:['RS256'],issuer:env.STUDIO_GITHUB_APP_CLIENT_ID});assert.ok(verified.payload.exp-verified.payload.iat<=600);
  }else assert.equal(options.headers.Authorization,undefined);
  let body;
  if(endpoint==='/app')body={id:42,client_id:env.STUDIO_GITHUB_APP_CLIENT_ID,owner,permissions,events:[]};
  else if(endpoint===base+'/installation')body={id:123,app_id:42,client_id:env.STUDIO_GITHUB_APP_CLIENT_ID,account:owner,target_id:owner.id,target_type:'User',repository_selection:'selected',suspended_at:null,permissions,events:[],repositories_url:'https://invalid.example/secret'};
  else if(endpoint===base)body={id:1368255570,full_name:'Raph-Alpaca/science-simulations',owner,private:false,archived:false,disabled:false,default_branch:'main'};
  else if(endpoint.endsWith('/heads/main'))body={ref:'refs/heads/main',object:{type:'commit',sha:expectedSha}};
  else if(endpoint.endsWith('/studio-worker.yml')||endpoint.endsWith('/studio-publication.yml'))body={id:44,path:'.github/workflows/'+endpoint.split('/').at(-1),state:'active'};
  else assert.fail('Unexpected endpoint');
  const response={body:structuredClone(body),status:200};const changed=change?.(endpoint,response)??response;
  return changed instanceof Response?changed:Response.json(changed.body,{status:changed.status});
 }};
}
const run=p=>probeAppConnection({env,expectedSha,...p});
test('connection metadata is checked with six GETs while production gates stay disabled',async()=>{
 const before=structuredClone(env),p=provider(),result=await run(p);
 assert.equal(result.status,'metadata_verified');assert.equal(result.requests,6);assert.equal(p.calls.length,6);assert.equal(result.executionReady,false);
 assert.ok(result.remaining.includes('installation_repository_count'));assert.ok(result.remaining.includes('actions_oidc_roundtrip'));assert.deepEqual(env,before);
 assert.deepEqual(result.checks,['configuration','app','installation','repository','main','studio-worker.yml','studio-publication.yml']);
 const text=JSON.stringify(result);for(const value of ['PRIVATE KEY',env.STUDIO_GITHUB_APP_CLIENT_ID,'Authorization','invalid.example'])assert.equal(text.includes(value),false);
});
test('missing credentials, malformed installation and unreviewed SHA stop before any request',async()=>{
 for(const changes of [{env:{}},{env:{...env,STUDIO_GITHUB_INSTALLATION_ID:'1/other'}},{env:{...env,STUDIO_GITHUB_APP_PRIVATE_KEY:'private diagnostic'}},{expectedSha:'main'}]){
  const p=provider(),r=await probeAppConnection({env,expectedSha,...p,...changes});assert.equal(r.stage,'configuration');assert.equal(r.status,'blocked');assert.equal(p.calls.length,0);
 }
});
test('wrong App identity, account, permission or event scope cannot reach repository requests',async()=>{
 for(const [stage,mutate] of [
  ['app',v=>{v.client_id='other';}],['app',v=>{v.owner.id=1;}],['app',v=>{v.permissions.administration='write';}],['app',v=>{v.events=['push'];}],
  ['installation',v=>{v.id=124;}],['installation',v=>{v.app_id=9;}],['installation',v=>{v.account.id=1;}],['installation',v=>{v.repository_selection='all';}],['installation',v=>{v.suspended_at='2026-10-14';}],['installation',v=>{v.permissions.contents='write';}],['installation',v=>{v.client_id='other';}]
 ]){
  const p=provider((e,r)=>{if(e===(stage==='app'?'/app':base+'/installation'))mutate(r.body);return r;}),r=await run(p);
  assert.equal(r.status,'blocked');assert.equal(r.stage,stage);assert.ok(p.calls.length<=2);
 }
});
test('repository transfer, private repository, main drift and disabled workflow are rejected',async()=>{
 for(const [endpoint,mutate,stage] of [
  [base,v=>{v.id=1;},'repository'],[base,v=>{v.private=true;},'repository'],[base,v=>{v.owner.id=1;},'repository'],
  [base+'/git/ref/heads/main',v=>{v.object.sha='b'.repeat(40);},'main'],
  [base+'/actions/workflows/studio-worker.yml',v=>{v.state='disabled_manually';},'studio-worker.yml'],
  [base+'/actions/workflows/studio-publication.yml',v=>{v.path='.github/workflows/other.yml';},'studio-publication.yml']
 ]){const p=provider((e,r)=>{if(e===endpoint)mutate(r.body);return r;}),r=await run(p);assert.equal(r.status,'blocked');assert.equal(r.stage,stage);}
});
test('HTTP rejection, redirects, oversized and invalid bodies stop once without revealing upstream data',async()=>{
 for(const response of [new Response('upstream private text',{status:403}),new Response(null,{status:301,headers:{Location:'https://invalid.example'}}),new Response('x'.repeat(131073)),new Response('{bad private JSON')]){
  const p=provider(()=>response),r=await run(p);assert.equal(r.status,'blocked');assert.equal(p.calls.length,1);assert.equal(JSON.stringify(r).includes('private'),false);
 }
});
test('abort bounds stalled transport and stalled body even if provider ignores the signal',async()=>{
 for(const body of [false,true]){
  const controller=new AbortController();let calls=0;
  const transport=async()=>{calls++;setTimeout(()=>controller.abort(),20);return body?new Response(new ReadableStream({start(){},cancel(){}})):new Promise(()=>{});};
  const started=Date.now(),r=await run({transport,signal:controller.signal});assert.equal(r.status,'blocked');assert.equal(calls,1);assert.ok(Date.now()-started<2000);
 }
});
test('already aborted requests neither sign nor contact the provider',async()=>{
 const p=provider(),controller=new AbortController();controller.abort();const r=await run({...p,signal:controller.signal});assert.equal(r.status,'blocked');assert.equal(p.calls.length,0);
});
test('stdin CLI rejects malformed, oversized and extra-field packets without echoing credentials',async()=>{
 for(const input of ['private synthetic invalid input','x'.repeat(32769),JSON.stringify({appClientId:'fake',installationId:'1',privateKey:'DO_NOT_ECHO_THIS',expectedSha,extra:'secret'})]){
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['automation/studio/app-connection-cli.mjs','--stdin'],{stdio:['pipe','pipe','pipe'],windowsHide:true});let stdout='',stderr='';
   child.on('error',reject);child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);child.stdin.on('error',()=>{});
   child.on('exit',code=>resolve({code,stdout,stderr}));child.stdin.end(input);
  });
  assert.equal(result.code,1);assert.equal(result.stderr,'');const report=JSON.parse(result.stdout);assert.equal(report.requests,0);assert.equal(report.executionReady,false);assert.equal(result.stdout.includes('DO_NOT_ECHO'),false);
 }
});
