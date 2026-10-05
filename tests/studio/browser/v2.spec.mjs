import {test,expect} from '@playwright/test';
for(const width of [390,1440])test('v2 UI isolated transport at '+width,async({page})=>{
 await page.setViewportSize({width,height:1000});let conversations=[],created=0,deleted=0;
 await page.route('**/api/studio/**',async route=>{
  const path=new URL(route.request().url()).pathname.replace('/api/studio/',''),body=route.request().postDataJSON();let data;
  if(path==='session')data={authenticated:true,capabilities:{requestV2:true,conversationEditing:true}};
  else if(path==='conversations'&&body){created++;const c={id:'00000000-0000-4000-8000-000000000001',title:body.title.trim(),created_at:'2026-01-01T00:00:00Z'};conversations.push(c);data={conversation:c};}
  else if(path==='conversations')data={conversations};
  else if(path.endsWith('/rename')){conversations[0].title=body.title;data={conversation:conversations[0]};}
  else if(path.endsWith('/delete')){deleted++;conversations=[];data={};}
  else if(path.startsWith('conversations/'))data={conversation:conversations[0],messages:[],jobs:[]};
  else return route.fulfill({status:404,json:{error:'NOT_FOUND'}});
  await route.fulfill({json:data});
 });
 await page.goto('/');await page.getByRole('button',{name:'＋ 새 대화'}).click();
 await expect(page.getByLabel('대화 이름')).toBeFocused();await page.getByLabel('대화 이름').fill('취소 검사');await page.getByRole('button',{name:'취소',exact:true}).click();expect(created).toBe(0);
 await page.getByRole('button',{name:'＋ 새 대화'}).click();await page.getByLabel('대화 이름').fill('   ');await expect(page.getByRole('button',{name:'생성',exact:true})).toBeDisabled();
 await page.getByLabel('대화 이름').fill('격리 검사');await page.getByRole('button',{name:'생성',exact:true}).dblclick();await expect(page.getByRole('dialog')).not.toBeVisible();expect(created).toBe(1);
 await page.getByLabel('수업에서 보여 주고 싶은 것').fill('내 요청 유지');await page.getByText('작성 예시 보기',{exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByText('이 형식을 반드시 따를 필요는 없습니다.',{exact:false})).toBeVisible();await expect(page.getByLabel('수업에서 보여 주고 싶은 것')).toHaveValue('내 요청 유지');await expect(page.getByText('적용 학년도',{exact:false})).toHaveCount(0);
 await page.getByLabel('격리 검사 메뉴').click();await page.getByRole('button',{name:'이름 수정',exact:true}).click();await page.getByLabel('대화 이름').fill('수정된 검사');await page.getByRole('button',{name:'저장',exact:true}).click();await page.reload();await expect(page.getByRole('button',{name:/수정된 검사/})).toBeVisible();
 await page.getByLabel('수정된 검사 메뉴').click();await page.getByRole('button',{name:'삭제',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('웹앱은 삭제되지 않습니다');await page.getByRole('dialog').getByRole('button',{name:'취소'}).click();expect(deleted).toBe(0);
 await page.getByRole('button',{name:'삭제',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).click();expect(deleted).toBe(1);await page.reload();await expect(page.getByText('새 대화를 열어 첫 요청을 기록해 보세요.')).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('studio:last-conversation'))).toBeNull();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
