// Run only in a disposable verification job without credentials. Local tests
// exercise reviewed fixtures; this module never executes candidate code in Node.
import {chromium} from '@playwright/test';
import {hash} from '../../packages/contracts/content-source.js';
import {RUNTIME_CONTRACT,RuntimeCheckError,runtimeNeed as need,checkRuntimeSource} from './runtime-contract.mjs';
import {browserLaunchIssues} from './runtime-diagnostics.mjs';

const ORIGIN='https://simulation.invalid';
const CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'none'; connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const mime={html:'text/html',js:'text/javascript',css:'text/css',json:'application/json',svg:'image/svg+xml'};
export function browserEnvironment(env){
 const result={};for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','PATH','HOME','USERPROFILE','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)'])if(typeof env[key]==='string')result[key]=env[key];
 return result;
}
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(fn,code){for(let i=0;i<12;i++){if(await fn())return;await wait(100);}throw new RuntimeCheckError(code);}
async function one(page,attribute){const element=page.locator('['+attribute+']');need(await element.count()===1&&await element.isVisible(),'RUNTIME_REQUIRED_CONTROL');return element;}
async function change(control){
 const tag=await control.evaluate(el=>({tag:el.tagName,type:el.type,value:el.value,checked:el.checked,options:el.options?Array.from(el.options).filter(o=>!o.disabled).map(o=>o.value):[]}));
 if(tag.tag==='SELECT'){
  const next=tag.options.find(v=>v!==tag.value);need(next!==undefined,'RUNTIME_CONTROL_NO_RANGE');await control.selectOption(next);
 }else if(tag.tag==='INPUT'&&tag.type==='checkbox')await control.setChecked(!tag.checked);
 else if(tag.tag==='INPUT'&&tag.type==='range'){
  await control.focus();await control.press('End');if(await control.inputValue()===tag.value)await control.press('Home');
  need(await control.inputValue()!==tag.value,'RUNTIME_CONTROL_NO_RANGE');
 }else throw new RuntimeCheckError('RUNTIME_CONTROL_UNSUPPORTED');
 return tag.type==='checkbox'?String(tag.checked):tag.value;
}
const value=async control=>(await control.getAttribute('type'))==='checkbox'?String(await control.isChecked()):control.inputValue();
const shot=async element=>hash(await element.screenshot({animations:'disabled',timeout:3000}));

