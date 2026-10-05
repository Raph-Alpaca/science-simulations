import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {hash} from '../../automation/catalog/content.mjs';
export async function workerFixture({legacy=false,auth=false}={}){
 const db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;");
  const rpc=async(name,params)=>(await db.query('select studio.'+name+'('+Object.keys(params).map((k,i)=>k+'=> $'+(i+1)).join(',')+') value',Object.values(params))).rows[0].value;
  let preserved;
  for(const name of ['studio_v1','studio_v2','studio_budget_v1','studio_worker_v1']){
   if(legacy&&name==='studio_worker_v1'){
    const ownerId=randomUUID();await db.query('insert into auth.users values($1)',[ownerId]);await db.query('insert into studio.teachers values($1,true)',[ownerId]);
    await db.exec('set role service_role');
    const conversation=await rpc('new_conversation_v2',{p_owner:ownerId,p_title:'Pre-worker mock',p_request:randomUUID()});
    const job=await rpc('submit_job_v2',{p_owner:ownerId,p_conversation:conversation.id,p_client_request:randomUUID(),p_hash:'a'.repeat(64),p_snapshot:{schemaVersion:2,payload:{requirements:'Preserve this synthetic pre-migration request.'}},p_job:randomUUID(),p_idempotency:randomUUID()});
    const before=(await db.query('select row_to_json(j) value from studio.jobs j where id=$1',[job.id])).rows[0].value;
    preserved={ownerId,jobId:job.id,before};await db.exec('reset role');
   }
   await db.exec(readFileSync('supabase/proposals/'+name+'.sql','utf8'));
  }
  if(preserved)preserved.after=(await db.query('select row_to_json(j) value from studio.jobs j where id=$1',[preserved.jobId])).rows[0].value;
  if(auth)await db.exec(readFileSync('supabase/proposals/studio_worker_auth_v1.sql','utf8'));
  const ownerId=randomUUID();await db.query('insert into auth.users values($1)',[ownerId]);await db.query('insert into studio.teachers values($1,true)',[ownerId]);
  await db.exec('set role service_role');
  const conversation=await rpc('new_conversation_v2',{p_owner:ownerId,p_title:'Synthetic worker fixture',p_request:randomUUID()});
  const meta=JSON.parse(readFileSync('content/simulations/mendel-inheritance/meta.json','utf8'));
  const input={generationKind:'interactive_3d',requirements:[{id:'R1',text:'Synthetic fixture only, no real curriculum review.'}]};
  const context={contentId:meta.id,grade:3,unit:meta.unit,schoolYear:null,curriculumRevision:null,config:JSON.parse(readFileSync('config/catalog.json','utf8')),sources:meta.sourceIds.map(id=>({id}))};
  const inputText=JSON.stringify({input,context}),sourceSnapshotHash=hash(inputText);
  const submission={p_owner:ownerId,p_conversation:conversation.id,p_client:randomUUID(),p_job:randomUUID(),p_idempotency:randomUUID(),p_request:{schemaVersion:2,payload:{requirements:'Synthetic fixture only.'}},p_input:inputText,p_hash:sourceSnapshotHash,p_input_review:randomUUID()};
  const identity={p_job:submission.p_job,p_run:101,p_attempt:1},jobId=identity.p_job;
  const enable=()=>db.exec("reset role;create or replace function studio.worker_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;update studio.budget_policy set enabled=true;set role service_role;");
  const submit=()=>rpc('submit_worker_job',submission);
  const bind=()=>rpc('bind_worker_run',identity);
  const claim=()=>rpc('claim_worker_run',{...identity,p_hash:sourceSnapshotHash});
  const checkpoint=()=>rpc('worker_checkpoint',{...identity,p_hash:sourceSnapshotHash});
  const append=(body,event=randomUUID())=>{const text=JSON.stringify({jobId,sourceSnapshotHash,...body});return rpc('append_worker_evidence',{...identity,p_hash:sourceSnapshotHash,p_event:event,p_body:text,p_body_hash:hash(text)});};
  const finish=(outcome='needs_input',candidate=null,reason='FIXTURE_HOLD')=>rpc('finish_worker_run',{...identity,p_outcome:outcome,p_candidate:candidate,p_reason:reason});
  const client={schema(schema){assert.equal(schema,'studio');return {
   rpc(name,params){return {async abortSignal(signal){assert.ok(signal instanceof AbortSignal);try{return {data:await rpc(name,params),error:null};}catch(error){return {data:null,error};}}};},
   from(table){
    assert.ok(['worker_runs','worker_evidence','budget_calls','jobs'].includes(table));
    let fields,field,id,order='',limit='',single=false;
    const query={select(value){assert.match(value,/^[a-z_]+(?:,[a-z_]+)*$/);fields=value;return query;},
     eq(key,value){assert.ok(['job_id','call_id','id'].includes(key));field=key;id=value;return query;},
     order(key,{ascending}){assert.equal(key,'sequence');order=' order by sequence '+(ascending?'asc':'desc');return query;},
     limit(value){assert.ok(Number.isInteger(value)&&value>0&&value<=40);limit=' limit '+value;return query;},
     maybeSingle(){single=true;return query;},
     async abortSignal(signal){assert.ok(signal instanceof AbortSignal);try{const rows=(await db.query('select '+fields+' from studio.'+table+' where '+field+'=$1'+order+limit,[id])).rows;return {data:single?rows[0]??null:rows,error:null};}catch(error){return {data:null,error};}}};
    return query;
   },
  };}};
  return {db,rpc,ownerId,jobId,meta,input,context,sourceSnapshotHash,submission,identity,enable,submit,bind,claim,checkpoint,append,finish,client,preserved};
 }catch(error){await db.close();throw error;}
}
