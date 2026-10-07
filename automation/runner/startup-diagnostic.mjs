// Optional infrastructure-only diagnostics. Only a public key reaches Linux;
// plaintext never leaves the verifier and no candidate is accepted here.
import {createPublicKey,createCipheriv,publicEncrypt,randomBytes,createHash,constants} from 'node:crypto';
const need=value=>{if(!value)throw Error('STARTUP_DIAGNOSTIC_INVALID');};
const exact=(value,keys)=>need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','));
function bytes(value,max,expected){
 need(typeof value==='string'&&value.length<=Math.ceil(max/3)*4&&/^[A-Za-z0-9+/]*={0,2}$/.test(value));
 const decoded=Buffer.from(value,'base64');need(decoded.toString('base64')===value&&decoded.length<=max&&(expected===undefined||decoded.length===expected));return decoded;
}
export function startupPublicKey(value){
 const der=bytes(value,1024);const key=createPublicKey({key:der,format:'der',type:'spki'});
 need(key.asymmetricKeyType==='rsa'&&key.asymmetricKeyDetails.modulusLength===3072);
 return {key,keyId:createHash('sha256').update(der).digest('hex')};
}
export function assertSealedStartup(value){
 exact(value,['version','keyId','wrappedKey','iv','tag','ciphertext']);need(value.version===1&&/^[a-f0-9]{64}$/.test(value.keyId));
 bytes(value.wrappedKey,384,384);bytes(value.iv,12,12);bytes(value.tag,16,16);bytes(value.ciphertext,32768);return value;
}
export function sealStartupError(error,publicKey){
 const {key:recipient,keyId}=startupPublicKey(publicKey),key=randomBytes(32),iv=randomBytes(12);
 const plaintext=Buffer.from(typeof error?.message==='string'?error.message:'LAUNCH_ERROR_MESSAGE_UNAVAILABLE').subarray(0,32768);
 try{
  const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(keyId));
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return assertSealedStartup({version:1,keyId,wrappedKey:publicEncrypt({key:recipient,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')});
 }finally{key.fill(0);plaintext.fill(0);}
}
export function assertStartupProbe(value){
 exact(value,['mode','started','stopped','sealed']);need(value.mode==='startup-only'&&typeof value.started==='boolean'&&value.stopped===true);
 if(value.started)need(value.sealed===null);else assertSealedStartup(value.sealed);return value;
}
