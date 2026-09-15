import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspect,probe,NAMES} from '../../automation/studio/preflight.mjs';
const teacher='00000000-0000-4000-8000-000000000001';
const values=()=>({SUPABASE_URL:'https://'+'x'.repeat(20)+'.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_'+'x'.repeat(30),SUPABASE_SECRET_KEY:'sb_secret_'+'y'.repeat(30),ALLOWED_USER_IDS:teacher,STUDIO_ORIGIN:'http://127.0.0.1:3000',STUDIO_DB_READY:'false'});
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('preflight rejects missing or unsafe settings before any network call',async()=>{
  const base=values();assert.equal(inspect(base).valid,true);
  const bad=NAMES.map(name=>({...base,[name]:''}));
  for(const url of ['http://example.com','https://example.com',base.SUPABASE_URL+':8443',base.SUPABASE_URL+'/?key=hidden'])bad.push({...base,SUPABASE_URL:url});
  bad.push({...base,STUDIO_DB_READY:'true'},{...base,ALLOWED_USER_IDS:'not-a-uuid'});
  let calls=0;
  for(const env of bad){assert.equal(inspect(env).valid,false);await probe(env,async()=>{calls++;throw Error('must not call');});}
  assert.equal(calls,0);
});
test('preflight uses only three bounded GETs and looks up one allowed teacher without emitting identities or secrets',async()=>{
  const env=values();env.ALLOWED_USER_IDS+=',00000000-0000-4000-8000-000000000002';
  const paths=[];
  const result=await probe(env,async(url,options)=>{
    const path=new URL(url).pathname;paths.push(path);
    assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
    assert.equal(options.body,undefined);assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization,undefined);
    assert.equal(options.headers.apikey,path==='/auth/v1/settings'?env.SUPABASE_PUBLISHABLE_KEY:env.SUPABASE_SECRET_KEY);
    if(path==='/auth/v1/settings')return reply({disable_signup:true,secret:env.SUPABASE_SECRET_KEY});
    if(path==='/auth/v1/admin/users/'+teacher)return reply({id:teacher,is_anonymous:false,email:'private-detail-sentinel'});
    assert.equal(options.headers['Accept-Profile'],'studio');
    return reply({code:'PGRST106',message:'private-detail-sentinel',details:env.SUPABASE_URL},406);
  });
  assert.deepEqual(paths,['/auth/v1/settings','/auth/v1/admin/users/'+teacher,'/rest/v1/']);
  assert.equal(result.auth.signupDisabled,true);assert.equal(result.teacher.exists,true);
  assert.equal(result.dataApi.code,'PGRST106');
  assert.equal(result.catalogPermissions,'unverified_without_database_or_management_access');
  const output=JSON.stringify(result);
  for(const sensitive of [teacher,env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,env.SUPABASE_PUBLISHABLE_KEY,'private-detail-sentinel'])assert.equal(output.includes(sensitive),false);
});
test('network and oversized responses stay unverified and discard raw error text',async()=>{
  const result=await probe(values(),async()=>{throw Error('private-detail-sentinel');});
  assert.equal(result.teacher.status,'network_or_access_unverified');
  assert.equal(JSON.stringify(result).includes('private-detail-sentinel'),false);
  const oversized=await probe(values(),async()=>new Response('x'.repeat(1024*1024+1)));
  assert.equal(oversized.auth.status,'response_too_large');assert.equal(oversized.teacher.exists,false);
});
