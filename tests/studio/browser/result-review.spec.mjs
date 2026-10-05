import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resultFixture} from '../result-review-fixture.mjs';

for(const [width,missing] of [[390,false],[1440,false],[1440,true]])test('version-bound result review '+width+(missing?' missing sources':''),async({page})=>{
 const f=await resultFixture({missing,repair:!missing});let feedbackRequests=0,loseResponse=true;
 try{
  const conversation={id:f.submission.p_conversation,title:'결과 검토 검사',created_at:'2026-10-05T00:00:00Z'};
  await page.route('**/api/studio/**',async route=>{
   const parts=new URL(route.request().url()).pathname.replace('/api/studio/','').split('/'),body=route.request().postDataJSON();
   try{
    let data;
    if(parts[0]==='session')data={authenticated:true,fixture:true,capabilities:{requestV2:true,conversationEditing:true,resultReview:true}};
    else if(parts[0]==='conversations')data=parts.length===1?{conversations:[conversation]}:{conversation,messages:[],jobs:(await f.db.query('select * from studio.jobs')).rows};
    else if(parts[0]==='jobs'&&parts[2]==='dispatch')data={dispatch:{state:'submitted'}};
    else if(parts[0]==='jobs'&&parts[2]==='result')data=await f.service.read(parts[1]);
    else if(parts[0]==='jobs'&&parts[2]==='result-file')data=await f.service.file(parts[1],body);
    else if(parts[0]==='jobs'&&parts[2]==='feedback'){
     feedbackRequests++;data=await f.service.feedback(parts[1],body);if(loseResponse){loseResponse=false;await route.fulfill({status:503,json:{error:'RESULT_UNAVAILABLE'}});return;}
    }else if(parts[0]==='jobs'&&parts.length===2)data={job:(await f.db.query('select * from studio.jobs where id=$1',[parts[1]])).rows[0],events:(await f.db.query('select * from studio.job_events where job_id=$1 order by sequence',[parts[1]])).rows};
    else throw Object.assign(Error(),{code:'UNEXPECTED_UI_ACTION',status:400});
    await route.fulfill({json:data});
   }catch(error){await route.fulfill({status:error.status||500,json:{error:error.code||'TEST_ERROR'}});}
  });
  await page.setViewportSize({width,height:1000});await page.goto('/');await page.getByRole('button',{name:/결과 검토 검사/}).click();
  const panel=page.getByRole('region',{name:'제작 결과와 검토'});await panel.getByRole('button',{name:'결과·검토 보기'}).click();
  if(missing){await expect(panel).toContainText('교육과정 근거가 필요해 제작을 보류했습니다.');await expect(panel.getByLabel('의견 종류')).toHaveValue('note');await expect(panel.locator('option[value=request_changes]')).toHaveJSProperty('disabled',true);}
  else{
   await expect(panel.getByRole('heading',{name:'합성 결과 검토'})).toBeVisible();await expect(panel).toContainText('수정 1회 결과');
   await panel.getByText(/최초 결과 ·/).click();await expect(panel).toContainText('초기화 동작 실패');
   await panel.getByText('결과 파일 확인',{exact:true}).click();await panel.getByRole('button',{name:'코드 텍스트 보기'}).click();await expect(panel.getByLabel('index.html 코드')).toContainText('<script>globalThis.RESULT_CODE_EXECUTED=true');
   expect(await page.evaluate(()=>globalThis.RESULT_CODE_EXECUTED)).toBeUndefined();await expect(panel.locator('iframe,object,embed,img')).toHaveCount(0);
   await panel.getByText('결과 파일 확인',{exact:true}).click();
  }
  await panel.getByText('공개 전 확인할 항목',{exact:true}).click();await expect(panel).toContainText('출처 원문 대조 기록이 아직 연결되지 않았습니다.');await expect(panel.getByRole('button',{name:/승인|게시/})).toHaveCount(0);
  await panel.getByLabel('수정할 내용 또는 검토 메모').fill('다음 결과에서는 변수 설명을 더 분명하게 해 주세요.');
  await panel.getByRole('button',{name:'이 버전에 의견 저장'}).dblclick();await expect(page.getByRole('alert').filter({hasText:'결과 기록을 불러오거나 저장하지 못했습니다.'})).toContainText('결과 기록을 불러오거나 저장하지 못했습니다.');expect(feedbackRequests).toBe(1);
  await panel.getByRole('button',{name:'이 버전에 의견 저장'}).click();await expect(panel.getByRole('status')).toHaveText('이 결과 버전에 의견을 저장했습니다.');expect(feedbackRequests).toBe(2);
  expect((await f.db.query('select count(*)::int n from studio.result_feedback')).rows[0].n).toBe(1);
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('변수 설명');
  await expect(panel.locator('.result-feedback')).toContainText('다음 결과에서는 변수 설명을 더 분명하게 해 주세요.');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await mkdir('.local/evidence/worker',{recursive:true});await page.screenshot({path:'.local/evidence/worker/result-review-'+width+'-'+(missing?'missing-':'')+randomUUID()+'.png',fullPage:true});
  await page.reload();await panel.getByRole('button',{name:'결과·검토 보기'}).click();await expect(panel.locator('.result-feedback')).toContainText('다음 결과에서는 변수 설명을 더 분명하게 해 주세요.');
  expect((await f.db.query('select count(*)::int n from studio.approvals')).rows[0].n).toBe(0);expect((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n).toBe(1);
 }finally{await f.db.close();}
});
