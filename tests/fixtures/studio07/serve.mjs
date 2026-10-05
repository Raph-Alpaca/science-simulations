// Explicit local-only UI fixture proxy. Never deployed, never reads .env, never uses real Auth/DB.
import http from 'node:http';import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {requestEnvelope,conversationTitle,mockNext,retryAllowed} from '../../../apps/studio/lib/domain.mjs';
const origin='http://127.0.0.1:3002',upstream='http://127.0.0.1:3003';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','apps/studio','--hostname','127.0.0.1','--port','3003'],{windowsHide:true,stdio:'ignore',env:{...process.env,SUPABASE_URL:'',SUPABASE_SECRET_KEY:'',SUPABASE_PUBLISHABLE_KEY:'',ALLOWED_USER_IDS:'',STUDIO_DB_READY:'false',STUDIO_ORIGIN:'',NEXT_TELEMETRY_DISABLED:'1'}});
child.on('error',()=>{console.error('FIXTURE_SERVER_FAILED');process.exitCode=1;});
const conversations=[],jobs=[],messages=[],events=[],receipts=new Map();
const server=http.createServer(async(req,res)=>{
 const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store'});res.end(JSON.stringify(body));};
 try{
 if(req.headers.host!=='127.0.0.1:3002')return json(403,{error:'INVALID_ORIGIN'});
 const path=new URL(req.url,origin).pathname;
 if(!path.startsWith('/api/studio/')){
  const r=await fetch(upstream+req.url,{signal:AbortSignal.timeout(10000)});res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')||'text/plain','Cache-Control':'no-store'});res.end(Buffer.from(await r.arrayBuffer()));return;
 }
 if(req.method!=='GET'&&req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});
 if(req.method==='POST'&&req.headers.origin!==origin)return json(403,{error:'INVALID_ORIGIN'});
 let body; if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)return json(413,{error:'REQUEST_TOO_LARGE'});}body=JSON.parse(raw);}
 const parts=path.slice('/api/studio/'.length).split('/');
 if(parts[0]==='session')return json(200,{authenticated:true,fixture:true,executionMode:'mock',capabilities:{requestV2:true,conversationEditing:true}});
 if(parts[0]==='logout')return json(200,{authenticated:false,remoteSignOut:'unconfirmed'});
 if(parts[0]==='conversations'&&parts.length===1){
  if(!body)return json(200,{conversations});
  const title=conversationTitle(body.title);if(receipts.has(body.clientRequestId))return json(200,receipts.get(body.clientRequestId));
  const conversation={id:randomUUID(),title,created_at:new Date().toISOString()};conversations.unshift(conversation);const result={conversation};receipts.set(body.clientRequestId,result);return json(200,result);
 }
 if(parts[0]==='conversations'){
  const c=conversations.find(c=>c.id===parts[1]);if(!c)return json(404,{error:'NOT_FOUND'});
  if(parts[2]==='rename'){c.title=conversationTitle(body.title);return json(200,{conversation:c});}
  if(parts[2]==='delete'){
   if(jobs.some(j=>j.conversation_id===c.id&&['queued','running','cancel_requested'].includes(j.state)))return json(409,{error:'CONVERSATION_BUSY'});
   conversations.splice(conversations.indexOf(c),1);for(let i=messages.length-1;i>=0;i--)if(messages[i].conversation_id===c.id)messages.splice(i,1);return json(200,{});
  }
  return json(200,{conversation:c,messages:messages.filter(m=>m.conversation_id===c.id),jobs:jobs.filter(j=>j.conversation_id===c.id)});
 }
 if(parts[0]==='jobs'&&parts.length===1){
  const env=requestEnvelope(body);if(!conversations.some(c=>c.id===env.conversationId))return json(404,{error:'NOT_FOUND'});
  if(receipts.has(env.clientRequestId))return json(200,receipts.get(env.clientRequestId));
  if(jobs.some(j=>['queued','running','cancel_requested'].includes(j.state)))return json(409,{error:'STATE_CONFLICT'});
  const job={id:randomUUID(),conversation_id:env.conversationId,state:'queued',phase:null,state_version:0,run_attempt:1,execution_mode:'mock',error_code:null,target_content_id:null,request_snapshot:env};job.run_id='mock:'+job.id;jobs.unshift(job);messages.push({id:randomUUID(),conversation_id:env.conversationId,body:env.payload.requirements});const result={job};receipts.set(env.clientRequestId,result);return json(200,result);
 }
 if(parts[0]==='jobs'){
  const job=jobs.find(j=>j.id===parts[1]);if(!job||!conversations.some(c=>c.id===job.conversation_id))return json(404,{error:'NOT_FOUND'});
  if(parts[2]==='commands'){
   if(body.command==='retry'){retryAllowed(job,body.expectedStateVersion);return json(409,{error:'RETRY_NOT_ALLOWED'});}
   const next=mockNext(job,body.command,body.expectedStateVersion);Object.assign(job,{state:next.state,phase:next.phase,error_code:next.errorCode,state_version:next.stateVersion});events.push({id:randomUUID(),job_id:job.id,sequence:events.length,to_state:job.state,phase:job.phase,occurred_at:new Date().toISOString()});return json(200,{job});
  }
  return json(200,{job,events:events.filter(e=>e.job_id===job.id)});
 }
 json(404,{error:'NOT_FOUND'});
 }catch(e){json(e.status||400,{error:e.code||'FIXTURE_ERROR'});}
});
server.listen(3002,'127.0.0.1',()=>console.log('LOCAL FIXTURE ONLY http://127.0.0.1:3002/'));
server.on('error',()=>{child.kill();process.exitCode=1;});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{server.close();child.kill();});
process.on('exit',()=>child.kill());