// A separate JS world prevents the page replacing WebGL/DOM builtins used for
// this observation. This verifies WebGL availability, not scientific validity.
async function webglObservation(context,page){
 const cdp=await context.newCDPSession(page);
 try{
  const {frameTree}=await cdp.send('Page.getFrameTree');
  const {executionContextId}=await cdp.send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'trusted-runtime-observer'});
  const result=await cdp.send('Runtime.evaluate',{contextId:executionContextId,returnByValue:true,expression:`(()=>{const c=document.querySelector('[data-sim-view]');if(!(c instanceof HTMLCanvasElement))return null;const g=c.getContext('webgl2')||c.getContext('webgl');return g?{width:g.drawingBufferWidth,height:g.drawingBufferHeight,lost:g.isContextLost()}:null;})()`});
  return result.result.value;
 }finally{await cdp.detach();}
}
export async function verifyRuntimeBrowser(bundle,{signal,channel='chrome',environment=process.env}={}){
 const started=Date.now(),base={candidateHash:bundle.candidateHash,sourceSnapshotHash:bundle.sourceSnapshotHash,baselineSha:bundle.baselineSha,attempt:bundle.attempt,contractVersion:RUNTIME_CONTRACT.version};
 const result={...base,checks:{contract:'not_run',runtime:'not_run'},checksExecuted:[],issues:[],observations:[],requests:0};
 let browser,timer,closePromise,expired=false,cancelled=signal?.aborted===true;
 const close=()=>browser?(closePromise??=browser.close().then(()=>true,()=>false)):Promise.resolve(true);
 const abort=()=>{cancelled=true;void close();};signal?.addEventListener('abort',abort,{once:true});
 const stop=()=>{need(!cancelled,'RUNTIME_CANCELLED');need(!expired,'RUNTIME_TIME_LIMIT');};
 try{
  stop();
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;void close();reject(new RuntimeCheckError('RUNTIME_TIME_LIMIT'));},RUNTIME_CONTRACT.limits.seconds*1000);});
  async function execute(){
   try{await checkRuntimeSource(bundle.candidate);result.checks.contract='pass';}catch(error){result.checks.contract='fail';throw error;}finally{result.checksExecuted.push('contract');}
   stop();
   try{browser=await chromium.launch({channel,headless:true,chromiumSandbox:true,env:browserEnvironment(environment),timeout:10000,
    args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-pings','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});}
   catch(error){stop();const [code,...markers]=browserLaunchIssues(error);result.issues.push(...markers);throw new RuntimeCheckError(code);}
   stop();result.browserVersion=browser.version();result.checksExecuted.push('runtime');result.checks.runtime='fail';
   const files=new Map(bundle.candidate.files.map(f=>['/'+f.path,f.content]));let requests=0;
   async function scene(width,noWebgl=false){
    stop();const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block',acceptDownloads:false,permissions:[],offline:true});
    const faults=new Set();let page;
    try{
     await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());requests++;result.requests=Math.min(requests,201);
      if(requests>RUNTIME_CONTRACT.limits.requests){faults.add('RUNTIME_REQUEST_LIMIT');return route.abort();}
      if(url.origin!==ORIGIN||req.method()!=='GET'||url.search||!files.has(url.pathname)||
       (req.isNavigationRequest()&&(req.frame()!==page?.mainFrame()||url.pathname!=='/'+bundle.candidate.meta.entry))){faults.add('RUNTIME_NETWORK_OR_ASSET_REJECTED');return route.abort();}
      return route.fulfill({status:200,body:files.get(url.pathname),contentType:(mime[url.pathname.split('.').pop()]||'application/octet-stream')+'; charset=utf-8',headers:{'Content-Security-Policy':CSP,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()'}});
     });
     await context.routeWebSocket('**/*',ws=>{faults.add('RUNTIME_WEBSOCKET_REJECTED');ws.close();});
     context.on('page',p=>{if(page&&p!==page){faults.add('RUNTIME_POPUP_REJECTED');void p.close();}});
     page=await context.newPage();page.setDefaultTimeout(3000);page.setDefaultNavigationTimeout(5000);
     page.on('pageerror',()=>faults.add('RUNTIME_PAGE_ERROR'));page.on('crash',()=>faults.add('RUNTIME_PAGE_CRASH'));
     page.on('console',msg=>{if(msg.type()==='error')faults.add('RUNTIME_CONSOLE_ERROR');});
     page.on('dialog',dialog=>{faults.add('RUNTIME_DIALOG_REJECTED');void dialog.dismiss();});
     page.on('download',download=>{faults.add('RUNTIME_DOWNLOAD_REJECTED');void download.cancel();});
     if(noWebgl)await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /^webgl|^experimental-webgl/.test(type)?null:original.call(this,type,...args);};});
     await page.goto(ORIGIN+'/'+bundle.candidate.meta.entry,{waitUntil:'load'});await wait(100);stop();
     if(noWebgl){
      const alternative=await one(page,'data-sim-alternative');need((await alternative.innerText()).trim().length>=10,'RUNTIME_ALTERNATIVE_EMPTY');
      need(!faults.size,[...faults][0]);result.observations.push({width,webglUnavailable:true,alternativeVisible:true});return;
     }
     const view=await one(page,'data-sim-view'),control=await one(page,'data-sim-control'),output=await one(page,'data-sim-output'),reset=await one(page,'data-sim-reset'),assumptions=await one(page,'data-sim-assumptions');
     const box=await view.boundingBox();need(box&&box.width>=160&&box.height>=100,'RUNTIME_VIEW_TOO_SMALL');
     need(['CANVAS','svg'].includes(await view.evaluate(el=>el.tagName)),'RUNTIME_VIEW_TYPE');
     need((await assumptions.innerText()).trim().length>=10,'RUNTIME_ASSUMPTIONS_EMPTY');
     need(await control.evaluate(el=>!!(el.labels?.length||el.getAttribute('aria-label')?.trim()||el.getAttribute('aria-labelledby'))),'RUNTIME_CONTROL_LABEL');
     const before={value:await value(control),output:(await output.innerText()).trim(),image:await shot(view)};need(before.output.length>0,'RUNTIME_OUTPUT_EMPTY');
     await change(control);await until(async()=>(await output.innerText()).trim()!==before.output,'RUNTIME_OUTPUT_UNCHANGED');
     const after=await shot(view);need(after!==before.image,'RUNTIME_VIEW_UNCHANGED');
     await reset.click();await until(async()=>await value(control)===before.value&&(await output.innerText()).trim()===before.output,'RUNTIME_RESET_FAILED');
     need(await shot(view)===before.image,'RUNTIME_RESET_VIEW_FAILED');
     const observed={width,controlChanged:true,outputChanged:true,viewChanged:true,resetRestored:true,initialViewHash:before.image,changedViewHash:after};
     if(bundle.generationKind==='interactive_3d'){
      const gl=await webglObservation(context,page);need(gl&&!gl.lost&&gl.width>0&&gl.height>0,'RUNTIME_WEBGL_REQUIRED');
      const camera=await one(page,'data-sim-camera');await change(camera);need(await shot(view)!==before.image,'RUNTIME_CAMERA_UNCHANGED');
      const fallback=await one(page,'data-sim-fallback');await fallback.click();const alternative=await one(page,'data-sim-alternative');need((await alternative.innerText()).trim().length>=10,'RUNTIME_ALTERNATIVE_EMPTY');
      observed.webgl=gl;observed.cameraChanged=true;observed.alternativeVisible=true;
     }
     need(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'RUNTIME_HORIZONTAL_OVERFLOW');
     need(page.url()===ORIGIN+'/'+bundle.candidate.meta.entry,'RUNTIME_NAVIGATION_REJECTED');need(!faults.size,[...faults][0]);
     result.observations.push(observed);
    }finally{await context.close();}
   }
   for(const width of RUNTIME_CONTRACT.limits.viewports)await scene(width);
   if(bundle.generationKind==='interactive_3d')await scene(390,true);
   stop();result.requests=requests;result.checks.runtime='pass';
  }
  await Promise.race([execute(),timeout]);
 }catch(error){result.issues.push(error instanceof RuntimeCheckError?error.code:cancelled?'RUNTIME_CANCELLED':expired?'RUNTIME_TIME_LIMIT':'RUNTIME_BROWSER_FAILED');}
 finally{
  clearTimeout(timer);signal?.removeEventListener('abort',abort);let closeTimer;
  result.browserStopped=await Promise.race([close(),new Promise(ok=>{closeTimer=setTimeout(()=>ok(false),5000);})]);clearTimeout(closeTimer);
  if(!result.browserStopped){if(result.checks.runtime==='pass')result.checks.runtime='fail';result.issues.push('RUNTIME_BROWSER_STOP_UNVERIFIED');}
  if(cancelled){if(result.checks.runtime==='pass')result.checks.runtime='fail';if(!result.issues.includes('RUNTIME_CANCELLED'))result.issues.push('RUNTIME_CANCELLED');}
  result.durationMs=Date.now()-started;
 }
 return result;
}
