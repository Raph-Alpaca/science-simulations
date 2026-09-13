import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { metadata, config, sources, samples } from '../fixtures/data.mjs';
import { assertMetadata } from '@science/contracts';
import { filterCards, stateFromSearch } from '@science/contracts/catalog';
import { ROOT, readPackages, relativeFile, selectApproved, hash, fileManifest, verifyArtifactHash } from '../../automation/catalog/content.mjs';
import { buildCatalog, safeRemove, toCard } from '../../automation/catalog/build.mjs';

async function sandbox(t) {
  const dir = path.join(ROOT,'.local/catalog-tests',crypto.randomUUID());
  await fs.mkdir(dir,{recursive:true});
  t.after(() => safeRemove(dir));
  return dir;
}
async function content(dir, meta=metadata(), html='<!doctype html><html lang="ko"><title>Fixture</title><h1 id="top">Fixture</h1></html>') {
  const folder = path.join(dir,meta.id);
  await fs.mkdir(folder,{recursive:true});
  await fs.writeFile(path.join(folder,'meta.json'),JSON.stringify(meta));
  await fs.writeFile(path.join(folder,'index.html'),html);
  return folder;
}

test('schema accepts unknown curriculum only as a draft, rejects missing/extra/wrong fields',() => {
  assert.doesNotThrow(() => assertMetadata(metadata(),'fixture-light',config,sources));
  for(const mutation of [m=>delete m.title,m=>m.grade=4,m=>m.stage='published',m=>m.approvalIsExternal=false,m=>m.status='published',m=>m.title='  ',m=>m.concepts=['빛','빛']]) {
    const m=metadata(); mutation(m); assert.throws(() => assertMetadata(m,m.id,config,sources),/META_SCHEMA/);
  }
});
test('folder, common unit and source registry must agree',() => {
  assert.throws(() => assertMetadata(metadata(),'other-id',config,sources),/ID_FOLDER/);
  assert.throws(() => assertMetadata(metadata('fixture-light',{unit:'가짜 단원'}),'fixture-light',config,sources),/UNKNOWN_UNIT/);
  assert.throws(() => assertMetadata(metadata(),'fixture-light',config,[]),/UNKNOWN_SOURCE/);
});
test('rejects traversal, absolute, encoded, hidden and Windows paths',() => {
  for(const value of ['../index.html','/index.html','C:/x.html','..\\x.html','%2e%2e/x','.env','assets/.local/x','file.html?x','folder./x']) assert.throws(() => relativeFile(value));
});
test('combined grade/unit/query filters and Unicode normalization',() => {
  assert.equal(filterCards(samples,{grade:'2',unit:'검사용 단원 B',query:'온도 측정'}).length,1);
  assert.equal(filterCards(samples,{grade:'3',query:'빛'}).length,0);
  assert.equal(filterCards(samples,{query:'　관찰　'}).length,2);
  assert.equal(filterCards(samples,{}).length,3);
});
test('URL restores valid filters, rejects unknown grade/unit and caps query',() => {
  assert.deepEqual(stateFromSearch('?grade=2&unit=검사용+단원+B&q=온도',config),{grade:'2',unit:'검사용 단원 B',query:'온도'});
  assert.equal(stateFromSearch('?grade=9&unit=unknown',config).grade,'');
  assert.equal(stateFromSearch('?q='+ 'x'.repeat(300),config).query.length,150);
});
test('valid metadata files are scanned and unapproved draft is excluded',async t => {
  const dir=await sandbox(t); await content(dir);
  const list=await readPackages(dir,config,sources);
  assert.equal(list.length,1); assert.equal(list[0].candidateHash.length,64);
  assert.deepEqual(selectApproved(list,[],{}),[]);
});
test('duplicate declared ID cannot be published through another folder',async t => {
  const dir=await sandbox(t); const folder=await content(dir);
  await fs.cp(folder,path.join(dir,'another-id'),{recursive:true});
  await assert.rejects(readPackages(dir,config,sources),/ID_FOLDER_MISMATCH/);
});
test('missing entry and broken HTML, CSS, JS links fail',async t => {
  const dir=await sandbox(t); const folder=await content(dir);
  await fs.writeFile(path.join(folder,'meta.json'),JSON.stringify(metadata('fixture-light',{entry:'missing.html'})));
  await assert.rejects(readPackages(dir,config,sources),/MISSING_ENTRY/);
  await fs.writeFile(path.join(folder,'meta.json'),JSON.stringify(metadata()));
  for(const body of ['<img src="missing.png">','<a href="#missing">x</a>','<a href="../outside.html">x</a>']) {
    await fs.writeFile(path.join(folder,'index.html'),body); await assert.rejects(readPackages(dir,config,sources));
  }
  await fs.writeFile(path.join(folder,'index.html'),'<h1>fixture</h1>');
  await fs.writeFile(path.join(folder,'style.css'),'div {background:url(missing.png)}');
  await assert.rejects(readPackages(dir,config,sources),/BROKEN_LINK/);
  await fs.writeFile(path.join(folder,'style.css'),'');
  await fs.writeFile(path.join(folder,'main.js'),"import './missing.js'");
  await assert.rejects(readPackages(dir,config,sources),/BROKEN_LINK/);
});
test('unapproved invalid metadata still fails validation',async t => {
  const dir=await sandbox(t); await content(dir,metadata('fixture-light',{title:''}));
  await assert.rejects(readPackages(dir,config,sources),/META_SCHEMA/);
});
test('private extensions and hardlinks fail before copying',async t => {
  const dir=await sandbox(t); const folder=await content(dir);
  await fs.writeFile(path.join(folder,'private.txt'),'fixture');
  await assert.rejects(readPackages(dir,config,sources),/FILE_TYPE/);
  await fs.unlink(path.join(folder,'private.txt'));
  await fs.link(path.join(folder,'index.html'),path.join(folder,'linked.html'));
  await assert.rejects(readPackages(dir,config,sources),/LINK_NOT_ALLOWED/);
});
test('oversized file fails at finite limit',async t => {
  const dir=await sandbox(t); const folder=await content(dir);
  await fs.writeFile(path.join(folder,'large.js'),Buffer.alloc(2*1024*1024+1));
  await assert.rejects(readPackages(dir,config,sources),/CONTENT_SIZE_LIMIT/);
});
test('approval binds candidate and evidence, title change invalidates previous approval',async t => {
  const dir=await sandbox(t);
  const meta=metadata('fixture-light',{stage:'ready',schoolYear:2099,curriculumRevision:'SYNTHETIC TEST ONLY'});
  const folder=await content(dir,meta); const list=await readPackages(dir,config,sources);
  const evidence={sourceSnapshotHash:hash('source'),checksHash:hash('checks'),lockHash:hash('lock'),policyVersion:'fixture-v1',checks:Object.fromEntries(['curriculum','textbook','rights','science','learning','runtime'].map(k=>[k,'pass']))};
  const approval={schemaVersion:1,contentId:meta.id,candidateHash:list[0].candidateHash,artifactHash:hash('artifact'),approvalId:'fixture-approval',approvedAt:'2099-01-01T00:00:00Z',evidenceVersion:evidence};
  assert.equal(selectApproved(list,[approval],evidence).length,1);
  assert.throws(()=>selectApproved(list,[approval,approval],evidence),/DUPLICATE_APPROVAL/);
  assert.throws(()=>selectApproved(list,[{...approval,candidateHash:hash('other')}],evidence),/CANDIDATE_HASH/);
  assert.throws(()=>selectApproved(list,[approval],{...evidence,policyVersion:'changed'}),/EVIDENCE_VERSION/);
  assert.throws(()=>selectApproved(list,[{...approval,evidenceVersion:{...evidence,checks:{}}}],evidence),/EVIDENCE_MISSING/);
  await fs.writeFile(path.join(folder,'meta.json'),JSON.stringify({...meta,title:'Changed title'}));
  const changed=await readPackages(dir,config,sources);
  assert.equal(toCard(changed[0],config.basePath).href,toCard(list[0],config.basePath).href);
  assert.throws(()=>selectApproved(changed,[approval],evidence),/CANDIDATE_HASH/);
});
test('real build is empty, excludes fixtures and secrets, deterministic across rebuilds',async () => {
  const a=await buildCatalog(); const b=await buildCatalog();
  assert.equal(a.publishedCards,0); assert.equal(a.artifactHash,b.artifactHash);
  const manifest=await fileManifest(path.join(ROOT,'dist/catalog'));
  assert.deepEqual(manifest.map(f=>f.path),['assets/app.js','assets/styles.css','catalog.json','index.html']);
  const output=await fs.readFile(path.join(ROOT,'dist/catalog/catalog.json'),'utf8');
  assert.deepEqual(JSON.parse(output).cards,[]);
  assert.equal(output.includes('fixture-'),false);
});
test('safe cleanup never removes source or reference directories',async () => {
  await assert.rejects(safeRemove(path.join(ROOT,'references')),/OUTPUT_OUTSIDE/);
  await assert.rejects(safeRemove(path.join(ROOT,'.local/reference')),/OUTPUT_OUTSIDE/);
});
test('an approval for another artifact cannot authorize this build',() => {
  assert.doesNotThrow(()=>verifyArtifactHash([{artifactHash:hash('a')}],hash('a')));
  assert.throws(()=>verifyArtifactHash([{artifactHash:hash('a')}],hash('b')),/ARTIFACT_HASH/);
});
test('stage ready cannot replace curriculum evidence or external approval',async t=>{
  const dir=await sandbox(t); await content(dir,metadata('fixture-light',{stage:'ready'}));
  const list=await readPackages(dir,config,sources);
  assert.equal(selectApproved(list,[],{}).length,0);
  assert.throws(()=>selectApproved(list,[{contentId:'fixture-light'}],{}),/PUBLICATION_NOT_READY/);
});
