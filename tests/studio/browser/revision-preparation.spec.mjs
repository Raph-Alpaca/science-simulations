import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {revisionPreparationFixture} from '../revision-preparation-fixture.mjs';
import {insertPreparation} from '../preparation-fixture.mjs';

for(const width of [390,1440])test('revision evidence renewal keeps consent and lost-response boundaries at '+width,async({page})=>{
 const f=await revisionPreparationFixture({seed:false,expiredParent:true});let prepares=0,approvals=0,starts=0,loseNext=false;
 try{
  const feedback=await f.feedback('초기화 설명을 보완해 주세요.');
  const conversation={id:f.submission.p_conversation,title:'수정 근거 갱신 검사',created_at:'2026-10-16T00:00:00Z'};
  await page.route('**/api/studio/**',async route=>{
   const parts=new URL(route.request().url()).pathname.replace('/api/studio/','').split('/'),body=route.request().postDataJSON();
   try{
    let data;
    if(parts[0]==='session')data={authenticated:true,fixture:true,capabilities:{requestV2:true,conversationEditing:true,inputReviews:true,resultReview:true,revisions:true,realExecution:true}};
    else if(parts[0]==='conversations')data=parts.length===1?{conversations:[conversation]}:{conversation,messages:[],jobs:(await f.db.query('select * from studio.jobs order by created_at desc')).rows};
    else if(parts[0]==='jobs'&&parts[2]==='dispatch')data={dispatch:{state:'submitted'}};
    else if(parts[0]==='jobs'&&parts[2]==='result')data=await f.service.read(parts[1]);
    else if(parts[0]==='jobs'&&parts[2]==='revision-input'){
     prepares++;data=await f.revision.prepare(parts[1],body);
     if(loseNext){loseNext=false;await route.fulfill({status:503,json:{error:'REVISION_UNAVAILABLE'}});return;}
    }else if(parts[0]==='input-reviews'&&parts[2]==='approve'){approvals++;data=await f.inputs.approve(parts[1],body);}
    else if(parts[0]==='input-reviews'&&parts[2]==='start'){starts++;throw Error('MUST_NOT_START');}
    else if(parts[0]==='input-reviews'&&parts.length===2)data=await f.inputs.read(parts[1]);
    else if(parts[0]==='jobs'&&parts.length===2)data={job:(await f.db.query('select * from studio.jobs where id=$1',[parts[1]])).rows[0],events:[]};
    else throw Error('UNEXPECTED_UI_ACTION');
    await route.fulfill({json:data});
   }catch(error){await route.fulfill({status:error.status||500,json:{error:error.code||'TEST_ERROR'}});}
  });
  await page.setViewportSize({width,height:1000});await page.goto('/');await page.getByRole('button',{name:/수정 근거 갱신 검사/}).click();
  const result=page.getByRole('region',{name:'제작 결과와 검토'}),panel=page.getByRole('region',{name:'후속 수정 준비'}),status=panel.getByRole('region',{name:'제작 전 자료 확인'});
  await result.getByRole('button',{name:'결과·검토 보기'}).click();await panel.getByRole('button',{name:'이 요청으로 수정 준비'}).click();
  await expect(status).toContainText('유료 제작을 시작하지 않습니다');await expect(panel.getByLabel(/기존 결과·자료 요약/)).toBeDisabled();
  const rows=async()=>(await f.db.query('select id,source_hash,state,consent from studio.input_reviews order by created_at,id')).rows;
  const old=(await rows())[0];await f.seedRecords();loseNext=true;
  await panel.getByRole('button',{name:'자료 확인 후 수정 입력 새로 준비'}).click();await expect(page.getByRole('alert').filter({hasText:'수정 입력을 준비하지 못했습니다'})).toContainText('수정 입력을 준비하지 못했습니다');
  expect((await rows()).length).toBe(2);
  // Authority changes AFTER SQL committed but BEFORE the lost response retry.
  await f.db.exec('reset role');await f.db.query('update studio.preparation_sources set revoked_at=now() where id=$1',[f.records[0].recordId]);
  const replacement={...f.records[0],recordId:randomUUID()};await insertPreparation(f.db,f.scope.sources[0],replacement);await f.db.exec('set role service_role');
  await panel.getByRole('button',{name:'자료 확인 후 수정 입력 새로 준비'}).click();await expect(status).toContainText('유료 제작을 시작하지 않습니다');
  expect(prepares).toBe(3);expect((await rows()).length).toBe(2);
  await panel.getByRole('button',{name:'자료 확인 후 수정 입력 새로 준비'}).click();await expect(status).toContainText('원문 확인 기록이 연결됐습니다');
  const current=(await rows()).at(-1);expect(current.id).not.toBe(old.id);expect(current.source_hash).not.toBe(old.source_hash);expect(current.consent).toBe(null);
  await expect(panel).toContainText(f.context.contentId);await expect(panel).toContainText(feedback.note);await expect(panel).toContainText(f.input.requirements[0].text);
  await expect(panel.getByLabel(/기존 결과·자료 요약/)).not.toBeChecked();await expect(panel.getByLabel(/이번 수정은 별도 제작/)).not.toBeChecked();
  await panel.getByLabel(/기존 결과·자료 요약/).check();await panel.getByLabel(/이번 수정은 별도 제작/).check();
  await page.reload();await result.getByRole('button',{name:'결과·검토 보기'}).click();await expect(panel.getByLabel(/이번 수정은 별도 제작/)).not.toBeChecked();
  await panel.getByLabel(/기존 결과·자료 요약/).check();await panel.getByLabel(/이번 수정은 별도 제작/).check();await panel.getByRole('button',{name:'수정 입력 확인 저장'}).click();
  await expect(panel.getByRole('button',{name:/수정 제작 시작/})).toBeEnabled();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.evaluate(()=>globalThis.RESULT_CODE_EXECUTED)).toBeUndefined();
  await mkdir('.local/evidence/revision-preparation',{recursive:true});await page.screenshot({path:'.local/evidence/revision-preparation/ready-'+width+'.png',fullPage:true});
  await f.db.exec('reset role');await f.db.query('update studio.preparation_sources set revoked_at=now() where id=$1',[replacement.recordId]);await f.db.exec('set role service_role');
  await page.reload();await result.getByRole('button',{name:'결과·검토 보기'}).click();await expect(panel.getByRole('button',{name:/수정 제작 시작/})).toBeDisabled();
  await expect(panel.getByRole('button',{name:'자료 확인 후 수정 입력 새로 준비'})).toBeVisible();
  expect(prepares).toBe(4);expect(approvals).toBe(1);expect(starts).toBe(0);
  expect((await f.db.query('select count(*)::int n from studio.jobs')).rows[0].n).toBe(1);
  expect((await f.db.query('select count(*)::int n from studio.dispatch_intents')).rows[0].n).toBe(0);
 }finally{await f.db.close();}
});
