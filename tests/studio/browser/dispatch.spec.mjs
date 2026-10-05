import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {workerFixture} from '../worker-fixture.mjs';
import {syntheticDispatchEnv,syntheticGitHub} from '../github-dispatch-fixture.mjs';
import {createInputReviewService} from '../../../apps/studio/lib/input-review.mjs';
import {createDispatchService} from '../../../apps/studio/lib/dispatch-service.mjs';

for(const [width,uncertain] of [[390,false],[1440,false],[1440,true]])test('review to durable dispatch UI '+width+(uncertain?' uncertain':''),async({page})=>{
 const f=await workerFixture({auth:true});let starts=0;
 try{
  await f.db.exec('reset role');for(const n of ['studio_runner_v1','studio_input_review_v1','studio_dispatch_v1'])await f.db.exec(await readFile('supabase/proposals/'+n+'.sql','utf8'));
  await f.enable();await f.db.exec("reset role;create or replace function studio.dispatch_execution_enabled() returns boolean language sql security invoker set search_path='' as $$select true$$;set role service_role;");
  const db=f.client.schema('studio'),input=createInputReviewService({db,ownerId:f.ownerId,enabled:true});
  const provider=syntheticGitHub(uncertain?{fail:'/repos/Raph-Alpaca/science-simulations/actions/workflows/studio-worker.yml/dispatches'}:{});
  const dispatch=createDispatchService({db,ownerId:f.ownerId,env:syntheticDispatchEnv,transport:provider.transport});
  const conversation={id:f.submission.p_conversation,title:'제작 연결 검사',created_at:'2026-10-05T00:00:00Z'};
  await page.route('**/api/studio/**',async route=>{
   const parts=new URL(route.request().url()).pathname.replace('/api/studio/','').split('/'),body=route.request().postDataJSON();
   try{
    let data;
    if(parts[0]==='session')data={authenticated:true,fixture:true,capabilities:{requestV2:true,conversationEditing:true,inputReviews:true,realExecution:true}};
    else if(parts[0]==='conversations')data=parts.length===1?{conversations:[conversation]}:{conversation,messages:[],jobs:(await f.db.query('select * from studio.jobs order by created_at desc')).rows};
    else if(parts[0]==='input-reviews'&&parts.length===1)data=await input.prepare(body);
    else if(parts[0]==='input-reviews'&&parts[2]==='approve')data=await input.approve(parts[1],body);
    else if(parts[0]==='input-reviews'&&parts[2]==='start'){starts++;data=await dispatch.start(parts[1],body);}
    else if(parts[0]==='input-reviews'&&parts.length===2)data=await input.read(parts[1]);
    else if(parts[0]==='jobs'&&parts[2]==='dispatch')data=await dispatch.read(parts[1]);
    else if(parts[0]==='jobs'&&parts[2]==='commands'){
     expect(body.command).toBe('cancel');data={job:await f.rpc('cancel_worker_job',{p_owner:f.ownerId,p_job:parts[1],p_expected:body.expectedStateVersion,p_command:body.clientRequestId})};
    }else if(parts[0]==='jobs'&&parts.length===2)data={job:(await f.db.query('select * from studio.jobs where id=$1',[parts[1]])).rows[0],events:(await f.db.query('select * from studio.job_events where job_id=$1 order by sequence',[parts[1]])).rows};
    else throw Object.assign(Error(),{code:'UNEXPECTED_UI_ACTION',status:400});
    await route.fulfill({json:data});
   }catch(error){await route.fulfill({status:error.status||500,json:{error:error.code||'TEST_ERROR'}});}
  });
  await page.setViewportSize({width,height:1000});await page.goto('/');await page.getByRole('button',{name:/제작 연결 검사/}).click();
  await page.getByLabel('탐구 주제',{exact:true}).fill('합성 입체 도형');await page.getByLabel('시뮬레이션 유형').selectOption('interactive_3d');
  await page.getByLabel('수업에서 보여 주고 싶은 것').fill('원본·유료 호출 없는 접수 검사');await page.getByRole('button',{name:'제작 입력 미리 확인'}).click();
  await expect(page.getByRole('button',{name:/제작 시작/})).toHaveCount(0);
  await page.getByLabel(/과제와 직접 작성한 요약/).check();await page.getByLabel(/실제 제작을 시작하면/).check();await page.getByRole('button',{name:'입력 확인 저장'}).click();
  await page.getByRole('button',{name:'제작 시작 · 최대 1,000원'}).dblclick();const detail=page.getByRole('region',{name:'작업 상세',exact:true});
  await expect(detail).toContainText(uncertain?'실행 접수 여부 확인 필요':'실행번호 확인 완료');
  await expect(detail.getByRole('button',{name:'모의 한 단계 실행'})).toHaveCount(0);await expect(detail.getByRole('button',{name:'모의 오류 확인'})).toHaveCount(0);await expect(detail.getByRole('button',{name:'재시도',exact:true})).toHaveCount(0);
  expect(starts).toBe(1);expect(provider.calls.filter(c=>c.endpoint.endsWith('/dispatches'))).toHaveLength(1);
  await page.reload();await expect(detail).toContainText(uncertain?'실행 접수 여부 확인 필요':'실행번호 확인 완료');await expect(page.getByRole('button',{name:'접수한 작업 보기'})).toBeVisible();
  expect(starts).toBe(1);expect(provider.calls.filter(c=>c.endpoint.endsWith('/dispatches'))).toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await mkdir('.local/evidence/worker',{recursive:true});await page.screenshot({path:'.local/evidence/worker/dispatch-'+width+'-'+(uncertain?'uncertain-':'')+randomUUID()+'.png',fullPage:true});
  await detail.getByRole('button',{name:'중단 요청'}).click();await expect(detail).toContainText('제작 중단');await expect(detail).toContainText('실행 요청 취소됨');
  expect((await f.db.query('select state from studio.budget_jobs')).rows[0].state).toBe('closed');expect((await f.db.query('select count(*)::int n from studio.budget_calls')).rows[0].n).toBe(0);
 }finally{await f.db.close();}
});
