import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
import {publicationBinding} from './artifact-transfer.mjs';
import {assertPublicationRuntimeSummary} from './publication-packet.mjs';
const need=v=>{if(!v)throw Error('PUBLICATION_REPORT_TRANSFER_REJECTED');};
const exact=(v,fields)=>need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...fields].sort().join(','));
const bytes=(text,size,max=size)=>{need(typeof text==='string'&&text.length<=Math.ceil(max/3)*4);const b=Buffer.from(text,'base64');need(b.length>=size&&b.length<=max&&b.toString('base64')===text);return b;};
const derive=(secret,salt,binding)=>{const master=bytes(secret,32);try{return Buffer.from(hkdfSync('sha256',master,salt,Buffer.from('science-studio-publication-report-v1\0'+JSON.stringify(binding)),32));}finally{master.fill(0);}};
export const PUBLICATION_REPORT_TRANSFER_BYTES=32768;
export function sealPublicationReport(report,packet,secret){
 let key,plain;
 try{
  const binding=publicationBinding(packet.binding);assertPublicationRuntimeSummary(report,packet);plain=Buffer.from(JSON.stringify(report));need(plain.length<=16384);
  const salt=randomBytes(32),nonce=randomBytes(12),header={version:1,kind:'publication-report',algorithm:'A256GCM-HKDF-SHA256',binding,inspection:packet.inspection,salt:salt.toString('base64'),nonce:nonce.toString('base64')};
  key=derive(secret,salt,binding);const cipher=createCipheriv('aes-256-gcm',key,nonce,{authTagLength:16});cipher.setAAD(Buffer.from(JSON.stringify(header)));
  const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);return JSON.stringify({...header,tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')});
 }catch{throw Error('PUBLICATION_REPORT_TRANSFER_REJECTED');}finally{key?.fill(0);plain?.fill(0);}
}
export function openPublicationReport(text,expected,secret){
 let key,plain;
 try{
  need(typeof text==='string'&&Buffer.byteLength(text)<=PUBLICATION_REPORT_TRANSFER_BYTES);const v=JSON.parse(text);exact(v,['version','kind','algorithm','binding','inspection','salt','nonce','tag','ciphertext']);
  need(v.version===1&&v.kind==='publication-report'&&v.algorithm==='A256GCM-HKDF-SHA256');const binding=publicationBinding(expected);need(JSON.stringify(publicationBinding(v.binding))===JSON.stringify(binding));
  const salt=bytes(v.salt,32),nonce=bytes(v.nonce,12),tag=bytes(v.tag,16),ciphertext=bytes(v.ciphertext,1,16384);
  const header={version:1,kind:v.kind,algorithm:v.algorithm,binding,inspection:v.inspection,salt:v.salt,nonce:v.nonce};key=derive(secret,salt,binding);
  const decipher=createDecipheriv('aes-256-gcm',key,nonce,{authTagLength:16});decipher.setAAD(Buffer.from(JSON.stringify(header)));decipher.setAuthTag(tag);
  plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]);const report=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(plain));assertPublicationRuntimeSummary(report,{binding,inspection:v.inspection});return {report,binding,inspection:v.inspection};
 }catch{throw Error('PUBLICATION_REPORT_TRANSFER_REJECTED');}finally{key?.fill(0);plain?.fill(0);}
}
