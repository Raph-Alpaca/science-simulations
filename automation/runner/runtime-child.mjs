// Trusted verifier entry point: source is inert JSON over stdin. Candidate JS
// runs only in the fresh browser, never as Node, shell, npm hooks or tests.
import {prepareRuntimeBundle} from './runtime-contract.mjs';
import {verifyRuntimeBrowser} from './runtime-browser.mjs';
import {runtimeSubmission} from '../../packages/contracts/runtime-report.js';

const controller=new AbortController();process.on('message',message=>{if(message==='cancel')controller.abort();});
process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
let timer;
try{
 const input=await Promise.race([(async()=>{const chunks=[];let bytes=0;for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>2_300_000)throw Error('RUNTIME_PACKET_TOO_LARGE');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');})(),new Promise((_,reject)=>{timer=setTimeout(()=>{process.stdin.destroy();reject(Error('RUNTIME_PACKET_TIMEOUT'));},5000);})]);
 clearTimeout(timer);const packet=JSON.parse(input),bundle=prepareRuntimeBundle(packet);
 const result=await verifyRuntimeBrowser(bundle,{signal:controller.signal,...(process.argv[2]==='--container'?{channel:'chromium'}:{})});
 process.stdout.write(JSON.stringify(runtimeSubmission(result)));
 if(!result.browserStopped)process.exitCode=1;
}catch{process.stderr.write('RUNTIME_CHILD_FAILED\n');process.exitCode=1;}
finally{clearTimeout(timer);if(process.connected)process.disconnect();}
