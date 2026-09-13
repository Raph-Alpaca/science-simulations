export const MAX_SAMPLES = 10000;
const SINGLE = /^(RR|Rr|rr)$/;
const DOUBLE = /^(RR|Rr|rr)(YY|Yy|yy)$/;
function genes(parent) {
  if (typeof parent !== 'string' || !(SINGLE.test(parent) || DOUBLE.test(parent))) throw new TypeError('지원하지 않는 부모 유전자형');
  return parent.match(/.{2}/g);
}
export function gametes(parent) {
  let result = [{ alleles: '', probability: 1 }];
  for (const pair of genes(parent)) {
    const next = new Map();
    for (const item of result) for (const allele of pair) {
      const key = item.alleles + allele;
      next.set(key, (next.get(key) || 0) + item.probability / 2);
    }
    result = [...next].map(([alleles, probability]) => ({ alleles, probability }));
  }
  return result;
}
function combine(a, b) {
  return [...a].map((allele, index) => [allele, b[index]].sort().join('')).join('');
}
export function phenotype(genotype) {
  genes(genotype);
  const shape = genotype.includes('R') ? 'round' : 'wrinkled';
  return genotype.length === 2 ? shape : shape + (genotype.includes('Y') ? 'Yellow' : 'Green');
}
export function cross(parentA, parentB) {
  const gametesA = gametes(parentA), gametesB = gametes(parentB);
  if (parentA.length !== parentB.length) throw new TypeError('부모의 유전자 수가 다름');
  const genotypes = {}, phenotypes = {}, cells = [];
  for (const a of gametesA) for (const b of gametesB) {
    const genotype = combine(a.alleles, b.alleles), trait = phenotype(genotype);
    const probability = a.probability * b.probability;
    genotypes[genotype] = (genotypes[genotype] || 0) + probability;
    phenotypes[trait] = (phenotypes[trait] || 0) + probability;
    cells.push({ a: a.alleles, b: b.alleles, genotype, phenotype: trait, probability });
  }
  return { genotypes, phenotypes, gametesA, gametesB, cells };
}
export function sample(parentA, parentB, count, rng = Math.random) {
  if (!Number.isInteger(count) || count < 0 || count > MAX_SAMPLES) throw new RangeError('표본 수는 0~10000의 정수');
  const theory = cross(parentA, parentB);
  const choose = (options) => {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('난수는 0 이상 1 미만');
    let sum = 0;
    for (const option of options) { sum += option.probability; if (value < sum) return option.alleles; }
    return options.at(-1).alleles;
  };
  const result = { count, genotypes: {}, phenotypes: {}, last: null };
  for (let i = 0; i < count; i++) {
    const a = choose(theory.gametesA), b = choose(theory.gametesB);
    const genotype = combine(a, b), trait = phenotype(genotype);
    result.genotypes[genotype] = (result.genotypes[genotype] || 0) + 1;
    result.phenotypes[trait] = (result.phenotypes[trait] || 0) + 1;
    result.last = { a, b, genotype, phenotype: trait };
  }
  return result;
}
