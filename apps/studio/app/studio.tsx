'use client';
import { useEffect, useState } from 'react';

type Conversation = {id: string; title: string; created_at: string};
type Job = {id: string; conversation_id: string; state: string; phase: string | null; state_version: number; run_attempt: number; error_code: string | null; school_year: number | null; target_content_id: string | null; run_id: string};
type Event = {id: string; sequence: number; to_state: string; phase: string | null; occurred_at: string};
type Message = {id: string; body: string};
const states: Record<string,string> = {queued:'모의 실행 대기',running:'모의 실행 중',cancel_requested:'중단 요청됨',cancelled:'모의 실행 중단',failed:'모의 오류',needs_input:'모의 흐름 종료 · 실제 근거 필요'};
const phases: Record<string,string> = {source_review:'자료 검토',learning_design:'학습 설계',development:'개발',independent_review:'독립 검토',testing:'검사',policy_check:'정책 확인'};
const errors: Record<string,string> = {
  SETUP_REQUIRED:'연결 설정 필요: Supabase 설정과 데이터베이스 준비를 마친 뒤 사용할 수 있습니다.',
  LOGIN_REQUIRED:'로그인이 필요합니다. 세션이 만료되었다면 다시 로그인하세요.',
  LOGIN_FAILED:'로그인하지 못했습니다. 이메일과 비밀번호를 확인하세요.',
  AUTH_UNAVAILABLE:'인증 서비스에 연결하지 못했습니다. 잠시 후 다시 로그인하세요. 계속되면 서버 연결 상태를 확인하세요.',
  AUTH_RATE_LIMITED:'로그인 요청이 너무 많습니다. 잠시 기다린 후 다시 시도하세요.',
  AUTH_REJECTED:'인증 서비스가 로그인을 거절했습니다. 관리자에게 인증 설정 확인을 요청하세요.',
  TEACHER_NOT_ALLOWED:'허용된 교사 계정이 아닙니다. 관리자에게 접근 권한을 확인하세요.',
  DATABASE_UNAVAILABLE:'데이터베이스에 연결하지 못했습니다. 설정과 SQL 적용 상태를 확인하세요.',
  STATE_CONFLICT:'작업 상태가 바뀌었거나 다른 작업이 진행 중입니다. 기록을 새로고침하세요.',
  RETRY_NOT_ALLOWED:'중단·실패 작업만 최대 2회 재시도할 수 있습니다.',
  LIMIT_REACHED:'모의 검사 저장 한도에 도달했습니다. 새 작업을 진행할 수 없습니다.',
  NOT_FOUND:'기록을 찾을 수 없거나 접근 권한이 없습니다.',
  INVALID_REQUEST:'입력 내용을 확인하세요. 학년도는 미확인으로 둘 수 있습니다.',
  INVALID_TRANSITION:'현재 상태에서는 이 작업을 진행할 수 없습니다.',
  MOCK_SIMULATED_FAILURE:'검사용 모의 오류입니다. 실제 제작은 실행하지 않았습니다.',
  MOCK_FINISHED_NO_EVIDENCE:'모의 단계만 확인했습니다. 교육과정·교과서 검토와 실제 제작 증거는 없습니다.',
};
async function api(path: string, body?: unknown) {
  const response = await fetch('/api/studio/'+path, {method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'SERVICE_UNAVAILABLE');
  return data;
}
const date = (value: string) => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));

