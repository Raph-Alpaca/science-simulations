'use client';
import {useEffect,useRef,useState} from 'react';
type ImageInfo={width:number;height:number;hash:string};
type Version={stateVersion:number;sourceHash:string;candidateHash:string|null;evidenceHash:string};
type Props={jobId:string;version:Version;attempt:number;candidateHash:string;images:ImageInfo[];disabled:boolean;api:(path:string,body?:unknown)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<void>};
export default function ResultScreenshots({jobId,version,attempt,candidateHash,images,disabled,api,run}:Props){
 const [image,setImage]=useState<(ImageInfo&{bytesBase64:string})|null>(null);
 const mounted=useRef(true),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function load(info:ImageInfo){
  const data=await api('jobs/'+jobId+'/result-screenshot',{version,attempt,width:info.width,hash:info.hash});
  if(!mounted.current)return;
  const next=data.screenshot;
  if(next?.candidateHash!==candidateHash||next.attempt!==attempt||next.hash!==info.hash||next.width!==info.width||next.height!==900||next.mimeType!=='image/jpeg'||typeof next.bytesBase64!=='string'||next.bytesBase64.length>262144||!/^[A-Za-z0-9+/]+={0,2}$/.test(next.bytesBase64))throw Error('RESULT_RECORD_INVALID');
  setImage(next);
 }
 const resultLabel=attempt===0?'최초 결과':`수정 ${attempt}회 결과`;
 const label=image?`${image.width===390?'좁은':'넓은'} 화면에서 촬영한 ${resultLabel}의 초기 화면`:'';
 return <section className="result-screenshots" aria-label={resultLabel+' · 검사에서 촬영한 화면'}>
  <h4>검사에서 촬영한 화면</h4>
  <p className="muted">처음 열었을 때의 화면 기록입니다. 이 그림에서는 시뮬레이션을 조작할 수 없습니다.</p>
  {images.length?<div className="screenshot-options" role="group" aria-label="촬영 화면 크기">{images.map(info=><button type="button" key={info.width} disabled={disabled} aria-pressed={image?.hash===info.hash} onClick={()=>void run(()=>load(info))}>{info.width===390?'좁은 화면':'넓은 화면'} <span>{info.width}px</span></button>)}</div>:<p className="muted">저장된 화면 기록이 없습니다. 이전 검사이거나 화면을 저장하지 못한 경우입니다.</p>}
  {image&&<figure>
   {/* Fixed JPEG bytes only; candidate scripts/markup never enter this origin. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img src={'data:image/jpeg;base64,'+image.bytesBase64} alt={label} width={image.width} height={image.height}/>
   <figcaption>{label}</figcaption>
   <button type="button" onClick={()=>dialog.current?.showModal()}>화면 크게 보기</button>
   <dialog ref={dialog} className="screenshot-dialog" aria-label={label}>
    <div className="screenshot-dialog-heading"><p>{label}</p><button type="button" autoFocus onClick={()=>dialog.current?.close()}>닫기</button></div>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={'data:image/jpeg;base64,'+image.bytesBase64} alt={label} width={image.width} height={image.height}/>
   </dialog>
  </figure>}
 </section>;
}
