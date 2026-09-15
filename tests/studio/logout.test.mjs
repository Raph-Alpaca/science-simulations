import test from 'node:test';
import assert from 'node:assert/strict';
import {logoutConfig, logoutCurrentBrowser, projectAuthCookie} from '../../apps/studio/lib/logout.mjs';

const config=logoutConfig({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',STUDIO_ORIGIN:'http://127.0.0.1:3000'});
function store(names) {
  const values=new Map(names.map(name=>[name,'fixture-only'])); const deleted=[];
  return {values,deleted,getAll:()=>[...values].map(([name,value])=>({name,value})),set:(name,value,options)=>{if(options.maxAge===0){values.delete(name);deleted.push(name);}else values.set(name,value);}};
}
test('logout configuration does not require teacher allowlist, active status, DB ready or secret',()=>{
  assert.equal(config.storageKey,'sb-fixture-auth-token');
  assert.throws(()=>logoutConfig({}),{code:'SETUP_REQUIRED'});
});
test('only exact project auth cookie names and chunks are selected',()=>{
  for(const suffix of ['', '.0','.12','-user','-code-verifier','.bad','-other'])
    assert.equal(projectAuthCookie(config.storageKey+suffix,config.storageKey),!['.bad','-other'].includes(suffix));
  assert.equal(projectAuthCookie('sb-other-auth-token.0',config.storageKey),false);
});
test('absent session is idempotent and never calls Auth or clears unrelated cookies',async()=>{
  const s=store(['theme','sb-other-auth-token']);
  for(let i=0;i<2;i++)assert.deepEqual(await logoutCurrentBrowser(config,s,()=>{throw Error('must not call');}),{authenticated:false,localSessionCleared:true,remoteSignOut:'not_required'});
  assert.equal(s.values.size,2);
});
test('normal and revoked teachers use the same local-only SDK logout without authorization lookup',async()=>{
  const s=store([config.storageKey+'.0',config.storageKey+'.1','theme','sb-other-auth-token']);
  const create=(_url,_key,options)=>({auth:{signOut:async input=>{
    assert.deepEqual(input,{scope:'local'});
    assert.equal(options.cookies.getAll().length,2);
    await options.global.fetch(config.url+'/auth/v1/logout?scope=local',{method:'POST'});
    return {error:null};
  }}});
  const result=await logoutCurrentBrowser(config,s,create,async()=>new Response(null,{status:204}));
  assert.equal(result.remoteSignOut,'confirmed');assert.equal(s.values.size,2);
  assert.deepEqual(s.deleted.sort(),[config.storageKey+'.0',config.storageKey+'.1']);
});
for(const kind of ['network','sdk-ignored-expired','malformed-session'])test(`simulated ${kind} still clears own cookies without claiming remote success`,async()=>{
  const s=store([config.storageKey,'theme']);
  const create=(_url,_key,options)=>({auth:{signOut:async()=>{
    if(kind==='malformed-session')throw Error('fixture internal error');
    await options.global.fetch(config.url+'/auth/v1/logout?scope=local',{method:'POST'});
    return {error:null};
  }}});
  const result=await logoutCurrentBrowser(config,s,create,async()=>{if(kind==='network')throw TypeError('fixture fetch failed');return new Response(null,{status:401});});
  assert.deepEqual(result,{authenticated:false,localSessionCleared:true,remoteSignOut:'unconfirmed'});
  assert.deepEqual([...s.values.keys()],['theme']);
});
