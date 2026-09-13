import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const entry='simulations/mendel-inheritance/index.html';

test('local metadata card navigates to draft and survives direct refresh',async({page,request})=>{
  await page.goto('./');
  await expect(page.getByText('미승인 로컬 초안 · 교육과정·교과서 미대조 · 공개 배포 제외')).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(1);
  await page.getByLabel('중3',{exact:true}).check();
  await page.getByRole('searchbox').fill('유전');
  await expect(page.locator('.card')).toHaveCount(1);
  await page.locator('.card a').click();
  await expect(page).toHaveURL(/mendel-inheritance\/index.html$/);
  await page.reload();
  await expect(page.locator('#step-title')).toContainText('부모');
  expect((await request.get('.env')).status()).toBe(404);
  await page.locator('#back').click();
  await expect(page.locator('.card')).toHaveCount(1);
});

test('dominance traces parents, gametes, fertilization, offspring with pause and reset',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await page.goto(entry);
  await page.locator('#prediction').fill('r은 자손에 남을 것이다');
  await page.locator('#next').click();
  await expect(page.locator('#step-title')).toContainText('생식세포');
  await page.locator('#next').click();
  await expect(page.locator('#step-title')).toContainText('수정');
  await page.locator('#next').click();
  await expect(page.locator('#step-title')).toContainText('자손');
  await expect(page.locator('#diagram')).toContainText('Rr');
  await page.locator('[data-count="10"]').click();
  await expect(page.locator('#total')).toHaveText('10');
  await page.locator('#reset').click();
  await expect(page.locator('#total')).toHaveText('0');
  await expect(page.locator('#prediction')).toHaveValue('');
  await page.clock.install();
  await page.locator('#play').click();
  await page.locator('#pause').click();
  const paused=await page.locator('#step-title').innerText();
  await page.clock.runFor(10000);
  await expect(page.locator('#step-title')).toHaveText(paused);
  await page.locator('#play').click();await page.clock.runFor(10000);
  await expect(page.locator('#step-title')).toContainText('자손');
  await expect(page.locator('#total')).toHaveText('0');
  expect(errors).toEqual([]);
  expect(requests.every(url=>url.startsWith('http://127.0.0.1:4177/'))).toBeTruthy();
});

test('sample buttons accumulate 1/10/100/1000 and parent/mode changes isolate experiments',async({page})=>{
  await page.goto(entry);await page.locator('#mode').selectOption('segregation');
  await page.locator('#parent-a').selectOption('Rr');await page.locator('#parent-b').selectOption('Rr');
  let total=0;
  for(const count of [1,10,100,1000]){
    await page.locator(`[data-count="${count}"]`).click();total+=count;
    await expect(page.locator('#total')).toHaveText(total.toLocaleString('en-US'));
  }
  await expect(page.locator('#genotype-results')).toContainText('25');
  await expect(page.locator('#phenotype-results')).toContainText('75');
  await page.locator('#prediction').fill('예측');await page.locator('#explanation').fill('설명');
  await page.locator('#parent-a').selectOption('rr');
  await expect(page.locator('#total')).toHaveText('0');
  await expect(page.locator('#prediction')).toHaveValue('');
  await expect(page.locator('#explanation')).toHaveValue('');
  await page.locator('#parent-b').selectOption('rr');
  await page.locator('[data-count="100"]').click();
  await expect(page.locator('#total')).toHaveText('100');
  await expect(page.locator('#last')).toContainText('rr');
  await page.locator('#mode').selectOption('independence');
  await expect(page.locator('#total')).toHaveText('0');
  await expect(page.locator('#parent-a')).toHaveValue('RrYy');
});

test('2x2 and 4x4 optional Punnett tables and independent model assumptions',async({page})=>{
  await page.goto(entry);
  await expect(page.locator('#cross-wrap')).toBeHidden();
  await page.locator('#show-cross').check();
  await expect(page.locator('#cross-table tbody td')).toHaveCount(4);
  await page.locator('#mode').selectOption('independence');
  await page.locator('#show-cross').check();
  await expect(page.locator('#cross-table tbody td')).toHaveCount(16);
  await expect(page.locator('#phenotype-results')).toContainText('56.25');
  await expect(page.locator('.notes')).toContainText('감수분열 한 번마다 네 종류가 모두');
  await expect(page.locator('.notes')).toContainText('유전자 간 상호작용');
  await page.screenshot({path:'.local/evidence/genetics03/desktop.png',fullPage:true});
});

test('finite sample cap prevents extra trials and reset restores controls',async({page})=>{
  await page.goto(entry);
  for(let i=0;i<10;i++)await page.locator('[data-count="1000"]').click();
  await expect(page.locator('#total')).toHaveText('10,000');
  await expect(page.locator('[data-count="1"]')).toBeDisabled();
  await page.locator('#reset').click();
  await expect(page.locator('[data-count="1"]')).toBeEnabled();
});

for(const width of [390,768,1440])test(`keyboard, small screen and axe at ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(entry);await page.keyboard.press('Tab');
  await expect(page.getByRole('link',{name:'탐구로 바로 가기'})).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.locator('#main')).toBeFocused();
  await page.locator('#mode').selectOption('independence');
  await page.locator('#show-cross').focus();await page.keyboard.press('Space');
  await expect(page.locator('#cross-wrap')).toBeVisible();
  await page.locator('#next').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#step-title')).toContainText('생식세포');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({path:`.local/evidence/genetics03/screen-${width}.png`,fullPage:true});
});
