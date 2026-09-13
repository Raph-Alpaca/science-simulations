import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const fixture='http://127.0.0.1:4175/science-simulations/';

test('public screen: no fake cards, no console errors, grade/unit/search/reset',async ({page})=>{
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const requests=[]; page.on('request',r=>requests.push(r.url()));
  await page.goto('./');
  await expect(page.getByRole('heading',{name:'첫 탐구 자료를 준비하고 있어요.'})).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(0);
  await page.getByLabel('중3',{exact:true}).check();
  await page.getByLabel('단원',{exact:true}).selectOption('생식과 유전');
  await page.getByRole('searchbox').fill('유전');
  await page.getByRole('button',{name:'검색',exact:true}).click();
  await expect(page).toHaveURL(/grade=3/);
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('유전');
  await expect(page.getByLabel('단원',{exact:true})).toHaveValue('생식과 유전');
  await page.getByRole('button',{name:'조건 초기화'}).click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  expect(errors).toEqual([]);
  expect(requests.every(url=>url.startsWith('http://127.0.0.1:4174/'))).toBeTruthy();
  await page.screenshot({path:'.local/catalog-tests/public-desktop.png',fullPage:true});
});
test('subpath, direct index, missing content and private paths',async ({page,request})=>{
  await page.goto('index.html?grade=1'); await page.reload();
  await expect(page.getByLabel('중1',{exact:true})).toBeChecked();
  for(const route of ['simulations/mendel-inheritance/index.html','tests/fixtures/data.mjs','.env.local','%2e%2e%2fREADME.md','does-not-exist.html']) {
    expect((await request.get(route)).status()).toBe(404);
  }
  const missing=await request.get('/catalog.json'); expect(missing.status()).toBe(404);
  await page.goto('/science-simulations'); await expect(page).toHaveURL(/\/science-simulations\/$/);
});
test('fixture cards are generated from metadata and combined filters work',async ({page})=>{
  await page.goto(fixture);
  await expect(page.getByText('검사용 데이터 · 실제 교육 콘텐츠가 아닙니다')).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(3);
  await page.getByLabel('중2',{exact:true}).check();
  await expect(page.locator('.card')).toHaveCount(1);
  await page.getByLabel('단원',{exact:true}).selectOption('검사용 단원 B');
  await page.getByRole('searchbox').fill('온도 측정');
  await expect(page.locator('.card')).toHaveCount(1);
  await page.getByRole('searchbox').fill('없는검색');
  await expect(page.getByRole('heading',{name:'조건에 맞는 자료가 없어요.'})).toBeVisible();
  await page.getByRole('button',{name:'전체 자료 보기'}).click();
  await expect(page.locator('.card')).toHaveCount(3);
  await page.screenshot({path:'.local/catalog-tests/fixture-desktop.png',fullPage:true});
  await page.getByRole('searchbox').fill('빛');
  await expect(page.locator('.card')).toHaveCount(1);
  await page.getByRole('link',{name:'빛과 그림자 · 검사 전용 탐구 시작하기'}).click();
  await page.reload(); await expect(page.getByRole('heading',{name:'검사용 진입점'})).toBeVisible();
});
test('untrusted metadata is rendered as text, not HTML',async ({page})=>{
  await page.route('**/catalog.json',async route=>{
    const response=await route.fetch(); const data=await response.json();
    data.cards[0].title='<img src=x onerror="window.__xss=true">';
    await route.fulfill({response,json:data});
  });
  await page.goto(fixture);
  await expect(page.locator('.card h3').first()).toHaveText('<img src=x onerror="window.__xss=true">');
  expect(await page.locator('.card img').count()).toBe(0);
  expect(await page.evaluate(()=>window.__xss)).toBeUndefined();
});
test('data fetch failure is distinct from empty, retry recovers',async ({page})=>{
  await page.route('**/catalog.json',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.goto('./'); await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('#empty')).toBeHidden();
  await page.unroute('**/catalog.json');
  await page.getByRole('button',{name:'다시 불러오기'}).click();
  await expect(page.locator('#empty')).toBeVisible();
});
test('keyboard controls, skip link and automated WCAG audit',async ({page})=>{
  await page.goto(fixture); await expect(page.locator('.card')).toHaveCount(3);
  await page.keyboard.press('Tab'); await expect(page.getByRole('link',{name:'자료 목록으로 건너뛰기'})).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#catalog')).toBeFocused();
  await page.getByLabel('전체',{exact:true}).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('중1',{exact:true})).toBeChecked();
  await expect(page.locator('.card')).toHaveCount(1);
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});
for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1024,height:768}]) {
  test(`responsive viewport ${viewport.width}x${viewport.height}`,async ({page})=>{
    await page.setViewportSize(viewport); await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(fixture); await expect(page.locator('.card')).toHaveCount(3);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await page.getByRole('searchbox').fill('빛'); await expect(page.locator('.card')).toHaveCount(1);
    const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({path:`.local/catalog-tests/fixture-${viewport.width}.png`,fullPage:true});
  });
}
