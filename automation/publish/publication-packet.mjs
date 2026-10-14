// Inert publication inspection envelope. No originals, credentials or authority
// issuance: the trusted server and encrypted transfer supply this descriptor.
import {openArtifactBundle} from './artifact-bundle.mjs';
import {hash,LIMITS} from '../../packages/contracts/content-source.js';
import {assertRuntimeReport} from '../../packages/contracts/runtime-report.js';
const need=value=>{if(!value)throw Error('PUBLICATION_INSPECTION_INVALID');};
const exact=(value,keys)=>need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','));
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function publicationInspection(value,binding){
 exact(value,['proposalText','generationKind']);need(typeof value.proposalText==='string'&&Buffer.byteLength(value.proposalText)<=4096&&hash(value.proposalText)===binding.proposalHash);
 need(['interactive_2d','interactive_3d'].includes(value.generationKind));
 let p;try{p=JSON.parse(value.proposalText);}catch{throw Error('PUBLICATION_INSPECTION_INVALID');}
 exact(p,['schemaVersion','jobId','contentId','candidateHash','sourceSnapshotHash','baselineSha','attempt','baseArtifactHash','artifactHash','entry']);
 need(p.schemaVersion===1&&uuid(p.jobId)&&typeof p.contentId==='string'&&/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(p.contentId));
 need(['candidateHash','sourceSnapshotHash','baseArtifactHash','artifactHash'].every(k=>sha(p[k]))&&p.artifactHash===binding.artifactHash&&/^[a-f0-9]{40}$/.test(p.baselineSha));
 need(Number.isInteger(p.attempt)&&p.attempt>=0&&p.attempt<=2&&typeof p.entry==='string'&&p.entry.endsWith('.html')&&p.entry.length<=200);
 return freeze({inspection:{...value},proposal:p});
}
export function preparePublicationBundle(packet){
 exact(packet,['artifactText','binding','inspection']);
 const {proposal:p,inspection}=publicationInspection(packet.inspection,packet.binding),artifact=openArtifactBundle(packet.artifactText,packet.binding.artifactHash);
 const prefix='simulations/'+p.contentId+'/',target=artifact.files.filter(f=>f.path.startsWith(prefix));
 const manifest=artifact.manifest.filter(f=>f.path.startsWith(prefix)).map(f=>({path:f.path.slice(prefix.length),hash:f.hash}));
 need(hash(JSON.stringify(manifest))===p.candidateHash);
 const decode=file=>new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(file.bytesBase64,'base64'));
 let files,meta,catalog;try{files=target.map(f=>({path:f.path.slice(prefix.length),content:decode(f)}));meta=JSON.parse(files.find(f=>f.path==='meta.json').content);catalog=JSON.parse(decode(artifact.files.find(f=>f.path==='catalog.json')));}catch{throw Error('PUBLICATION_INSPECTION_INVALID');}
 need(meta.id===p.contentId&&meta.entry===p.entry&&files.some(f=>f.path===p.entry));
 const basePath='/science-simulations/',entryPath=basePath+prefix+p.entry;
 need(catalog.schemaVersion===1&&catalog.basePath===basePath&&Array.isArray(catalog.cards)&&catalog.cards.length<=LIMITS.packages);
 const entries=catalog.cards.map(c=>{need(c&&typeof c.id==='string'&&typeof c.href==='string'&&c.href.startsWith(basePath+'simulations/'+c.id+'/')&&artifact.files.some(f=>basePath+f.path===c.href));return c.href;});
 need(entries.includes(entryPath)&&new Set(entries).size===entries.length);
 return freeze({artifact,inspection,binding:packet.binding,entryPath,basePath,entries,
  runtime:{candidate:{contentId:p.contentId,candidateHash:p.candidateHash,meta,files},candidateHash:p.candidateHash,sourceSnapshotHash:p.sourceSnapshotHash,baselineSha:p.baselineSha,attempt:p.attempt,generationKind:inspection.generationKind}});
}
export function assertPublicationRuntimeReport(report,packet){
 preparePublicationBundle(packet);return assertPublicationRuntimeSummary(report,packet);
}
export function assertPublicationRuntimeSummary(report,packet){
 exact(report,['version','artifactHash','runtime']);need(report.version==='publication-runtime-v1'&&report.artifactHash===packet.binding.artifactHash);
 const {proposal,inspection}=publicationInspection(packet.inspection,packet.binding);assertRuntimeReport(report.runtime,inspection.generationKind);
 need(['candidateHash','sourceSnapshotHash','baselineSha','attempt'].every(k=>report.runtime[k]===proposal[k]));
 need(report.runtime.issues.every(code=>/^RUNTIME_[A-Z0-9_]{1,100}$/.test(code)));return report;
}
