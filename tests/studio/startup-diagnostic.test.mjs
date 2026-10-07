import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,privateDecrypt,createDecipheriv,constants} from 'node:crypto';
import {startupPublicKey,sealStartupError,assertStartupProbe} from '../../automation/runner/startup-diagnostic.mjs';
import {runRehearsal} from '../../automation/runner/container/rehearsal.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072});
const recipient=publicKey.export({type:'spki',format:'der'}).toString('base64');
function decrypt(envelope){
 const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.wrappedKey,'base64'));
 try{const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));decipher.setAAD(Buffer.from(envelope.keyId));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]);}finally{key.fill(0);}
}
test('only the recipient can recover bounded authenticated startup details',()=>{
 const detail='private startup detail /private-path';const sealed=sealStartupError(Error(detail),recipient);
 assert.equal(decrypt(sealed).toString(),detail);assert.equal(JSON.stringify(sealed).includes(detail),false);
 const modified={...sealed,tag:Buffer.alloc(16).toString('base64')};assert.throws(()=>decrypt(modified));
 assert.equal(decrypt(sealStartupError(Error('x'.repeat(50000)),recipient)).length,32768);
 assert.equal(sealed.keyId,startupPublicKey(recipient).keyId);
});
test('startup probes reject plaintext fields, unverified shutdown and wrong keys',()=>{
 const sealed=sealStartupError(Error('private'),recipient),valid={mode:'startup-only',started:false,stopped:true,sealed};
 assert.equal(assertStartupProbe(valid),valid);
 for(const report of [{...valid,raw:'private'},{...valid,stopped:false},{...valid,sealed:{...sealed,raw:'private'}},{...valid,sealed:{...sealed,ciphertext:'private'}}])assert.throws(()=>assertStartupProbe(report));
 assert.throws(()=>startupPublicKey('private'));
 const short=generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({type:'spki',format:'der'}).toString('base64');assert.throws(()=>startupPublicKey(short));
});
test('rehearsal preserves the failure and runs at most one candidate-free sealed startup probe',async()=>{
 const calls=[],logs=[],errors=[],sealed=sealStartupError(Error('private'),recipient);
 const run=async(packet,options)=>{calls.push({packet,options});if(options.probe)return {isolated:true};if(options.startupPublicKey)return {mode:'startup-only',started:false,stopped:true,sealed};return {checks:{contract:'pass',runtime:'not_run'},details:{browserStopped:true,browserVersion:null},issues:['RUNTIME_BROWSER_LAUNCH_FAILED']};};
 assert.equal(await runRehearsal({image:'test-image',run,startupPublicKey:recipient,log:x=>logs.push(x),error:x=>errors.push(x)}),1);
 assert.equal(calls.length,3);assert.equal(calls[2].packet,null);assert.equal(calls[2].options.startupPublicKey,recipient);
 assert.equal(errors.length,1);assert.equal(JSON.stringify([...logs,...errors]).includes('private'),false);
 assert.equal(JSON.parse(logs[1]).name,'startup-diagnostic');
});
