import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, productionInputs, assertNoLinks } from './content.mjs';
import { bundleCatalog, safeRemove, toCard } from './build.mjs';
import { serveDirectory } from './serve.mjs';

// Explicitly local draft output. This path never enters the production build.
export async function buildGeneticsPreview() {
  const input = await productionInputs();
  const draft = input.packages.find(item => item.meta.id === 'mendel-inheritance');
  if (!draft || draft.meta.stage !== 'draft') throw new Error('LOCAL_DRAFT_REQUIRED');
  const output = path.join(ROOT, '.local/catalog-tests/genetics-preview');
  await safeRemove(output);
  await bundleCatalog(output, input.config, [toCard(draft, input.config.basePath)]);
  const index = path.join(output, 'index.html');
  const html = await fs.readFile(index, 'utf8');
  await fs.writeFile(index, html.replace('<body>', '<body><aside class="fixture-banner">미승인 로컬 초안 · 교육과정·교과서 미대조 · 공개 배포 제외</aside>'));
  for (const file of draft.manifest) {
    const target = path.join(output, 'simulations', draft.meta.id, file.path);
    await assertNoLinks(target);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(draft.folder, file.path), target);
  }
  return { output, basePath: input.config.basePath, candidateHash: draft.candidateHash };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await buildGeneticsPreview();
    const index = process.argv.indexOf('--port');
    const port = index < 0 ? 4176 : Number(process.argv[index + 1]);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT_INVALID');
    console.log(`LOCAL_DRAFT ${result.candidateHash}`);
    const server = await serveDirectory(result.output, result.basePath, port);
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
  } catch (error) { console.error(`PREVIEW_FAILED: ${error.message}`); process.exitCode = 1; }
}
