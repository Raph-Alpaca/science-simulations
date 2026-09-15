// Read-only preflight. Never print raw environment, URLs, headers, responses or errors.
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(import.meta.dirname,'../..');
export const NAMES=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','ALLOWED_USER_IDS','STUDIO_ORIGIN','STUDIO_DB_READY'];
export function inspect(values) {
  const present=Object.fromEntries(NAMES.map(name=>[name,typeof values[name]==='string'&&values[name].length>0]));
  let urlValid=false;
  try {const url=new URL(values.SUPABASE_URL);urlValid=url.protocol==='https:'&&/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/';}catch{}
  const ids=(values.ALLOWED_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const format={SUPABASE_URL:urlValid,SUPABASE_PUBLISHABLE_KEY:/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(values.SUPABASE_PUBLISHABLE_KEY||''),SUPABASE_SECRET_KEY:/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(values.SUPABASE_SECRET_KEY||''),ALLOWED_USER_IDS:ids.length>0&&ids.every(x=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x)),STUDIO_ORIGIN:values.STUDIO_ORIGIN==='http://127.0.0.1:3000',STUDIO_DB_READY:values.STUDIO_DB_READY==='false'};
  return {present,format,valid:Object.values(present).every(Boolean)&&Object.values(format).every(Boolean)};
}
export async function probe(values,request=fetch) {
  const result={auth:{status:'not_checked'},teacher:{status:'not_checked'},dataApi:{status:'not_checked'},catalogPermissions:'unverified_without_database_or_management_access'};
  if(!inspect(values).valid)return result;
  const origin=new URL(values.SUPABASE_URL).origin;
  async function get(endpoint,key,extra={}) {
    try {
      const response=await request(origin+endpoint,{method:'GET',redirect:'error',headers:{apikey:key,...extra},signal:AbortSignal.timeout(10000)});
      // Bounded read; no raw response is retained outside this function/caller scope.
      const reader=response.body?.getReader();let bytes=0;const parts=[];
      if(reader)while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024*1024){await reader.cancel();return {status:'response_too_large'};}parts.push(value);}
      let body=null;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{}
      return {status:response.ok?'ok':'http_error',httpStatus:response.status,body};
    }catch{return {status:'network_or_access_unverified'};}
  }
  const auth=await get('/auth/v1/settings',values.SUPABASE_PUBLISHABLE_KEY);
  result.auth={status:auth.status,httpStatus:auth.httpStatus};
  if(auth.status==='ok')result.auth.signupDisabled=typeof auth.body?.disable_signup==='boolean'?auth.body.disable_signup:'unverified';
  // Query only the first configured teacher, never list all users.
  const userId=values.ALLOWED_USER_IDS.split(',')[0].trim();
  const user=await get('/auth/v1/admin/users/'+encodeURIComponent(userId),values.SUPABASE_SECRET_KEY);
  const record=user.body?.user??user.body;
  result.teacher={status:user.status,httpStatus:user.httpStatus,exists:user.status==='ok'&&record?.id===userId};
  if(user.status==='ok')result.teacher.anonymous=typeof record?.is_anonymous==='boolean'?record.is_anonymous:'unverified';
  // OpenAPI metadata only: no table rows and no RPC/SQL execution.
  const api=await get('/rest/v1/',values.SUPABASE_SECRET_KEY,{Accept:'application/openapi+json','Accept-Profile':'studio'});
  result.dataApi={status:api.status,httpStatus:api.httpStatus,studioApiVisible:api.status==='ok'&&api.body?.paths!==undefined};
  if(api.status==='ok')result.dataApi.expectedPaths=Object.fromEntries(['teachers','conversations','messages','jobs','job_events','reviews','approvals','releases'].map(name=>[name,Object.hasOwn(api.body?.paths??{},'/'+name)]));
  else if(/^PGRST\d{3}$/.test(api.body?.code||''))result.dataApi.code=api.body.code;
  return result;
}
async function main() {
  let values;try{values=parseEnv(await fs.readFile(path.join(ROOT,'apps/studio/.env.local'),'utf8'));}catch{console.log(JSON.stringify({status:'ENV_FILE_UNREADABLE'}));process.exitCode=1;return;}
  const report={checkedAt:new Date().toISOString(),environment:inspect(values),dbReadyRemainsFalse:values.STUDIO_DB_READY==='false',codeVariableNamesMatch:false,remote:null};
  const source=await fs.readFile(path.join(ROOT,'apps/studio/lib/config.ts'),'utf8');
  report.codeVariableNamesMatch=NAMES.every(name=>source.includes('process.env.'+name));
  if(report.environment.valid&&report.codeVariableNamesMatch)report.remote=await probe(values);
  const folder=path.join(ROOT,'.local/evidence/studio05');await fs.mkdir(folder,{recursive:true});
  await fs.writeFile(path.join(folder,'connection-preflight.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(!report.environment.valid||!report.codeVariableNamesMatch)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.log(JSON.stringify({status:'PREFLIGHT_UNVERIFIED'}));process.exitCode=1;});
