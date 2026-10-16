export type SourcePreparationState={
 sourceReadiness?:{state:'ready'|'needs_evidence';missingSourceIds:string[];missingKinds:string[];changed:boolean};
 sourcePreparation?:{reviewScope:string;records:{sourceId:string;kind:string;locator:string;checkedScope:string;limitations:string[];reviewedAt:string;validUntil:string}[]}|null;
};
const labels:Record<string,string>={curriculum:'교육과정',textbook:'공개 교재',science:'과학 참고 자료'};
export function sourcePreparationBlocked(value:SourcePreparationState|null){return value?.sourceReadiness?.state==='needs_evidence';}
export default function SourcePreparation({value}: {value:SourcePreparationState}){
 if(!value.sourceReadiness)return null;
 const ready=value.sourceReadiness.state==='ready',packet=value.sourcePreparation;
 return <section aria-label="제작 전 자료 확인" className="source-preparation">
  <h4>제작 전 자료 확인</h4>
  <p className="notice">{ready?'입력한 요약과 일치하는 원문 확인 기록이 연결됐습니다.':'원문 확인 기록이 부족하거나 변경됐습니다. 유료 제작을 시작하지 않습니다.'}</p>
  <p className="muted">{packet?.reviewScope==='selected_textbook'?'선정 교과서의 기록된 범위':'일반 개념 중심 · 특정 학교 교과서 일치는 미확인'}입니다. 이 기록은 아래 범위에 한정되며, 제작 결과의 과학·학습·동작 검토와 게시 승인은 별도로 진행합니다.</p>
  {!!value.sourceReadiness.missingKinds.length&&<p>필요한 자료: {value.sourceReadiness.missingKinds.map(k=>labels[k]??k).join(', ')}</p>}
  {!!value.sourceReadiness.missingSourceIds.length&&<p>확인 기록이 필요한 자료: {value.sourceReadiness.missingSourceIds.map(id=>'참고 자료 '+id.replace('source-','')).join(', ')}</p>}
  {packet?.records.length?<details><summary>연결한 원문 확인 범위 {packet.records.length}개</summary><ul>{packet.records.map(r=><li key={r.sourceId}><strong>{labels[r.kind]??'참고 자료'} · {r.locator}</strong><p>{r.checkedScope}</p>{r.limitations.length>0&&<p>확인 범위의 한계: {r.limitations.join(' / ')}</p>}<p className="muted">확인일 {r.reviewedAt.slice(0,10)} · 유효기한 {r.validUntil.slice(0,10)} (UTC)</p></li>)}</ul></details>:null}
 </section>;
}
