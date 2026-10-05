'use client';
import { useEffect, useState, useRef } from 'react';
import GenerationRequest from './generation-request';
import ResultReview from './result-review';

type Conversation = {id: string; title: string; created_at: string};
type Job = {execution_mode?: string; id: string; conversation_id: string; state: string; phase: string | null; state_version: number; run_attempt: number; error_code: string | null; school_year: number | null; target_content_id: string | null; run_id: string};
type Event = {id: string; sequence: number; to_state: string; phase: string | null; occurred_at: string};
type Message = {id: string; body: string};
const states: Record<string,string> = {queued:'모의 실행 대기',running:'모의 실행 중',cancel_requested:'중단 요청됨',cancelled:'모의 실행 중단',failed:'모의 오류',needs_input:'모의 흐름 종료 · 실제 근거 필요'};
const realStates:Record<string,string>={queued:'제작 실행 대기',running:'제작·검토 진행 중',cancel_requested:'중단 요청됨',cancelled:'제작 중단',failed:'제작 실패',needs_input:'추가 자료·수정 필요',awaiting_approval:'결과 검토 대기'};
const stateLabel=(job:Job)=>(job.execution_mode==='real'?realStates:states)[job.state]||job.state;
const dispatchLabels:Record<string,string>={ready:'실행 요청 준비 중',claimed:'실행 접수 확인 중 · 자동 재전송하지 않습니다.',submitted:'실행번호 확인 완료 · 작업 진행은 아래 기록을 확인하세요.',uncertain:'실행 접수 여부 확인 필요 · 다시 전송하지 않고 대기합니다.',failed:'실행 전 연결 확인 실패 · AI 호출은 시작하지 않았습니다.',cancelled:'실행 요청 취소됨',unavailable:'실행 접수 기록을 확인하지 못했습니다. 새로고침해 주세요.'};
const phases: Record<string,string> = {source_review:'자료 검토',learning_design:'학습 설계',development:'개발',independent_review:'독립 검토',testing:'검사',policy_check:'정책 확인'};
const errors: Record<string,string> = {
  RUNNER_CONNECTION_REQUIRED:'실제 제작 연결 설정이 아직 준비되지 않았습니다.',
  REAL_EXECUTION_UNAVAILABLE:'실제 제작이 아직 활성화되지 않았거나 일시 중지됐습니다.',
  RUNNER_PREFLIGHT_FAILED:'제작기 연결을 확인하지 못해 실행을 시작하지 않았습니다.',
  DISPATCH_UNAVAILABLE:'접수 결과를 확인하지 못했습니다. 같은 입력의 상태를 다시 확인하세요. 실행 요청은 중복 전송하지 않습니다.',
  DISPATCH_STATE_CONFLICT:'제작 접수 상태가 바뀌었습니다. 작업 기록을 새로고침하세요.',
  REAL_COMMAND_NOT_ALLOWED:'실제 작업에서는 중단 요청만 사용할 수 있습니다.',
  RESULT_SETUP_REQUIRED:'결과 검토 기능이 아직 연결되지 않았습니다.',
  RESULT_UNAVAILABLE:'결과 기록을 불러오거나 저장하지 못했습니다. 같은 내용으로 다시 확인할 수 있습니다.',
  RESULT_RECORD_INVALID:'결과와 검사 기록의 버전이 일치하지 않습니다. 검토를 보류하고 확인해야 합니다.',
  RESULT_CHANGED:'결과 버전이 바뀌었습니다. 검토 기록을 새로고침한 뒤 다시 확인하세요.',
  RESULT_FEEDBACK_LIMIT:'이 작업의 의견 저장 한도 20개에 도달했습니다.',
  REVISION_SETUP_REQUIRED:'후속 수정 기능이 아직 연결되지 않았습니다.',
  REVISION_UNAVAILABLE:'수정 입력을 준비하지 못했습니다. 같은 수정 요청으로 다시 확인할 수 있습니다.',
  REVISION_CHANGED:'기준 결과나 후속 작업이 바뀌었습니다. 최신 결과를 열고 새 수정 요청을 남겨 주세요.',
  REVISION_BUSY:'이 콘텐츠의 후속 작업이 진행 중입니다. 종료 후 결과를 확인해 주세요.',
  REVISION_LIMIT:'이 콘텐츠의 수정 또는 입력 저장 한도에 도달했습니다.',
  REVISION_CONTEXT_TOO_LARGE:'기준 결과와 누적 요청이 제작기의 입력 한도를 넘었습니다. 이번 자동 수정은 시작하지 않았습니다.',
  INPUT_REVIEW_SETUP_REQUIRED:'제작 입력 저장 기능이 아직 준비되지 않았습니다.',
  INPUT_REVIEW_INVALID:'과제와 참고 자료의 입력 내용을 확인하세요.',
  INPUT_REVIEW_UNAVAILABLE:'입력 확인 기록을 저장하거나 불러오지 못했습니다. 같은 내용을 다시 확인할 수 있습니다.',
  INPUT_REVIEW_CHANGED:'입력 버전이 달라졌습니다. 현재 내용을 다시 확인하세요.',
  INPUT_REVIEW_EXPIRED:'입력 확인 기한이 지났습니다. 현재 내용을 다시 준비하세요.',
  INPUT_REVIEW_LIMIT:'입력 확인 기록의 저장 한도에 도달했습니다.',
  INPUT_CONTAINS_PRIVATE_DATA:'비밀값이나 비공개 경로가 포함되어 있습니다. 해당 내용을 제거하세요.',
  SOURCE_URL_INVALID:'로그인 정보가 없는 공개 HTTPS 자료 주소를 입력하세요.',
  SOURCE_DUPLICATE:'같은 범위의 참고 자료가 중복되었습니다.',
  INPUT_PERMISSION_REQUIRED:'입력 사용 범위와 비용 조건을 확인하세요.',
  REQUEST_TOO_LARGE:'입력이 너무 큽니다. 과제와 자료 요약을 줄여 주세요.',
  REQUEST_TIMEOUT:'입력 전송이 제한 시간을 넘었습니다. 연결 상태를 확인하세요.',
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
  LIMIT_REACHED:'작업 또는 예산 한도에 도달했습니다. 새 작업을 진행할 수 없습니다.',
  NOT_FOUND:'기록을 찾을 수 없거나 접근 권한이 없습니다.',
  INVALID_REQUEST:'입력 내용을 확인하세요.',
 DB_CHANGE_REQUIRED:'DB 변경 적용 필요: 07-1 SQL 검토와 적용 후 사용할 수 있습니다.',
 CONVERSATION_BUSY:'진행 중인 작업이 있습니다. 작업 종료 또는 중단 완료 후 다시 진행하세요.',
 DELETE_ROLLOUT_REQUIRED:'삭제 기능은 호환 앱 배포와 복구 버전 확인 후 별도 활성화가 필요합니다. 아직 삭제되지 않았습니다.',
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
  const [fixture,setFixture]=useState(false);
  const [inputReviewReady,setInputReviewReady]=useState(false);
  const [resultReviewReady,setResultReviewReady]=useState(false);
  const [revisionReady,setRevisionReady]=useState(false);
  const [realReady,setRealReady]=useState(false),[dispatchState,setDispatchState]=useState('');
  const [auth,setAuth] = useState<'checking'|'setup'|'login'|'ready'>('checking');
  const [notice,setNotice] = useState(''); const [busy,setBusy] = useState(false);
  const [conversations,setConversations] = useState<Conversation[]>([]); const [selected,setSelected] = useState('');
  const [messages,setMessages] = useState<Message[]>([]); const [jobs,setJobs] = useState<Job[]>([]);
  const [job,setJob] = useState<Job|null>(null); const [events,setEvents] = useState<Event[]>([]);
  const [topic,setTopic] = useState(''); const [requirements,setRequirements] = useState('');
  const [grade,setGrade] = useState('3'); const [unit,setUnit] = useState('생식과 유전');
  const [pending,setPending] = useState<{key:string; signature:string}|null>(null);
  function clearPrivate() {
    setConversations([]);setMessages([]);setJobs([]);setJob(null);setEvents([]);setSelected('');
    setTopic('');setRequirements('');setPending(null);
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
  const actionLock=useRef(false);
  async function action(fn:()=>Promise<void>) {if(actionLock.current)return; actionLock.current=true;setBusy(true);setNotice('');try {await fn();}catch(error){failed(error);}finally{actionLock.current=false;setBusy(false);}}
  async function list() { const data=await api('conversations'); setConversations(data.conversations); }
  async function detail(jobId:string) {const data=await api('jobs/'+jobId);setJob(data.job);setEvents(data.events);setDispatchState('');if(data.job.execution_mode==='real'){try{const result=await api('jobs/'+jobId+'/dispatch');setDispatchState(result.dispatch.state);}catch{setDispatchState('unavailable');}}localStorage.setItem('studio:last-job',data.job.id);}
  async function open(conversationId:string) {
    const data=await api('conversations/'+conversationId);setSelected(conversationId);setMessages(data.messages);setJobs(data.jobs);setJob(null);setEvents([]);
    // Only navigation IDs persist in this browser, never request text or credentials.
    localStorage.setItem('studio:last-conversation',conversationId);
    const lastJob=localStorage.getItem('studio:last-job');
    const restoredJob=data.jobs.find((item:Job)=>item.id===lastJob)||data.jobs[0];
    if(restoredJob) await detail(restoredJob.id);
  }
  async function boot() {
    const session=await api('session');setFixture(session.fixture===true);setDbV2(session.capabilities?.requestV2===true);setInputReviewReady(session.capabilities?.inputReviews===true);setRealReady(session.capabilities?.realExecution===true);setResultReviewReady(session.capabilities?.resultReview===true);setRevisionReady(session.capabilities?.revisions===true);setAuth('ready');await list();
    const last=localStorage.getItem('studio:last-conversation'); if(last) {try{await open(last);}catch(e){if(e instanceof Error && e.message==='NOT_FOUND'){localStorage.removeItem('studio:last-conversation');localStorage.removeItem('studio:last-job');}else throw e;}}
  }
  useEffect(()=>{void boot().catch(failed); const stored=sessionStorage.getItem('studio:pending'); if(stored) {try{setPending(JSON.parse(stored));}catch{sessionStorage.removeItem('studio:pending');}}},[]);
  const [dbV2,setDbV2]=useState(false);
  const [dialog,setDialog]=useState<{kind:'create'|'rename'|'delete';id?:string}|null>(null);
  const [title,setTitle]=useState(''); const titleInput=useRef<HTMLInputElement>(null); const modal=useRef<HTMLDialogElement>(null);
  const newButton=useRef<HTMLButtonElement>(null);
  const createKey=useRef(''); const trigger=useRef<HTMLElement|null>(null);
  function closeDialog(){setDialog(null);}
  function showDialog(kind:'create'|'rename'|'delete', c?:Conversation){trigger.current=document.activeElement as HTMLElement;setTitle(c?.title||'');createKey.current=crypto.randomUUID();setDialog({kind,id:c?.id});}
  useEffect(()=>{if(dialog){modal.current?.showModal();if(dialog.kind!=='delete')titleInput.current?.focus();}else {modal.current?.close();if(trigger.current?.isConnected)trigger.current.focus();else if(trigger.current)newButton.current?.focus();}},[dialog]);
  async function saveDialog(){
    if(!dialog)return;
    if(dialog.kind!=='delete' && (!title.trim()||title.length>120))throw new Error('INVALID_REQUEST');
    if(!dbV2)throw new Error('DB_CHANGE_REQUIRED');
    if(dialog.kind==='create'){const data=await api('conversations',{title,clientRequestId:createKey.current});await list();await open(data.conversation.id);}
    else if(dialog.kind==='rename'){await api('conversations/'+dialog.id+'/rename',{title});await list();}
    else {await api('conversations/'+dialog.id+'/delete',{});
      if(selected===dialog.id){setSelected('');setMessages([]);setJobs([]);setJob(null);setEvents([]);setTopic('');setRequirements('');setPending(null);sessionStorage.removeItem('studio:pending');localStorage.removeItem('studio:last-conversation');localStorage.removeItem('studio:last-job');}
      await list();
    }
    closeDialog();
  }
  const locked=auth!=='ready'||busy;
  async function send() {
    const payload={topic,grade:Number(grade),unit,requirements,targetContentId:null,expectedVersion:null};
    const bytes=new TextEncoder().encode(JSON.stringify({conversation:selected,payload}));
    const signature=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    const request=pending?.signature===signature?pending:{key:crypto.randomUUID(),signature};
    setPending(request);sessionStorage.setItem('studio:pending',JSON.stringify(request));
    const data=await api('jobs',{schemaVersion:2,conversationId:selected,clientRequestId:request.key,operation:'create_simulation',payload});
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
    <header className="topbar"><a className="brand" href="/"><span className="brand-icon" aria-hidden="true">✳</span><span>과학 제작실<small>TEACHER STUDIO</small></span></a><div className="top-actions"><span className="badge">{realReady?'2D·3D 제작':'모의 실행 · 제작 준비'}</span><a href="https://raph-alpaca.github.io/science-simulations/" target="_blank" rel="noreferrer">공개 자료실 ↗</a><button disabled={busy||auth==='checking'||auth==='setup'} onClick={()=>void action(async()=>{const result=await api('logout',{});setAuth('login');clearPrivate();setNotice(result.remoteSignOut==='unconfirmed'?'이 브라우저의 로그인 정보는 정리했습니다. 인증 서버의 세션 종료는 확인하지 못했습니다.':'이 브라우저에서 로그아웃했습니다.');})}>{auth==='ready'?'로그아웃':'현재 브라우저 로그인 정보 정리'}</button></div></header>
    <main id="workspace">{fixture&&<p className="notice" role="status">격리된 로컬 검사 화면 · 실제 로그인/운영 DB 아님 · 종료하면 검사 기록이 사라집니다.</p>}
      <div className="intro"><div><p className="eyebrow">수업의 아이디어를, 차근차근</p><h1>오늘은 어떤 탐구를 만들까요?</h1><p>요청을 기록하고 제작 과정을 살펴보는 교사 작업 공간입니다.</p></div><div className="mode-note"><strong>{inputReviewReady?'제작할 내용을 먼저 확인하세요':'현재는 모의 실행입니다'}</strong><span>{realReady?'입력 확인 → 제작·검토 → 결과 확인':inputReviewReady?'입력 준비·확인 가능 · 실제 제작은 연결 대기':'AI 호출 · 콘텐츠 제작 · 승인 · 배포 없음'}</span></div></div>
      {auth==='ready'&&!dbV2&&<p className="notice">DB 변경 적용 필요: 새 요청·대화 생성·이름 수정·삭제는 아직 사용할 수 없습니다. 기존 기록 조회와 모의 작업은 유지됩니다.</p>}<p className="muted">{realReady?'확인한 과제로 제작과 검토를 시작할 수 있습니다. 결과 검토와 공개 게시 연결은 별도 단계입니다.':inputReviewReady?'입력 확인 기록을 저장할 수 있습니다. AI 제작과 공개 게시의 실제 연결은 아직 준비 중입니다.':'실제 실행기 연결 필요 · 현재 모의 실행만 지원합니다.'}</p>{notice&&<div className="notice" role="alert">{notice}</div>}
      {auth!=='ready'&&<section className="login-panel" aria-labelledby="login-title"><div><span className="eyebrow">교사 전용</span><h2 id="login-title">{auth==='setup'?'연결 설정 필요':'제작실 로그인'}</h2><p>{auth==='setup'?'Supabase 연결과 교사 계정 설정이 아직 준비되지 않았습니다. 보호된 작업은 잠겨 있습니다.':'허용된 교사 계정으로 로그인하세요. 신규 가입은 제공하지 않습니다.'}</p><p className="muted">설정 안내: docs/STUDIO_SETUP.md</p></div><form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);const element=e.currentTarget;void action(async()=>{await api('login',{email:form.get('email'),password:form.get('password')});element.reset();await boot();});}}><label>이메일<input name="email" type="email" autoComplete="username" required disabled={auth==='setup'||busy}/></label><label>비밀번호<input name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={auth==='setup'||busy}/></label><button className="primary" disabled={auth==='setup'||auth==='checking'||busy}>{auth==='checking'?'연결 확인 중…':'로그인'}</button></form></section>}
      <div className="workspace-grid">
        <aside className="panel conversations" aria-labelledby="conversations-title"><div className="panel-heading"><h2 id="conversations-title">대화 목록</h2><span>{conversations.length}</span></div><button ref={newButton} className="new-button" disabled={locked} onClick={()=>showDialog('create')}>＋ 새 대화</button><nav aria-label="대화 선택">{conversations.map(c=><div className="conversation-row" key={c.id}><button className={selected===c.id?'conversation active':'conversation'} onClick={()=>void action(()=>open(c.id))} disabled={locked}>{c.title}<small>{date(c.created_at)}</small></button><details><summary aria-label={c.title+' 메뉴'}>⋯</summary><button disabled={locked} onClick={()=>showDialog('rename',c)}>이름 수정</button><button disabled={locked} onClick={()=>showDialog('delete',c)}>삭제</button></details></div>)}</nav>{!conversations.length&&<p className="empty">{auth==='ready'?'새 대화를 열어 첫 요청을 기록해 보세요.':'로그인하면 나의 대화를 불러옵니다.'}</p>}<p className="privacy-note">나의 요청과 기록은 공개 자료실에 표시되지 않습니다.</p></aside>
        <section className="panel request-panel" aria-labelledby="request-title"><div className="panel-heading"><h2 id="request-title">탐구 요청</h2><span className="muted">문자 입력</span></div>{messages.length>0&&<div className="messages" aria-label="대화 기록">{messages.map(m=><article key={m.id}><strong>나의 요청</strong><p>{m.body}</p></article>)}</div>}{inputReviewReady?<GenerationRequest key={selected} conversationId={selected} disabled={locked} realReady={realReady} onStarted={async jobId=>{await open(selected);await detail(jobId);}} api={api} run={action} onError={failed}/>:<form onSubmit={e=>{e.preventDefault();void action(send);}}><fieldset disabled={locked||!selected}><legend className="sr-only">모의 작업 요청 입력</legend><label>탐구 주제<input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="예: 부모의 대립유전자는 어떻게 전달될까요?" maxLength={120} required/></label><div className="form-row"><label>학년<select value={grade} onChange={e=>setGrade(e.target.value)}><option value="1">중1</option><option value="2">중2</option><option value="3">중3</option></select></label><label>단원<input value={unit} onChange={e=>setUnit(e.target.value)} required maxLength={120}/></label></div><label>수업에서 보여 주고 싶은 것<textarea aria-describedby="request-hint" rows={5} value={requirements} onChange={e=>setRequirements(e.target.value)} maxLength={4000} placeholder="학생이 무엇을 예측하고, 조작하고, 관찰하면 좋을지 적어 주세요." required/></label><p id="request-hint">학생들에게 보여 주고 싶은 현상이나 개념을 자유롭게 작성해 주세요.</p><details className="writing-example"><summary>작성 예시 보기</summary><ul><li>어떤 개념이나 현상을 보여주고 싶은지</li><li>학생이 무엇을 조작하거나 비교하면 좋은지</li><li>어떤 변화나 결과가 화면에 나타나면 좋은지</li><li>학생이 무엇을 이해했으면 하는지</li></ul><p>체세포 분열과 감수 1분열을 한 화면에서 비교하고 싶습니다.<br/>학생이 분열 단계를 직접 이동하면서 염색체 배열과 이동을 관찰할 수 있도록 해 주세요.<br/>특히 감수 1분열에서 상동 염색체가 분리되면서 염색체 수가 절반으로 감소하는 모습을 체세포 분열과 비교해서 이해할 수 있으면 좋겠습니다.</p><p>이 형식을 반드시 따를 필요는 없습니다. 예시는 자동 입력되지 않습니다.</p></details><p className="muted">{requirements.length}/4,000자 · 교육과정·교과서 대조는 미확인입니다.</p><button disabled={!dbV2} className="primary" type="submit">모의 작업 접수</button></fieldset></form>}{!selected&&<p className="empty">로그인 후 대화를 선택하면 요청을 입력할 수 있습니다.</p>}</section>
        <section className="panel detail-panel" aria-labelledby="detail-title"><div className="panel-heading"><h2 id="detail-title">작업 상세</h2><button disabled={locked||!selected} onClick={()=>void action(async()=>{await open(selected);})}>새로고침</button></div>{jobs.length>0&&<label>작업 선택<select aria-label="작업 선택" value={job?.id||''} disabled={locked} onChange={e=>void action(()=>detail(e.target.value))}>{jobs.map(j=><option key={j.id} value={j.id}>{stateLabel(j)} · {j.id.slice(0,8)}</option>)}</select></label>}{job?<><div className="job-state" role="status"><span className="badge">{job.execution_mode==='real'?'실제 제작':'모의 실행'}</span><h3>{stateLabel(job)}</h3><p>{job.phase?phases[job.phase]:'아직 시작하지 않았습니다.'}</p></div>{job.execution_mode==='real'&&dispatchState&&<p className="notice">{dispatchLabels[dispatchState]||'접수 상태 확인 필요'}</p>}<dl><dt>콘텐츠 ID</dt><dd>{job.target_content_id??'미확정'}</dd><dt>실행 번호</dt><dd>{job.execution_mode==='real'?(job.run_id.startsWith('pending:')?'미확인':job.run_id):job.run_attempt+' / 최대 3'}</dd><dt>작업 ID</dt><dd className="mono">{job.id}</dd></dl>{job.error_code&&<p className="notice">{errors[job.error_code]||'작업 상태를 확인해 주세요.'}</p>}<div className="commands">{job.execution_mode!=='real'&&<button className="primary" disabled={locked||!['queued','running','cancel_requested'].includes(job.state)} onClick={()=>void action(()=>command('advance'))}>{job.state==='cancel_requested'?'모의 중단 확인':'모의 한 단계 실행'}</button>}<button disabled={locked||!['queued','running'].includes(job.state)} onClick={()=>void action(()=>command('cancel'))}>중단 요청</button>{job.execution_mode!=='real'&&<button disabled={locked||!['queued','running'].includes(job.state)} onClick={()=>void action(()=>command('simulate_error'))}>모의 오류 확인</button>}{job.execution_mode!=='real'&&<button disabled={locked||!['failed','cancelled'].includes(job.state)||job.run_attempt>=3} onClick={()=>void action(()=>command('retry'))}>재시도</button>}</div>{job.execution_mode==='real'&&resultReviewReady&&<ResultReview key={job.id+':'+job.state_version} jobId={job.id} disabled={locked} revisionReady={revisionReady} realReady={realReady} onStarted={async jobId=>{await open(selected);await detail(jobId);}} onError={failed} api={api} run={action}/>}<h3 className="history-title">진행 기록</h3><ol className="timeline">{events.map(event=><li key={event.id}><strong>{event.phase?phases[event.phase]:(job.execution_mode==='real'?realStates:states)[event.to_state]}</strong><span>{(job.execution_mode==='real'?realStates:states)[event.to_state]}</span><small>{date(event.occurred_at)}</small></li>)}</ol><p className="muted">{job.execution_mode==='real'?'실행 접수는 제작·게시 완료를 뜻하지 않습니다. 결과물 검토와 게시 확인이 필요합니다.':'단계 이름은 모의 표시입니다. 실제 자료 검토나 제작 결과가 아닙니다.'}</p></>:<div className="empty detail-empty"><span aria-hidden="true">○</span><h3>아직 선택한 작업이 없어요</h3><p>모의 작업을 접수하면<br/>진행 상태와 기록을 살펴볼 수 있습니다.</p></div>}</section>
      </div>
      <dialog ref={modal} onCancel={e=>{e.preventDefault();if(!busy)closeDialog();}} aria-labelledby="conversation-dialog-title"><form onSubmit={e=>{e.preventDefault();void action(saveDialog);}}><h2 id="conversation-dialog-title">{dialog?.kind==='delete'?'대화 삭제':dialog?.kind==='rename'?'이름 수정':'새 대화'}</h2>{dialog?.kind==='delete'?<><p>이 탐구 대화를 삭제하시겠습니까?<br/>대화를 삭제해도 이미 제작된 웹앱은 삭제되지 않습니다.</p><p>대화 제목과 메시지는 삭제됩니다. 작업 요청 스냅샷(주제·단원·요청 내용 포함)은 재현·중복 방지용 제작 명세로 별도 보존되며 검토·승인·배포 이력은 유지됩니다.</p><p>진행 중인 작업은 중단 완료 후 삭제할 수 있습니다.</p></>:<label>대화 이름<input ref={titleInput} value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} required disabled={busy}/><small>1~120자 · 공백만 입력할 수 없습니다.</small></label>}{!dbV2&&<p>DB 변경 적용 필요</p>}{notice&&<p role="alert">{notice}</p>}<div className="commands"><button type="button" disabled={busy} onClick={closeDialog}>취소</button><button type="submit" disabled={busy||!dbV2||(dialog?.kind!=='delete'&&!title.trim())}>{dialog?.kind==='delete'?'삭제':dialog?.kind==='rename'?'저장':'생성'}</button></div></form></dialog>
    </main><footer>과학 제작실 <span>교사 전용 · 제작 기록 조회</span></footer>
  </>;
}
