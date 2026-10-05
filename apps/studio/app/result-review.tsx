'use client';
import {useRef,useState} from 'react';
import RevisionRequest from './revision-request';

type Version={stateVersion:number;sourceHash:string;candidateHash:string|null;evidenceHash:string};
type ModelReport={status:string;findings?:string[];blockingIssues:string[];plan?:string;checks?:Record<string,string>};
type Result={jobId:string;state:string;reason:string|null;version:Version;revision:null|{parentJobId:string;candidateHash:string};input:{generationKind:string;grade:number;unit:string;sources:{id:string;title:string;kind:string;verification:string}[]};
 candidate:null|{contentId:string;title:string;summary:string;assumptions:string[];entry:string;files:{path:string;hash:string;bytes:number}[]};
 initialReviews:(ModelReport&{role:string;sequence:number})[];attempts:{attempt:number;candidateHash:string;runtime:null|{checksHash:string;checks:Record<string,string>;checksExecuted:string[];issues:string[];details:{browserVersion:string|null;browserStopped:boolean;observations:{width:number;webglUnavailable?:boolean}[]}};review:ModelReport|null}[];
 budget:{state:string;calls:number;spentUsdMicros:number;heldUsdMicros:number};feedbackAllowed:boolean;publication:{eligible:boolean;blockers:string[]};
 feedback:{id:string;decision:string;note:string;candidate_hash:string|null;created_at:string}[]};
type Props={jobId:string;disabled:boolean;revisionReady:boolean;realReady:boolean;onStarted:(jobId:string)=>Promise<void>;onError:(error:unknown)=>void;api:(path:string,body?:unknown)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<void>};
const status:Record<string,string>={pass:'통과',fail:'실패',needs_evidence:'근거 필요',not_run:'미실행',invalid:'기록 해석 불가'};
const role:Record<string,string>={curriculum:'교육과정 검토',subject:'과학·교과 검토',design:'학습 설계'};
const dimension:Record<string,string>={science:'과학 정확성',learning:'학습 설계',curriculum:'교육과정',textbook:'교과서',runtime:'실제 동작',contract:'파일·입력 규격'};
const blockers:Record<string,string>={SOURCE_ORIGINALS_NOT_ATTESTED:'출처 원문 대조 기록이 아직 연결되지 않았습니다.',DEPLOY_ARTIFACT_NOT_PREPARED:'게시할 배포 파일과 버전 검증이 아직 준비되지 않았습니다.',RELEASE_APPROVAL_NOT_RECORDED:'해당 배포 버전의 게시 승인이 없습니다.',CURRICULUM_CONTEXT_MISSING:'적용 교육과정 기준이 미확인입니다.',RESULT_NOT_READY:'현재 작업이 최종 결과 검토 단계에 도달하지 않았습니다.',CANDIDATE_NOT_AVAILABLE:'아직 생성된 결과 파일이 없습니다.'};
const reasons:Record<string,string>={CURRICULUM_EVIDENCE_REQUIRED:'교육과정 근거가 필요해 제작을 보류했습니다.',SUBJECT_EVIDENCE_REQUIRED:'과학·교과 근거가 필요해 제작을 보류했습니다.',DESIGN_REVIEW_REQUIRED:'학습 설계를 보완해야 합니다.',REPAIR_LIMIT_REACHED:'수정 횟수 한도에 도달했습니다.',RUNTIME_NOT_VERIFIED:'실행 검사를 완료하지 못했습니다.',REVIEW_EVIDENCE_REQUIRED:'독립 검토에 필요한 근거가 부족합니다.',COST_UNCERTAIN:'확정되지 않은 비용이 있어 예약을 유지하고 있습니다.',JOB_CANCELLED:'작업이 중단됐습니다.'};
function Opinion({report}:{report:ModelReport}){return <><p>AI 검토 의견: <strong>{status[report.status]||'확인 필요'}</strong></p>{report.plan&&<p className="preserve-lines">{report.plan}</p>}{report.findings?.length?<ul>{report.findings.map((item,i)=><li key={i}>{item}</li>)}</ul>:null}{report.blockingIssues.length>0&&<div className="notice"><strong>보완할 부분</strong><ul>{report.blockingIssues.map((item,i)=><li key={i}>{item}</li>)}</ul></div>}</>;}

