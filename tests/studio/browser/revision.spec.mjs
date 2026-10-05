import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {revisionFixture} from '../revision-fixture.mjs';

for(const width of [390,1440])test('revision consent, lost replies, restoration and single child at '+width,async({page})=>{
 const f=await revisionFixture();let preparations=0,starts=0,losePrepare=true,loseStart=true;
 try{
  const feedback=await f.feedback('초기화 버튼의 설명을 보완해 주세요.');
  const conversation={id:f.submission.p_conversation,title:'후속 수정 검사',created_at:'2026-10-05T00:00:00Z'};
  await page.route('**/api/studio/**',async route=>{
   const parts=new URL(route.request().url()).pathname.replace('/api/studio/','').split('/'),body=route.request().postDataJSON();
   try{
    let data;
    if(parts[0]==='session')data={authenticated:true,fixture:true,capabilities:{requestV2:true,conversationEditing:true,inputReviews:true,resultReview:true,revisions:true,realExecution:true}};
    else if(parts[0]==='conversations')data=parts.length===1?{conversations:[conversation]}:{conversation,messages:[],jobs:(await f.db.query('select * from studio.jobs order by created_at desc')).rows};
    else if(parts[0]==='jobs'&&parts[2]==='dispatch')data={dispatch:{state:'submitted'}};
    else if(parts[0]==='jobs'&&parts[2]==='result')data=await f.service.read(parts[1]);
    else if(parts[0]==='jobs'&&parts[2]==='revision-input'){
     preparations++;data=await f.revision.prepare(parts[1],body);
     if(losePrepare){losePrepare=false;await route.fulfill({status:503,json:{error:'REVISION_UNAVAILABLE'}});return;}
    }else if(parts[0]==='input-reviews'&&parts[2]==='approve')data=await f.inputs.approve(parts[1],body);
    else if(parts[0]==='input-reviews'&&parts[2]==='start'){
     starts++;const {job}=await f.inputs.submit(parts[1],body.sourceHash);data={jobId:job.id};
     // SQL commits; the browser loses only the response. No real GitHub request.
     if(loseStart){loseStart=false;await route.fulfill({status:503,json:{error:'DISPATCH_UNAVAILABLE'}});return;}
    }else if(parts[0]==='input-reviews'&&parts.length===2)data=await f.inputs.read(parts[1]);
    else if(parts[0]==='jobs'&&parts.length===2)data={job:(await f.db.query('select * from studio.jobs where id=$1',[parts[1]])).rows[0],events:[]};
    else throw Object.assign(Error(),{code:'UNEXPECTED_UI_ACTION',status:400});
    await route.fulfill({json:data});
   }catch(error){await route.fulfill({status:error.status||500,json:{error:error.code||'TEST_ERROR'}});}
  });
  await page.setViewportSize({width,height:1000});await page.goto('/');await page.getByRole('button',{name:/후속 수정 검사/}).click();
  const result=page.getByRole('region',{name:'제작 결과와 검토'}),panel=page.getByRole('region',{name:'후속 수정 준비'});
  await result.getByRole('button',{name:'결과·검토 보기'}).click();
  await panel.getByRole('button',{name:'이 요청으로 수정 준비'}).dblclick();
  await expect(page.getByRole('alert').filter({hasText:'수정 입력을 준비하지 못했습니다'})).toContainText('수정 입력을 준비하지 못했습니다');expect(preparations).toBe(1);
  await panel.getByRole('button',{name:'이 요청으로 수정 준비'}).click();
  await expect(panel.getByRole('heading',{name:'수정 제작기에 전달할 내용'})).toBeVisible();
  await expect(panel).toContainText(f.input.requirements[0].text);await expect(panel).toContainText(feedback.note);await expect(panel).toContainText(f.context.contentId);
  expect((await f.db.query('select count(*)::int n from studio.input_reviews')).rows[0].n).toBe(1);
  expect((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n).toBe(1);
  await expect(panel.getByRole('button',{name:'수정 입력 확인 저장'})).toBeDisabled();
  await panel.getByLabel(/기존 결과·자료 요약/).check();await expect(panel.getByRole('button',{name:'수정 입력 확인 저장'})).toBeDisabled();
  await panel.getByLabel(/이번 수정은 별도 제작/).check();
  // Reload clears unsaved consent while restoring the same immutable review.
  await page.reload();await result.getByRole('button',{name:'결과·검토 보기'}).click();
  await expect(panel.getByLabel(/기존 결과·자료 요약/)).not.toBeChecked();await expect(panel.getByLabel(/이번 수정은 별도 제작/)).not.toBeChecked();
  await panel.getByLabel(/기존 결과·자료 요약/).check();await panel.getByLabel(/이번 수정은 별도 제작/).check();await panel.getByRole('button',{name:'수정 입력 확인 저장'}).click();
  await expect(panel.getByRole('button',{name:'수정 제작 시작 · 최대 1,000원'})).toBeVisible();
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain(feedback.note);
  expect(await page.evaluate(()=>globalThis.RESULT_CODE_EXECUTED)).toBeUndefined();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await mkdir('.local/evidence/worker',{recursive:true});await page.screenshot({path:'.local/evidence/worker/revision-'+width+'-'+randomUUID()+'.png',fullPage:true});
  await panel.getByRole('button',{name:'수정 제작 시작 · 최대 1,000원'}).dblclick();await expect(page.getByRole('alert').filter({hasText:'접수 결과를 확인하지 못했습니다'})).toContainText('접수 결과를 확인하지 못했습니다');expect(starts).toBe(1);
  await page.reload();await page.getByLabel('작업 선택').selectOption(f.jobId);await result.getByRole('button',{name:'결과·검토 보기'}).click();
  await panel.getByRole('button',{name:'접수한 수정 작업 보기'}).click();
  const child=(await f.db.query('select id from studio.jobs where id<>$1',[f.jobId])).rows[0].id;await expect(page.getByLabel('작업 선택')).toHaveValue(child);
  expect(starts).toBe(1);expect((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n).toBe(2);
  expect((await f.db.query('select count(*)::int n from studio.dispatch_intents')).rows[0].n).toBe(1);expect((await f.db.query('select count(*)::int n from studio.approvals')).rows[0].n).toBe(0);
 }finally{await f.db.close();}
});
