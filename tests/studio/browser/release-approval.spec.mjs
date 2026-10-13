import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {releaseFixture} from '../release-approval-fixture.mjs';
import {createReleaseApprovalService} from '../../../apps/studio/lib/release-approval.mjs';

// Browser authentication is mocked. Approval, feedback and revocation use real
// local SQL; source checks and worker evidence are synthetic test fixtures.
for(const width of [390,1440])test('teacher approval, lost response, feedback invalidation and paused revocation '+width,async({page})=>{
 const f=await releaseFixture();let approvalRequests=0,loseResponse=true,paused=false,prepared=false;
 const disabled=createReleaseApprovalService({db:f.client.schema('studio'),ownerId:f.ownerId});
 try{
  const conversation={id:f.submission.p_conversation,title:'게시 승인 검사',created_at:'2026-10-13T00:00:00Z'};
  await page.route('**/api/studio/**',async route=>{
   const parts=new URL(route.request().url()).pathname.replace('/api/studio/','').split('/'),body=route.request().postDataJSON();
   try{
    let data;const release=paused?disabled:f.release;
    if(parts[0]==='session')data={authenticated:true,fixture:true,capabilities:{requestV2:true,conversationEditing:true,resultReview:true,releaseReview:true}};
    else if(parts[0]==='conversations')data=parts.length===1?{conversations:[conversation]}:{conversation,messages:[],jobs:(await f.db.query('select * from studio.jobs')).rows};
    else if(parts[0]==='jobs'&&parts[2]==='dispatch')data={dispatch:{state:'submitted'}};
    else if(parts[0]==='jobs'&&parts[2]==='result')data=await f.service.read(parts[1]);
    else if(parts[0]==='jobs'&&parts[2]==='feedback')data=await f.service.feedback(parts[1],body);
    else if(parts[0]==='jobs'&&parts[2]==='publication-review'){
     if(!prepared){await route.fulfill({status:404,json:{error:'NOT_FOUND'}});return;}data=await release.read(parts[1]);
    }else if(parts[0]==='jobs'&&parts[2]==='publication-approval'){
     approvalRequests++;data=await release.approve(parts[1],body);
     if(loseResponse){loseResponse=false;await route.fulfill({status:503,json:{error:'RELEASE_UNAVAILABLE'}});return;}
    }else if(parts[0]==='publication-approvals'&&parts[2]==='revoke')data=await release.revoke(parts[1],body);
    else if(parts[0]==='jobs'&&parts.length===2)data={job:(await f.db.query('select * from studio.jobs where id=$1',[parts[1]])).rows[0],events:(await f.db.query('select * from studio.job_events where job_id=$1 order by sequence',[parts[1]])).rows};
    else throw Object.assign(Error(),{code:'UNEXPECTED_UI_ACTION',status:400});
    await route.fulfill({json:data});
   }catch(error){await route.fulfill({status:error.status||500,json:{error:error.code||'TEST_ERROR'}});}
  });
  await page.setViewportSize({width,height:1000});await page.goto('/');await page.getByRole('button',{name:/게시 승인 검사/}).click();
  const result=page.getByRole('region',{name:'제작 결과와 검토'}),panel=page.getByRole('region',{name:'공개 게시 승인'});
  await result.getByRole('button',{name:'결과·검토 보기'}).click();await panel.getByRole('button',{name:'게시 준비 상태 확인'}).click();
  await expect(panel).toContainText('게시 준비 기록이 아직 없습니다.');await expect(panel.getByRole('checkbox')).toHaveCount(0);
  prepared=true;await panel.getByRole('button',{name:'게시 승인 상태 새로고침'}).click();
  const save=panel.getByRole('button',{name:'이 버전의 게시 승인 저장'});await expect(save).toBeDisabled();
  await panel.getByRole('checkbox').check();await save.dblclick();
  await expect(page.getByRole('alert').filter({hasText:'게시 승인 상태를 확인하지 못했습니다.'})).toBeVisible();expect(approvalRequests).toBe(1);
  await save.click();await expect(panel).toContainText('이 버전의 게시 승인이 저장됐습니다. 아직 게시 완료는 아닙니다.');expect(approvalRequests).toBe(2);
  expect((await f.db.query('select count(*)::int n from studio.approvals')).rows[0].n).toBe(1);
  expect((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n).toBe(0);
  expect(await page.evaluate(()=>globalThis.RESULT_CODE_EXECUTED)).toBeUndefined();await expect(panel.locator('iframe,object,embed')).toHaveCount(0);
  await page.reload();await result.getByRole('button',{name:'결과·검토 보기'}).click();await panel.getByRole('button',{name:'게시 준비 상태 확인'}).click();await expect(panel).toContainText('이 버전의 게시 승인이 저장됐습니다.');
  await result.getByLabel('수정할 내용 또는 검토 메모').fill('공개 전에 변수 설명을 보완해 주세요.');await result.getByRole('button',{name:'이 버전에 의견 저장'}).click();
  await expect(result.locator('.result-feedback')).toContainText('변수 설명');await panel.getByRole('button',{name:'게시 준비 상태 확인'}).click();
  await expect(panel).toContainText('이전 승인 기록은 보존되며 현재 게시에는 사용할 수 없습니다.');await expect(panel.getByRole('checkbox')).toHaveCount(0);
  paused=true;await panel.getByRole('button',{name:'게시 승인 상태 새로고침'}).click();await expect(panel).toContainText('새 게시 승인은 일시 중지됐습니다.');
  await panel.getByRole('button',{name:'이 버전의 게시 승인 철회'}).click();await expect(panel).toContainText('이 버전의 게시 승인을 철회했습니다.');
  await expect(panel.getByRole('button',{name:'이 버전의 게시 승인 철회'})).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('변수 설명');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await mkdir('.local/evidence/worker',{recursive:true});await page.screenshot({path:'.local/evidence/worker/release-approval-'+width+'-'+randomUUID()+'.png',fullPage:true});
  expect((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n).toBe(1);expect((await f.db.query('select count(*)::int n from studio.budget_calls')).rows[0].n).toBe(5);
 }finally{await f.db.close();}
});
