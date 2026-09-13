// Synthetic UI fixtures only. Never imported by the production build.
export const config = {
  schemaVersion:1, basePath:'/science-simulations/',
  grades:[{value:1,label:'중1'},{value:2,label:'중2'},{value:3,label:'중3'}],
  units:[{grade:1,label:'검사용 단원 A'},{grade:2,label:'검사용 단원 B'},{grade:3,label:'검사용 단원 C'}]
};
export const sources = [{id:'fixture-source'}];
export function metadata(id='fixture-light', changes={}) {
  return { schemaVersion:1,id,title:'빛과 그림자 · 검사 전용',grade:1,unit:'검사용 단원 A',summary:'검색과 카드 표시를 확인하는 합성 데이터입니다.',concepts:['빛','관찰'],schoolYear:null,curriculumRevision:null,entry:'index.html',sourceIds:['fixture-source'],stage:'draft',assumptions:['교육용 모형이 아닌 UI 검사 데이터'],approvalIsExternal:true,...changes };
}
export const samples = [
  metadata(),
  metadata('fixture-temperature',{title:'온도 변화 · 검사 전용',grade:2,unit:'검사용 단원 B',concepts:['온도','측정']}),
  metadata('fixture-inheritance',{title:'유전 관계 · 검사 전용',grade:3,unit:'검사용 단원 C',concepts:['유전','관찰']})
];
