import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {resultFixture} from '../result-review-fixture.mjs';
import {captureRecord} from '../../../packages/contracts/runtime-screenshot.js';

for(const width of [390,1440])test('teacher views inert version-bound captures '+width,async({page})=>{
 const screenshots=await Promise.all([390,1440].map(async w=>captureRecord(await readFile(`tests/fixtures/runtime-screenshots/${w}.jpg`),w)));
 const f=await resultFixture({screenshots});let imageRequests=0;
 try{
  const conversation={id:f.submission.p_conversation,title:'실행 화면 검토 · 합성 검사',created_at:'2026-10-05T00:00:00Z'};
  await page.route('**/api/studio/**',async route=>{
   const parts=new URL(route.request().url()).pathname.replace('/api/studio/','').split('/'),body=route.request().postDataJSON();
   try{
    let data;
    if(parts[0]==='session')data={authenticated:true,fixture:true,capabilities:{requestV2:true,conversationEditing:true,resultReview:true}};
    else if(parts[0]==='conversations')data=parts.length===1?{conversations:[conversation]}:{conversation,messages:[],jobs:(await f.db.query('select * from studio.jobs')).rows};
    else if(parts[0]==='jobs'&&parts[2]==='dispatch')data={dispatch:{state:'submitted'}};
    else if(parts[0]==='jobs'&&parts[2]==='result')data=await f.service.read(parts[1]);
    else if(parts[0]==='jobs'&&parts[2]==='result-screenshot'){imageRequests++;data=await f.service.screenshot(parts[1],body);}
    else if(parts[0]==='jobs'&&parts.length===2)data={job:(await f.db.query('select * from studio.jobs where id=$1',[parts[1]])).rows[0],events:(await f.db.query('select * from studio.job_events where job_id=$1 order by sequence',[parts[1]])).rows};
    else throw Object.assign(Error(),{code:'UNEXPECTED_UI_ACTION',status:400});
    await route.fulfill({json:data});
   }catch(error){await route.fulfill({status:error.status||500,json:{error:error.code||'TEST_ERROR'}});}
  });
  await page.setViewportSize({width,height:1000});await page.goto('/');await page.getByRole('button',{name:/실행 화면 검토/}).click();
  const panel=page.getByRole('region',{name:'제작 결과와 검토'});await panel.getByRole('button',{name:'결과·검토 보기'}).click();
  const gallery=panel.getByRole('region',{name:'최초 결과 · 검사에서 촬영한 화면'});
  await expect(gallery.getByRole('heading')).toBeVisible();expect(imageRequests).toBe(0);
  await gallery.getByRole('button',{name:'좁은 화면 390px'}).click();
  const preview=gallery.locator('figure>img');await expect(preview).toHaveJSProperty('naturalWidth',390);expect(imageRequests).toBe(1);
  await expect(gallery.getByRole('button',{name:'좁은 화면 390px'})).toHaveAttribute('aria-pressed','true');
  await gallery.getByRole('button',{name:'넓은 화면 1440px'}).click();await expect(preview).toHaveJSProperty('naturalWidth',1440);expect(imageRequests).toBe(2);
  const enlarge=gallery.getByRole('button',{name:'화면 크게 보기'});await enlarge.click();
  const dialog=gallery.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'닫기'})).toBeFocused();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(enlarge).toBeFocused();
  expect(await page.evaluate(()=>globalThis.RESULT_CODE_EXECUTED)).toBeUndefined();await expect(panel.locator('iframe,object,embed')).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('bytesBase64');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await gallery.scrollIntoViewIfNeeded();await mkdir('.local/evidence/screenshots',{recursive:true});await gallery.screenshot({path:`.local/evidence/screenshots/gallery-${width}.png`});
  await page.reload();await panel.getByRole('button',{name:'결과·검토 보기'}).click();await expect(panel.getByRole('region',{name:'최초 결과 · 검사에서 촬영한 화면'}).locator('img')).toHaveCount(0);expect(imageRequests).toBe(2);
  expect((await f.db.query('select count(*)::int n from studio.approvals')).rows[0].n).toBe(0);
  expect((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n).toBe(1);
 }finally{await f.db.close();}
});
