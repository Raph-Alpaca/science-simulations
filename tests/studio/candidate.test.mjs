import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hash} from '../../automation/catalog/content.mjs';
import {parseCandidate} from '../../automation/runner/candidate.mjs';

const meta=JSON.parse(readFileSync('content/simulations/mendel-inheritance/meta.json','utf8'));
const context={contentId:meta.id,grade:3,unit:meta.unit,schoolYear:null,curriculumRevision:null,
 config:JSON.parse(readFileSync('config/catalog.json','utf8')),sources:meta.sourceIds.map(id=>({id}))};
const files=()=>[{path:'index.html',content:'<!doctype html><canvas></canvas>'},{path:'meta.json',content:JSON.stringify(meta)},
 {path:'ui.js',content:'// Inert fixture: 3D would use browser WebGL, without installing packages.'}];
const parse=(list=files(),extra={})=>parseCandidate(JSON.stringify({files:list}),{...context,...extra});

test('source-only candidate preserves identity, stays unapproved and binds every file byte',()=>{
 const a=parse(),b=parse(files().reverse());
 assert.equal(a.candidateHash,b.candidateHash);assert.equal(a.meta.stage,'draft');assert.equal(a.contentId,meta.id);
 assert.equal(a.manifest.find(f=>f.path==='index.html').hash,hash(files()[0].content));
 assert.ok(Object.isFrozen(a.files[0]));assert.throws(()=>{a.files[0].content='changed';});
 const changed=files();changed[0].content+=' ';assert.notEqual(a.candidateHash,parse(changed).candidateHash);
});
test('rejects traversal, private paths, Windows devices and alternate data streams',()=>{
 for(const path of ['../apps/studio/ui.js','.env','.github/workflows/test.json','/tmp/test.js','C:/tmp/test.js',
  'data/../../test.js','data\\test.js','%2e%2e/test.js','NUL.js','data/COM1.json','ui.js:secret','data/trailing./a.js']){
  assert.throws(()=>parse([...files(),{path,content:'no'}]),e=>e.code==='CANDIDATE_PATH_REJECTED',path);
 }
});
test('rejects dependencies, executables, guidelines and system configuration anywhere',()=>{
 for(const path of ['package.json','data/package.json','package-lock.json','AGENTS.md','script.ps1','tools.exe','config.json','tsconfig.json']){
  assert.throws(()=>parse([...files(),{path,content:'{}'}]),e=>['CANDIDATE_PATH_REJECTED','CANDIDATE_JSON_PATH_REJECTED'].includes(e.code),path);
 }
});
test('rejects case aliases and file/directory collisions before writing',()=>{
 assert.throws(()=>parse([...files(),{path:'UI.js',content:'x'}]),/CANDIDATE_PATH_COLLISION/);
 assert.throws(()=>parse([...files(),{path:'UI.js/child.js',content:'x'}]),/CANDIDATE_PATH_COLLISION/);
});
test('cannot change identity, claim school year/curriculum, or self-approve publication',()=>{
 for(const change of [{id:'another-content'},{grade:2},{schoolYear:2026},{curriculumRevision:'2022'},{stage:'ready'},{approvalIsExternal:false}]){
  const list=files();list[1].content=JSON.stringify({...meta,...change});assert.throws(()=>parse(list));
 }
 const list=files();list[1].content=JSON.stringify({...meta,sourceIds:['invented-source']});assert.throws(()=>parse(list),/CANDIDATE_META_INVALID/);
});
test('requires a real entry and metadata, with bounded JSON-only response',()=>{
 assert.throws(()=>parse(files().filter(f=>f.path!=='index.html')),/CANDIDATE_ENTRY_MISSING/);
 assert.throws(()=>parse(files().filter(f=>f.path!=='meta.json')),/CANDIDATE_META_INVALID/);
 assert.throws(()=>parseCandidate('```json\n{}\n```',context),/CANDIDATE_JSON_INVALID/);
 assert.throws(()=>parseCandidate(JSON.stringify({files:files(),approval:{pass:true}}),context),/CANDIDATE_FORMAT_INVALID/);
 assert.throws(()=>parseCandidate(' '.repeat(2_000_001),context),/CANDIDATE_SIZE_LIMIT/);
 assert.throws(()=>parse(Array.from({length:101},(_,i)=>({path:'file'+i+'.js',content:''}))),/CANDIDATE_FILE_LIMIT/);
});
