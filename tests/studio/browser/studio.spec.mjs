import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';

test('UI-only revoked user can clear browser session and sees unconfirmed remote termination',async({page})=>{
  await page.route('**/api/studio/**',route=>route.fulfill(route.request().url().endsWith('/logout')?{status:200,json:{authenticated:false,localSessionCleared:true,remoteSignOut:'unconfirmed'}}:{status:403,json:{error:'TEACHER_NOT_ALLOWED'}}));
  await page.goto('/');
  await expect(page.getByRole('button',{name:'현재 브라우저 로그인 정보 정리'})).toBeEnabled();
  await page.getByRole('button',{name:'현재 브라우저 로그인 정보 정리'}).click();
  await expect(page.getByRole('heading',{name:'제작실 로그인',exact:true})).toBeVisible();
  await expect(page.getByRole('alert').filter({hasText:'인증 서버의 세션 종료는 확인하지 못했습니다.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'＋ 새 대화'})).toBeDisabled();
});

test('UI-only selected failed job and its guidance survive reload',async({page})=>{
  const cid='00000000-0000-4000-8000-000000000001';
  const failed={id:'00000000-0000-4000-8000-000000000002',conversation_id:cid,state:'failed',phase:null,state_version:1,run_attempt:1,error_code:'MOCK_SIMULATED_FAILURE',school_year:null,target_content_id:null};
  const latest={...failed,id:'00000000-0000-4000-8000-000000000003',state:'cancelled',error_code:null};
  const conversation={id:cid,title:'검사용 실패 안내',created_at:'2026-01-01T00:00:00Z'};
  await page.route('**/api/studio/**',async route=>{
    const path=new URL(route.request().url()).pathname.replace('/api/studio/','');
    const data=path==='session'?{authenticated:true,executionMode:'mock'}:path==='conversations'?{conversations:[conversation]}:path==='conversations/'+cid?{conversation,messages:[],jobs:[latest,failed]}:path.startsWith('jobs/')?{job:path.endsWith(failed.id)?failed:latest,events:[]}:null;
    await route.fulfill({status:data?200:404,json:data||{error:'NOT_FOUND'}});
  });
  await page.goto('/');await page.getByRole('button',{name:/검사용 실패 안내/}).click();
  await page.locator('.detail-panel select').selectOption(failed.id);
  await expect(page.getByRole('heading',{name:'모의 오류',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.locator('.detail-panel select')).toHaveValue(failed.id);
  await expect(page.locator('.detail-panel .notice')).toHaveText('검사용 모의 오류입니다. 실제 제작은 실행하지 않았습니다.');
  await expect(page.getByRole('button',{name:'재시도',exact:true})).toBeEnabled();
});

test('UI-only login errors distinguish network, rate limit, credentials and teacher denial',async({page})=>{
  let code='AUTH_UNAVAILABLE';
  await page.route('**/api/studio/**',route=>route.fulfill({status:401,json:{error:route.request().url().endsWith('/login')?code:'LOGIN_REQUIRED'}}));
  await page.goto('/');
  for(const [error,text] of [
    ['AUTH_UNAVAILABLE','인증 서비스에 연결하지 못했습니다.'],
    ['AUTH_RATE_LIMITED','로그인 요청이 너무 많습니다.'],
    ['LOGIN_FAILED','이메일과 비밀번호를 확인하세요.'],
    ['AUTH_REJECTED','인증 서비스가 로그인을 거절했습니다.'],
    ['TEACHER_NOT_ALLOWED','허용된 교사 계정이 아닙니다.'],
  ]) {
    code=error;
    await page.getByLabel('이메일',{exact:true}).fill('fixture@example.invalid');
    await page.getByLabel('비밀번호',{exact:true}).fill('fixture-only-not-a-real-password');
    await page.getByRole('button',{name:'로그인',exact:true}).click();
    await expect(page.getByRole('alert').filter({hasText:text})).toBeVisible();
    await expect(page.getByRole('button',{name:'＋ 새 대화'})).toBeDisabled();
  }
});

test('real unconfigured server denies forged sessions and all protected operations',async({page,request})=>{
  await page.goto('/');await expect(page.getByRole('heading',{name:'연결 설정 필요'})).toBeVisible();
  await expect(page.getByRole('button',{name:'로그인',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'＋ 새 대화'})).toBeDisabled();
  for(const endpoint of ['session','conversations','jobs/00000000-0000-4000-8000-000000000001']){
    const result=await request.get('/api/studio/'+endpoint,{headers:{cookie:'fake-session=teacher','x-user-id':'forged'}});expect(result.status()).toBe(503);expect(await result.json()).toEqual({error:'SETUP_REQUIRED'});
  }
  for(const endpoint of ['login','conversations','jobs','jobs/00000000-0000-4000-8000-000000000001/commands']){
    const result=await request.post('/api/studio/'+endpoint,{data:{state:'published',ownerId:'forged'}});expect(result.status()).toBe(503);
  }
  await fs.mkdir('.local/evidence/studio05',{recursive:true});await page.screenshot({path:'.local/evidence/studio05/unconfigured.png',fullPage:true});
});
for(const width of [390,1440])test(`unconfigured layout, keyboard and accessibility at ${width}`,async({page})=>{
  await page.setViewportSize({width,height:1000});await page.goto('/');await expect(page.getByRole('heading',{name:'연결 설정 필요'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'작업 공간으로 건너뛰기'})).toBeFocused();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});

test('UI-only fixture: request, lost-response resend, restore, mock steps, cancel and error; not real Auth/DB',async({page,request})=>{
  const cid='00000000-0000-4000-8000-000000000001',jid='00000000-0000-4000-8000-000000000002',retryId='00000000-0000-4000-8000-000000000003';
  const conversation={id:cid,title:'검사용 모의 대화',created_at:'2026-01-01T00:00:00Z'};
  let jobs=[],messages=[],events=[],attemptedKey=null,loseResponse=true;
  // Transport interception lives in this test only; production routes remain closed.
  await page.route('**/api/studio/**',async route=>{
    const url=new URL(route.request().url()).pathname.replace('/api/studio/','');
    const body=route.request().postDataJSON();let data;
    if(url==='session')data={authenticated:true,executionMode:'mock'};
    else if(url==='conversations')data={conversations:[conversation]};
    else if(url==='conversations/'+cid)data={conversation,messages,jobs};
    else if(url==='jobs'&&body){
      if(attemptedKey)expect(body.clientRequestId).toBe(attemptedKey);attemptedKey=body.clientRequestId;
      if(!jobs.length){jobs=[{id:jid,conversation_id:cid,execution_mode:'mock',state:'queued',phase:null,state_version:0,run_attempt:1,school_year:null,target_content_id:null,error_code:null,run_id:'mock:'+jid}];messages=[{id:'message',body:body.payload.requirements}];}
      if(loseResponse){loseResponse=false;await route.abort();return;}data={job:jobs[0]};
    }else if(/^jobs\/[^/]+$/.test(url))data={job:jobs.find(j=>j.id===url.split('/')[1]),events};
    else if(/^jobs\/[^/]+\/commands$/.test(url)){
      const {mockNext}=await import('../../../apps/studio/lib/domain.mjs');
      if(body.command==='retry') {jobs.unshift({...jobs[0],id:retryId,retry_of:jobs[0].id,state:'queued',state_version:0,phase:null,run_attempt:2});events=[];}
      else {const next=mockNext(jobs[0],body.command,body.expectedStateVersion);jobs[0]={...jobs[0],...next,state_version:next.stateVersion,error_code:next.errorCode};
        events.push({id:'event'+events.length,sequence:events.length,to_state:next.state,phase:next.phase,occurred_at:'2026-01-01T00:01:00Z'});}
      data={job:jobs[0]};
    }else if(url==='logout')data={authenticated:false};
    else{await route.fulfill({status:404,json:{error:'NOT_FOUND'}});return;}
    await route.fulfill({json:data});
  });
  await page.goto('/');await page.getByRole('button',{name:/검사용 모의 대화/}).click();
  await page.getByLabel('탐구 주제').fill('검사용 주제');await page.getByLabel('수업에서 보여 주고 싶은 것').fill('검사용 요청 <script>alert(1)</script>');
  await page.getByRole('button',{name:'모의 작업 접수'}).click();await expect(page.getByRole('alert').filter({hasText:'요청을 처리하지 못했습니다'})).toBeVisible();
  await page.getByRole('button',{name:'모의 작업 접수'}).click();await expect(page.getByRole('heading',{name:'모의 실행 대기'})).toBeVisible();expect(jobs).toHaveLength(1);
  await page.reload();await expect(page.getByRole('heading',{name:'모의 실행 대기'})).toBeVisible();
  await page.getByRole('button',{name:'모의 한 단계 실행'}).click();await expect(page.getByRole('heading',{name:'모의 실행 중'})).toBeVisible();
  await page.getByRole('button',{name:'중단 요청',exact:true}).click();await expect(page.getByRole('heading',{name:'중단 요청됨'})).toBeVisible();
  await page.getByRole('button',{name:'모의 중단 확인'}).click();await expect(page.getByRole('heading',{name:'모의 실행 중단'})).toBeVisible();
  await page.getByRole('button',{name:'재시도',exact:true}).click();await expect(page.getByRole('heading',{name:'모의 실행 대기'})).toBeVisible();expect(jobs).toHaveLength(2);expect(jobs[1].state).toBe('cancelled');
  await page.getByRole('button',{name:'모의 오류 확인'}).click();await expect(page.getByRole('heading',{name:'모의 오류',exact:true})).toBeVisible();
  expect((await request.get('/api/studio/session')).status()).toBe(503);
  await page.screenshot({path:'.local/evidence/studio05/fixture-only.png',fullPage:true});
  await page.getByLabel('수업에서 보여 주고 싶은 것').fill('지워질 검사용 입력');
  await page.getByRole('button',{name:'로그아웃'}).click();await expect(page.getByRole('heading',{name:'제작실 로그인'})).toBeVisible();
  await expect(page.getByLabel('수업에서 보여 주고 싶은 것')).toHaveValue('');
});