export default function ResultReview({jobId,disabled,revisionReady,realReady,onStarted,onError,api,run}:Props){
 const [result,setResult]=useState<Result|null>(null),[filePath,setFilePath]=useState(''),[file,setFile]=useState<{path:string;content:string}|null>(null);
 const [note,setNote]=useState(''),[decision,setDecision]=useState('request_changes'),[saved,setSaved]=useState(false);
 const current=useRef(jobId);current.current=jobId;
 async function load(){const data=await api('jobs/'+jobId+'/result');if(current.current!==jobId)return;setResult(data.result);setFile(null);setFilePath(data.result.candidate?.entry||'');if(!data.result.candidate)setDecision('note');}
 async function showFile(){if(!result||!filePath)return;const data=await api('jobs/'+jobId+'/result-file',{version:result.version,path:filePath});setFile(data.file);}
 async function save(){
  if(!result||!note.trim())return;
  const signature=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({version:result.version,decision,note:note.trim()})))),b=>b.toString(16).padStart(2,'0')).join('');
  const key='studio:feedback:'+jobId;let pending:{signature:string;id:string}|null=null;try{pending=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
  if(pending?.signature!==signature)pending={signature,id:crypto.randomUUID()};sessionStorage.setItem(key,JSON.stringify(pending));
  await api('jobs/'+jobId+'/feedback',{version:result.version,decision,note:note.trim(),clientRequestId:pending.id});
  sessionStorage.removeItem(key);setNote('');setSaved(true);await load();
 }
 return <section className="result-review" aria-label="제작 결과와 검토">
  <h3>제작 결과와 검토</h3><button type="button" disabled={disabled} onClick={()=>void run(load)}>{result?'검토 기록 새로고침':'결과·검토 보기'}</button>
  {result&&<>
   {result.revision&&<p>수정 기준 결과 <code>{result.revision.candidateHash.slice(0,12)}</code> <button type="button" disabled={disabled} onClick={()=>void run(()=>onStarted(result.revision!.parentJobId))}>수정 전 작업 보기</button></p>}
   {result.reason&&<p className="notice">{reasons[result.reason]||'작업이 완료되지 않았습니다. 아래 기록을 확인하세요.'}</p>}
   {result.candidate?<><h4>{result.candidate.title}</h4><p>{result.candidate.summary}</p><p>결과 버전 <code>{result.version.candidateHash?.slice(0,12)}</code> · {result.input.generationKind==='interactive_3d'?'3D':'2D'}</p><h4>모형의 가정과 한계</h4><ul>{result.candidate.assumptions.map((item,i)=><li key={i}>{item}</li>)}</ul></>:<p>생성된 결과 파일이 없습니다. 보류 사유와 먼저 필요한 자료를 확인하세요.</p>}
   <p className="muted">AI 검토 의견과 별도 실행 검사 결과를 구분합니다. 모델의 통과 의견만으로 출처 대조나 게시 승인이 완료되지 않습니다.</p>
   {result.initialReviews.map(report=><details key={report.sequence}><summary>{role[report.role]} · {status[report.status]||'확인 필요'}</summary><Opinion report={report}/></details>)}
   {result.attempts.map(attempt=><details key={attempt.attempt} open={attempt.attempt===result.attempts.length-1}><summary>{attempt.attempt===0?'최초 결과':`수정 ${attempt.attempt}회 결과`} · {attempt.candidateHash.slice(0,12)}</summary>
    <h4>별도 실행 검사</h4>{attempt.runtime?<><table><caption className="sr-only">{attempt.attempt+1}번째 결과의 실행 검사</caption><thead><tr><th scope="col">검사</th><th scope="col">결과</th></tr></thead><tbody>{Object.entries(attempt.runtime.checks).map(([key,value])=><tr key={key}><th scope="row">{dimension[key]}</th><td>{status[value]}</td></tr>)}</tbody></table>
    <p className="muted">브라우저 {attempt.runtime.details.browserVersion||'미확인'} · 종료 {attempt.runtime.details.browserStopped?'확인':'미확인'} · 검사 화면 {Array.from(new Set(attempt.runtime.details.observations.map(o=>o.width))).join(' / ')||'없음'}px</p>{attempt.runtime.issues.length>0&&<ul>{attempt.runtime.issues.map((issue,i)=><li key={i}>{issue==='RESET_FAILED'?'초기화 동작 실패':issue}</li>)}</ul>}</>:<p>실행 검사 기록이 없습니다.</p>}
    <h4>독립 검토</h4>{attempt.review?<><Opinion report={attempt.review}/><ul>{Object.entries(attempt.review.checks||{}).map(([key,value])=><li key={key}>{dimension[key]} · AI 의견 {status[value]}</li>)}</ul></>:<p>독립 검토 기록이 없습니다.</p>}
   </details>)}
   <details><summary>공개 전 확인할 항목</summary><ul>{result.publication.blockers.map(code=><li key={code}>{blockers[code]||'추가 확인이 필요합니다.'}</li>)}</ul><p>이 화면의 메모와 수정 요청은 게시 승인이 아닙니다.</p></details>
   <p className="muted">기록된 API 사용액 ${(result.budget.spentUsdMicros/1000000).toFixed(6)} · {result.budget.calls}회 호출{result.budget.heldUsdMicros>0?` · 미확정 예약 $${(result.budget.heldUsdMicros/1000000).toFixed(6)}`:''}. 환율·세금이 포함된 실제 청구와 다를 수 있습니다.</p>
   {result.candidate&&<details><summary>결과 파일 확인</summary><p>코드를 텍스트로 확인합니다. 조작 가능한 미리보기는 별도 연결이 필요합니다.</p><label>결과 파일<select value={filePath} onChange={e=>{setFilePath(e.target.value);setFile(null);}} disabled={disabled}>{result.candidate.files.map(f=><option key={f.path} value={f.path}>{f.path} · {f.bytes.toLocaleString()} bytes</option>)}</select></label><button type="button" disabled={disabled} onClick={()=>void run(showFile)}>코드 텍스트 보기</button>{file&&<pre className="candidate-source" tabIndex={0} aria-label={file.path+' 코드'}>{file.content}</pre>}</details>}
   <h4>이 결과에 남길 의견</h4><p>수정 요청을 저장해도 새 AI 호출이나 게시를 바로 실행하지 않습니다.</p>
   <fieldset disabled={disabled||!result.feedbackAllowed}><legend className="sr-only">결과 검토 의견 작성</legend><label>의견 종류<select value={decision} onChange={e=>setDecision(e.target.value)}><option value="request_changes" disabled={!result.candidate}>수정 요청</option><option value="note">검토 메모</option></select></label><label>수정할 내용 또는 검토 메모<textarea rows={4} maxLength={2000} value={note} onChange={e=>{setNote(e.target.value);setSaved(false);}} placeholder="변경할 동작, 표현, 모형의 한계를 구체적으로 적어 주세요. 개인정보·비밀값은 넣지 마세요."/></label><button type="button" disabled={!note.trim()} onClick={()=>void run(save)}>이 버전에 의견 저장</button></fieldset>
   {!result.feedbackAllowed&&<p>작업이 진행 중입니다. 종료된 결과에 의견을 남길 수 있습니다.</p>}{saved&&<p className="notice" role="status">이 결과 버전에 의견을 저장했습니다.</p>}
   {result.feedback.length>0&&<ol className="result-feedback">{result.feedback.map(item=><li key={item.id}><strong>{item.decision==='request_changes'?'수정 요청':'검토 메모'}</strong><p className="preserve-lines">{item.note}</p><small>{item.candidate_hash?'결과 '+item.candidate_hash.slice(0,12):'결과 파일 생성 전'}</small></li>)}</ol>}
   {revisionReady&&result.candidate&&result.feedbackAllowed&&<RevisionRequest jobId={jobId} version={result.version} feedback={result.feedback.filter(f=>f.decision==='request_changes'&&f.candidate_hash===result.version.candidateHash)} disabled={disabled} realReady={realReady} onStarted={onStarted} onError={onError} api={api} run={run}/>}
  </>}
 </section>;
}
