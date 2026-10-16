import {hash} from './content-source.js';
export const SCREENSHOT_LIMITS=Object.freeze({bytes:196608,widths:[390,1440],height:900,reportBytes:640000});
const need=v=>{if(!v)throw Error('RUNTIME_SCREENSHOT_INVALID');};
// Browser-produced JPEG only. No arbitrary URL, HTML, SVG, or image dimensions.
export function assertRuntimeScreenshot(value){
 need(value&&Object.keys(value).sort().join(',')==='bytesBase64,hash,height,width');
 need(SCREENSHOT_LIMITS.widths.includes(value.width)&&value.height===SCREENSHOT_LIMITS.height);
 need(typeof value.hash==='string'&&/^[a-f0-9]{64}$/.test(value.hash));
 need(typeof value.bytesBase64==='string'&&value.bytesBase64.length<=Math.ceil(SCREENSHOT_LIMITS.bytes/3)*4&&/^[A-Za-z0-9+/]+={0,2}$/.test(value.bytesBase64));
 const bytes=Buffer.from(value.bytesBase64,'base64');
 need(bytes.length>=32&&bytes.length<=SCREENSHOT_LIMITS.bytes&&bytes.toString('base64')===value.bytesBase64&&hash(bytes)===value.hash);
 need(bytes.readUInt16BE(0)===0xffd8&&bytes.readUInt16BE(bytes.length-2)===0xffd9);
 let at=2,frame=false,scan=false;
 while(at<bytes.length-2){
  need(bytes[at++]===0xff);while(bytes[at]===0xff)at++;const marker=bytes[at++];
  need(at+2<=bytes.length);const length=bytes.readUInt16BE(at);need(length>=2&&at+length<=bytes.length);
  if(marker===0xc0){need(!frame&&length>=8&&bytes[at+2]===8&&bytes.readUInt16BE(at+3)===value.height&&bytes.readUInt16BE(at+5)===value.width);frame=true;}
  else need(!(marker>=0xc1&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker)));
  if(marker===0xda){need(frame);scan=true;break;}at+=length;
 }
 need(frame&&scan);return value;
}
export function captureRecord(bytes,width){
 return assertRuntimeScreenshot({width,height:SCREENSHOT_LIMITS.height,hash:hash(bytes),bytesBase64:Buffer.from(bytes).toString('base64')});
}
export function screenshotSummary({width,height,hash:sha}){return {width,height,hash:sha};}
