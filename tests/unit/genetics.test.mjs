import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gametes, cross, sample, MAX_SAMPLES } from '../../content/simulations/mendel-inheritance/model.js';
import { ROOT, productionInputs } from '../../automation/catalog/content.mjs';

test('S01 exact monohybrid probabilities are independently specified', () => {
  assert.deepEqual(cross('RR','rr').genotypes, { Rr: 1 });
  assert.deepEqual(cross('Rr','Rr').genotypes, { RR: .25, Rr: .5, rr: .25 });
  assert.deepEqual(cross('rr','rr').genotypes, { rr: 1 });
  assert.deepEqual(cross('Rr','Rr').phenotypes, { round: .75, wrinkled: .25 });
});
test('S01 exact dihybrid genotype and phenotype probabilities', () => {
  const result = cross('RrYy','RrYy');
  assert.deepEqual(result.genotypes, { RRYY:1/16,RRYy:2/16,RRyy:1/16,RrYY:2/16,RrYy:4/16,Rryy:2/16,rrYY:1/16,rrYy:2/16,rryy:1/16 });
  assert.deepEqual(result.phenotypes, {roundYellow:9/16,roundGreen:3/16,wrinkledYellow:3/16,wrinkledGreen:1/16});
});
test('S03 each gamete has one allele per locus, unique probabilities sum to one', () => {
  assert.deepEqual(gametes('RrYy'), ['RY','Ry','rY','ry'].map(alleles => ({alleles,probability:.25})));
  for (const parent of ['RR','Rr','rr','RRYY','RRYy','RRyy','RrYY','RrYy','Rryy','rrYY','rrYy','rryy']) {
    const values=gametes(parent);
    assert.equal(values.reduce((n,g)=>n+g.probability,0),1);
    assert.ok(values.every(g=>parent.length===2 ? /^[Rr]$/.test(g.alleles) : /^[Rr][Yy]$/.test(g.alleles)));
  }
});
test('all nine single-locus crosses sum to one and commute', () => {
  for (const a of ['RR','Rr','rr']) for (const b of ['RR','Rr','rr']) {
    const result=cross(a,b);
    assert.equal(Object.values(result.genotypes).reduce((x,y)=>x+y,0),1);
    assert.deepEqual(result.genotypes,cross(b,a).genotypes);
  }
});
test('S02 seeded samples conserve counts at 1/10/100/1000 without forcing ratios', () => {
  let seed=913;
  const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for (const n of [1,10,100,1000]) {
    const result=sample('RrYy','RrYy',n,rng);
    assert.equal(result.count,n);
    assert.equal(Object.values(result.genotypes).reduce((x,y)=>x+y,0),n);
    assert.equal(Object.values(result.phenotypes).reduce((x,y)=>x+y,0),n);
  }
  // Deliberately extreme RNG proves sampling does not impose theoretical ratios.
  assert.deepEqual(sample('Rr','Rr',100,()=>0).genotypes,{RR:100});
  assert.deepEqual(sample('Rr','Rr',10,()=>.999999).genotypes,{rr:10});
});
test('invalid parents, counts and RNG fail; finite sample limit', () => {
  assert.equal(MAX_SAMPLES,10000);
  for (const parent of ['','rR','RRrr','RrYYzz']) assert.throws(()=>gametes(parent));
  assert.throws(()=>cross('Rr','RrYy'));
  for (const count of [-1,1.2,10001,Infinity]) assert.throws(()=>sample('Rr','Rr',count));
  for (const value of [-.1,1,NaN]) assert.throws(()=>sample('Rr','Rr',1,()=>value));
});
test('real genetics draft validates but is never selected for publication', async () => {
  const input=await productionInputs();
  const draft=input.packages.find(p=>p.meta.id==='mendel-inheritance');
  assert.ok(draft);
  assert.equal(draft.meta.stage,'draft');
  assert.equal(draft.meta.schoolYear,null);
  assert.equal(draft.meta.curriculumRevision,null);
  assert.equal(input.selected.length,0);
  const catalog=JSON.parse(await fs.readFile(path.join(ROOT,'dist/catalog/catalog.json'),'utf8'));
  assert.equal(catalog.cards.some(c=>c.id==='mendel-inheritance'),false);
});
