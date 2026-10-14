import {test,expect} from '@playwright/test';
import {publicationCompletionFixture} from '../publication-completion-fixture.mjs';
import {createReleaseApprovalService} from '../../../apps/studio/lib/release-approval.mjs';
test('teacher sees uncertain then verified publication and can request a correction',async({page})=>{
 const f=await publicationCompletionFixture();try{
  const release=createReleaseApprovalService({db:f.client.schema('studio'),ownerId:f.ownerId,enabled:true}),conversation={id:f.submission.p_conversation,title:'게시 확인 검사',created_at:'2026-10-14T00:00:00Z'};
  await page.route('**/api/studio/**',async route=>{
   const parts=new URL(route.request().url()).pathname.replace('/api/studio/','').split('/'),body=route.request().postDataJSON();
   try{
    let data;
    if(parts[0]==='session')data={authenticated:true,fixture:true,capabilities:{requestV2:true,conversationEditing:true,resultReview:true,releaseReview:true}};
    else if(parts[0]==='conversations')data=parts.length===1?{conversations:[conversation]}:{conversation,messages:[],jobs:(await f.db.query('select * from studio.jobs')).rows};
    else if(parts[0]==='jobs'&&parts[2]==='dispatch')data={dispatch:{state:'submitted'}};
    else if(parts[0]==='jobs'&&parts[2]==='result')data=await f.service.read(parts[1]);
    else if(parts[0]==='jobs'&&parts[2]==='feedback')data=await f.service.feedback(parts[1],body);
    else if(parts[0]==='jobs'&&parts[2]==='publication-review')data=await release.read(parts[1]);
    else if(parts[0]==='publication-approvals'&&parts[2]==='dispatch')data={dispatch:await f.rpc('read_publication_dispatch',{p_owner:f.ownerId,p_approval:f.approval.id})};
    else if(parts[0]==='jobs'&&parts.length===2)data={job:(await f.db.query('select * from studio.jobs where id=$1',[parts[1]])).rows[0],events:(await f.db.query('select * from studio.job_events where job_id=$1 order by sequence',[parts[1]])).rows};
    else throw Object.assign(Error(),{code:'UNEXPECTED_UI_ACTION',status:400});
    await route.fulfill({json:data});
   }catch(error){await route.fulfill({status:error.status||500,json:{error:error.code||'TEST_ERROR'}});}
  });
  await page.setViewportSize({width:390,height:1000});await page.goto('/');await page.getByRole('button',{name:/게시 확인 검사/}).click();
  const panel=page.getByRole('region',{name:'공개 게시 승인'}),result=page.getByRole('region',{name:'제작 결과와 검토'});
  await result.getByRole('button',{name:'결과·검토 보기'}).click();await panel.getByRole('button',{name:'게시 준비 상태 확인'}).click();
  const uncertain=structuredClone(f.outcome);Object.assign(uncertain.deployment,{status:'uncertain',errorCode:'PAGES_TRANSPORT_UNCERTAIN',statusRequests:0,deploymentId:null});uncertain.verification=null;expect((await f.complete(uncertain)).status).toBe(200);
  await panel.getByRole('button',{name:'게시 요청 상태 확인'}).click();await expect(panel).toContainText('게시 결과가 불확실해');await expect(panel.getByRole('link',{name:'게시된 시뮬레이션 열기'})).toHaveCount(0);
  expect((await f.complete()).status).toBe(200);await page.reload();await result.getByRole('button',{name:'결과·검토 보기'}).click();await panel.getByRole('button',{name:'게시 준비 상태 확인'}).click();
  await expect(page.getByText('게시 확인 완료',{exact:true}).first()).toBeVisible();
  for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await expect(panel.getByRole('link',{name:'게시된 시뮬레이션 열기'})).toHaveAttribute('href',/^https:\/\/raph-alpaca\.github\.io\/science-simulations\/simulations\//);await expect(panel.getByRole('button',{name:'이 버전의 게시 승인 철회'})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await result.getByLabel('수정할 내용 또는 검토 메모').fill('공개된 결과의 설명을 더 쉽게 보완해 주세요.');await result.getByRole('button',{name:'이 버전에 의견 저장'}).click();await expect(result.locator('.result-feedback')).toContainText('더 쉽게');
  expect((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n).toBe(1);expect((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n).toBe(1);
 }finally{await f.db.close();}
});
