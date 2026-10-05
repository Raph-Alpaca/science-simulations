# 재개 인계 — 과학 시뮬레이션 제작실

이 문서는 다음 작업자가 그대로 이어갈 수 있도록 유지한다. 마지막 실제 검증은 STATUS 맨 위와 비공개 `.local/evidence`를 함께 확인한다. 키·암호는 이 문서에 쓰지 않는다.

## 현재 지점 — 2026-10-05 재개 후

**최신 14:36 KST:** 사용자 승인한 진단7개를 새 PR #2로 공개·병합했다. branch codex/studio-rehearsal-diagnostics, HEAD `ae2231f40f1e331eeab2f625180b1da8d977d808`, origin/main과Production은 `c5f781a00eae78f9da14cff6c95eac750917ba42` / `dpl_CosqyoN7AHDvErGSXSHLaZMTKEiK` READY. HEAD와 main 파일 트리는 같다. 홈200·session401·worker POST503/WORKER_SETUP_REQUIRED 확인. 앞선 진단7개 공개/병합 승인은 해결됐으므로 다시 묻지 않는다.

추가 승인1회 run37268245456은 failure 종료. 기록은 isolation / CONTAINER_COMMAND_FAILED / execute / cleanup confirmed다. 컨테이너 생성·설정 확인은 지났고 격리 확인용 프로세스가 실패했으며 삭제는 확인됐다. 2D/3D는 미실행, 생성/검토 job은 skipped. 기존 run37267554755와 별도로 `.local/studio-worker-review-20261005/rehearsal-37268245456.{json,log}` 보존. 원격 검사는 총2회이며 다음1회는 미승인 상태다.

새 로컬 보완5개: Dockerfile의 허용 소스 COPY --chmod=0555 및 USER pwuser 이후 node --check3개, 컨테이너 README와 진행 문서3개. 호스트 빌드문맥의0700 하위 폴더가 기본 root 소유로 이미지에 복사되는 접근 문제를 다룬다. 공식 Docker COPY 메타데이터 문서와 코드로 발견했지만 실제 실패의 OS 원인은 아직 추정이다. 로컬9/9 PASS(654ms), 실제 수정 이미지 빌드/검사는 미실행이다. 전체5개를 새 검토 목록/해시로 고정한 뒤 공개/병합·추가 검사1회 승인 응답을 확인한다. 검사를 자동 재시도하거나 sandbox/권한 제한을 풀지 않는다. 사용량78% 남음. 아래 이전 승인 대기는 모두 이력이다.

**최신 14:28 KST:** 사용자 명시 승인 후 PR #1 병합 완료. main/Production은 `8d9a87657a0341d478bf6706e404657e31ee9e28`, Vercel `dpl_GjajT37AeTqm2gaDBWQ1BHuLyJNm` READY다. 홈200·미로그인 session401·worker POST503/WORKER_SETUP_REQUIRED 확인. 실제 로그인 후 UI는 미검증, runtime 로그 도구는403이다. 앞선 병합 승인 질문/거부는 해결됐으므로 다시 묻지 않는다.

승인된 원격 rehearsal1회 `37267554755`를 실행했고 이미지 빌드는 성공, 격리/2D/3D 검사 단계는 일반 오류만 남기고 failure 종료했다. 2D 성공 로그가 없어 probe와 첫2D 내부 중 정확한 실패 위치는 미확정이다. 전체 로그/상태를 `.local/studio-worker-review-20261005/rehearsal-37267554755.{log,json}`에 저장했다. 원격 재실행·DB 변경·유료 AI·학생용 게시0회, 감시 프로세스는 exit1로 종료했다.

새 로컬 변경은 runtime-container/rehearsal의 안전한 오류 단계·정리 상태 기록, 관련 검사2개, STATUS/RESUME_HANDOFF/WORKER_ROLLOUT 총7개다. 9/9 로컬 검사 PASS(모의 Docker)이며 실제 격리 원인을 해결한 결과는 아니다. 다음 공개/병합·추가 검사1회는 새 범위로 확인한다. 로컬 HEAD94a3bca와 origin/main8d9a876은 파일 트리가 동일하므로 미커밋7개를 보존해 새 codex/ 브랜치를 origin/main에서 준비할 수 있다. 무조건 reset/checkout하지 않는다. 사용량은82% 남았으며20% 보호 규칙 유지. 아래14:17 이전 내용은 이력이다.

