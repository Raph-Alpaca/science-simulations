import {randomUUID} from 'node:crypto';
import {preparationSourceFingerprint} from '../../packages/contracts/preparation-evidence.js';
export function preparationFixture(ownerId=randomUUID(),now=Date.now()){
 const sources=['curriculum','textbook','science'].map((kind,i)=>({id:'source-'+(i+1),kind,title:'합성 자료 '+kind,url:'https://example.org/'+kind,location:'Synthetic section',summary:'합성 요약 "표본"\n원문 검토의 증거가 아닙니다.'}));
 const scope={ownerId,sources,reviewScope:'general_concepts',curriculumRevision:'2022'};
 const records=sources.map(source=>({schemaVersion:1,purpose:'generation_source_preparation',recordId:randomUUID(),ownerId,sourceFingerprint:preparationSourceFingerprint(source),kind:source.kind,reviewScope:scope.reviewScope,curriculumRevision:'2022',documentHash:'a'.repeat(64),locator:'Synthetic original section',checkedScope:'Synthetic scope only; not actual curriculum evidence.',limitations:['No selected school textbook alignment.'],reviewerId:'synthetic-reviewer',reviewedAt:new Date(now-3600000).toISOString(),validUntil:new Date(now+86400000).toISOString(),method:'original_scope_checked',status:'reviewed',aiUseAllowed:true,summaryPublicAllowed:true}));
 return {scope,records};
}
export async function insertPreparation(db,source,record){
 const {kind,title,url,location,summary}=source;
 return db.query('insert into studio.preparation_sources(id,owner_id,source_fingerprint,review_scope,curriculum_revision,source_identity,record) values($1,$2,$3,$4,$5,$6,$7)',[record.recordId,record.ownerId,record.sourceFingerprint,record.reviewScope,record.curriculumRevision,{kind,title,url,location,summary},record]);
}
