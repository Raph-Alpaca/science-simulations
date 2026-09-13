import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, assertNoLinks, exists, readJSON } from './content.mjs';
import { buildCatalog } from './build.mjs';

const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
export async function serveDirectory(directory, basePath, port) {
  await assertNoLinks(directory);
  const root = await fs.realpath(directory);
  const server = http.createServer(async (req,res) => {
    const end = (status,body) => { res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'}); res.end(body); };
    try {
      if (!['GET','HEAD'].includes(req.method)) return end(405,'Method not allowed');
      const host = req.headers.host || '';
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) return end(403,'Host not allowed');
      const raw = req.url.split('?')[0];
      let requested;
      try { requested = decodeURIComponent(raw); } catch { return end(400,'Bad path'); }
      if (requested === '/' || requested === basePath.slice(0,-1)) { res.writeHead(302,{Location:basePath}); return res.end(); }
      if (!requested.startsWith(basePath)) return end(404,'Not found');
      const suffix = requested.slice(basePath.length);
      if (suffix.includes('\\') || /[%:\x00-\x1f]/.test(suffix) || suffix.split('/').some(p => p.startsWith('.'))) return end(404,'Not found');
      const relative = suffix.endsWith('/') || !suffix ? suffix + 'index.html' : suffix;
      const file = path.resolve(root,relative);
      if (!file.startsWith(root + path.sep)) return end(404,'Not found');
      await assertNoLinks(file);
      if (!await exists(file) || !(await fs.stat(file)).isFile()) return end(404,'Not found');
      const mime = types[path.extname(file)];
      if (!mime) return end(404,'Not found');
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
      res.end(req.method === 'HEAD' ? undefined : await fs.readFile(file));
    } catch { if (!res.headersSent) end(404,'Not found'); else res.end(); }
  });
  server.requestTimeout = 10000;
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(port,'127.0.0.1',resolve); });
  console.log(`Catalog: http://127.0.0.1:${port}${basePath}`);
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.includes('--build')) await buildCatalog();
    const config = await readJSON(path.join(ROOT,'config/catalog.json'));
    const index = process.argv.indexOf('--port');
    const port = index < 0 ? 4173 : Number(process.argv[index+1]);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT_INVALID');
    const server = await serveDirectory(path.join(ROOT,'dist/catalog'),config.basePath,port);
    for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => server.close(() => process.exit(0)));
  } catch(e) { console.error(`SERVER_FAILED: ${e.message}`); process.exitCode = 1; }
}
