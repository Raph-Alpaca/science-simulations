import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {workerFixture} from '../worker-fixture.mjs';
import {preparationFixture,insertPreparation} from '../preparation-fixture.mjs';
import {createInputReviewService} from '../../../apps/studio/lib/input-review.mjs';

for(const width of [390,1440])test('source readiness, fresh consent and revoked start at '+width,async({page})=>{
 const f=await workerFixture();let starts=0,prepares=0,approvals=0;
 try{
  await f.db.exec('reset role');
  for(const name of ['studio_input_review_v1','studio_preparation_sources_v1','studio_preparation_admission_v1'])await f.db.exec(await readFile('supabase/proposals/'+name+'.sql','utf8'));
  await f.db.exec('set role service_role');
  const evidence=preparationFixture(f.ownerId),service=createInputReviewService({db:f.client.schema('studio'),ownerId:f.ownerId,enabled:true,preparationEnabled:true});
  const conversation={id:f.submission.p_conversation,title:'근거 연결 검사',created_at:'2026-10-16T00:00:00Z'};
  await page.route('**/api/studio/**',async route=>{
   const parts=new URL(route.request().url()).pathname.replace('/api/studio/','').split('/'),body=route.request().postDataJSON();
   try{
    let data;
    if(parts[0]==='session')data={authenticated:true,executionMode:'mock',capabilities:{requestV2:true,conversationEditing:true,inputReviews:true,realExecution:true}};
    else if(parts[0]==='conversations')data=parts.length===1?{conversations:[conversation]}:{conversation,messages:[],jobs:[]};
    else if(parts[0]==='input-reviews'&&parts.length===1){prepares++;data=await service.prepare(body);}
    else if(parts[0]==='input-reviews'&&parts[2]==='approve'){approvals++;data=await service.approve(parts[1],body);}
    else if(parts[0]==='input-reviews'&&parts[2]==='start'){starts++;throw Error('MUST_NOT_START');}
    else if(parts[0]==='input-reviews'&&parts.length===2)data=await service.read(parts[1]);
    else throw Error('UNEXPECTED_ACTION');
    await route.fulfill({json:data});
   }catch(error){await route.fulfill({status:error.status||500,json:{error:error.code||'TEST_ERROR'}});}
  });
  await page.setViewportSize({width,height:1000});await page.goto('/');await page.getByRole('button',{name:/근거 연결 검사/}).click();
  await page.getByLabel('탐구 주제',{exact:true}).fill('원문 확인 범위 연결');await page.getByLabel('수업에서 보여 주고 싶은 것').fill('합성 검사입니다. 실제 근거로 사용하지 않습니다.');
  for(const [i,s] of evidence.scope.sources.entries()){
   await page.getByRole('button',{name:'＋ 참고 자료 추가'}).click();const group=page.getByRole('group',{name:'참고 자료 '+(i+1),exact:true});
   await group.getByLabel('자료 구분').selectOption(s.kind);await group.getByLabel('자료 이름').fill(s.title);await group.getByLabel('공개 자료 주소').fill(s.url);
   await group.getByLabel('참고한 절·쪽·범위').fill(s.location);await group.getByLabel('직접 작성한 요약').fill(s.summary);
  }
  await page.getByRole('button',{name:'제작 입력 미리 확인'}).click();const preview=page.getByRole('region',{name:'제작기에 전달할 내용'}),status=page.getByRole('region',{name:'제작 전 자료 확인'});
  await expect(status).toContainText('유료 제작을 시작하지 않습니다');await expect(preview.getByRole('button',{name:'입력 확인 저장'})).toBeDisabled();
  await f.db.exec('reset role');for(let i=0;i<3;i++)await insertPreparation(f.db,evidence.scope.sources[i],evidence.records[i]);await f.db.exec('set role service_role');
  await preview.getByRole('button',{name:'자료 확인 후 새 입력 준비'}).click();await expect(status).toContainText('원문 확인 기록이 연결됐습니다');
  await expect(preview.getByLabel(/과제와 직접 작성한 요약/)).not.toBeChecked();
  await preview.getByLabel(/과제와 직접 작성한 요약/).check();await preview.getByLabel(/실제 제작을 시작하면/).check();await preview.getByRole('button',{name:'입력 확인 저장'}).click();
  await expect(preview.getByRole('button',{name:/제작 시작 · 최대/})).toBeEnabled();
  await status.getByText('연결한 원문 확인 범위 3개').click();await expect(status).toContainText('특정 학교 교과서 일치는 미확인');await expect(status).toContainText('No selected school textbook alignment.');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await mkdir('.local/evidence/source-preparation',{recursive:true});await page.screenshot({path:'.local/evidence/source-preparation/ready-'+width+'.png',fullPage:true});
  await f.db.exec('reset role');await f.db.query('update studio.preparation_sources set revoked_at=now() where id=$1',[evidence.records[0].recordId]);await f.db.exec('set role service_role');
  await page.reload();await expect(status).toContainText('유료 제작을 시작하지 않습니다');await expect(preview.getByRole('button',{name:/제작 시작 · 최대/})).toBeDisabled();
  expect(prepares).toBe(2);expect(approvals).toBe(1);expect(starts).toBe(0);
  expect((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n).toBe(0);expect((await f.db.query('select count(*)::int n from studio.budget_calls')).rows[0].n).toBe(0);
 }finally{await f.db.close();}
});
