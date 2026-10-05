'use client';
import {useEffect,useRef,useState} from 'react';

type Source={kind:string;title:string;url:string;location:string;summary:string};
type Draft={topic:string;grade:number;unit:string;requirements:string;generationKind:string;sources:Source[]};
type Review=Draft&{id:string;sourceHash:string;state:string;expiresAt:string;contentId:string;jobId:string|null;curriculumRevision:string|null;budget:{monthlyLimitKrw:number;monthlyJobLimit:number;jobLimitKrw:number;maxRepairAttempts:number};unverified:string[]};
type Props={conversationId:string;disabled:boolean;realReady:boolean;onStarted:(jobId:string)=>Promise<void>;api:(path:string,body?:unknown)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<void>;onError:(error:unknown)=>void};
const labels:Record<string,string>={curriculum:'교육과정',textbook:'교과서',science:'과학 참고 자료'};
const cleanSources=(sources:Source[])=>sources.map(({kind,title,url,location,summary})=>({kind,title,url,location,summary}));

export default function GenerationRequest({conversationId,disabled,realReady,onStarted,api,run,onError}:Props){
 const [draft,setDraft]=useState<Draft>({topic:'',grade:3,unit:'생식과 유전',requirements:'',generationKind:'interactive_2d',sources:[]});
 const [review,setReview]=useState<Review|null>(null),[rights,setRights]=useState(false),[cost,setCost]=useState(false);
 const [restoring,setRestoring]=useState(true);const mounted=useRef(true);
 const storage='studio:input-review:'+conversationId,pending='studio:input-pending:'+conversationId;
 useEffect(()=>{
  mounted.current=true;const stored=sessionStorage.getItem(storage);
  if(!stored){setRestoring(false);return()=>{mounted.current=false;};}
  void api('input-reviews/'+stored).then(data=>{if(mounted.current){const r=data.review as Review;setReview(r);setDraft({topic:r.topic,grade:r.grade,unit:r.unit,requirements:r.requirements,generationKind:r.generationKind,sources:cleanSources(r.sources)});}}).catch(error=>{if(mounted.current){sessionStorage.removeItem(storage);onError(error);}}).finally(()=>{if(mounted.current)setRestoring(false);});
  return()=>{mounted.current=false;};
  // Parent mounts a fresh form per conversation; no request/source text persists.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const locked=disabled||restoring||!conversationId;
 function change(next:Partial<Draft>){setDraft(value=>({...value,...next}));setReview(null);setRights(false);setCost(false);sessionStorage.removeItem(storage);}
 function source(index:number,patch:Partial<Source>){change({sources:draft.sources.map((s,i)=>i===index?{...s,...patch}:s)});}
 async function prepare(){
  if(review&&Date.parse(review.expiresAt)>Date.now())return;
  const raw=JSON.stringify({conversationId,...draft});
  const signature=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
  let saved:{signature:string;key:string}|null=null;try{saved=JSON.parse(sessionStorage.getItem(pending)||'null');}catch{}
  const request=saved?.signature===signature?saved:{signature,key:crypto.randomUUID()};sessionStorage.setItem(pending,JSON.stringify(request));
  const data=await api('input-reviews',{conversationId,clientRequestId:request.key,...draft});
  if(!mounted.current)return;setReview(data.review);setRights(false);setCost(false);sessionStorage.setItem(storage,data.review.id);sessionStorage.removeItem(pending);
 }
 async function approve(){
  if(!review||!rights||!cost)return;
  const data=await api('input-reviews/'+review.id+'/approve',{sourceHash:review.sourceHash,rightsConfirmed:rights,budgetAccepted:cost});
  if(mounted.current)setReview(data.review);
 }
 async function start(){
  if(!review||!realReady)return;
  const data=await api('input-reviews/'+review.id+'/start',{sourceHash:review.sourceHash});
  const current=await api('input-reviews/'+review.id);if(mounted.current)setReview(current.review);
  await onStarted(data.jobId);
 }
 const expired=review&&review.state!=='consumed'?Date.parse(review.expiresAt)<=Date.now():false;
 return <div className="generation-request">
  <h3>2D·3D 제작 준비</h3><p className="muted">과제와 직접 작성한 자료 요약을 확인합니다. 입력 저장에는 AI 비용이 발생하지 않습니다.</p>
  <form onSubmit={e=>{e.preventDefault();void run(prepare);}}><fieldset disabled={locked}>
   <legend className="sr-only">실제 제작을 위한 과제 입력</legend>
   <label>탐구 주제<input value={draft.topic} onChange={e=>change({topic:e.target.value})} maxLength={120} required/></label>
   <div className="form-row"><label>학년<select value={draft.grade} onChange={e=>change({grade:Number(e.target.value)})}>{[1,2,3].map(g=><option key={g} value={g}>중{g}</option>)}</select></label><label>단원<input value={draft.unit} onChange={e=>change({unit:e.target.value})} maxLength={120} required/></label></div>
   <label>시뮬레이션 유형<select value={draft.generationKind} onChange={e=>change({generationKind:e.target.value})}><option value="interactive_2d">2D · 변수와 결과 비교</option><option value="interactive_3d">3D · 입체 구조와 움직임 탐구</option></select></label>
   {draft.generationKind==='interactive_3d'&&<p className="muted">카메라 조작과 3D를 사용할 수 없는 기기를 위한 대체 설명을 포함합니다.</p>}
   <label>수업에서 보여 주고 싶은 것<textarea rows={5} value={draft.requirements} onChange={e=>change({requirements:e.target.value})} maxLength={4000} required placeholder="학생이 예측할 것, 조작할 변수, 관찰할 변화와 이해할 개념을 구체적으로 적어 주세요."/></label>
   <h4>참고 자료와 나의 요약</h4><p className="muted">공개 링크와 직접 작성한 요약만 입력하세요. 교과서 원문, 학생 정보, 비밀값은 넣지 마세요. 자료가 부족한 부분은 검토 완료로 표시하지 않습니다.</p>
   {draft.sources.map((s,i)=><fieldset className="source-input" key={i}><legend>참고 자료 {i+1}</legend>
    <label>자료 구분<select value={s.kind} onChange={e=>source(i,{kind:e.target.value})}>{Object.entries(labels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
    <label>자료 이름<input value={s.title} onChange={e=>source(i,{title:e.target.value})} maxLength={150} required/></label>
    <label>공개 자료 주소<input type="url" value={s.url} onChange={e=>source(i,{url:e.target.value})} placeholder="https://…" maxLength={1000} required/></label>
    <label>참고한 절·쪽·범위<input value={s.location} onChange={e=>source(i,{location:e.target.value})} maxLength={160} required/></label>
    <label>직접 작성한 요약<textarea rows={3} value={s.summary} onChange={e=>source(i,{summary:e.target.value})} maxLength={900} required/></label>
    <button type="button" onClick={()=>change({sources:draft.sources.filter((_,n)=>n!==i)})}>참고 자료 {i+1} 삭제</button>
   </fieldset>)}
   <button type="button" disabled={draft.sources.length>=6} onClick={()=>change({sources:[...draft.sources,{kind:'science',title:'',url:'',location:'',summary:''}]})}>＋ 참고 자료 추가</button>
   <div className="commands"><button className="primary" type="submit">제작 입력 미리 확인</button></div>
  </fieldset></form>
  {review&&<section className="input-preview" aria-labelledby="input-preview-title">
   <h3 id="input-preview-title">제작기에 전달할 내용</h3>
   <p><strong>{review.topic}</strong> · 중{review.grade} · {review.unit} · {review.generationKind==='interactive_3d'?'3D':'2D'}</p><p className="preserve-lines">{review.requirements}</p>
   <p className="muted">제작 기준: {review.curriculumRevision?review.curriculumRevision+' 개정':'미확인'} · 원문 대조 미확인</p>
   {review.sources.length?<ul>{review.sources.map((s,i)=><li key={i}><strong>{labels[s.kind]} · {s.title}</strong><br/><a href={s.url} target="_blank" rel="noreferrer">{s.url}</a><p>{s.location}</p><p className="preserve-lines">{s.summary}</p></li>)}</ul>:<p>등록된 참고 자료가 없습니다. 근거를 확인하기 전까지 과학·교육과정 검토는 보류됩니다.</p>}
   <p className="muted">현재 미확인: {review.unverified.join(', ')}. 링크를 저장한 것만으로 원문 확인을 완료하지 않습니다.</p>
   <p>내부 예산 한도: 월 {review.budget.monthlyLimitKrw.toLocaleString()}원·{review.budget.monthlyJobLimit}건, 작업당 {review.budget.jobLimitKrw.toLocaleString()}원. 검토와 최대 {review.budget.maxRepairAttempts}회 수정을 포함합니다.</p>
   {expired?<p className="notice">입력 확인 기한이 지났습니다. 내용을 다시 준비해 주세요.</p>:review.state==='prepared'?<fieldset disabled={locked}>
    <legend className="sr-only">입력 사용 범위 확인</legend>
    <label className="check-label"><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>과제와 직접 작성한 요약에 개인정보·비밀·비공개 원문이 없으며, AI 처리와 결과물 공개에 사용할 수 있음을 확인했습니다.</label>
    <label className="check-label"><input type="checkbox" checked={cost} onChange={e=>setCost(e.target.checked)}/>실제 제작을 시작하면 실패·중단 전까지 발생한 비용도 위 한도에 포함됨을 확인했습니다.</label>
    <button type="button" className="primary" disabled={!rights||!cost} onClick={()=>void run(approve)}>입력 확인 저장</button>
   </fieldset>:<div><p className="notice" role="status">{review.state==='consumed'?'이 입력 버전으로 작업이 접수됐습니다. 작업 상세에서 상태를 확인하세요.':realReady?'입력 확인을 저장했습니다. 아래 버튼으로 제작을 시작할 수 있습니다.':'입력 확인을 저장했습니다. 실제 실행기 연결 후 이 버전으로 제작할 수 있습니다.'}</p>
    {review.state==='consumed'&&review.jobId?<button type="button" disabled={locked} onClick={()=>void run(()=>onStarted(review.jobId!))}>접수한 작업 보기</button>:realReady&&<button type="button" className="primary" disabled={locked} onClick={()=>void run(start)}>제작 시작 · 최대 {review.budget.jobLimitKrw.toLocaleString()}원</button>}
   </div>}
   <p className="muted">내용을 수정하면 다시 확인합니다. 제작 결과의 검토와 게시 승인은 이후 단계입니다.</p>
  </section>}
 </div>;
}
