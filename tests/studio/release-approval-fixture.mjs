import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resultFixture} from './result-review-fixture.mjs';
import {hash} from '../../packages/contracts/content-source.js';
import {encodeArtifactBundle,prepareCatalogRelease} from '../../automation/publish/artifact-bundle.mjs';
import {createReleaseApprovalService} from '../../apps/studio/lib/release-approval.mjs';

// Real local SQL + signed synthetic worker HTTP. All model, original-source,
// runtime and teacher identities are fixtures, never evidence for real publication.
export async function releaseFixture({repair=false}={}){
 const kinds=['curriculum','textbook','science'];
 const meta={...JSON.parse(await readFile('content/simulations/mendel-inheritance/meta.json','utf8')),curriculumRevision:'2022',sourceIds:kinds.map(k=>'synthetic-'+k)};
 const f=await resultFixture({metadata:meta,repair});
 try{
  await f.db.exec('reset role');
  for(const name of ['studio_runner_v1','studio_input_review_v1','studio_dispatch_v1','studio_revision_v1','studio_release_approval_v1'])await f.db.exec(await readFile('supabase/proposals/'+name+'.sql','utf8'));
  await f.db.exec('set role service_role');
  const snapshot=await f.rpc('read_worker_result',{p_owner:f.ownerId,p_job:f.jobId});
  const version=snapshot.evidence.findLast(e=>e.kind==='candidate');
  const developer=snapshot.evidence.findLast(e=>e.sequence<version.sequence&&e.kind==='role_output'&&JSON.parse(e.body).role==='developer');
  const runtime=JSON.parse(snapshot.evidence.findLast(e=>e.kind==='runtime_evidence').body);
  const b64=(path,text)=>({path,bytesBase64:Buffer.from(text).toString('base64')});
  const {schemaVersion,basePath,grades,units}=f.context.config;
  const base=encodeArtifactBundle([b64('index.html','<!doctype html><title>Synthetic catalog only</title>'),b64('catalog.json',JSON.stringify({schemaVersion,basePath,grades,units,cards:[]}))]);
  const prepared=prepareCatalogRelease({jobId:f.jobId,baseArtifactText:base.artifactText,expectedBaseArtifactHash:base.artifactHash,config:f.context.config,
   packet:{inputText:snapshot.worker.input_text,candidateText:JSON.parse(developer.body).output,expected:{sourceSnapshotHash:f.sourceSnapshotHash,candidateHash:f.candidate.candidateHash,baselineSha:snapshot.worker.verified_sha,attempt:repair?1:0}}});
  const education={schemaVersion:1,contentId:meta.id,candidateHash:f.candidate.candidateHash,sourceSnapshotHash:f.sourceSnapshotHash,grade:meta.grade,unit:meta.unit,curriculumRevision:'2022',scope:'curriculum_revision',
   records:kinds.map(kind=>({sourceId:'synthetic-'+kind,kind,documentHash:hash('SYNTHETIC '+kind),locator:'Synthetic section',scope:'Test data only',reviewedAt:'2026-01-01T00:00:00.000Z',reviewerId:'synthetic-source-reviewer',method:'original_checked',verdict:'pass',aiUseAllowed:true,summaryPublicAllowed:true}))};
  const row={id:randomUUID(),job_id:f.jobId,owner_id:f.ownerId,state_version:snapshot.job.state_version,source_hash:f.sourceSnapshotHash,candidate_hash:f.candidate.candidateHash,
   evidence_hash:snapshot.evidence_hash,feedback_hash:hash(''),proposal_text:prepared.proposalText,proposal_hash:prepared.proposalHash,artifact_text:prepared.artifactText,artifact_hash:prepared.artifactHash,
   base_artifact_hash:base.artifactHash,education_text:JSON.stringify(education),education_hash:hash(JSON.stringify(education)),checks_hash:runtime.evidence.checksHash,lock_hash:hash('synthetic-lock'),policy_version:'synthetic-release-v1'};
  const admin=async fn=>{await f.db.exec('reset role');try{return await fn();}finally{await f.db.exec('set role service_role');}};
  const issue=async(patch={})=>{const r={...row,...patch};await admin(()=>f.db.query('insert into studio.release_reviews('+Object.keys(r).join(',')+') values('+Object.keys(r).map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(r)));return r;};
  await admin(()=>f.db.query('insert into studio.release_baseline(singleton,enabled,artifact_hash,lock_hash,policy_version) values(true,true,$1,$2,$3)',[base.artifactHash,row.lock_hash,row.policy_version]));
  await issue();
  const release=createReleaseApprovalService({db:f.client.schema('studio'),ownerId:f.ownerId,enabled:true});
  const body=()=>({reviewId:row.id,proposalHash:row.proposal_hash,clientRequestId:randomUUID(),confirmPublication:true});
  return {...f,release,row,base,prepared,education,admin,issue,body};
 }catch(error){await f.db.close();throw error;}
}
