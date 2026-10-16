import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {preparationSourceFingerprint,prepareSourceEvidence,verifyPreparedSourceEvidence} from '../../packages/contracts/preparation-evidence.js';

const now=Date.parse('2026-10-15T00:00:00.000Z');
function fixture(){
 const ownerId=randomUUID(),sources=['curriculum','textbook','science'].map((kind,i)=>({id:'source-'+(i+1),kind,title:'Synthetic '+kind,url:'https://example.org/'+kind,location:'Fixture section',summary:'Synthetic summary. Not real source evidence.',verification:'not_independently_verified'}));
 const scope={ownerId,sources,reviewScope:'general_concepts',curriculumRevision:'2022'};
 const records=sources.map(source=>({schemaVersion:1,purpose:'generation_source_preparation',recordId:randomUUID(),ownerId,sourceFingerprint:preparationSourceFingerprint(source),kind:source.kind,reviewScope:scope.reviewScope,curriculumRevision:'2022',documentHash:'a'.repeat(64),locator:'Synthetic original section',checkedScope:'Synthetic scope only; does not certify curriculum alignment.',limitations:['No Korean school textbook alignment claim.'],reviewerId:'synthetic-reviewer',reviewedAt:'2026-10-14T00:00:00.000Z',validUntil:'2026-10-16T00:00:00.000Z',method:'original_scope_checked',status:'reviewed',aiUseAllowed:true,summaryPublicAllowed:true}));
 return {scope,records};
}
test('no trusted records means no readiness even when browser source fields claim verification',()=>{
 const {scope}=fixture();scope.sources[0].verification='verified';scope.sources[0].approved=true;
 const result=prepareSourceEvidence(scope,[],{now});assert.equal(result.state,'needs_evidence');assert.equal(result.missingSourceIds.length,3);
 assert.equal(prepareSourceEvidence({...scope,sources:[]},[],{now}).state,'needs_evidence');
});
test('partial source review binds exact authored summary and yields no release authority',()=>{
 const {scope,records}=fixture(),result=prepareSourceEvidence(scope,records,{now});assert.equal(result.state,'ready');
 assert.equal(result.packet.records.length,3);assert.ok(result.packet.records.every(r=>r.limitations.length===1));
 assert.equal('ownerId' in result.packet.records[0],false);assert.equal('candidateHash' in result.packet,false);assert.equal('publicationApproved' in result.packet,false);
 assert.equal(verifyPreparedSourceEvidence(result,scope,records,{now}).state,'ready');
 for(const key of ['title','url','location','summary']){
  const changed=structuredClone(scope);changed.sources[0][key]+='x';
  assert.equal(verifyPreparedSourceEvidence(result,changed,records,{now}).state,'needs_evidence');
 }
});
test('cross-owner, scope, revision, expired, future, revoked, rights-missing and ambiguous records cannot authorize',()=>{
 const {scope,records}=fixture();
 for(const patch of [{ownerId:randomUUID()},{reviewScope:'selected_textbook'},{curriculumRevision:'2015'},{validUntil:'2026-10-15T00:00:00.000Z'},{reviewedAt:'2026-10-15T00:00:01.000Z'},{status:'revoked'},{aiUseAllowed:false},{summaryPublicAllowed:false}]){
  const list=structuredClone(records);Object.assign(list[0],patch);assert.equal(prepareSourceEvidence(scope,list,{now}).state,'needs_evidence');
 }
 assert.equal(prepareSourceEvidence(scope,[...records,{...records[0],recordId:randomUUID()}],{now}).state,'needs_evidence');
 assert.equal(prepareSourceEvidence({...scope,sources:scope.sources.slice(0,2)},records,{now}).state,'needs_evidence');
});
test('snapshot forgery and changes after consent remain held',()=>{
 const {scope,records}=fixture(),saved=prepareSourceEvidence(scope,records,{now});
 const changed=structuredClone(saved);changed.packet.records[0].checkedScope='Forged broader claim';assert.equal(verifyPreparedSourceEvidence(changed,scope,records,{now}).state,'needs_evidence');
 const updated=structuredClone(records);updated[0].documentHash='b'.repeat(64);assert.equal(verifyPreparedSourceEvidence(saved,scope,updated,{now}).state,'needs_evidence');
 assert.equal(verifyPreparedSourceEvidence(saved,scope,records,{now:Date.parse(records[0].validUntil)}).state,'needs_evidence');
});
test('unbounded or release/candidate-shaped records are rejected, not upgraded',()=>{
 const {scope,records}=fixture();
 for(const patch of [{candidateHash:'a'.repeat(64)},{method:'ai_claim'},{documentHash:'invalid'},{purpose:'release_approval'},{reviewedAt:'yesterday'},{checkedScope:'x'.repeat(2001)}])assert.throws(()=>prepareSourceEvidence(scope,[{...records[0],...patch},...records.slice(1)],{now}),/INVALID/);
 assert.throws(()=>prepareSourceEvidence(scope,[records[0],records[0]],{now}),/INVALID/);
 assert.throws(()=>prepareSourceEvidence({...scope,sources:Array(7).fill(scope.sources[0])},records,{now}),/INVALID/);
});
