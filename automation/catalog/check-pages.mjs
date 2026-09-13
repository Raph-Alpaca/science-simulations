import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, fileManifest, hash } from './content.mjs';
const folder=path.join(ROOT,'dist/catalog');
const manifest=await fileManifest(folder);
assert.deepEqual(manifest.map(f=>f.path),['assets/app.js','assets/styles.css','catalog.json','index.html']);
const data=JSON.parse(await fs.readFile(path.join(folder,'catalog.json'),'utf8'));
assert.equal(data.basePath,'/science-simulations/');
assert.deepEqual(data.cards,[]);
for(const file of manifest) {
  const text=await fs.readFile(path.join(folder,file.path),'utf8');
  assert.ok(!/mendel-inheritance|fixture-light|PRIVATE KEY|github_pat_|sk-proj-/.test(text),`UNEXPECTED_PUBLIC_DATA: ${file.path}`);
}
console.log(JSON.stringify({files:manifest,cards:0,artifactHash:hash(JSON.stringify(manifest))},null,2));