export default function Studio() {
  const [auth,setAuth] = useState<'checking'|'setup'|'login'|'ready'>('checking');
  const [notice,setNotice] = useState(''); const [busy,setBusy] = useState(false);
  const [conversations,setConversations] = useState<Conversation[]>([]); const [selected,setSelected] = useState('');
  const [messages,setMessages] = useState<Message[]>([]); const [jobs,setJobs] = useState<Job[]>([]);
  const [job,setJob] = useState<Job|null>(null); const [events,setEvents] = useState<Event[]>([]);
  const [topic,setTopic] = useState(''); const [requirements,setRequirements] = useState('');
  const [grade,setGrade] = useState('3'); const [unit,setUnit] = useState('생식과 유전'); const [year,setYear] = useState('');
  const [pending,setPending] = useState<{key:string; signature:string}|null>(null);
  function clearPrivate() {
    setConversations([]);setMessages([]);setJobs([]);setJob(null);setEvents([]);setSelected('');
    setTopic('');setRequirements('');setYear('');setPending(null);
    localStorage.removeItem('studio:last-conversation');
    localStorage.removeItem('studio:last-job');
    for(const key of Object.keys(sessionStorage)) if(key.startsWith('studio:')) sessionStorage.removeItem(key);
  }
  function failed(error: unknown) {
    const code = error instanceof Error?error.message:'SERVICE_UNAVAILABLE';
    setNotice(errors[code] || '요청을 처리하지 못했습니다. 연결을 확인하고 다시 시도하세요.');
    if(code==='SETUP_REQUIRED') setAuth('setup');
    if(code==='LOGIN_REQUIRED'||code==='TEACHER_NOT_ALLOWED') {setAuth('login');clearPrivate();}
  }
  async function action(fn:()=>Promise<void>) {setBusy(true);setNotice('');try {await fn();}catch(error){failed(error);}finally{setBusy(false);}}
  async function list() { const data=await api('conversations'); setConversations(data.conversations); }
  async function detail(jobId:string) {const data=await api('jobs/'+jobId);setJob(data.job);setEvents(data.events);localStorage.setItem('studio:last-job',data.job.id);}
  async function open(conversationId:string) {
    const data=await api('conversations/'+conversationId);setSelected(conversationId);setMessages(data.messages);setJobs(data.jobs);setJob(null);setEvents([]);
    // Only navigation IDs persist in this browser, never request text or credentials.
    localStorage.setItem('studio:last-conversation',conversationId);
    const lastJob=localStorage.getItem('studio:last-job');
    const restoredJob=data.jobs.find((item:Job)=>item.id===lastJob)||data.jobs[0];
    if(restoredJob) await detail(restoredJob.id);
  }
  async function boot() {
    await api('session');setAuth('ready');await list();
    const last=localStorage.getItem('studio:last-conversation'); if(last) await open(last);
  }
  useEffect(()=>{void boot().catch(failed); const stored=sessionStorage.getItem('studio:pending'); if(stored) {try{setPending(JSON.parse(stored));}catch{sessionStorage.removeItem('studio:pending');}}},[]);
  const locked=auth!=='ready'||busy;
  async function send() {
    const payload={topic,grade:Number(grade),unit,requirements,schoolYear:year?Number(year):null,targetContentId:null,expectedVersion:null};
    const bytes=new TextEncoder().encode(JSON.stringify({conversation:selected,payload}));
    const signature=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    const request=pending?.signature===signature?pending:{key:crypto.randomUUID(),signature};
    setPending(request);sessionStorage.setItem('studio:pending',JSON.stringify(request));
    const data=await api('jobs',{schemaVersion:1,conversationId:selected,clientRequestId:request.key,operation:'create_simulation',payload});
    sessionStorage.removeItem('studio:pending');setPending(null);setRequirements('');
    await open(selected);await detail(data.job.id);
  }
  async function command(kind:string) {
    if(!job)return;
    const storageKey='studio:command:'+job.id+':'+kind+':'+job.state_version;
    const clientRequestId=sessionStorage.getItem(storageKey)||crypto.randomUUID();sessionStorage.setItem(storageKey,clientRequestId);
    const data=await api('jobs/'+job.id+'/commands',{command:kind,expectedStateVersion:job.state_version,clientRequestId});
    sessionStorage.removeItem(storageKey);await open(selected);await detail(data.job.id);
  }
  return <>
    <a className="skip" href="#workspace">작업 공간으로 건너뛰기</a>
    <header className="topbar"><a className="brand" href="/"><span className="brand-icon" aria-hidden="true">✳</span><span>과학 제작실<small>TEACHER STUDIO</small></span></a><div className="top-actions"><span className="badge">05 · 모의 실행</span><a href="https://raph-alpaca.github.io/science-simulations/" target="_blank" rel="noreferrer">공개 자료실 ↗</a><button disabled={busy||auth==='checking'||auth==='setup'} onClick={()=>void action(async()=>{const result=await api('logout',{});setAuth('login');clearPrivate();setNotice(result.remoteSignOut==='unconfirmed'?'이 브라우저의 로그인 정보는 정리했습니다. 인증 서버의 세션 종료는 확인하지 못했습니다.':'이 브라우저에서 로그아웃했습니다.');})}>{auth==='ready'?'로그아웃':'현재 브라우저 로그인 정보 정리'}</button></div></header>
    <main id="workspace">
      <div className="intro"><div><p className="eyebrow">수업의 아이디어를, 차근차근</p><h1>오늘은 어떤 탐구를 만들까요?</h1><p>요청을 기록하고 제작 과정을 살펴보는 교사 작업 공간입니다.</p></div><div className="mode-note"><strong>현재는 모의 실행입니다</strong><span>AI 호출 · 콘텐츠 제작 · 승인 · 배포 없음</span></div></div>
      {notice&&<div className="notice" role="alert">{notice}</div>}
      {auth!=='ready'&&<section className="login-panel" aria-labelledby="login-title"><div><span className="eyebrow">교사 전용</span><h2 id="login-title">{auth==='setup'?'연결 설정 필요':'제작실 로그인'}</h2><p>{auth==='setup'?'Supabase 연결과 교사 계정 설정이 아직 준비되지 않았습니다. 보호된 작업은 잠겨 있습니다.':'허용된 교사 계정으로 로그인하세요. 신규 가입은 제공하지 않습니다.'}</p><p className="muted">설정 안내: docs/STUDIO_SETUP.md</p></div><form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);const element=e.currentTarget;void action(async()=>{await api('login',{email:form.get('email'),password:form.get('password')});element.reset();await boot();});}}><label>이메일<input name="email" type="email" autoComplete="username" required disabled={auth==='setup'||busy}/></label><label>비밀번호<input name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={auth==='setup'||busy}/></label><button className="primary" disabled={auth==='setup'||auth==='checking'||busy}>{auth==='checking'?'연결 확인 중…':'로그인'}</button></form></section>}
      <div className="workspace-grid">
        <aside className="panel conversations" aria-labelledby="conversations-title"><div className="panel-heading"><h2 id="conversations-title">대화 목록</h2><span>{conversations.length}</span></div><button className="new-button" disabled={locked} onClick={()=>void action(async()=>{const data=await api('conversations',{title:'새 탐구 대화'});await list();await open(data.conversation.id);})}>＋ 새 대화</button><nav aria-label="대화 선택">{conversations.map(c=><button className={selected===c.id?'conversation active':'conversation'} key={c.id} onClick={()=>void action(()=>open(c.id))} disabled={locked}>{c.title}<small>{date(c.created_at)}</small></button>)}</nav>{!conversations.length&&<p className="empty">{auth==='ready'?'새 대화를 열어 첫 요청을 기록해 보세요.':'로그인하면 나의 대화를 불러옵니다.'}</p>}<p className="privacy-note">나의 요청과 기록은 공개 자료실에 표시되지 않습니다.</p></aside>
        <section className="panel request-panel" aria-labelledby="request-title"><div className="panel-heading"><h2 id="request-title">탐구 요청</h2><span className="muted">문자 입력</span></div>{messages.length>0&&<div className="messages" aria-label="대화 기록">{messages.map(m=><article key={m.id}><strong>나의 요청</strong><p>{m.body}</p></article>)}</div>}<form onSubmit={e=>{e.preventDefault();void action(send);}}><fieldset disabled={locked||!selected}><legend className="sr-only">모의 작업 요청 입력</legend><label>탐구 주제<input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="예: 부모의 대립유전자는 어떻게 전달될까요?" maxLength={120} required/></label><div className="form-row"><label>학년<select value={grade} onChange={e=>setGrade(e.target.value)}><option value="1">중1</option><option value="2">중2</option><option value="3">중3</option></select></label><label>단원<input value={unit} onChange={e=>setUnit(e.target.value)} required maxLength={120}/></label></div><label>적용 학년도 <span className="optional">선택 · 미확인 유지 가능</span><input type="number" min="1900" max="2200" value={year} onChange={e=>setYear(e.target.value)} placeholder="미확인"/></label><label>수업에서 보여 주고 싶은 것<textarea rows={5} value={requirements} onChange={e=>setRequirements(e.target.value)} maxLength={4000} placeholder="학생이 무엇을 예측하고, 조작하고, 관찰하면 좋을지 적어 주세요." required/></label><p className="muted">{requirements.length}/4,000자 · 교육과정·교과서 대조는 미확인입니다.</p><button className="primary" type="submit">모의 작업 접수</button></fieldset></form>{!selected&&<p className="empty">로그인 후 대화를 선택하면 요청을 입력할 수 있습니다.</p>}</section>
        <section className="panel detail-panel" aria-labelledby="detail-title"><div className="panel-heading"><h2 id="detail-title">작업 상세</h2><button disabled={locked||!selected} onClick={()=>void action(async()=>{await open(selected);})}>새로고침</button></div>{jobs.length>0&&<label>작업 선택<select aria-label="작업 선택" value={job?.id||''} disabled={locked} onChange={e=>void action(()=>detail(e.target.value))}>{jobs.map(j=><option key={j.id} value={j.id}>{states[j.state]||j.state} · {j.id.slice(0,8)}</option>)}</select></label>}{job?<><div className="job-state" role="status"><span className="badge">모의 실행</span><h3>{states[job.state]||job.state}</h3><p>{job.phase?phases[job.phase]:'아직 시작하지 않았습니다.'}</p></div><dl><dt>학년도</dt><dd>{job.school_year??'미확인'}</dd><dt>콘텐츠 ID</dt><dd>{job.target_content_id??'미확정'}</dd><dt>실행 번호</dt><dd>{job.run_attempt} / 최대 3</dd><dt>작업 ID</dt><dd className="mono">{job.id}</dd></dl>{job.error_code&&<p className="notice">{errors[job.error_code]||'작업 상태를 확인해 주세요.'}</p>}<div className="commands"><button className="primary" disabled={locked||!['queued','running','cancel_requested'].includes(job.state)} onClick={()=>void action(()=>command('advance'))}>{job.state==='cancel_requested'?'모의 중단 확인':'모의 한 단계 실행'}</button><button disabled={locked||!['queued','running'].includes(job.state)} onClick={()=>void action(()=>command('cancel'))}>중단 요청</button><button disabled={locked||!['queued','running'].includes(job.state)} onClick={()=>void action(()=>command('simulate_error'))}>모의 오류 확인</button><button disabled={locked||!['failed','cancelled'].includes(job.state)||job.run_attempt>=3} onClick={()=>void action(()=>command('retry'))}>재시도</button></div><h3 className="history-title">진행 기록</h3><ol className="timeline">{events.map(event=><li key={event.id}><strong>{event.phase?phases[event.phase]:states[event.to_state]}</strong><span>{states[event.to_state]}</span><small>{date(event.occurred_at)}</small></li>)}</ol><p className="muted">단계 이름은 모의 표시입니다. 실제 자료 검토나 제작 결과가 아닙니다.</p></>:<div className="empty detail-empty"><span aria-hidden="true">○</span><h3>아직 선택한 작업이 없어요</h3><p>모의 작업을 접수하면<br/>진행 상태와 기록을 살펴볼 수 있습니다.</p></div>}</section>
      </div>
    </main><footer>과학 제작실 <span>교사만 접근 · 기록은 비공개 · 현재 모의 실행</span></footer>
  </>;
}
