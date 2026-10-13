import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {config,metadata} from '../fixtures/data.mjs';
import {hash,LIMITS} from '../../packages/contracts/content-source.js';
import {assertPublicationEvidence} from '../../packages/contracts/index.js';
import {ROOT,fileManifest,assertNoLinks,productionInputs} from '../../automation/catalog/content.mjs';
import {parseCandidate} from '../../automation/runner/candidate.mjs';
import {encodeArtifactBundle,openArtifactBundle,prepareCatalogRelease,assertCatalogReleaseApproval} from '../../automation/publish/artifact-bundle.mjs';
import {captureArtifactBundle,stageArtifactBundle,assertStagedArtifact} from '../../automation/publish/artifact-storage.mjs';

// Synthetic source receipts and teacher identifiers only. These tests neither
// certify original sources nor create authenticated approval or publish content.
const jobId='11111111-1111-4111-8111-111111111111',ownerId='22222222-2222-4222-8222-222222222222';
const kinds=['curriculum','textbook','science'];
const b64=(name,body)=>({path:name,bytesBase64:Buffer.from(body).toString('base64')});
function baseArtifact() {
  return encodeArtifactBundle([
    b64('index.html','<!doctype html><title>Synthetic catalog</title>'),
    b64('catalog.json',JSON.stringify({...config,cards:[]})),
    b64('assets/app.js','globalThis.ARTIFACT_CODE_EXECUTED=true;'),
    b64('assets/logo.png',Buffer.from([255,0,10,13,127]))
  ]);
}
function candidate({id='fixture-light',title='합성 공개 후보',stage='draft',entry='index.html',extra=[],kind='interactive_2d'}={}) {
  const meta=metadata(id,{title,stage,entry,curriculumRevision:'2022',sourceIds:kinds.map(k=>'fixture-'+k)});
  const context={contentId:id,grade:meta.grade,unit:meta.unit,schoolYear:null,curriculumRevision:meta.curriculumRevision,config,sources:meta.sourceIds.map(id=>({id}))};
  const inputText=JSON.stringify({input:{generationKind:kind,requirements:[{id:'R1',text:'Synthetic only'}]},context});
  const candidateText=JSON.stringify({files:[
    {path:'meta.json',content:JSON.stringify(meta)},
    {path:entry,content:'<!doctype html><title>'+title+'</title><script src="ui.js"></script>'},
    {path:'ui.js',content:'globalThis.ARTIFACT_CODE_EXECUTED=true;'},...extra
  ]});
  const parsed=parseCandidate(candidateText,context);
  const expected={sourceSnapshotHash:hash(inputText),candidateHash:parsed.candidateHash,baselineSha:'a'.repeat(40),attempt:0};
  return {packet:{inputText,candidateText,expected},parsed};
}
function prepare(data=candidate(),base=baseArtifact()) {
  return prepareCatalogRelease({jobId,baseArtifactText:base.artifactText,expectedBaseArtifactHash:base.artifactHash,packet:data.packet,config});
}
function approvalFor(prepared,data) {
  const proposal=JSON.parse(prepared.proposalText);
  const education={schemaVersion:1,contentId:proposal.contentId,candidateHash:proposal.candidateHash,sourceSnapshotHash:proposal.sourceSnapshotHash,
    grade:data.parsed.meta.grade,unit:data.parsed.meta.unit,curriculumRevision:'2022',scope:'curriculum_revision',records:kinds.map(kind=>({
      sourceId:'fixture-'+kind,kind,documentHash:hash('SYNTHETIC '+kind),locator:'Synthetic section 1',scope:'Synthetic fixture only',
      reviewedAt:'2026-01-01T00:00:00.000Z',reviewerId:'synthetic-reviewer',method:'original_checked',verdict:'pass',aiUseAllowed:true,summaryPublicAllowed:true}))};
  const educationEvidence=JSON.stringify(education);
  const evidenceVersion={sourceSnapshotHash:proposal.sourceSnapshotHash,checksHash:hash('checks'),lockHash:hash('lock'),educationHash:hash(educationEvidence),policyVersion:'synthetic-release-v2',
    checks:Object.fromEntries(['curriculum','textbook','rights','science','learning','runtime'].map(k=>[k,'pass']))};
  const approval={schemaVersion:2,jobId,contentId:proposal.contentId,candidateHash:proposal.candidateHash,artifactHash:prepared.artifactHash,
    proposalHash:prepared.proposalHash,approvalId:'synthetic-approval',approvedAt:'2026-01-02T00:00:00.000Z',approverId:ownerId,actorType:'teacher',decision:'approve',invalidatedAt:null,educationEvidence,evidenceVersion};
  const current={...proposal,...evidenceVersion,ownerId};
  return {approval,current};
}
async function cleanup(directory) {
  const root=path.join(ROOT,'.local/release-artifacts');
  assert.equal(path.dirname(path.resolve(directory)),root);
  assert.match(path.basename(directory),/^[a-f0-9-]{36}$/);
  await assertNoLinks(directory);
  await fs.rm(directory,{recursive:true,force:true});
}

