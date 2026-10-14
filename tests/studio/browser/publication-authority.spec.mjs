import {test,expect} from '@playwright/test';
import {publicationAuthorityFixture} from '../publication-authority-fixture.mjs';
import {createReleaseApprovalService} from '../../../apps/studio/lib/release-approval.mjs';

test('teacher sees consumption boundary and a stale revoke never reports success',async({page})=>{
 const f=await publicationAuthorityFixture();try{
  await f.enableDeploy();const release=createReleaseApprovalService({db:f.client.schema('studio'),ownerId:f.ownerId,enabled:true});
  const conversation={id:f.submission.p_conversation,title:'전송 승인 경계 검사',created_at:'2026-10-14T00:00:00Z'};
  await page.route('**/api/studio/**',async route=>{
   const parts=new URL(route.request().url()).pathname.replace('/api/studio/','').split('/'),body=route.request().postDataJSON();
   try{
    let data;
    if(parts[0]==='session')data={authenticated:true,fixture:true,capabilities:{requestV2:true,conversationEditing:true,resultReview:true,releaseReview:true}};
    else if(parts[0]==='conversations')data=parts.length===1?{conversations:[conversation]}:{conversation,messages:[],jobs:(await f.db.query('select * from studio.jobs')).rows};
    else if(parts[0]==='jobs'&&parts[2]==='dispatch')data={dispatch:{state:'submitted'}};
    else if(parts[0]==='jobs'&&parts[2]==='result')data=await f.service.read(parts[1]);
    else if(parts[0]==='jobs'&&parts[2]==='publication-review')data=await release.read(parts[1]);
    else if(parts[0]==='publication-approvals'&&parts[2]==='revoke')data=await release.revoke(parts[1],body);
    else if(parts[0]==='jobs'&&parts.length===2)data={job:(await f.db.query('select * from studio.jobs where id=$1',[parts[1]])).rows[0],events:(await f.db.query('select * from studio.job_events where job_id=$1 order by sequence',[parts[1]])).rows};
    else throw Object.assign(Error(),{code:'UNEXPECTED_UI_ACTION',status:400});
    await route.fulfill({json:data});
   }catch(error){await route.fulfill({status:error.status||500,json:{error:error.code||'TEST_ERROR'}});}
  });
  await page.setViewportSize({width:390,height:1000});await page.goto('/');await page.getByRole('button',{name:/전송 승인 경계 검사/}).click();
  const panel=page.getByRole('region',{name:'공개 게시 승인'});
  await page.getByRole('button',{name:'결과·검토 보기'}).click();await panel.getByRole('button',{name:'게시 준비 상태 확인'}).click();
  await expect(panel).toContainText('공개 전송 준비가 시작되기 전까지');const revoke=panel.getByRole('button',{name:'이 버전의 게시 승인 철회'});await expect(revoke).toBeVisible();
  expect((await f.authorize()).status).toBe(200);await revoke.click();
  await expect(page.getByRole('alert').filter({hasText:'공개 전송 준비가 시작돼'})).toBeVisible();
  await panel.getByRole('button',{name:'게시 승인 상태 새로고침'}).click();
  for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await expect(panel).toContainText('실제 게시 여부를 확인해야 합니다.');await expect(revoke).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  expect((await f.db.query('select invalidated_at from studio.approvals where id=$1',[f.approval.id])).rows[0].invalidated_at).toBe(null);
  expect((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n).toBe(0);
 }finally{await f.db.close();}
});
