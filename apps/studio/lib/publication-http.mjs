import {createHash} from 'node:crypto';
import {PublicationAuthError,PUBLICATION_TRUST} from './publication-auth.mjs';
import {LIMITS} from '../../../packages/contracts/content-source.js';

export const PUBLICATION_BODY_LIMIT=4096;
export const publicationNeed=(value,code='PUBLICATION_REQUEST_INVALID',status=400)=>{if(!value)throw new PublicationAuthError(code,status);};
export const publicationHash=value=>createHash('sha256').update(value).digest('hex');
export const publicationUuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export const publicationSha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const publicationExact=(value,keys)=>publicationNeed(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','));
export const publicationPath=value=>typeof value==='string'&&value.length<=200&&value.split('/').length<=LIMITS.depth+1&&value.split('/').every(p=>/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(p)&&!/[. ]$/.test(p)&&!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
export const publicationResponse=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
async function bodyText(request){
 publicationNeed(request.headers.get('content-type')?.split(';')[0].trim()==='application/json'&&!request.headers.has('content-encoding'));
 const length=request.headers.get('content-length');publicationNeed(length===null||/^\d+$/.test(length)&&Number(length)<=PUBLICATION_BODY_LIMIT,'PUBLICATION_REQUEST_TOO_LARGE',413);
 const reader=request.body?.getReader();publicationNeed(reader);const chunks=[];let bytes=0,timer;
 try{return await Promise.race([
  new Promise((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new PublicationAuthError('PUBLICATION_BODY_TIMEOUT',408));},5000);}),
  (async()=>{while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>PUBLICATION_BODY_LIMIT){void reader.cancel().catch(()=>{});throw new PublicationAuthError('PUBLICATION_REQUEST_TOO_LARGE',413);}chunks.push(r.value);}try{return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}catch{throw new PublicationAuthError('PUBLICATION_REQUEST_INVALID',400);}})(),
 ]);}finally{clearTimeout(timer);try{reader.releaseLock();}catch{/* The timed-out pending read is cancelled. */}}
}
export function createPublicationHttpHandler({verifyToken,gateway}){
 return async(request,action)=>{
  try{
   publicationNeed(request.method==='POST','METHOD_NOT_ALLOWED',405);
   const url=new URL(request.url);publicationNeed(url.origin===PUBLICATION_TRUST.origin&&url.pathname==='/api/publication/'+action&&!url.search&&!url.hash,'PUBLICATION_ORIGIN_REJECTED',403);
   publicationNeed(!request.headers.has('cookie')&&!request.headers.has('origin'),'PUBLICATION_BROWSER_REJECTED',403);
   const identity=await verifyToken(request.headers.get('authorization'));
   publicationNeed(identity.purpose==='publication'&&identity.role==='prepare','PUBLICATION_ROLE_REJECTED',403);
   publicationNeed(['manifest','file'].includes(action),'PUBLICATION_ACTION_REJECTED',404);
   const text=await bodyText(request);let body;try{body=JSON.parse(text);}catch{throw new PublicationAuthError('PUBLICATION_REQUEST_INVALID',400);}
   publicationExact(body,['publicationId','payload']);publicationNeed(publicationUuid(body.publicationId));
   publicationExact(body.payload,action==='file'?['path']:[]);if(action==='file')publicationNeed(publicationPath(body.payload.path));
   const data=await gateway.read({identity,publicationId:body.publicationId,action,bodyHash:publicationHash(text),path:body.payload.path??null});
   // Each response carries at most one 2 MiB file as base64, below the host's
   // 4.5 MB payload limit. Full private snapshots never leave the gateway.
   publicationNeed(Buffer.byteLength(JSON.stringify(data))<=3_000_000,'PUBLICATION_RESPONSE_TOO_LARGE',503);
   return publicationResponse(data);
  }catch(error){return publicationResponse({error:error instanceof PublicationAuthError?error.code:'PUBLICATION_SERVICE_UNAVAILABLE'},error instanceof PublicationAuthError?error.status:503);}
 };
}
