'use client';
import {useState} from 'react';
import PublicationDispatch from './publication-dispatch';

type Receipt={id:string;approvedAt:string;invalidatedAt:string|null;effective:boolean};
type Review={id:string;proposalHash:string;candidateHash:string;artifactHash:string;title:string|null;current:boolean;approvalAllowed:boolean;approvalPaused:boolean;approval:Receipt|null;blockers:string[]};
type Props={jobId:string;disabled:boolean;dispatchReady:boolean;api:(path:string,body?:unknown)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<void>};

export default function PublicationApproval({jobId,disabled,dispatchReady,api,run}:Props){
 const [review,setReview]=useState<Review|null>(null),[loaded,setLoaded]=useState(false),[confirmed,setConfirmed]=useState(false);
 async function load(){
  try{const data=await api('jobs/'+jobId+'/publication-review');setReview(data.publicationReview);setLoaded(true);setConfirmed(false);}
  catch(error){if(error instanceof Error&&error.message==='NOT_FOUND'){setReview(null);setLoaded(true);setConfirmed(false);}else throw error;}
 }
 async function approve(){
  if(!review?.approvalAllowed||!confirmed)return;
  // Only version and idempotency IDs persist, never source text or credentials.
  const key='studio:approval:'+review.id;
  let requestId=sessionStorage.getItem(key);if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem(key,requestId);}
  await api('jobs/'+jobId+'/publication-approval',{reviewId:review.id,proposalHash:review.proposalHash,clientRequestId:requestId,confirmPublication:true});
  await load();sessionStorage.removeItem(key);
 }
 async function revoke(){if(!review?.approval)return;await api('publication-approvals/'+review.approval.id+'/revoke',{});await load();}
 return <section className="publication-approval" aria-label="공개 게시 승인">
  <h4>공개 게시 승인</h4>
  <p>최종 결과와 검토 기록을 확인한 뒤 해당 버전의 공개를 승인합니다. 이후 결과나 검토 내용이 바뀌면 새 승인이 필요합니다.</p>
  <button type="button" disabled={disabled} onClick={()=>void run(load)}>{loaded?'게시 승인 상태 새로고침':'게시 준비 상태 확인'}</button>
  {loaded&&!review&&<p role="status">출처 원문 대조와 배포 파일 검증을 마친 게시 준비 기록이 아직 없습니다.</p>}
  {review&&<>
   <p>{review.title} · 결과 버전 <code>{review.candidateHash.slice(0,12)}</code> · 배포 버전 <code>{review.artifactHash.slice(0,12)}</code></p>
   {!review.current&&<p className="notice" role="status">결과·검토 의견 또는 게시 기준이 바뀌어 이 준비 기록과 승인을 사용할 수 없습니다. 최신 결과의 게시 준비를 다시 확인해야 합니다.</p>}
   {review.approvalPaused&&<p className="notice">새 게시 승인은 일시 중지됐습니다. 기존 승인 확인과 철회는 가능합니다.</p>}
   {review.approval?<>
    <p role="status">{review.approval.invalidatedAt?'이 버전의 게시 승인을 철회했습니다.':review.approval.effective?'이 버전의 게시 승인이 저장됐습니다. 아직 게시 완료는 아닙니다.':'이전 승인 기록은 보존되며 현재 게시에는 사용할 수 없습니다.'}</p>
    <p className="muted">승인 저장: {new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(review.approval.approvedAt))}</p>
    {!review.approval.invalidatedAt&&<button type="button" disabled={disabled} onClick={()=>void run(revoke)}>이 버전의 게시 승인 철회</button>}
    <PublicationDispatch key={review.approval.id} approvalId={review.approval.id} effective={review.approval.effective} enabled={dispatchReady} disabled={disabled} api={api} run={run}/>
   </>:review.approvalAllowed?<fieldset disabled={disabled}>
    <legend className="sr-only">최종 버전 공개 승인</legend>
    <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 위 결과와 검토 기록을 확인했으며 이 버전의 공개 게시를 승인합니다.</label>
    <button type="button" disabled={!confirmed} onClick={()=>void run(approve)}>이 버전의 게시 승인 저장</button>
   </fieldset>:null}
  </>}
 </section>;
}
