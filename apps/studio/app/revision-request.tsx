'use client';
import {useEffect,useRef,useState} from 'react';

type Version={stateVersion:number;sourceHash:string;candidateHash:string|null;evidenceHash:string};
type Review={id:string;sourceHash:string;state:string;expiresAt:string;jobId:string|null;contentId:string;requirements:string;grade:number;unit:string;generationKind:string;
 revision:{parentJobId:string;feedbackId:string;candidateHash:string};sources:{title?:string;location?:string;summary?:string}[];
 budget:{monthlyLimitKrw:number;monthlyJobLimit:number;jobLimitKrw:number;maxRepairAttempts:number}};
type Props={jobId:string;version:Version;feedback:{id:string;note:string}[];disabled:boolean;realReady:boolean;
 api:(path:string,body?:unknown)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<void>;onStarted:(jobId:string)=>Promise<void>;onError:(error:unknown)=>void};

export default function RevisionRequest({jobId,version,feedback,disabled,realReady,api,run,onStarted,onError}:Props){
 const [review,setReview]=useState<Review|null>(null),[rights,setRights]=useState(false),[cost,setCost]=useState(false),[restoring,setRestoring]=useState(true);
 const mounted=useRef(true),storage='studio:revision-review:'+jobId,pending='studio:revision-pending:'+jobId;
 function accept(value:Review){if(value.revision?.parentJobId!==jobId)throw Error('REVISION_CHANGED');setReview(value);setRights(false);setCost(false);}
 useEffect(()=>{
  mounted.current=true;const stored=sessionStorage.getItem(storage);
  if(!stored){setRestoring(false);return()=>{mounted.current=false;};}
  void api('input-reviews/'+stored).then(data=>{if(mounted.current)accept(data.review);}).catch(error=>{if(mounted.current){sessionStorage.removeItem(storage);onError(error);}}).finally(()=>{if(mounted.current)setRestoring(false);});
  return()=>{mounted.current=false;};
  // The parent remounts this component for each result version. Only IDs persist.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function prepare(feedbackId:string){
  let saved:{feedbackId:string;clientRequestId:string}|null=null;try{saved=JSON.parse(sessionStorage.getItem(pending)||'null');}catch{}
  const request=saved?.feedbackId===feedbackId?saved:{feedbackId,clientRequestId:crypto.randomUUID()};sessionStorage.setItem(pending,JSON.stringify(request));
  const data=await api('jobs/'+jobId+'/revision-input',{...request,version});
  if(!mounted.current)return;accept(data.review);sessionStorage.setItem(storage,data.review.id);sessionStorage.removeItem(pending);
 }
 async function approve(){
  if(!review||!rights||!cost)return;
  const data=await api('input-reviews/'+review.id+'/approve',{sourceHash:review.sourceHash,rightsConfirmed:rights,budgetAccepted:cost});if(mounted.current)accept(data.review);
 }
 async function start(){
  if(!review||!realReady)return;
  const data=await api('input-reviews/'+review.id+'/start',{sourceHash:review.sourceHash});
  if(mounted.current){const current=await api('input-reviews/'+review.id);if(mounted.current)accept(current.review);await onStarted(data.jobId);}
 }
 const locked=disabled||restoring,expired=review&&review.state!=='consumed'&&Date.parse(review.expiresAt)<=Date.now();
 return <section className="input-preview" aria-label="후속 수정 준비">
  <h4>후속 수정 준비</h4><p>기존 결과를 기준으로 새 작업을 만듭니다. 원래 결과와 콘텐츠 주소는 보존하며, 수정 작업에도 월 제작 건수와 비용 한도가 적용됩니다.</p>
  {feedback.length?<ul>{feedback.map(item=><li key={item.id}><p className="preserve-lines">{item.note}</p><button type="button" disabled={locked} onClick={()=>void run(()=>prepare(item.id))}>이 요청으로 수정 준비</button></li>)}</ul>:<p>이 결과에 수정 요청을 먼저 저장해 주세요.</p>}
  {review&&<>
   <h4>수정 제작기에 전달할 내용</h4><p>중{review.grade} · {review.unit} · {review.generationKind==='interactive_3d'?'3D':'2D'}</p>
   <p>기준 결과 <code>{review.revision.candidateHash.slice(0,12)}</code> · 콘텐츠 ID <code>{review.contentId}</code></p>
   <p className="preserve-lines">{review.requirements}</p>
   <details><summary>유지할 참고 자료 요약</summary>{review.sources.length?<ul>{review.sources.map((s,i)=><li key={i}><strong>{s.title||'참고 자료 '+(i+1)}</strong><p>{s.location}</p><p className="preserve-lines">{s.summary||'저장된 요약 없음'}</p></li>)}</ul>:<p>등록된 참고 자료가 없습니다.</p>}<p>출처 원문 대조 여부는 기존 기록을 따르며, 새 결과의 과학·학습 설계·실제 동작을 다시 검토합니다.</p></details>
   <p>내부 예산 한도: 월 {review.budget.monthlyLimitKrw.toLocaleString()}원·{review.budget.monthlyJobLimit}건, 이번 수정 작업 최대 {review.budget.jobLimitKrw.toLocaleString()}원. 검토와 작업 내 최대 {review.budget.maxRepairAttempts}회 수정을 포함합니다.</p>
   {expired?<p className="notice">확인 기한이 지났습니다. 수정 요청을 다시 준비해 주세요.</p>:review.state==='prepared'?<fieldset disabled={locked}>
    <legend className="sr-only">수정 입력과 비용 확인</legend>
    <label className="check-label"><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>기존 결과·자료 요약·수정 요청에 개인정보·비밀·비공개 원문이 없으며 AI 처리와 결과물 공개에 사용할 수 있음을 확인했습니다.</label>
    <label className="check-label"><input type="checkbox" checked={cost} onChange={e=>setCost(e.target.checked)}/>이번 수정은 별도 제작 1건이며 실패·중단 전까지 발생한 비용도 위 한도에 포함됨을 확인했습니다.</label>
    <button type="button" disabled={!rights||!cost} onClick={()=>void run(approve)}>수정 입력 확인 저장</button>
   </fieldset>:review.state==='consumed'&&review.jobId?<button type="button" disabled={locked} onClick={()=>void run(()=>onStarted(review.jobId!))}>접수한 수정 작업 보기</button>:<div><p className="notice" role="status">수정 입력 확인을 저장했습니다.{!realReady&&' 실제 실행기 연결 후 시작할 수 있습니다.'}</p>{realReady&&<button type="button" className="primary" disabled={locked} onClick={()=>void run(start)}>수정 제작 시작 · 최대 {review.budget.jobLimitKrw.toLocaleString()}원</button>}</div>}
  </>}
 </section>;
}
