// A new temporary directory, never the checkout, is the Docker build context.
import {mkdir,copyFile,lstat,mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash} from '../../../packages/contracts/content-source.js';

export const CONTAINER_FILES=Object.freeze([
 'package.json','package-lock.json','apps/catalog/package.json','apps/studio/package.json',
 ...['package.json','index.js','catalog.js','meta.schema.json','content-source.js','education-evidence.js','runtime-report.js','runtime-spec.js'].map(f=>'packages/contracts/'+f),
 ...['bounded-responses.mjs','candidate.mjs','runtime-contract.mjs','runtime-browser.mjs','runtime-diagnostics.mjs','runtime-child.mjs','container/isolation-probe.mjs'].map(f=>'automation/runner/'+f),
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
 const filename=path.join(ROOT,'automation/runner/container/seccomp.json');
 if(hash(await readFile(filename))!=='cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849')throw Error('CONTAINER_SECCOMP_CHANGED');
 return filename;
}
