// Dedicated probe: public key only, never a candidate, task, token or DB input.
import {chromium} from '@playwright/test';
import {runtimeLaunchOptions} from '../runtime-browser.mjs';
import {startupPublicKey,sealStartupError,assertStartupProbe} from '../startup-diagnostic.mjs';
let browser,stdinTimer,closeTimer;
try{
 const raw=await Promise.race([(async()=>{const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>4096)throw Error();chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');})(),new Promise((_,reject)=>{stdinTimer=setTimeout(()=>{process.stdin.destroy();reject(Error());},5000);})]);
 clearTimeout(stdinTimer);const input=JSON.parse(raw);
 if(!input||Object.keys(input).join(',')!=='publicKey')throw Error();startupPublicKey(input.publicKey);
 const report={mode:'startup-only',started:false,stopped:true,sealed:null};
 try{browser=await chromium.launch(runtimeLaunchOptions({channel:'chromium'}));report.started=true;}
 catch(error){report.sealed=sealStartupError(error,input.publicKey);}
 finally{if(browser)report.stopped=await Promise.race([browser.close().then(()=>true,()=>false),new Promise(ok=>{closeTimer=setTimeout(()=>ok(false),5000);})]);clearTimeout(closeTimer);}
 process.stdout.write(JSON.stringify(assertStartupProbe(report)));
}catch{process.stderr.write('STARTUP_PROBE_FAILED\n');process.exitCode=1;}
finally{clearTimeout(stdinTimer);clearTimeout(closeTimer);}