test('constructs deterministic complete catalogs while retaining the exact 2D/3D candidate bytes and draft metadata',()=>{
  for(const kind of ['interactive_2d','interactive_3d']) {
    const data=candidate({kind}),base=baseArtifact(),a=prepare(data,base),b=prepare(data,base);
    assert.deepEqual(a,b);
    const bundle=openArtifactBundle(a.artifactText,a.artifactHash),prefix='simulations/fixture-light/';
    for(const source of data.parsed.files)assert.equal(Buffer.from(bundle.files.find(f=>f.path===prefix+source.path).bytesBase64,'base64').toString('utf8'),source.content);
    assert.equal(JSON.parse(Buffer.from(bundle.files.find(f=>f.path===prefix+'meta.json').bytesBase64,'base64')).stage,'draft');
    assert.equal(hash(JSON.stringify(bundle.manifest.filter(f=>f.path.startsWith(prefix)).map(f=>({path:f.path.slice(prefix.length),hash:f.hash})))),data.parsed.candidateHash);
    assert.equal(globalThis.ARTIFACT_CODE_EXECUTED,undefined);
    assert.equal(Object.isFrozen(a),true);
  }
});

test('adding and revising a card preserves unrelated files, card order and the stable entry URL',()=>{
  const first=prepare(candidate({id:'fixture-one',extra:[{path:'old.js',content:'old file'}]}));
  const second=prepare(candidate({id:'fixture-two'}),first);
  const before=openArtifactBundle(second.artifactText,second.artifactHash);
  const revised=prepare(candidate({id:'fixture-one',title:'수정한 제목'}),second);
  const after=openArtifactBundle(revised.artifactText,revised.artifactHash);
  for(const file of before.files.filter(f=>f.path!=='catalog.json'&&!f.path.startsWith('simulations/fixture-one/')))
    assert.deepEqual(after.files.find(f=>f.path===file.path),file);
  const cardData=JSON.parse(Buffer.from(after.files.find(f=>f.path==='catalog.json').bytesBase64,'base64'));
  assert.deepEqual(cardData.cards.map(c=>c.id),['fixture-one','fixture-two']);
  assert.equal(cardData.cards[0].title,'수정한 제목');
  assert.equal(cardData.cards[0].href,'/science-simulations/simulations/fixture-one/index.html');
  assert.equal(after.files.some(f=>f.path==='simulations/fixture-one/old.js'),false);
  assert.throws(()=>prepare(candidate({id:'fixture-one',entry:'moved.html'}),revised),/RELEASE_ENTRY_CHANGED/);
});

test('an exact external v2 approval can authorize unchanged draft bytes; legacy v1 still requires ready',()=>{
  const data=candidate(),prepared=prepare(data),authorization=approvalFor(prepared,data);
  const receipt=assertCatalogReleaseApproval({...prepared,...authorization});
  assert.equal(receipt.candidateHash,data.parsed.candidateHash);
  assert.equal(receipt.artifactHash,prepared.artifactHash);
  assert.equal(receipt.publicPath,'/science-simulations/simulations/fixture-light/index.html');
  assert.throws(()=>assertPublicationEvidence(data.parsed.meta,{...authorization.approval,schemaVersion:1}),/PUBLICATION_NOT_READY/);
  assert.throws(()=>assertPublicationEvidence({...data.parsed.meta,stage:'withdrawn'},authorization.approval),/PUBLICATION_NOT_READY/);
  assert.throws(()=>assertPublicationEvidence(data.parsed.meta,undefined),/PUBLICATION_NOT_READY/);
});

test('comments, change requests, agent assertions, revoked approvals and other teachers cannot authorize publication',()=>{
  const data=candidate(),prepared=prepare(data),auth=approvalFor(prepared,data);
  for(const patch of [{decision:'request_changes'},{decision:'note'},{actorType:'agent'},{actorType:'model'},
    {invalidatedAt:'2026-01-03T00:00:00.000Z'},{invalidatedAt:undefined},{approverId:randomUUID()},
    {approvedAt:'2099-01-01T00:00:00.000Z'},{proposalHash:hash('other')},{schemaVersion:1}])
    assert.throws(()=>assertCatalogReleaseApproval({...prepared,...auth,approval:{...auth.approval,...patch}}),/RELEASE_APPROVAL_REQUIRED/);
});

