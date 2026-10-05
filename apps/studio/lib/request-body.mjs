import {StudioError} from './domain.mjs';
// Bound the body stream itself, including clients omitting Content-Length.
export async function studioRequestBody(request,{limit=16000,timeoutMs=5000}={}){
 if(Number(request.headers.get('content-length')||0)>limit)throw new StudioError('REQUEST_TOO_LARGE',413);
 const reader=request.body?.getReader();if(!reader)throw new StudioError('INVALID_REQUEST');let timer;
 try{return await Promise.race([
  new Promise((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new StudioError('REQUEST_TIMEOUT',408));},timeoutMs);}),
  (async()=>{const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){void reader.cancel().catch(()=>{});throw new StudioError('REQUEST_TOO_LARGE',413);}chunks.push(value);}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new StudioError('INVALID_REQUEST');}})(),
 ]);}finally{clearTimeout(timer);try{reader.releaseLock();}catch{}}
}
