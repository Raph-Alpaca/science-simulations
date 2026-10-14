'use client';
import {useState} from 'react';

type Dispatch={id:string;state:string;run_id:number|null;publication?:{state:string;publicUrl:string|null}};
type Props={approvalId:string;effective:boolean;enabled:boolean;disabled:boolean;api:(path:string,body?:unknown)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<void>};
const labels:Record<string,string>={
 ready:'게시 검사 요청을 저장했습니다. 아직 실행을 보내지 않았습니다.',
 claimed:'게시 검사 요청의 접수 여부를 확인해야 합니다. 같은 요청을 다시 보내지 않고 기다립니다.',
 submitted:'게시 검사 실행이 접수됐습니다. 아직 게시 완료는 아닙니다.',
 uncertain:'게시 검사 요청의 응답을 확인하지 못했습니다. 같은 요청을 다시 보내지 않고 접수 여부를 확인해야 합니다.',
 failed:'게시 검사 연결 확인에 실패해 실행 요청을 보내지 않았습니다.',
 cancelled:'승인 상태가 바뀌어 게시 검사 요청을 취소했습니다.',
};
const publicationLabels:Record<string,string>={checking:'게시 파일 검사를 진행 중입니다.',check_failed:'게시 파일 검사를 통과하지 못해 공개 전송을 시작하지 않았습니다.',transferring:'공개 전송을 준비하거나 진행 중입니다. 실제 게시 확인을 기다립니다.',unconfirmed:'게시 결과가 불확실해 새 전송을 보류했습니다. 기존 실행의 실제 게시 상태를 확인해야 합니다.',published:'승인한 파일의 실제 게시를 확인했습니다.'};

export default function PublicationDispatch({approvalId,effective,enabled,disabled,api,run}:Props){
 const [dispatch,setDispatch]=useState<Dispatch|null>(null),[loaded,setLoaded]=useState(false),[unknown,setUnknown]=useState(false);
 const path='publication-approvals/'+approvalId+'/dispatch';
 async function load(){
  try{const data=await api(path);setDispatch(data.dispatch);setLoaded(true);setUnknown(false);}
  catch(error){setUnknown(true);throw error;}
 }
 async function start(){
  if(!enabled||!effective||!loaded||unknown||(dispatch&&dispatch.state!=='ready'))return;
  const key='studio:publication:'+approvalId;
  let clientRequestId=sessionStorage.getItem(key);if(!clientRequestId){clientRequestId=crypto.randomUUID();sessionStorage.setItem(key,clientRequestId);}
  try{const data=await api(path,{clientRequestId});setDispatch(data.dispatch);setUnknown(false);sessionStorage.removeItem(key);}
  catch(error){setUnknown(true);throw error;}
 }
 return <section aria-label="승인한 버전의 게시 요청">
  <h5>게시 요청 상태</h5>
  <button type="button" disabled={disabled} onClick={()=>void run(load)}>{loaded?'게시 요청 상태 새로고침':'게시 요청 상태 확인'}</button>
  {!enabled&&<p>새 게시 요청은 아직 준비되지 않았거나 일시 중지됐습니다. 기존 요청 상태는 확인할 수 있습니다.</p>}
  {unknown&&<p role="status">접수 여부를 확인하지 못했습니다. 상태를 새로고침한 뒤 이어서 진행하세요.</p>}
  {dispatch&&<><p role="status">{publicationLabels[dispatch.publication?.state||'']||labels[dispatch.state]||'게시 요청 기록을 확인해야 합니다.'}</p>{dispatch.run_id&&<p className="muted">검사 실행번호: {dispatch.run_id}</p>}</>}
  {loaded&&!dispatch&&!unknown&&<p>이 승인으로 접수한 게시 요청은 없습니다.</p>}
  {loaded&&!unknown&&enabled&&effective&&(!dispatch||dispatch.state==='ready')&&<button type="button" disabled={disabled} onClick={()=>void run(start)}>승인한 버전의 게시 검사 요청</button>}
 </section>;
}