**최신 14:17 KST:** 사용자는 다음 단계 진행을 요청했고, 과제는 설치 없는 기존 제작실 웹앱에서 입력한다고 안내했다. PR #1은 OPEN / ready for review / CLEAN이며 head는 `94a3bca07f708544650ec8ab20c0639b51e5241c`다. draft 해제만 성공했다. main 병합은 자동 승인 검토에서 “이전 승인에서 제외했고 운영 배포를 유발하므로 다음 단계 요청만으로 불충분”하다는 사유로 거부됐다. **PR 병합·기존 제작실 갱신·키 없는 Linux rehearsal 1회**의 구체적 승인 질문이 대기 중이다. 새 응답을 확인하고, 승인 전 병합을 우회하지 않는다. 과거 153개 공개 업로드 승인을 다시 묻지 않는다.

Vercel 실제 조회: 기존 6개 변수 이름만 Production 범위, 새 기능 활성화 변수 없음. Production은4931c7e / `dpl_FKPC9E44CpVJmJNJB7wWEsBFtg4F` / READY다. 익명 GET은 홈200·session API401·아직 없는 worker GET404다. Supabase READ ONLY 메타데이터: capability2·삭제 gate=false·8개 테이블 RLS=true·baseline/v2 migration2개·새 실행기 함수 없음. 로그인 후 새 UI·실제 Actions/Linux는 미검증. 운영 변경/유료 호출/검사 서버 기동 없음. 상세는 STATUS 맨 위를 따른다. 아래 draft 생성 직후의 문단은 이전 상태다.

