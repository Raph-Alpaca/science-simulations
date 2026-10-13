import {RuntimeCheckError,runtimeNeed} from './runtime-envelope.mjs';
export {RuntimeCheckError,runtimeNeed,prepareRuntimeBundle} from './runtime-envelope.mjs';
import path from 'node:path';
import {parse} from 'parse5';
import {transform} from 'esbuild';
import {hash,relativeFile} from '../../packages/contracts/content-source.js';
import {RUNTIME_CONTRACT} from '../../packages/contracts/runtime-spec.js';
export {RUNTIME_CONTRACT};
function walk(root){const list=[],todo=[root];while(todo.length){const node=todo.pop();list.push(node);runtimeNeed(list.length<=30000,'RUNTIME_DOCUMENT_TOO_COMPLEX');todo.push(...(node.childNodes||[]));if(node.content)todo.push(node.content);}return list;}

// Parse inert source. No candidate module is imported by Node or used as config.
export async function checkRuntimeSource(candidate){
 const files=new Map(candidate.files.map(f=>[f.path,f.content]));
 function link(value,from,navigation=false){
  if(navigation&&/^https:\/\//i.test(value))return;
  const clean=value.split('#')[0].split('?')[0];let decoded;
  try{decoded=decodeURIComponent(clean);}catch{throw new RuntimeCheckError('RUNTIME_UNSAFE_LINK');}
  runtimeNeed(!decoded.startsWith('/')&&!/[\\:%\x00-\x1f]/.test(decoded),'RUNTIME_UNSAFE_LINK');
  const target=decoded?path.posix.normalize(path.posix.join(path.posix.dirname(from),decoded)):from;
  try{relativeFile(target);}catch{throw new RuntimeCheckError('RUNTIME_UNSAFE_LINK');}
  runtimeNeed(files.has(target),'RUNTIME_MISSING_ASSET');
 }
 for(const [name,text] of files){
  if(/\.(html|svg)$/.test(name))for(const node of walk(parse(text))){
   runtimeNeed(!['iframe','frame','object','embed','base'].includes(node.tagName),'RUNTIME_EMBED_REJECTED');
   const attrs=node.attrs||[];
   if(node.tagName==='script')runtimeNeed(attrs.some(a=>a.name==='src')&&!node.childNodes?.some(n=>n.value?.trim()),'RUNTIME_INLINE_SCRIPT_REJECTED');
   runtimeNeed(node.tagName!=='style','RUNTIME_INLINE_STYLE_REJECTED');
   for(const a of attrs){
    runtimeNeed(!/^on/i.test(a.name)&&!['srcset','style','srcdoc'].includes(a.name),'RUNTIME_INLINE_RESOURCE_REJECTED');
    runtimeNeed(!(node.tagName==='meta'&&a.name==='http-equiv'&&a.value.toLowerCase()==='refresh'),'RUNTIME_REDIRECT_REJECTED');
    if(['src','href','poster','xlink:href'].includes(a.name))link(a.value,name,node.tagName==='a');
   }
  }
  if(name.endsWith('.css'))for(const pattern of [/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g,/@import\s+['"]([^'"]+)['"]/g])for(const match of text.matchAll(pattern))link(match[1],name);
  if(name.endsWith('.js')){
   try{await transform(text,{loader:'js',target:'es2022',logLevel:'silent'});}catch{throw new RuntimeCheckError('RUNTIME_JS_SYNTAX');}
   for(const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g))link(match[1],name);
  }
 }
 return {contractVersion:RUNTIME_CONTRACT.version,files:files.size};
}