test('approval binds the exact job, candidate, source, base catalog, checker baseline and attempt',()=>{
  const data=candidate(),prepared=prepare(data),auth=approvalFor(prepared,data);
  for(const patch of [{jobId:randomUUID()},{contentId:'fixture-other'},{candidateHash:hash('new')},{sourceSnapshotHash:hash('new')},
    {baseArtifactHash:hash('another release')},{baselineSha:'b'.repeat(40)},{attempt:1}])
    assert.throws(()=>assertCatalogReleaseApproval({...prepared,...auth,current:{...auth.current,...patch}}),/RELEASE_CONTEXT_CHANGED/);
  assert.throws(()=>assertCatalogReleaseApproval({...prepared,...auth,approval:{...auth.approval,jobId:randomUUID()}}),/RELEASE_APPROVAL_CHANGED/);
  const revised=prepare(candidate({title:'요청에 따라 수정한 결과'}));
  assert.throws(()=>assertCatalogReleaseApproval({...revised,...auth}),/RELEASE_APPROVAL_REQUIRED/);
  const otherJob=prepareCatalogRelease({jobId:randomUUID(),baseArtifactText:baseArtifact().artifactText,expectedBaseArtifactHash:baseArtifact().artifactHash,packet:data.packet,config});
  assert.equal(otherJob.artifactHash,prepared.artifactHash);
  assert.notEqual(otherJob.proposalHash,prepared.proposalHash);
});

test('changed policy, checks, lock, source receipts or failed review cannot reuse approval',()=>{
  const data=candidate(),prepared=prepare(data),auth=approvalFor(prepared,data);
  for(const key of ['checksHash','lockHash','educationHash','policyVersion'])
    assert.throws(()=>assertCatalogReleaseApproval({...prepared,...auth,current:{...auth.current,[key]:hash('changed')}}),/RELEASE_EVIDENCE_CHANGED/);
  for(const key of Object.keys(auth.approval.evidenceVersion.checks))
    assert.throws(()=>assertCatalogReleaseApproval({...prepared,...auth,approval:{...auth.approval,evidenceVersion:{...auth.approval.evidenceVersion,checks:{...auth.approval.evidenceVersion.checks,[key]:'fail'}}}}),/EVIDENCE_MISSING/);
  assert.throws(()=>assertCatalogReleaseApproval({...prepared,...auth,approval:{...auth.approval,educationEvidence:auth.approval.educationEvidence+' '}}),/EDUCATION_EVIDENCE_INVALID/);
});

test('tampered, rehashed or extended artifacts and changed proposals fail against the pinned approval',()=>{
  const data=candidate(),prepared=prepare(data),auth=approvalFor(prepared,data);
  assert.throws(()=>assertCatalogReleaseApproval({...prepared,...auth,proposalText:prepared.proposalText+' '}),/RELEASE_PROPOSAL_CHANGED/);
  const packet=JSON.parse(prepared.artifactText);packet.files.find(f=>f.path==='assets/app.js').bytesBase64=Buffer.from('changed').toString('base64');
  assert.throws(()=>assertCatalogReleaseApproval({...prepared,...auth,artifactText:JSON.stringify(packet)}),/ARTIFACT_HASH_MISMATCH/);
  const repacked=encodeArtifactBundle(packet.files);
  assert.throws(()=>assertCatalogReleaseApproval({...prepared,...auth,artifactText:repacked.artifactText}),/RELEASE_ARTIFACT_INVALID/);
  const extended=encodeArtifactBundle([...JSON.parse(prepared.artifactText).files,b64('assets/extra.js','extra')]);
  assert.throws(()=>assertCatalogReleaseApproval({...prepared,...auth,artifactText:extended.artifactText}),/RELEASE_ARTIFACT_INVALID/);
});