**최신 원격 상태**: 사용자가 검토한153개 공개 업로드·draft PR을 승인했다. `94a3bca07f708544650ec8ab20c0639b51e5241c`를codex/studio-v2-budget에push하고 [draft PR #1](https://github.com/Raph-Alpaca/science-simulations/pull/1)을생성·첨부했다. main은4931c7e그대로다. 기존40개스테이징은`.local/studio-worker-review-20261005/original-staged-40.patch`로보존하고최신153개를커밋했다. 아래“40개스테이징유지/공개승인대기”는이전상태다. 이문서와STATUS의업로드후기록은로컬미커밋이며승인된153개코드버전과분리한다. **병합·운영SQL·유료AI·학생용게시 권한은 이번 승인에서 제외**됐다.

후속 수정 연결의 로컬 구현과 검증을 완료했다. 동일 콘텐츠ID·정확한 부모 후보·누적 과제·새 동의/예산·계보/중복접수 방지·후속 결과 조회를 연결했고 운영 적용은 하지 않았다. [최신 구현](FOLLOWUP_REVISION.md), STATUS 맨 위를 따른다. 아래141/17/21개 수치는 이전 단계 이력이며 최신은 **제작실151개·Chrome19개 통과 증거·실제PG17 경쟁29개**다. Chrome은 최초17/19 뒤 선택자 오류를 수정하여 새2/2를 재실행했으며 한 번의 전체19/19 실행은 아니다.

현재 검사 프로세스와 임시 DB/서버는 종료됐다. 포트3000/3001/4177/55443 수신0·postgres프로세스0을 정상 사용자 권한으로 확인했다. 운영 SQL/앱/키 변경·유료 AI0회. 재개 시 남은 사용량100%, 최신도구확인은88%(사용12%)로 사용량 중단 문턱에 도달하지 않았다. 초기화권을 사용하지 않았다. 현재인계이유는draft PR다음의병합/운영권한·자격증명준비경계다.

Vercel/GitHub의PR상태검사2개SUCCESS, Preview배포6851730555가정확한94a3bca커밋으로성공했다. URL은https://science-simulations-studio-btdszn6fq-alpaca-t.vercel.app/ 이며익명GET1회는HTTP302리다이렉트였다. 로그인후UI동작은미검증이다. Production은4931c7e그대로다. PR상태확인을빌드외기능검사/실제AI/게시성공으로확대하지않는다.

## 사용자 목표와 사용량 중단 조건

현재 단계 체크포인트는 `.local/studio-worker-review-20261005/premerge-checkpoint.json`에 있다. 최신 사용량은 남음84%(사용16%)이고 초기화권은 사용하지 않았다. 지금 대기는 사용량 문턱 때문이 아니라 위 병합 승인 경계다.

- 목표: 과제 입력 → 구체적인2D/3D 과학 시뮬레이션 제작 → 독립 검토 → 필요한 수정 → 승인/게시 → 실제 게시 확인. 로컬 합성 통과만으로 전체 목표 완료가 아니다.
- API 예산: 월10,000원·월약10건, 동시1·건당1,000원에 검토/작업 내 최대2회 보완 포함. 후속 수정은 별도1건으로 같은 월 한도에 포함한다.
- 최신 사용자 지시: **남은 약20%를 보존**한다. 남은 약25%부터 큰 새 단계를 시작하지 않고 진행 중 검사 종료·인계 정리를 하여20% 전에 멈춘다. 이전15% 지시는 역사적 기록이다.
- 재개와 큰 단계마다 get_usage_limits로 실제 사용량을 확인한다. 여러 관련 한도가 있으면 가장 적게 남은 한도를 고려한다. 초기화권을 임의 사용하거나 예산 소진을 완료로 처리하지 않는다.
- 이전21% 중단과 자동 goal 반복 뒤 blocked 처리는 당시의 중단 이력이다. 사용자는 이번 작업을 명시적으로 재개했다. goal 도구로 임의 재개/일시정지하거나 전체 목표 완료를 선언하지 않는다.

## 저장소와 변경 보존

작업 경로 `C:\Users\user\Desktop\science-simulations`, PowerShell. branch `codex/studio-v2-budget`, 마지막 확인 HEAD/origin main `4931c7e0445b2d227bac9c6ecfa29fcff62b5607`. 다시 Git 상태를 확인한다.

기존40개 스테이징(2261추가/44삭제)은 `.local/studio-worker-review-20261005/original-staged-40.patch`로보존했다. 승인한153개전체해시명세는같은폴더의manifest.json,사용자용목록은review.md다. 전체명세SHA256 `a5c11dd1d7b1cbf883b090fe14a0fd8d0076c260b569ee40aafba8935ea7cc03`. 153개를정확히스테이징/검증/커밋/push했고추가문서만미커밋이다. 무조건gitadd/reset/checkout으로미커밋상태를덮지않는다.

이전 자동 승인 검토의40개공개거부는새153개에대한명시적사용자승인으로해결했고해당작업만수행했다. 같은업로드승인을다시묻지않는다. API키준비응답은계속대기이며비밀값을채팅에받지않는다. DB비밀번호준비/갱신/접속은완료했으므로다시요구하지않는다. 다음main병합/운영활성화는현재승인범위밖이다.

## 완료된 실제 운영 작업

2026-10-04 운영 studio schema 백업→새 로컬PG17 복원과 데이터/권한/해시 검사 완료. 운영 v2 대화 관리 증분 SQL 적용 완료. 이후 worker/budget/dispatch/result 제안은 **운영 미적용**이다. 공개 자료실은 빈 목록, 운영 제작실은 기존 모의 앱이다. 운영 키/환경/원격 Git을 이번 구현에서 변경하지 않았다.

## 로컬에서 구현한 연결

1. 비용: 기본 비활성 SQL 원자 예약·정산·불확실 비용/전역슬롯 유지,5개 분리 모델 컨텍스트·최대9호출/20분·수정2회. 기본closed.
2. worker: 정확한 입력 승인/작업/실행번호/후보/검사 버전 결합, 서비스전용 DB, GitHub OIDC 서명/한도/jti 재사용 차단, 별도 보고자.
3. 실행 검사: 허용된 후보 파일만, 실제 로컬 Chrome2D/3D·카메라·대체표현·실패 감지. 원격은 고정 Docker 이미지/격리 검사 코드와 암호화 후보 전달 구현. 로컬 Docker가 없어 실제 Linux container/Actions/OIDC는 아직 미검증.
4. 입력:2D/3D 상세 과제·공개 링크/직접 작성 요약·내용 미리보기·사용 범위/비용 동의. 원문 대조는 미확인. 상태/동의는 정확한 입력 해시로 결합.
5. 접수: 고정 GitHub App 대상/권한/main SHA 확인, UUID만dispatch, 반환 run 재조회·DB결합. 영구 claim으로 재전송 방지, 취소 우선, 미확정 예약 유지. UI 시작/조회/중단, 실제 작업에서 모의 명령 거부.
6. 결과: 원본 증거/후보/실행/검토의 해시와순서 재검증, 실패 수정 이력 포함 결과 화면, 생성코드텍스트보기(실행하지 않음), 버전결합 메모/수정요청·중복저장방지. 의견 저장만으로 게시승인이나 새 유료 실행이 되지 않는다. 후속 수정은 다음 항목의 별도 동의를 거친다.
7. 교육과정 기준: 새 입력은 내부2022 개정 선택+unverified, 학년도 입력 없음. 새 게시 승인v2 형식은 모든 참고 자료의 실제 원문 검토 기록/권리/정확한 후보·입력·학년·단원·revision과educationHash를 요구한다. 실제 원문 검토 저장소/발급자는 아직 없고 생산 승인 차단은 유지된다. 기존v1과 과거 입력/콘텐츠는 보존한다.

8. 후속 수정: 원래 과제/후보 보존, 의견 버전 결합, 작은 승인 입력과 별도 기준 후보 전달, head의 원자 전진, 후보 없는 종료 뒤 명시적 재시도, 새5역할/실행 검사. 화면/API/SQL 제안까지 로컬 구현했다. 상세 FOLLOWUP_REVISION.md.

상세: BOUNDED_RUNNER.md, WORKER_STORE.md, WORKER_AUTH.md, WORKER_RUNTIME.md, REMOTE_WORKER.md, WORKER_WORKFLOWS.md, INPUT_REVIEW.md, DISPATCH.md, RESULT_REVIEW.md, EDUCATION_EVIDENCE.md.

## 남은 실제 목표

- 실제 모델 키/GitHub App/배포 승인 응답 이후, 검토한 변경을 PR로 올리고 운영 전 제안SQL을 검토·새migration생성·백업/적용/검증한다. 아직 새proposal을migration으로 임의복사하지 않는다.
- 키 없는 실제GitHub/Linux container rehearsal 통과, 실제Actions OIDC와고정SHA검증, 제한된 첫 유료제작. 단계별 증거 확인 없이 기능플래그를 켜지 않는다.
- 교육과정/교과서 맥락과 권위 있는 원문 접근·검증 증거 연결. 사용자는 학년도 입력을 제거하도록 확정했고 v2 요청은 schoolYear를 허용하지 않는다. 학년도 입력을 다시 만들지 않는다. 내부2022 개정 설정은 원문 확인과 별개다. 게시 형식v2에서 연도 없이 정확한 원문 검토 묶음을 요구하도록 했지만 신뢰 저장소/발급자와의 연결은 남았다. 임의 연도를 채우거나 형식 검사기를 실제 검증 권한으로 취급하지 않는다. 현재교사요약/AI의pass만으로 원문검토완료가 아니다.
- 후속 수정의 로컬 비용/동의/취소/버전/중복방지는 구현했다. 실제 Actions/OIDC/모델에서 같은 원본 전달과 결과 왕복을 검증해야 한다.
- 후보를 관리origin에서 실행하지 않는 조작가능미리보기, 정확한배포artifact준비/해시·사람의게시승인·PR/병합·같은artifact배포·실제URL/버전/조작 확인을 구현/검증한다.
- 실제 운영복구/보존·정리정책, 향후음성입력 등 명세의미완료범위를 별도기록한다. 모두완료됐다고추정하지 않는다.

## 작업 재개 순서

1. 사용량→AGENTS/README/OWNER_INPUT/SYSTEM_SPEC/STATUS→실제Git 상태를 읽는다. 미완료 프로세스는 도구의실제handle/서버상태로확인하고 시간초과만으로새작업을중복실행하지 않는다.
2. 이 문서 하단/STATUS 최신검사와 비공개증거에서현재단계의완료/실패를확인한다. 미완료 검사를 먼저끝내고서버를종료한다.
3. 사용자승인/API키응답을확인하되없으면질문을반복하지말고독립적으로가능한로컬연결을진행한다. 하위에이전트는명시요청없이는사용하지않는다.
4. 다음구현후필요한검사만수행하고사실대로STATUS/이문서를갱신한다. 남은 사용량25%안팎이면새단계를시작하지않고20%를보존한다.

## 최신 완료 지점

결과 검토: 전체 제작실141/141, 추가 상한 검사를 포함한 결과5/5, build/TypeScript, Chrome 전체17/17 및 정상 teardown, 새 PostgreSQL17 물리 경쟁21개 및 정상 종료가 통과했다. 마지막 상세 경로는 RESULT_REVIEW/STATUS를 참고한다. 모델/원격 검사 보고는 합성 값이다. 진행 중 검사 세션은 모두 종료됐다. 다음 단계 착수 전 새 사용자 답변과 사용량부터 확인한다.

그 뒤 교육과정 기준/게시v2 형식을 추가하고 자료실30/30, 제작실141/141, 컨테이너 복사본 import 검사4/4, build/TypeScript·자료실typecheck/validate, Chrome전체17/17 및 정상 종료를 확인했다. 실제원문/AI/발급/게시 성공은 아니다. 전체 자료실 검사는 공유 빌드/읽기 경쟁을 피하도록 test-concurrency=1을 쓴다. 이 Windows sandbox에서 네이티브번들러/realpath 검사와 브라우저 서버 정리는 일반 사용자 문맥의 허용된 실행이 필요했다. 같은 실패를 무작정 반복하거나 경로 보호를 삭제하지 않는다. 최종 후보228개 문제0, staged40 그대로다.

그 뒤 공식2022-33호 별책9의 생식과 유전 단원을 실제 확인했다. 공식 HWP와 제공 PDF65쪽/인쇄59쪽의17개 문단 순서가 공백·문장부호 제외 후 일치한다. 전체292쪽/모든 최신 수정 고시/선정 교과서 확인은 아니다. 멘델 시제품에 실험 의의와 조사·모둠 토의 활동을 추가했고 자료실30/30·Chrome 시제품8/8이 정상 종료했다. 현재 후보 `50d3016ddf9bf1b2098f6d01d6c4dda22291392c859ea49b6be02da80601346f`는9월 후보의 독립 검토를 승계하지 않는다. 공개 카드0, 초안 상태 유지.

상세 문서 `docs/CURRICULUM_MENDEL_REVIEW.md`, 기록 `references/reviews/curriculum-2022-mendel.json`. 원본/추출문단/비교 스크립트는 `.local/reference/curriculum-2022-review-378fe2ab-86f6-4655-8eaa-5932df634425/`에 있다. HWP 해시 `d049caa5b3e7420a0505345dc70ca325faf65a18468ba393eec103b44b78c790`, PDF 해시 `0cf53427691d54366d6805767c428a15b0e817580807b4354947de7e3b58b738`. 원문 파일/비밀값은 공개 업로드하지 않는다. 새 출처 기록은 게시 승인v2의 신뢰 발급물이 아니다.

현재 브라우저 보고서는 `.local/evidence/genetics03/browser-report/index.html`, 내장 결과 요약은 `browser-summary-20261005.json`, 새 검증 요약은 같은 폴더의 `curriculum-review-20261005.json`이다. `manifest.json`/`execution-summary.json`은9월13일 기록이므로 새 버전으로 오인하지 않는다. 이전 폴더 복사본 `.local/evidence/genetics-before-curriculum-a5742bc39b2a41078280d868525bd77b/`도 유지한다. 진행 중 검사 세션은 없으며3000/3001/4177 수신 서버가 없음을 확인했다.

## 최신 후속 수정 검사와 다음 단계

- 전체 제작실151/151 PASS/exit0,85.64초. 합성 서명HTTP/PGlite/모델5회/별도 보고자 왕복 포함. 실제 모델 호출이나 원문 검토 성공은 아니다.
- Chrome 기존17개 통과와 수정2/2 재실행 통과(16.6초),390/1440px·axe0·넘침 없음·응답 유실/복원·후보 비실행. 실패 trace는 .local/evidence/worker/browser-revision-initial-003ec477e57c40a9863076fd527299d1/에 보존한다.
- PostgreSQL17 .local/worker-pg17-revision-6a3bfd5997b7498787b3a5261e51c55d/result.json:10SQL/29물리 경쟁 PASS, UTC04:49:02~04:49:43, stopped=true·PID/임시암호 없음·보호 ACL. 읽기에는 일반 사용자 문맥이 필요할 수 있다.
- Next build/TypeScript, 컨테이너 복사 import4/4 PASS. 실제 Linux Docker 미검증. 현재 후보 소스의 내용/교육 검토는 직전 문단의멘델 해시와 한계를 그대로 따른다.

후속 수정 구현은 완료했으므로 이전 FOLLOWUP_REVISION_PLAN의 구현 전 제약을 다시 해결하려고 코드를 재작성하지 않는다. 새로운 기능은 기본 비활성이다. 원격 연결 단계가 다음 검증 경계다.

로컬 환경의 OpenAI 키/GitHub App client·installation·private key/검토된 worker SHA가 비어 있음을 값 노출 없이 확인했다. GitHub 저장소 Actions secret 이름 목록도 빈 배열이었다. 이는 이 두 위치의 준비 상태이며 다른 계정/위치까지 검사한 것은 아니다. 기존 공개 업로드 승인과 API 키 준비 응답을 확인한다. 비밀값은 채팅에 받지 않는다. DB 암호 입력/갱신은 이미 완료했으므로 반복하지 않는다.

실제 운영 연결 순서는 WORKER_ROLLOUT.md를 따른다. 신뢰된 원문 근거 발급·안전한 조작 미리보기·정확한 배포물 승인/게시/실제URL 확인도 남았다. 운영 활성화나 게시를 합성 검사로 대신하지 않는다. 기존40개 스테이징은 승인 검토용 스냅샷으로 보존하고 현재 전체 변경은 별도 목록/해시로 검토할 수 있게 한다.
