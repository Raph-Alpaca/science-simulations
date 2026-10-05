// Validation only. A trusted release service must obtain these records from its
// source-review store. Candidate files, model output and browser input are NOT
// authoritative issuers. This module never fetches or certifies a source.
import {hash} from './content-source.js';

const need=(ok)=>{if(!ok)throw new Error('EDUCATION_EVIDENCE_INVALID');};
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const short=(value,max=200)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const exact=(value,keys)=>{need(value&&typeof value==='object'&&!Array.isArray(value));need(Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)));};
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;

export function assertEducationEvidence(text,expectedHash,meta,approval){
 need(typeof text==='string'&&Buffer.byteLength(text)<=64000&&sha(expectedHash)&&hash(text)===expectedHash);
 let packet;try{packet=JSON.parse(text);}catch{need(false);}
 exact(packet,['schemaVersion','contentId','candidateHash','sourceSnapshotHash','grade','unit','curriculumRevision','scope','records']);
 need(packet.schemaVersion===1&&packet.scope==='curriculum_revision'&&packet.contentId===meta.id&&packet.candidateHash===approval.candidateHash&&
  packet.sourceSnapshotHash===approval.evidenceVersion.sourceSnapshotHash&&packet.grade===meta.grade&&packet.unit===meta.unit&&packet.curriculumRevision===meta.curriculumRevision);
 need(Array.isArray(packet.records)&&packet.records.length>=3&&packet.records.length<=30&&Array.isArray(meta.sourceIds));
 const seen=new Set(),kinds=new Set();
 for(const record of packet.records){
  exact(record,['sourceId','kind','documentHash','locator','scope','reviewedAt','reviewerId','method','verdict','aiUseAllowed','summaryPublicAllowed']);
  need(short(record.sourceId,150)&&meta.sourceIds.includes(record.sourceId)&&!seen.has(record.sourceId));seen.add(record.sourceId);
  need(['curriculum','textbook','science'].includes(record.kind));kinds.add(record.kind);
  need(sha(record.documentHash)&&short(record.locator,500)&&short(record.scope,2000)&&short(record.reviewerId,150)&&timestamp(record.reviewedAt));
  need(record.method==='original_checked'&&record.verdict==='pass'&&record.aiUseAllowed===true&&record.summaryPublicAllowed===true);
  need(Date.parse(record.reviewedAt)<=Date.parse(approval.approvedAt));
 }
 need(seen.size===meta.sourceIds.length&&['curriculum','textbook','science'].every(k=>kinds.has(k)));
 return packet;
}
