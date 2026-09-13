import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT } from './content.mjs';
import { serveDirectory } from './serve.mjs';
const server=await serveDirectory(path.join(ROOT,'dist/catalog'),'/science-simulations/',4180);
let browser;
try {
  browser=await chromium.launch({channel:'chrome'});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4180/science-simulations/');
  await page.getByRole('heading',{name:'첫 탐구 자료를 준비하고 있어요.'}).waitFor();
  assert.equal(await page.locator('.card').count(),0);
  await page.getByLabel('중3',{exact:true}).check();
  await page.getByRole('searchbox').fill('유전');
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('유전');
  const response=await page.request.get('http://127.0.0.1:4180/science-simulations/simulations/mendel-inheritance/index.html');
  assert.equal(response.status(),404);
  assert.deepEqual(errors,[]);
  console.log('PAGES_LOCAL_BROWSER_PASS: final artifact, subpath, empty state, reload, draft 404');
} finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
