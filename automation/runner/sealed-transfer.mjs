import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
import {RunnerError} from './bounded-responses.mjs';

const MAX_PLAIN=2_300_000,MAX_ENVELOPE=3_100_000;
const need=value=>{if(!value)throw new RunnerError('SEALED_TRANSFER_REJECTED');};
const keys=(value,names)=>need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...names].sort().join(','));
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function binding(value){
 keys(value,['jobId','runId','runAttempt','baselineSha','attempt','purpose','candidateHash','sourceSnapshotHash']);
 need(typeof value.jobId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.jobId)&&Number.isSafeInteger(value.runId)&&value.runId>0&&value.runAttempt===1);
 need(/^[a-f0-9]{40}$/.test(value.baselineSha)&&Number.isInteger(value.attempt)&&value.attempt>=0&&value.attempt<=2&&['candidate','runtime-report'].includes(value.purpose)&&sha(value.candidateHash)&&sha(value.sourceSnapshotHash));
 return {jobId:value.jobId,runId:value.runId,runAttempt:1,baselineSha:value.baselineSha,attempt:value.attempt,purpose:value.purpose,candidateHash:value.candidateHash,sourceSnapshotHash:value.sourceSnapshotHash};
}
function bytes(text,length,max=length){
 need(typeof text==='string'&&text.length<=Math.ceil(max/3)*4&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text));
 const buffer=Buffer.from(text,'base64');need(buffer.length>=length&&buffer.length<=max&&buffer.toString('base64')===text);return buffer;
}
function derive(secret,salt,identity){
 const master=bytes(secret,32);try{return Buffer.from(hkdfSync('sha256',master,salt,Buffer.from('science-studio-transfer-v1\0'+JSON.stringify(identity)),32));}finally{master.fill(0);}
}
// Ciphertext may be transferred between approved jobs; the transport secret
// stays in trusted wrappers and must NEVER enter the candidate container.
// Encryption grants no permission to publish source or to accept a test result.
export function sealTransfer(value,expected,secret){
 let key,plain;
 try{
  const identity=binding(expected),salt=randomBytes(32),nonce=randomBytes(12);
  plain=Buffer.from(JSON.stringify(value));need(plain.length>0&&plain.length<=MAX_PLAIN);
  const header={version:1,algorithm:'A256GCM-HKDF-SHA256',binding:identity,salt:salt.toString('base64'),nonce:nonce.toString('base64')};
  key=derive(secret,salt,identity);const cipher=createCipheriv('aes-256-gcm',key,nonce,{authTagLength:16});cipher.setAAD(Buffer.from(JSON.stringify(header)));
  const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);
  return JSON.stringify({...header,tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')});
 }catch{throw new RunnerError('SEALED_TRANSFER_REJECTED');}
 finally{key?.fill(0);plain?.fill(0);}
}
export function openTransfer(text,expected,secret){
 let key,plain;
 try{
  need(typeof text==='string'&&Buffer.byteLength(text)<=MAX_ENVELOPE);const value=JSON.parse(text);
  keys(value,['version','algorithm','binding','salt','nonce','tag','ciphertext']);need(value.version===1&&value.algorithm==='A256GCM-HKDF-SHA256');
  const identity=binding(expected);need(JSON.stringify(binding(value.binding))===JSON.stringify(identity));
  const salt=bytes(value.salt,32),nonce=bytes(value.nonce,12),tag=bytes(value.tag,16),ciphertext=bytes(value.ciphertext,1,MAX_PLAIN);
  const header={version:1,algorithm:value.algorithm,binding:identity,salt:value.salt,nonce:value.nonce};
  key=derive(secret,salt,identity);const decipher=createDecipheriv('aes-256-gcm',key,nonce,{authTagLength:16});decipher.setAAD(Buffer.from(JSON.stringify(header)));decipher.setAuthTag(tag);
  // Do not parse, return or log any unauthenticated partial plaintext.
  plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
 }catch{throw new RunnerError('SEALED_TRANSFER_REJECTED');}
 finally{key?.fill(0);plain?.fill(0);}
}