test('untrusted base hashes, unlisted simulation folders, mismatched cards and config are rejected',()=>{
  const base=baseArtifact(),data=candidate();
  assert.throws(()=>prepareCatalogRelease({jobId,baseArtifactText:base.artifactText,expectedBaseArtifactHash:hash('wrong'),packet:data.packet,config}),/RELEASE_ARTIFACT_INVALID/);
  const orphan=encodeArtifactBundle([...JSON.parse(base.artifactText).files,b64('simulations/orphan/index.html','unlisted')]);
  assert.throws(()=>prepare(data,orphan),/RELEASE_ORPHAN_CONTENT/);
  const first=prepare(data),files=JSON.parse(first.artifactText).files;
  const catalog=files.find(f=>f.path==='catalog.json'),value=JSON.parse(Buffer.from(catalog.bytesBase64,'base64'));
  value.cards[0].href='https://other.invalid/';catalog.bytesBase64=Buffer.from(JSON.stringify(value)).toString('base64');
  assert.throws(()=>prepare(data,encodeArtifactBundle(files)),/RELEASE_CATALOG_INVALID/);
  assert.throws(()=>prepareCatalogRelease({jobId,baseArtifactText:base.artifactText,expectedBaseArtifactHash:base.artifactHash,packet:data.packet,config:{...config,basePath:'/other/'}}),/RELEASE_CATALOG_CHANGED/);
});

test('encoded size, canonical base64, exact file fields and path checks apply before any write',()=>{
  const base=baseArtifact(),packet=JSON.parse(base.artifactText);
  packet.files[0].bytesBase64+='\n';assert.throws(()=>openArtifactBundle(JSON.stringify(packet),base.artifactHash));
  for(const name of ['../outside.js','.env','assets/NUL.js','assets/app.js/child.js'])
    assert.throws(()=>encodeArtifactBundle([...JSON.parse(base.artifactText).files,b64(name,'bad')]));
  assert.throws(()=>encodeArtifactBundle([...JSON.parse(base.artifactText).files,{...b64('assets/more.js','x'),privateNote:'not allowed'}]));
  assert.throws(()=>encodeArtifactBundle([...JSON.parse(base.artifactText).files,b64('assets/large.js',Buffer.alloc(LIMITS.fileBytes+1))]));
});

test('private staging and capture preserve real file bytes, avoid code execution and never overwrite a prior stage',async t=>{
  const data=candidate(),prepared=prepare(data),before=globalThis.ARTIFACT_CODE_EXECUTED;
  const a=await stageArtifactBundle({artifactText:prepared.artifactText,expectedArtifactHash:prepared.artifactHash});t.after(()=>cleanup(a.directory));
  const b=await stageArtifactBundle({artifactText:prepared.artifactText,expectedArtifactHash:prepared.artifactHash});t.after(()=>cleanup(b.directory));
  assert.notEqual(a.directory,b.directory);
  assert.equal(hash(JSON.stringify(await fileManifest(a.site))),prepared.artifactHash);
  const captured=await captureArtifactBundle(a.site);assert.deepEqual(captured,{artifactText:prepared.artifactText,artifactHash:prepared.artifactHash});
  assert.equal((await assertStagedArtifact(a.directory,prepared.artifactHash)).site,a.site);
  assert.equal(globalThis.ARTIFACT_CODE_EXECUTED,before);
  assert.equal((await fileManifest(a.site)).some(f=>['receipt.json','bundle.json'].includes(f.path)),false);
  await fs.link(path.join(a.site,'index.html'),path.join(a.site,'linked.html'));
  await assert.rejects(captureArtifactBundle(a.site),/LINK_NOT_ALLOWED/);
});

test('files changed after staging, extra files, incomplete output and unrelated directories cannot be uploaded using an old receipt',async t=>{
  const prepared=prepare(),stage=await stageArtifactBundle({artifactText:prepared.artifactText,expectedArtifactHash:prepared.artifactHash});
  t.after(()=>cleanup(stage.directory));
  await assert.rejects(assertStagedArtifact(ROOT,prepared.artifactHash),/RELEASE_STAGE_PATH_REJECTED/);
  const entry=path.join(stage.site,'index.html'),original=await fs.readFile(entry);
  await fs.writeFile(entry,'changed');
  await assert.rejects(assertStagedArtifact(stage.directory,prepared.artifactHash),/RELEASE_STAGED_BYTES_CHANGED/);
  await fs.writeFile(entry,original);
  const extra=path.join(stage.site,'assets','extra.js');await fs.writeFile(extra,'extra');
  await assert.rejects(assertStagedArtifact(stage.directory,prepared.artifactHash),/RELEASE_STAGED_BYTES_CHANGED/);
  await fs.unlink(extra);
  await fs.writeFile(path.join(stage.directory,'INCOMPLETE'),'failed');
  await assert.rejects(assertStagedArtifact(stage.directory,prepared.artifactHash),/RELEASE_STAGE_INCOMPLETE/);
});

test('production still selects zero contents while authenticated source and approval services are absent',async()=>{
  const input=await productionInputs();
  assert.deepEqual(input.selected,[]);
  assert.deepEqual(input.approvals,[]);
});
