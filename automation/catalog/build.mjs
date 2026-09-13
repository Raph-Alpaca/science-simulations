import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { ROOT, assertNoLinks, exists, fileManifest, hash, productionInputs, verifyArtifactHash } from './content.mjs';

export async function safeRemove(directory) {
  const absolute = path.resolve(directory);
  const allowed = ['dist/catalog','.local/catalog-builds','.local/catalog-tests','.local/catalog-fixtures'].map(p => path.join(ROOT,p));
  if (!allowed.some(base => absolute === base || absolute.startsWith(base + path.sep))) throw new Error('OUTPUT_OUTSIDE_ALLOWED_ROOT');
  await assertNoLinks(absolute);
  await fs.rm(absolute, { recursive: true, force: true });
}

export async function bundleCatalog(output, config, cards, fixture = false) {
  await fs.mkdir(output, { recursive: true });
  const template = await fs.readFile(path.join(ROOT,'apps/catalog/index.html'),'utf8');
  await fs.writeFile(path.join(output,'index.html'), template.replaceAll('__BASE__', config.basePath).replace('__FIXTURE__', fixture ? '<aside class="fixture-banner">검사용 데이터 · 실제 교육 콘텐츠가 아닙니다</aside>' : ''));
  await build({ entryPoints: [path.join(ROOT,'apps/catalog/src/main.ts')], bundle: true, format: 'esm', minify: true, target: ['chrome111','firefox111','safari16.4'], outfile: path.join(output,'assets/app.js'), logLevel: 'silent' });
  await fs.copyFile(path.join(ROOT,'apps/catalog/src/styles.css'),path.join(output,'assets/styles.css'));
  await fs.writeFile(path.join(output,'catalog.json'),JSON.stringify({ schemaVersion: 1, ...config, note: undefined, cards }));
}

export function toCard({ meta }, basePath) {
  return { id: meta.id, title: meta.title, grade: meta.grade, unit: meta.unit, summary: meta.summary, concepts: meta.concepts, href: `${basePath}simulations/${meta.id}/${meta.entry}` };
}

export async function buildCatalog() {
  const input = await productionInputs();
  const destination = path.join(ROOT,'dist/catalog');
  if (await exists(destination) && !await exists(path.join(destination,'catalog.json'))) throw new Error('UNKNOWN_OUTPUT_DIRECTORY');
  const stage = path.join(ROOT,'.local/catalog-builds',crypto.randomUUID());
  await assertNoLinks(stage);
  try {
    await bundleCatalog(stage, input.config, input.selected.map(p => toCard(p,input.config.basePath)));
    // No fixture/source tree is copied. Only trusted selected packages may enter output.
    for (const item of input.selected) for (const file of item.manifest) {
      const target = path.join(stage,'simulations',item.meta.id,file.path);
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.copyFile(path.join(item.folder,file.path),target);
    }
    const artifactHash = hash(JSON.stringify(await fileManifest(stage)));
    verifyArtifactHash(input.approvals, artifactHash);
    await safeRemove(destination);
    await fs.mkdir(path.dirname(destination),{recursive:true});
    await fs.rename(stage,destination);
    return { output: 'dist/catalog', validated: input.packages.length, publishedCards: input.selected.length, artifactHash };
  } finally { await safeRemove(stage); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await buildCatalog(),null,2)); }
  catch(e) { console.error(`BUILD_FAILED: ${e.message}`); process.exitCode = 1; }
}
