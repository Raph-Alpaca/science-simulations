import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {workerFixture} from '../worker-fixture.mjs';
import {createInputReviewService} from '../../../apps/studio/lib/input-review.mjs';

for(const width of [390,1440])test('reviewed 3D input UI with real local SQL at '+width,async({page})=>{
 const f=await workerFixture();let prepared=0,approved=0;const artifact=randomUUID();
 try{
  await f.db.exec('reset role');await f.db.exec(await readFile('supabase/proposals/studio_input_review_v1.sql','utf8'));await f.db.exec('set role service_role');
  const service=createInputReviewService({db:f.client.schema('studio'),ownerId:f.ownerId,enabled:true});
  const conversation={id:f.submission.p_conversation,title:'입력 확인 검사',created_at:'2026-10-05T00:00:00Z'};
  await page.route('**/api/studio/**',async route=>{
   const parts=new URL(route.request().url()).pathname.replace('/api/studio/','').split('/'),body=route.request().postDataJSON();
   try{
    let data;
    if(parts[0]==='session')data={authenticated:true,executionMode:'mock',capabilities:{requestV2:true,conversationEditing:true,inputReviews:true}};
    else if(parts[0]==='conversations')data=parts.length===1?{conversations:[conversation]}:{conversation,messages:[],jobs:[]};
    else if(parts[0]==='input-reviews'&&parts.length===1){prepared++;data=await service.prepare(body);}
    else if(parts[0]==='input-reviews'&&parts[2]==='approve'){approved++;data=await service.approve(parts[1],body);}
    else if(parts[0]==='input-reviews'&&parts.length===2)data=await service.read(parts[1]);
    else throw Object.assign(Error(),{code:'UNEXPECTED_UI_ACTION',status:400});
    await route.fulfill({json:data});
   }catch(error){await route.fulfill({status:error.status||500,json:{error:error.code||'TEST_ERROR'}});}
  });
  await page.setViewportSize({width,height:1000});await page.goto('/');await page.getByRole('button',{name:/입력 확인 검사/}).click();
  await page.getByLabel('탐구 주제',{exact:true}).fill('검사 전용 입체 탐구');await page.getByLabel('시뮬레이션 유형').selectOption('interactive_3d');
  await page.getByLabel('수업에서 보여 주고 싶은 것').fill('크기를 바꾸고 회전시키는 합성 검사 과제입니다.');
  await expect(page.getByText('카메라 조작과 3D를 사용할 수 없는 기기를 위한 대체 설명을 포함합니다.')).toBeVisible();
  await page.getByRole('button',{name:'＋ 참고 자료 추가'}).click();const source=page.getByRole('group',{name:'참고 자료 1',exact:true});
  await source.getByLabel('자료 이름').fill('검사용 공개 참고');await source.getByLabel('공개 자료 주소').fill('https://example.org/fixture');
  await source.getByLabel('참고한 절·쪽·범위').fill('검사 범위');await source.getByLabel('직접 작성한 요약').fill('실제 교육과정 근거가 아닌 합성 검사 요약입니다.');
  await page.getByRole('button',{name:'제작 입력 미리 확인'}).click();const preview=page.getByRole('region',{name:'제작기에 전달할 내용'});
  await expect(preview).toContainText('검사 전용 입체 탐구');await expect(preview).toContainText('3D');await expect(preview).toContainText('10,000원·10건');
  await expect(preview).toContainText('제작 기준: 2022 개정 · 원문 대조 미확인');await expect(page.getByLabel(/학년도/)).toHaveCount(0);
  await expect(preview.getByRole('button',{name:'입력 확인 저장'})).toBeDisabled();
  await preview.getByLabel(/과제와 직접 작성한 요약/).check();await expect(preview.getByRole('button',{name:'입력 확인 저장'})).toBeDisabled();
  await preview.getByLabel(/실제 제작을 시작하면/).check();await preview.getByRole('button',{name:'입력 확인 저장'}).dblclick();
  await expect(preview.getByRole('status')).toContainText('입력 확인을 저장했습니다');expect(prepared).toBe(1);expect(approved).toBe(1);
  const first=(await f.db.query('select id,source_hash,state from studio.input_reviews')).rows[0];expect(first.state).toBe('approved');
  expect((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n).toBe(0);expect((await f.db.query('select count(*)::int n from studio.budget_jobs')).rows[0].n).toBe(0);
  const browserStorage=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));expect(browserStorage).not.toContain('검사 전용 입체 탐구');expect(browserStorage).not.toContain('합성 검사 요약');
  await page.reload();await expect(page.getByLabel('탐구 주제',{exact:true})).toHaveValue('검사 전용 입체 탐구');await expect(page.getByRole('status')).toContainText('입력 확인을 저장했습니다');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await mkdir('.local/evidence/worker',{recursive:true});await page.screenshot({path:'.local/evidence/worker/input-review-'+width+'-'+artifact+'.png',fullPage:true});
  await page.getByLabel('수업에서 보여 주고 싶은 것').fill('변경한 합성 과제');await expect(preview).toHaveCount(0);
  await page.getByRole('button',{name:'제작 입력 미리 확인'}).click();await expect(preview.getByLabel(/과제와 직접 작성한 요약/)).not.toBeChecked();
  await expect(preview.getByRole('button',{name:'입력 확인 저장'})).toBeDisabled();
  const rows=(await f.db.query('select source_hash,state from studio.input_reviews')).rows;expect(rows).toHaveLength(2);expect(rows.some(r=>r.state==='prepared'&&r.source_hash!==first.source_hash)).toBe(true);
 }finally{await f.db.close();}
});
