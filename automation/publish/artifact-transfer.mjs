import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
import {LIMITS} from '../../packages/contracts/content-source.js';
import {preparePublicationBundle} from './publication-packet.mjs';
const MAX_PLAIN=Math.ceil(LIMITS.bytes/3)*4+100000;
export const PUBLICATION_TRANSFER_BYTES=Math.ceil(MAX_PLAIN/3)*4+12000;
const need=v=>{if(!v)throw Error('PUBLICATION_TRANSFER_REJECTED');};
const exact=(v,keys)=>need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(','));
const fields=['publicationId','approvalId','reviewId','runId','runAttempt','workflowSha','proposalHash','artifactHash'];
export function publicationBinding(value){
 exact(value,fields);
 for(const key of ['publicationId','approvalId','reviewId'])need(typeof value[key]==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value[key]));
 need(Number.isSafeInteger(value.runId)&&value.runId>0&&value.runAttempt===1&&/^[a-f0-9]{40}$/.test(value.workflowSha));
 need(['proposalHash','artifactHash'].every(k=>typeof value[k]==='string'&&/^[a-f0-9]{64}$/.test(value[k])));
 return Object.fromEntries(fields.map(k=>[k,value[k]]));
}
function bytes(value,length,max=length){
 need(typeof value==='string'&&value.length<=Math.ceil(max/3)*4);const data=Buffer.from(value,'base64');need(data.length>=length&&data.length<=max&&data.toString('base64')===value);return data;
}
function derive(secret,salt,identity){
 const master=bytes(secret,32);try{return Buffer.from(hkdfSync('sha256',master,salt,Buffer.from('science-studio-publication-artifact-v1\0'+JSON.stringify(identity)),32));}finally{master.fill(0);}
}
// Files remain ciphertext in the public repository's Actions artifacts. The
// transfer key belongs only to trusted wrappers, never to candidate execution.
export function sealPublicationArtifact(artifactText,expected,secret,inspection){
 let key,plain;
 try{
  const identity=publicationBinding(expected);preparePublicationBundle({artifactText,binding:identity,inspection});
  plain=Buffer.from(artifactText);need(plain.length<=MAX_PLAIN);
  const salt=randomBytes(32),nonce=randomBytes(12),header={version:2,kind:'publication-artifact',algorithm:'A256GCM-HKDF-SHA256',binding:identity,inspection,salt:salt.toString('base64'),nonce:nonce.toString('base64')};
  key=derive(secret,salt,identity);const cipher=createCipheriv('aes-256-gcm',key,nonce,{authTagLength:16});cipher.setAAD(Buffer.from(JSON.stringify(header)));
  const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);
  return JSON.stringify({...header,tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')});
 }catch{throw Error('PUBLICATION_TRANSFER_REJECTED');}finally{key?.fill(0);plain?.fill(0);}
}
export function openPublicationArtifact(text,expected,secret){
 let key,plain;
 try{
  need(typeof text==='string'&&Buffer.byteLength(text)<=PUBLICATION_TRANSFER_BYTES);const value=JSON.parse(text);
  exact(value,['version','kind','algorithm','binding','inspection','salt','nonce','tag','ciphertext']);need(value.version===2&&value.kind==='publication-artifact'&&value.algorithm==='A256GCM-HKDF-SHA256');
  const identity=publicationBinding(expected);need(JSON.stringify(publicationBinding(value.binding))===JSON.stringify(identity));
  const salt=bytes(value.salt,32),nonce=bytes(value.nonce,12),tag=bytes(value.tag,16),ciphertext=bytes(value.ciphertext,1,MAX_PLAIN);
  const header={version:2,kind:value.kind,algorithm:value.algorithm,binding:identity,inspection:value.inspection,salt:value.salt,nonce:value.nonce};
  key=derive(secret,salt,identity);const decipher=createDecipheriv('aes-256-gcm',key,nonce,{authTagLength:16});decipher.setAAD(Buffer.from(JSON.stringify(header)));decipher.setAuthTag(tag);
  plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]);const artifactText=new TextDecoder('utf-8',{fatal:true}).decode(plain);
  preparePublicationBundle({artifactText,binding:identity,inspection:value.inspection});return {artifactText,artifactHash:identity.artifactHash,binding:identity,inspection:value.inspection};
 }catch{throw Error('PUBLICATION_TRANSFER_REJECTED');}finally{key?.fill(0);plain?.fill(0);}
}
