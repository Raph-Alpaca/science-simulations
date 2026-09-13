import fs from 'node:fs/promises';
import path from 'node:path';
import { config, samples, sources } from './data.mjs';
import { assertMetadata } from '@science/contracts';
import { ROOT } from '../../automation/catalog/content.mjs';
import { bundleCatalog, safeRemove, toCard } from '../../automation/catalog/build.mjs';
import { serveDirectory } from '../../automation/catalog/serve.mjs';

const output = path.join(ROOT,'.local/catalog-fixtures');
await safeRemove(output);
for (const meta of samples) assertMetadata(meta,meta.id,config,sources);
await bundleCatalog(output,config,samples.map(meta => toCard({meta},config.basePath)),true);
for (const meta of samples) {
  const folder = path.join(output,'simulations',meta.id);
  await fs.mkdir(folder,{recursive:true});
  await fs.writeFile(path.join(folder,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><title>검사용 진입점</title><h1>검사용 진입점</h1><p>실제 교육 콘텐츠가 아닙니다.</p><a href="${config.basePath}">검사 자료실로 돌아가기</a></html>`);
}
const server = await serveDirectory(output,config.basePath,4175);
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,() => server.close(() => process.exit(0)));
