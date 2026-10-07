// A new temporary directory, never the checkout, is the Docker build context.
import {mkdir,copyFile,lstat,mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash} from '../../../packages/contracts/content-source.js';

export const CONTAINER_FILES=Object.freeze([
 'package.json','package-lock.json','apps/catalog/package.json','apps/studio/package.json',
 ...['package.json','index.js','catalog.js','meta.schema.json','content-source.js','education-evidence.js','runtime-report.js','runtime-spec.js'].map(f=>'packages/contracts/'+f),
 ...['bounded-responses.mjs','candidate.mjs','runtime-contract.mjs','runtime-browser.mjs','runtime-diagnostics.mjs','startup-diagnostic.mjs','runtime-child.mjs','container/isolation-probe.mjs','container/startup-probe.mjs'].map(f=>'automation/runner/'+f),
]);
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
export async function createBuildContext(parent){
 if(!path.isAbsolute(parent))throw Error('CONTAINER_CONTEXT_REJECTED');
 const folder=await mkdtemp(path.join(parent,'studio-checker-'));
 for(const file of [...CONTAINER_FILES,'automation/runner/container/Dockerfile']){
  const source=path.join(ROOT,file),stat=await lstat(source);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>2_000_000)throw Error('CONTAINER_SOURCE_REJECTED');
  const target=path.join(folder,file.endsWith('/Dockerfile')?'Dockerfile':file);
  await mkdir(path.dirname(target),{recursive:true,mode:0o700});await copyFile(source,target);
 }
 return folder;
}
export async function checkedSeccomp(){
 // Keep the upstream profile intact. The reviewed derivative permits chroot
 // for Chromium's nested user-namespace sandbox without adding a container cap.
 const filename=path.join(ROOT,'automation/runner/container/seccomp-chromium.json');
 if(hash(await readFile(filename))!=='f922c7c9bfc1ece0b72b244e56dc85756ded002c837fb46054cfd8b275c74b6b')throw Error('CONTAINER_SECCOMP_CHANGED');
 return filename;
}
