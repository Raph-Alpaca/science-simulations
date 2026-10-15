// Candidate-independent source review contract. It does not fetch or certify
// a source. Callers must load records from an owner-scoped trusted store, never
// from browser fields, model output, candidate files, or a release packet.
import {hash} from './content-source.js';

const need=ok=>{if(!ok)throw Error('PREPARATION_EVIDENCE_INVALID');};
const kinds=['curriculum','textbook','science'];
const scopes=['general_concepts','selected_textbook'];
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=(v,max)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=max;
const exact=(o,keys)=>{need(o&&typeof o==='object'&&!Array.isArray(o));need(Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k)));};
const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const keys=['schemaVersion','purpose','recordId','ownerId','sourceFingerprint','kind','reviewScope','curriculumRevision','documentHash','locator','checkedScope','limitations','reviewerId','reviewedAt','validUntil','method','status','aiUseAllowed','summaryPublicAllowed'];

export function preparationSourceFingerprint(source){
 need(source&&kinds.includes(source.kind));
 for(const [key,max] of [['title',150],['url',1000],['location',160],['summary',900]])need(text(source[key],max));
 let url;try{url=new URL(source.url);}catch{need(false);}
 need(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(url.hostname)&&!/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname));
 // Include the exact authored summary and locator; matching a URL alone cannot
 // certify a new assertion, another section, or an altered teacher summary.
 return hash(JSON.stringify({kind:source.kind,title:source.title,url:source.url,location:source.location,summary:source.summary}));
}

function validateRecord(record){
 exact(record,keys);
 need(record.schemaVersion===1&&record.purpose==='generation_source_preparation');
 need(uuid(record.recordId)&&uuid(record.ownerId)&&sha(record.sourceFingerprint)&&kinds.includes(record.kind));
 need(scopes.includes(record.reviewScope)&&text(record.curriculumRevision,30)&&sha(record.documentHash));
 need(text(record.locator,500)&&text(record.checkedScope,2000)&&text(record.reviewerId,150));
 need(Array.isArray(record.limitations)&&record.limitations.length<=10&&record.limitations.every(v=>text(v,500)));
 need(stamp(record.reviewedAt)&&stamp(record.validUntil)&&Date.parse(record.validUntil)>Date.parse(record.reviewedAt));
 need(record.method==='original_scope_checked'&&['reviewed','revoked'].includes(record.status));
 need(typeof record.aiUseAllowed==='boolean'&&typeof record.summaryPublicAllowed==='boolean');
}

const project=(record,sourceId)=>({sourceId,recordId:record.recordId,sourceFingerprint:record.sourceFingerprint,kind:record.kind,
 documentHash:record.documentHash,locator:record.locator,checkedScope:record.checkedScope,limitations:[...record.limitations],
 reviewerId:record.reviewerId,reviewedAt:record.reviewedAt,validUntil:record.validUntil,method:record.method,
 aiUseAllowed:record.aiUseAllowed,summaryPublicAllowed:record.summaryPublicAllowed});

export function prepareSourceEvidence({sources,ownerId,reviewScope,curriculumRevision},trustedRecords,{now=Date.now()}={}){
 need(uuid(ownerId)&&scopes.includes(reviewScope)&&text(curriculumRevision,30)&&Number.isFinite(now));
 need(Array.isArray(sources)&&sources.length<=6&&Array.isArray(trustedRecords)&&trustedRecords.length<=30);
 const ids=new Set(),fingerprints=new Set();for(const source of sources){need(text(source.id,150)&&!ids.has(source.id));ids.add(source.id);const fingerprint=preparationSourceFingerprint(source);need(!fingerprints.has(fingerprint));fingerprints.add(fingerprint);}
 const recordIds=new Set();for(const record of trustedRecords){validateRecord(record);need(!recordIds.has(record.recordId));recordIds.add(record.recordId);}
 const records=[],missingSourceIds=[];
 for(const source of sources){
  const fingerprint=preparationSourceFingerprint(source);
  const matches=trustedRecords.filter(r=>r.ownerId===ownerId&&r.sourceFingerprint===fingerprint&&r.kind===source.kind&&r.reviewScope===reviewScope&&r.curriculumRevision===curriculumRevision);
  // Ambiguous/changed authority is a hold, not an arbitrary newest-record win.
  const r=matches.length===1?matches[0]:null;
  if(!r||r.status!=='reviewed'||!r.aiUseAllowed||!r.summaryPublicAllowed||Date.parse(r.reviewedAt)>now||Date.parse(r.validUntil)<=now){missingSourceIds.push(source.id);continue;}
  records.push(project(r,source.id));
 }
 const missingKinds=kinds.filter(k=>!sources.some(s=>s.kind===k));
 const packet={schemaVersion:1,purpose:'generation_source_preparation',reviewScope,curriculumRevision,records};
 return {state:missingSourceIds.length||missingKinds.length?'needs_evidence':'ready',packet,packetHash:hash(JSON.stringify(packet)),missingSourceIds,missingKinds};
}

// Re-load trusted authority before admitting a paid job. This comparison is
// intended to run inside the future admission transaction, not as its substitute.
export function verifyPreparedSourceEvidence(snapshot,scope,trustedRecords,options){
 const current=prepareSourceEvidence(scope,trustedRecords,options);
 need(snapshot&&sha(snapshot.packetHash));
 const unchanged=hash(JSON.stringify(snapshot.packet))===snapshot.packetHash&&snapshot.packetHash===current.packetHash;
 return {...current,state:current.state==='ready'&&unchanged?'ready':'needs_evidence',unchanged};
}
