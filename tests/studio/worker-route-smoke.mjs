import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

let port;
for(let p=3012;p<=3018;p++){const free=await new Promise(ok=>{const s=net.createServer();s.on('error',()=>ok(false));s.listen(p,'127.0.0.1',()=>s.close(()=>ok(true)));});if(free){port=p;break;}}
assert.ok(port,'NO_LOCAL_SMOKE_PORT');
// Explicitly override dotenv values; this server cannot use production DB keys.
const env={...process.env,STUDIO_WORKER_API_ENABLED:'false',STUDIO_WORKER_TRUSTED_SHAS:'',STUDIO_DB_READY:'false',SUPABASE_URL:'https://disabled.invalid',SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_SECRET_KEY:'',ALLOWED_USER_IDS:'',STUDIO_ORIGIN:'http://127.0.0.1:'+port};
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','apps/studio','--hostname','127.0.0.1','--port',String(port)],{env,windowsHide:true});
const exit=once(child,'exit');let started=false,output='';
const report={startedAt:new Date().toISOString(),port,productionDatabaseDisabled:true};
try{
 await new Promise((ok,fail)=>{
  const timer=setTimeout(()=>fail(Error('SMOKE_START_TIMEOUT')),20000);
  child.stdout.on('data',data=>{output=(output+data).slice(-50000);if(!started&&/Ready in/.test(output)){started=true;clearTimeout(timer);ok();}});
  child.stderr.on('data',()=>{});child.once('error',()=>{clearTimeout(timer);fail(Error('SMOKE_START_FAILED'));});
  child.once('exit',()=>{if(!started){clearTimeout(timer);fail(Error('SMOKE_START_FAILED'));}});
 });
 const url='http://127.0.0.1:'+port+'/api/worker/input';
 const post=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});
 assert.equal(post.status,503);assert.deepEqual(await post.json(),{error:'WORKER_SETUP_REQUIRED'});assert.equal(post.headers.get('cache-control'),'private, no-store');
 const get=await fetch(url,{signal:AbortSignal.timeout(5000)});assert.equal(get.status,405);
 report.result='PASS';report.postStatus=post.status;report.getStatus=get.status;
}catch(error){report.result='FAIL';report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'SMOKE_ASSERTION_FAILED';process.exitCode=1;}
finally{
 if(child.exitCode===null)child.kill();
 let timer;try{await Promise.race([exit,new Promise((_,fail)=>{timer=setTimeout(()=>fail(Error('SMOKE_STOP_TIMEOUT')),5000);})]);report.stopped=true;}catch{report.stopped=false;process.exitCode=1;}finally{clearTimeout(timer);}
 report.finishedAt=new Date().toISOString();const folder=resolve('.local/evidence/worker');await mkdir(folder,{recursive:true});const file=join(folder,'route-smoke-'+randomUUID()+'.json');await writeFile(file,JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,evidence:file}));
}
