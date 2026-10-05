import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertPublicationEvidence} from '../../packages/contracts/index.js';
import {selectApproved} from '../../automation/catalog/content.mjs';
import {hash} from '../../packages/contracts/content-source.js';
import {metadata} from '../fixtures/data.mjs';

// All documents, reviewer identifiers and verdicts here are SYNTHETIC. No real
// source reading, rights review, approval issuance or publication is performed.
function fixture(){
 const kinds=['curriculum','textbook','science'];
 const meta=metadata('fixture-light',{stage:'ready',curriculumRevision:'2022',sourceIds:kinds.map(k=>'fixture-'+k)});
 const packet={schemaVersion:1,contentId:meta.id,candidateHash:hash('candidate'),sourceSnapshotHash:hash('sources'),grade:meta.grade,unit:meta.unit,curriculumRevision:'2022',scope:'curriculum_revision',records:kinds.map(kind=>({sourceId:'fixture-'+kind,kind,documentHash:hash('SYNTHETIC '+kind),locator:'Synthetic section 1',scope:'Synthetic fixture coverage only',reviewedAt:'2026-01-01T00:00:00.000Z',reviewerId:'synthetic-reviewer',method:'original_checked',verdict:'pass',aiUseAllowed:true,summaryPublicAllowed:true}))};
 const evidence={sourceSnapshotHash:packet.sourceSnapshotHash,checksHash:hash('checks'),lockHash:hash('lock'),policyVersion:'synthetic-v2',educationHash:hash(JSON.stringify(packet)),checks:Object.fromEntries(['curriculum','textbook','rights','science','learning','runtime'].map(k=>[k,'pass']))};
 const approval={schemaVersion:2,contentId:meta.id,candidateHash:packet.candidateHash,artifactHash:hash('artifact'),approvalId:'synthetic-only',approvedAt:'2026-01-02T00:00:00.000Z',educationEvidence:JSON.stringify(packet),evidenceVersion:evidence};
 return {meta,packet,evidence,approval};
}
function rewrite(approval,packet){const text=JSON.stringify(packet);return {...approval,educationEvidence:text,evidenceVersion:{...approval.evidenceVersion,educationHash:hash(text)}};}

test('revision-scoped v2 requires original-source receipts without inserting a school year',()=>{
 const {meta,approval,evidence}=fixture();assert.equal(meta.schoolYear,null);
 assert.doesNotThrow(()=>assertPublicationEvidence(meta,approval));
 assert.equal(selectApproved([{meta,candidateHash:approval.candidateHash}],[approval],evidence).length,1);
 assert.throws(()=>assertPublicationEvidence({...meta,schoolYear:2026},approval),/SCOPE_MISMATCH/);
 assert.throws(()=>assertPublicationEvidence(meta,{...approval,schemaVersion:1}),/PUBLICATION_NOT_READY/);
 // Historical v1 still needs its original year and all six evidence checks.
 assert.doesNotThrow(()=>assertPublicationEvidence({...meta,schoolYear:2024},{...approval,schemaVersion:1}));
 for(const key of Object.keys(evidence.checks))assert.throws(()=>assertPublicationEvidence(meta,{...approval,evidenceVersion:{...evidence,checks:{...evidence.checks,[key]:'needs_evidence'}}}),/EVIDENCE_MISSING/);
});
test('a model pass, teacher summary or unchecked reference cannot become an original-source receipt',()=>{
 const {meta,approval,packet}=fixture();
 for(const mutation of [p=>p.records[0].method='model_opinion',p=>p.records[0].verdict='needs_evidence',p=>p.records[0].aiUseAllowed=false,p=>p.records[0].summaryPublicAllowed=false,p=>p.records[0].documentHash=null,p=>p.records[0].reviewerId='',p=>p.records[0].locator='',p=>p.records[0].scope='',p=>p.records[0].reviewedAt='2026-01-03T00:00:00.000Z',p=>p.records[0].reviewedAt='2026-02-30T00:00:00.000Z',p=>p.records.pop(),p=>p.records[2].kind='curriculum',p=>p.records[2].sourceId=p.records[0].sourceId,p=>p.records[0].sourceId='unreferenced',p=>p.records[0].rawDocument='not allowed']){
  const changed=structuredClone(packet);mutation(changed);assert.throws(()=>assertPublicationEvidence(meta,rewrite(approval,changed)),/EDUCATION_EVIDENCE_INVALID/);
 }
});
test('education receipts bind the exact content, candidate, source input, grade, unit and revision',()=>{
 const {meta,approval,packet}=fixture();
 for(const patch of [{schemaVersion:2},{contentId:'other'},{candidateHash:hash('other')},{sourceSnapshotHash:hash('other')},{grade:3},{unit:'other'},{curriculumRevision:'2015'},{scope:'school_year'},{schoolYear:2026}]){
  assert.throws(()=>assertPublicationEvidence(meta,rewrite(approval,{...packet,...patch})),/EDUCATION_EVIDENCE_INVALID/);
 }
 assert.throws(()=>assertPublicationEvidence({...meta,sourceIds:[...meta.sourceIds,'extra']},approval),/EDUCATION_EVIDENCE_INVALID/);
 assert.throws(()=>assertPublicationEvidence(meta,{...approval,educationEvidence:approval.educationEvidence+' '}),/EDUCATION_EVIDENCE_INVALID/);
 assert.throws(()=>assertPublicationEvidence(meta,{...approval,educationEvidence:undefined}),/EDUCATION_EVIDENCE_INVALID/);
});
test('rehashed source receipts still require the release service current evidence hash',()=>{
 const {meta,approval,packet,evidence}=fixture(),changed=structuredClone(packet);changed.records[0].documentHash=hash('other document');
 const next=rewrite(approval,changed);assert.doesNotThrow(()=>assertPublicationEvidence(meta,next));
 assert.throws(()=>selectApproved([{meta,candidateHash:approval.candidateHash}],[next],evidence),/EVIDENCE_VERSION_MISMATCH/);
 assert.throws(()=>selectApproved([{meta,candidateHash:hash('other')}],[approval],evidence),/CANDIDATE_HASH_MISMATCH/);
});
