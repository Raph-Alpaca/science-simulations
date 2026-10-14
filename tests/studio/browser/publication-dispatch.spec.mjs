import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {publicationFixture} from '../publication-dispatch-fixture.mjs';
import {createStudioPublicationDispatch} from '../../../apps/studio/lib/publication-dispatch.mjs';
import {syntheticDispatchEnv,syntheticGitHub} from '../github-dispatch-fixture.mjs';

// Real local SQL and the fixed GitHub transport with synthetic HTTP. No keys,
// remote workflow, model, authenticated user or student publication is used.
for(const width of [390,1440])test('publication response loss, refresh and paused reads '+width,async({page})=>{
 const f=await publicationFixture();let paused=false,posts=0,loseRead=false;
 const provider=syntheticGitHub({publication:true,change:(endpoint,response)=>width===390&&endpoint.endsWith('/dispatches')?{status:503,body:{}}:response});
 const enabled=createStudioPublicationDispatch({db:f.client.schema('studio'),ownerId:f.ownerId,env:{...syntheticDispatchEnv,STUDIO_PUBLICATION_DISPATCH_ENABLED:'true',STUDIO_PUBLICATION_TRUSTED_SHAS:'a'.repeat(40)},transport:provider.transport});
 const disabled=createStudioPublicationDispatch({db:f.client.schema('studio'),ownerId:f.ownerId,env:{}});
 try{
  await f.enable();
  const conversation={id:f.submission.p_conversation,title:'게시 요청 검사',created_at:'2026-10-14T00:00:00Z'};
  await page.route('**/api/studio/**',async route=>{
   const parts=new URL(route.request().url()).pathname.replace('/api/studio/','').split('/'),body=route.request().postDataJSON();
   try{
    let data;
    if(parts[0]==='session')data={authenticated:true,fixture:true,capabilities:{requestV2:true,conversationEditing:true,resultReview:true,releaseReview:true,publicationDispatch:!paused}};
    else if(parts[0]==='conversations')data=parts.length===1?{conversations:[conversation]}:{conversation,messages:[],jobs:(await f.db.query('select * from studio.jobs')).rows};
    else if(parts[0]==='jobs'&&parts[2]==='dispatch')data={dispatch:{state:'submitted'}};
    else if(parts[0]==='jobs'&&parts[2]==='result')data=await f.service.read(parts[1]);
    else if(parts[0]==='jobs'&&parts[2]==='publication-review')data=await f.release.read(parts[1]);
    else if(parts[0]==='publication-approvals'&&parts[2]==='revoke')data=await f.release.revoke(parts[1],body);
    else if(parts[0]==='publication-approvals'&&parts[2]==='dispatch'){
     if(route.request().method()==='POST'){
      posts++;await enabled.start(parts[1],body);
      await route.fulfill({status:503,json:{error:'PUBLICATION_DISPATCH_UNAVAILABLE'}});return;
     }
     if(loseRead){loseRead=false;await route.fulfill({status:503,json:{error:'PUBLICATION_DISPATCH_UNAVAILABLE'}});return;}
     data=await (paused?disabled:enabled).read(parts[1]);
    }else if(parts[0]==='jobs'&&parts.length===2)data={job:(await f.db.query('select * from studio.jobs where id=$1',[parts[1]])).rows[0],events:[]};
    else throw Error('UNEXPECTED_UI_ACTION');
    await route.fulfill({json:data});
   }catch(error){await route.fulfill({status:error.status||500,json:{error:error.code||'TEST_ERROR'}});}
  });
  await page.setViewportSize({width,height:1000});await page.goto('/');await page.getByRole('button',{name:/게시 요청 검사/}).click();
  const result=page.getByRole('region',{name:'제작 결과와 검토'}),approval=page.getByRole('region',{name:'공개 게시 승인'}),panel=page.getByRole('region',{name:'승인한 버전의 게시 요청'});
  await result.getByRole('button',{name:'결과·검토 보기'}).click();await approval.getByRole('button',{name:'게시 준비 상태 확인'}).click();
  const send=panel.getByRole('button',{name:'승인한 버전의 게시 검사 요청'});
  await expect(send).toHaveCount(0);await panel.getByRole('button',{name:'게시 요청 상태 확인'}).click();await expect(send).toBeEnabled();
  loseRead=true;await panel.getByRole('button',{name:'게시 요청 상태 새로고침'}).click();await expect(panel).toContainText('접수 여부를 확인하지 못했습니다.');await expect(send).toHaveCount(0);
  await panel.getByRole('button',{name:'게시 요청 상태 새로고침'}).click();await send.dblclick();
  await expect(panel).toContainText('접수 여부를 확인하지 못했습니다.');await expect(send).toHaveCount(0);expect(posts).toBe(1);
  await panel.getByRole('button',{name:'게시 요청 상태 새로고침'}).click();
  const expected=width===390?'게시 검사 요청의 응답을 확인하지 못했습니다.':'게시 검사 실행이 접수됐습니다. 아직 게시 완료는 아닙니다.';
  await expect(panel).toContainText(expected);await expect(send).toHaveCount(0);
  paused=true;await page.reload();await result.getByRole('button',{name:'결과·검토 보기'}).click();await approval.getByRole('button',{name:'게시 준비 상태 확인'}).click();
  await panel.getByRole('button',{name:'게시 요청 상태 확인'}).click();await expect(panel).toContainText(expected);await expect(panel).toContainText('기존 요청 상태는 확인할 수 있습니다.');await expect(send).toHaveCount(0);
  await approval.getByRole('button',{name:'이 버전의 게시 승인 철회'}).click();await expect(approval).toContainText('게시 승인을 철회했습니다.');
  await panel.getByRole('button',{name:'게시 요청 상태 새로고침'}).click();await expect(panel).toContainText(expected);
  expect(provider.calls.filter(c=>c.endpoint.endsWith('/dispatches')).length).toBe(1);expect(posts).toBe(1);
  expect((await f.db.query('select count(*)::int n from studio.releases')).rows[0].n).toBe(0);
  expect(await page.evaluate(()=>globalThis.RESULT_CODE_EXECUTED)).toBeUndefined();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await mkdir('.local/evidence/worker',{recursive:true});await page.screenshot({path:'.local/evidence/worker/publication-dispatch-'+width+'-'+randomUUID()+'.png',fullPage:true});
 }finally{await f.db.close();}
});
