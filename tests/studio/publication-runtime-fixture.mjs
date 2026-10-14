import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {runtimeFixture} from './runtime-fixture.mjs';
import {encodeArtifactBundle,prepareCatalogRelease} from '../../automation/publish/artifact-bundle.mjs';
import {hash} from '../../packages/contracts/content-source.js';
let assets;
const b64=(path,bytes)=>({path,bytesBase64:Buffer.from(bytes).toString('base64')});
// Real catalog UI, reviewed synthetic interaction code, no source attestation.
export async function publicationRuntimeFixture({kind='interactive_2d',missingLink=false,extraCatalogJs='',assetBytes=0,...options}={}){
 assets??=Promise.all([readFile('apps/catalog/index.html','utf8'),readFile('apps/catalog/src/styles.css','utf8'),build({entryPoints:['apps/catalog/src/main.ts'],bundle:true,format:'esm',target:'chrome111',write:false,logLevel:'silent'})]);
 const [template,css,compiled]=await assets,f=runtimeFixture({kind,...options});
 const config={schemaVersion:1,basePath:'/science-simulations/',grades:[{value:3,label:'중3'}],units:[{grade:3,label:'검사용 모형'}]};
 const base=encodeArtifactBundle([b64('index.html',template.replaceAll('__BASE__',config.basePath).replace('__FIXTURE__','')),b64('assets/styles.css',css),b64('assets/app.js',compiled.outputFiles[0].text+extraCatalogJs+(missingLink?';new MutationObserver(()=>document.querySelectorAll(".card a").forEach(a=>a.remove())).observe(document,{childList:true,subtree:true});':'')),b64('catalog.json',JSON.stringify({...config,cards:[]})),...(assetBytes?[b64('assets/sample.png',Buffer.alloc(assetBytes,23))]:[])]);
 const release=prepareCatalogRelease({jobId:randomUUID(),baseArtifactText:base.artifactText,expectedBaseArtifactHash:base.artifactHash,config,packet:{inputText:f.inputText,candidateText:f.candidateText,expected:f.expected}});
 const binding={publicationId:randomUUID(),approvalId:randomUUID(),reviewId:randomUUID(),runId:12345,runAttempt:1,workflowSha:'a'.repeat(40),proposalHash:hash(release.proposalText),artifactHash:release.artifactHash};
 return {artifactText:release.artifactText,binding,inspection:{proposalText:release.proposalText,generationKind:kind}};
}
