# 구현 현황

## 2026-10-07 21:21 KST — 시작 실패의 chroot 지점 확인·수정 준비

[PR #7](https://github.com/Raph-Alpaca/science-simulations/pull/7)은 미리보기 검사 SUCCESS 확인 후 병합했다. main16be52e559ec5eeab9a1eac283fed9f00046861d, Production dpl_8GRwfYb8SabbrhoemN2PUzFKks7N READY다. [run37620220753](https://github.com/Raph-Alpaca/science-simulations/actions/runs/37620220753)은 격리/삭제 통과 후 2D 브라우저 시작 실패(runtime not_run,656ms,requests0,cleanup confirmed). 생성/검토 jobs skipped, 누적7회/이번 단계3/4회. 후보 없는 암호화 진단도 정상 반환·삭제했고 기존 DPAPI 키로 로컬 복호화했다. 원문10,431bytes와 암호문/실패 로그를 보호 폴더에 보존했다.

확인된 최초 실패는 Chromium 내부 sys_chroot 호출이다. 공식 Chromium 구현의 sandbox 축소 경로와 일치한다. 기존 공식 Playwright 프로필의 chroot 허용은 CAP_SYS_CHROOT 조건부인데 컨테이너는 cap-drop ALL이라 제외된다. 이 근거로 파생 프로필의 chroot 한 규칙만 조건 없이 허용하는 보완을 준비했다. 컨테이너 capability/host namespace/마운트/쓰기/네트워크 권한과 Chromium sandbox는 유지한다. syscall 하나의 허용 범위 변경임을 명시하며 막연한 보안 동일성이나 실제 Linux 해결 완료로 주장하지 않는다. 원문/파생본을 별도 보존·해시 고정하고 차이 검사를 추가했다. 실제 probe도 capability5종0을 요구한다.

관련15/15 PASS(exit0,868ms), diff check PASS. 최초 sandbox 계정 검사에서는 esbuild의 상위 폴더 읽기 거부로1개 실패했고 같은15개를 일반 사용자 문맥에서 다시 실행하여 모두 통과했다. 실패를 삭제하지 않는다. 다음은 이 수정 PR의 검사/병합 후 기존 상한의 네 번째 Linux 실행이다. 추가 무조건 재시도는 없다. 운영 DB/환경값·유료AI·학생용 게시 변경0회. 사용량96% 남음,50% 보존 기준 유지.


## 2026-10-07 재개 — 보관된 암호화 시작 진단 반영

사용자가 단계 완료 후에도 계속 진행하고 남은50%를 보존하도록 재개를 요청했다. 중단 체크포인트의12개 파일 해시와 경로가 모두 일치하고 staging은 비어 있다. 원격 main4cfa44a와 마지막 run37327477053의 완료/failure 상태도 일치한다. 기존 DPAPI 키의 합성 암호문 복호화와 공개키 대응을 실제 사용자 문맥에서 다시 확인했다. 키를 교체하지 않았다. 사용량97% 남음이며53~55%부터 정리한다. 기존17개·Chrome8개 검사는 소스가 그대로이므로 반복하지 않는다. 준비된12개를 새 PR로 반영하고 기존 최대4회 제한의 세 번째 키 없는 진단으로 계속한다. 아래 중단 지시는 이 재개 요청으로 해제됐다.

## 사용자 요청으로 즉시 중단 — 2026-10-06

사용자가 컴퓨터를 끄고 나중에 재개하겠다고 요청해 작업을 중단했다. 새 PR/업로드/원격 실행을 시작하지 않는다. 현재 암호화 시작 진단은 로컬 미커밋12개이며 PR #7은 만들지 않았다. 마지막 공개 상태는 PR #6/main4cfa44a1e6c45df52c921733bfeb34bf9c80cfbe, 마지막 원격 run37327477053은 failure로 종료했다. 모든 이 작업의 검사/감시 세션은 종료했고 로컬 DB/개발 서버를 새로 기동하지 않았다. 운영 DB/환경값·유료AI·학생용 게시 변경0회다.

현재 파일과 키·검사 증거는 저장됐다. 실제 사용자 DPAPI 보호 비밀키를 삭제하거나 새 키로 덮어쓰지 않는다. 다음 작업은 RESUME_HANDOFF 맨 위와 보호 폴더 shutdown-checkpoint.json을 읽고 Git/사용량 확인 → 미커밋12개/공개키-비밀키 대응 확인 → 검증된 진단 PR/병합 → 이번 단계3/4번째 키 없는 실행 → 암호문을 로컬에서 복호화해 원인에 맞게 수정하는 순서다. 마지막 사용량 확인은72% 남음이며 재개 시 다시 확인한다. 남은50% 보존 요청은 유지한다.

## 2026-10-06 00:01 KST — 여섯 번째 실패의 충돌 표식·한시적 암호화 진단 준비

[PR #6](https://github.com/Raph-Alpaca/science-simulations/pull/6) head c81aa0f4e8ec480133d7871e2c3a03bbdc717881을 병합했다(10월5일23:46:13 KST). main4cfa44a1e6c45df52c921733bfeb34bf9c80cfbe, Production dpl_ASUCiVoHyD2mspTu8YSfvvcCEcZL READY다. PR 미리보기 검사는 병합 당시 완료 감시 중이었고 병합 후 SUCCESS를 확인했다. 이후 검사 완료 확인을 병합 선행 조건으로 명시적으로 검사한다.

[run37327477053](https://github.com/Raph-Alpaca/science-simulations/actions/runs/37327477053)은 격리/삭제·소스 검사를 통과한 뒤 Chromium 시작에서 실패했다. 표식은 MISSING_PATH/CRASHPAD/ZYGOTE/SIGABRT와 일반 LAUNCH_FAILED다. runtime not_run, browserStarted false, browserStopped true, requests0,963ms,cleanup confirmed. Crashpad 표식이 근본 원인인지 충돌 후 부수 오류인지는 미확정이다. 누적6회, 이번 계속 단계2/4회 사용. 실패 로그/상태를 보호 폴더에 저장했고 감시 세션은 종료했다.

추측으로 권한을 바꾸지 않고 별도 시작 진단을 준비했다. 소스/후보를 받지 않는 동일 격리 컨테이너에 공개키만 stdin으로 전달하며, 기존과 같은 Chromium 시작 옵션을 사용한다. 실패 때만 최대32KiB 메시지를 AES-256-GCM과 RSA3072-OAEP-SHA256으로 봉인한다. 공개 로그에는 인증된 암호문 형식만 출력하고 원문/환경값을 출력하지 않는다. 시작 실패 뒤 한 번만 추가 진단하며 원래 실패 판정은 유지한다. 컨테이너 설정/진입점/수신 키 식별자/삭제를 확인해야 반환한다. 공개키 구성 파일을 제거하면 추가 진단이 꺼진다.

비밀키는 `.local/studio-worker-review-20261005/startup-diagnostic/private.dpapi`에 실제 Windows 사용자 전용 ACL·DPAPI CurrentUser로 보호했다. sandbox 사용자 DPAPI와 Set-Acl의 보안 감사 권한 시도는 실패했고 비밀키 저장 전 실제 사용자 문맥과 icacls로 해결했다. 비밀키 원문은 명령/환경/로그에 넣지 않았으며 복호화는 표준입력 파이프와 보호 폴더만 사용한다. 실제 DPAPI/암호화 왕복 PASS, 관련17/17 PASS(exit0,1097ms), Chrome8개 PASS(exit0, 합성 모델7응답/유료0회). Chrome 증거 `.local/evidence/worker/runtime-browser-a005d514-b9fa-40a5-a9b7-b699a17f3e15.json`. 실제 Linux 암호화 진단은 다음 실행에서 확인한다. 사용량72% 남음,50% 보존 기준 유지.

## 2026-10-05 계속 작업 — PR #5·다섯 번째 실행·시작 오류 표식 추가

사용자가 다음 단계가 끝나도 계속 진행하고 사용량50%까지만 사용하도록 요청했다. 남은50% 보존,53~55%부터 정리 기준으로 적용한다. 이번 진단 단계 원격 실행은 보호 기록/실행 도구에서 최대4회·같은 main 중복 금지·진행 중 실행 중복 금지를 강제한다. 키 없는 진단/수정은 이 계속 요청 범위에서 이어가며 운영 DB·환경값·유료AI·학생용 게시 변경은 아직 없다.

검토된6개를 head `1fee8b56513c59fa3964cb34c9702e5a8dcead5f`로 공개하고 [PR #5](https://github.com/Raph-Alpaca/science-simulations/pull/5)를 생성·첨부·병합했다(23:37:59 KST). main `85f740249109159aa899bac6baa8315616b124f9`, Production `dpl_FA2MYNJ5yKnQEbv2W77hti6vbffh` READY를 확인했다. [run37326412392](https://github.com/Raph-Alpaca/science-simulations/actions/runs/37326412392)에서 격리/삭제·소스 검사는 통과했으나 다시 RUNTIME_BROWSER_LAUNCH_FAILED / runtime not_run / browserStarted false / browserStopped true / requests0 / duration827ms / cleanup confirmed로 실패했다. 요약 문구 분류 보완만으로 OS 원인을 확정할 수 없었다. 3D/고장 fixture와 제작/검토 jobs 미실행. 누적5회, 이번 계속 단계1/4회. 로그/상태는 `.local/studio-worker-review-20261005/rehearsal-37326412392.{log,json}`에 보존했다.

다음 진단에서는 시작 오류 원문 대신14개의 고정 표식(권한/읽기 전용/공간/경로/프로세스 한도, crashpad/namespace/zygote/display, timeout/종료 신호)을 함께 기록한다. 이는 관찰된 오류 표식이며 각각을 근본 원인으로 판정하지 않는다. 메시지 입력32KiB·출력 최대15개 고정 코드, 후보 실행 이전 launch catch에만 적용하며 기존 보고서 허용 목록을 통과한다. 관련13/13 PASS(exit0,623ms). 권한·sandbox·자원 상한은 그대로다. 사용량73% 남음, 감시 프로세스 종료 확인.

## 2026-10-05 22:45 KST — 진단 PR #4 반영·실제 Chromium 시작 실패 확인

사용자가 manifest `48b8a0ab6a9045d60c9fcdf16099b89d83195eaa74cbcad5afa47d0f568753a8`의10개 공개·병합과 추가 키 없는 검사1회를 명시 승인했다. 파일/스테이징 바이트를 검증하고 `6031b8b1213d0a026200e3566de5f9b467e4749c`를 codex/studio-runtime-diagnostics에 공개해 [PR #4](https://github.com/Raph-Alpaca/science-simulations/pull/4)를 생성·첨부했다. Vercel 검사 통과 후 같은 head로 병합했다(22:39:44 KST). main은 `6e186b6e15ee16eff460e59fc78e8a5d67682d72`, Production `dpl_7w39jE91pXnZJ2q5NPJ9JpxAcuVW` READY다. 22:41:19 KST 실제 홈200·session401/LOGIN_REQUIRED·worker POST503/WORKER_SETUP_REQUIRED 및 private,no-store를 확인했다. 로그인 이후 UI/runtime 로그는 이번에 검사하지 않았다.

승인된 [실행 37318625336](https://github.com/Raph-Alpaca/science-simulations/actions/runs/37318625336)은 같은 main에서22:40:30~22:41:35 KST 실행 후 failure로 종료됐다. Ubuntu24.04.5 / runner image20260927.320.1, 검사 이미지 `sha256:0794318e44933fb07fc2dcac93408eba5ea36607d064eeeba9e978f6f60094fb`다. 이미지 빌드·격리 probe/삭제는 통과했다. 2D 결과는 contract=pass, runtime=not_run, issue=RUNTIME_BROWSER_LAUNCH_FAILED, browserStarted=false, browserStopped=true, requests=0, durationMs=985다. containerStage=report/cleanup=confirmed이며 **소스 검사를 통과했지만 Chromium 시작에 실패해 실제 화면/조작 검사는 실행하지 못했다.** 3D·고장 fixture도 미실행이다. configuration/generate/verify_0/1/2는 모두 skipped, 유료 호출·운영 DB/환경값·학생용 게시 변경0회다. 누적 원격 검사는4회, 추가 dispatch는 없다. 로그/상태는 `.local/studio-worker-review-20261005/rehearsal-37318625336.{json,log}`, HTTP 증거는 같은 폴더 runtime-diagnostic-production-http.json에 보존했다. 이전 실패3회도 유지한다.

설치된 Playwright1.63.0의 coreBundle.js와 [공식 Chromium 실행 코드](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/chromium.ts)를 확인했다. 일부 sandbox 원문을 `Chromium sandboxing failed!`로 다시 쓰는데 새 분류기가 이 요약을 누락했다. 로컬에서 해당 고정 문구 인식과 회귀 입력을 추가하고 관련7/7 PASS(exit0,324ms)를 확인했다. 누락은 확인된 진단 결함이지만 실제 Linux 오류 원문을 보존하지 않았으므로 이번 실패의 OS 원인까지 sandbox로 확정하지 않는다. 권한·sandbox·runner 이미지·환경 설정은 변경하지 않았다. Chrome8개는 직전 검증 증거이며 이번 문구 분류 수정 후 반복하지 않았다.

현재 미커밋은 분류기·관련 검사·컨테이너 README·진행 문서3개 총6개다. 다음 원격 진단은 새6개 공개/병합·추가 키 없는 검사1회 범위이며 직전10개 승인은 완료했다. 검토 목록/해시를 별도로 고정하고 원인 확인 전 권한 확대나 운영 DB 단계로 이동하지 않는다. 사용량74% 남음(사용26%), 초기화권 미사용. 원격 감시 exit1·로컬 검사 exit0으로 종료했으며 현재 검사/감시 세션 없음.

## 2026-10-05 22:33 KST — 읽기 권한 PR #3 반영·Linux 격리 통과·2D 보고서 진단 준비

사용자의 다음 단계 진행 요청에 따라 앞서 제시한 읽기 권한 보완5개와 추가 검사1회를 실행했다. manifest `0fb6936294f2bde9a47b1b63f1b9863eb487768abdb36dacc6993949caad0106`을 확인하고 `94cdd9f8cfd5ec1efe96500899de833aba559e04`를 공개해 [PR #3](https://github.com/Raph-Alpaca/science-simulations/pull/3)을 생성·첨부·병합했다. main은 `f5e58f47ce535eb7dcf9e9e4ecbc379051568dea`, 병합 시각22:22:55 KST다. 로컬 codex/studio-checker-readability의 HEAD와 main 파일 트리는 같다. 이5개 승인 범위는 완료됐으므로 다시 묻지 않는다.

Production `dpl_CMkLJQ6Rp7nZXiHGKhpvhVapkocM`가 같은 main SHA로 READY다. 22:24:03 KST 홈200·session401/LOGIN_REQUIRED·worker POST503/WORKER_SETUP_REQUIRED 및 private,no-store를 실제 확인했다. 기록은 `.local/studio-worker-review-20261005/readability-production-http.json`이다. 운영 DB/환경값·유료AI·학생용 게시 변경은 없다. 실제 로그인 이후 UI와 이전403인 runtime 로그 조회는 이번에 검사하지 않았다.

추가 [실행 37316382745](https://github.com/Raph-Alpaca/science-simulations/actions/runs/37316382745)은 같은 main SHA에서22:23:20~22:24:25 KST 실행 후 failure로 종료됐다. 이미지 빌드와 pwuser의 소스 구문/읽기 검사는 성공했고, 실제 Linux isolation=true/cleanup=confirmed를 확인했다. 다음2D는 CONTAINER_REHEARSAL_REPORT_INVALID로 실패했다. 보고서가 반환된 뒤 기대 결과와 일치하지 않은 상황이며, runRuntimeContainer는 보고서 형식/대상/브라우저 종료 확인과 컨테이너 삭제가 성공해야 반환한다. 다만 기존 출력은 세부 issue를 생략하므로 contract 실패인지 브라우저 시작/동작 실패인지 아직 확정할 수 없다. 3D·고장난 초기화 fixture는 실행하지 않았고 configuration/generate/verify_0/1/2는 모두 skipped다. 전체 로그와 상태는 같은 보호 폴더의 rehearsal-37316382745.{log,json}에 보존했다. 원격 검사는 누적3회이며 추가 dispatch는 없다.

로컬 진단 보완은 허용 목록의 runtime 오류 코드·검사 상태·제한된 숫자·브라우저 시작/종료 여부만 출력한다. Chromium 시작 실패는 sandbox/실행 파일/공유 라이브러리/프로세스 제한/기타로 분류하고 오류 원문·경로·후보·환경값은 기록하지 않는다. 보고서 반환 후 실패한 경우 report/cleanup confirmed를 표시한다. 컨테이너 복사 목록에 새 진단 모듈을 추가했으며 sandbox·권한·자원/시간 상한은 유지했다. Linux 실패 원인 해결로 판정하지 않는다.

검증: 관련 단위/모의 컨테이너 검사12/12 PASS(exit0,1314ms), 실제 로컬 Chrome8개 PASS(exit0)다. Chrome은 정상2D/3D·초기화 고장·정적 화면·외부 요청·위조 pass·응답 없는 스크립트·자식 프로세스 수정 왕복을 검사했다. 마지막 왕복의 모델7회 응답은 합성이며 유료 호출0회다. 증거 `.local/evidence/worker/runtime-browser-a62f5d46-7b93-41b3-bc4c-4f8c2572380c.json`, 기록22:32:30 KST. 실제 Linux 재검사는 아니다.

다음 검토 범위는 진단 코드4개·검사2개·문서4개 총10개를 새 공개 PR로 병합하고 키 없는 Linux 검사를 추가1회 수행하는 것이다. 직전1회 권한은 사용했으므로 검토 가능한 파일/해시를 고정해 이 추가 범위를 확인한다. 업로드 후보243개에서 금지 경로/키 패턴 문제0개, diff 공백 검사도 통과했다. 패턴 검사는 임의 인코딩된 비밀값이나 원문 권리 확인을 대신하지 않는다. 사용량76% 남음(사용24%), 초기화권 미사용. 원격 감시와 로컬 검사 프로세스는 모두 종료했다. 실제 Linux2D/3D 통과 전 운영 DB/실제 제작 활성화로 넘어가지 않는다.

## 2026-10-05 14:36 KST — 진단 PR #2 병합·추가 검사 종료·이미지 읽기 권한 보완

사용자가 진단 보완7개 공개/병합과 추가 키 없는 검사1회를 명시 승인했다. manifest `22de2f0faab1743e32f454c1a445c73fbba7efc5d6c93da0f6820f2d789f6e91`과7개 파일/스테이징 바이트 일치를 확인했다. `ae2231f40f1e331eeab2f625180b1da8d977d808`을codex/studio-rehearsal-diagnostics에 업로드해 [PR #2](https://github.com/Raph-Alpaca/science-simulations/pull/2)를 생성·첨부했고 Vercel 검사 성공 후 승인된 head로 병합했다. main은 `c5f781a00eae78f9da14cff6c95eac750917ba42`다(14:32:22 KST).

Production 배포 `dpl_CosqyoN7AHDvErGSXSHLaZMTKEiK`가 같은 main SHA로 READY다. 14:33:12 KST 실제 확인은 홈200·session401/LOGIN_REQUIRED·worker POST503/WORKER_SETUP_REQUIRED, 모두 private,no-store였다. `.local/studio-worker-review-20261005/diagnostic-production-http.json`에 저장했다. 운영 DB·환경값·유료AI·학생용 게시 변경은 없다. 로그인 후 새 UI와 이전403인 runtime 로그 조회는 이번에 반복하지 않았다.

승인한 [추가 실행 37268245456](https://github.com/Raph-Alpaca/science-simulations/actions/runs/37268245456)은 정확한 main SHA에서14:32:37~14:33:32 KST 실행 후 failure로 종료됐다. 이미지 생성/컨테이너 생성/설정 확인을 지나 **stage=isolation, code=CONTAINER_COMMAND_FAILED, containerStage=execute, cleanup=confirmed**로 기록됐다. 즉 격리 확인용 프로세스 실행 실패이며 컨테이너 삭제는 확인됐다. 2D/3D 및 생성/검토 작업은 실행하지 않았다. 이전 실패와 이번 실패의 전체 로그/상태를 각각 보존했고 추가 dispatch는 없다.

코드 검토에서 build-context가 만든0700 하위 디렉터리가 이미지의 기본 root 소유로 복사되어 pwuser가 중첩 probe를 읽지 못할 수 있는 구성 결함을 찾았다. [Docker 공식 COPY 문서](https://docs.docker.com/reference/dockerfile/#copy)에서 하위 디렉터리 메타데이터 보존과 기본 UID/GID0을 확인했다. 실제 프로세스 오류 원문은 기록하지 않았으므로 이 결함이 이번 실행 실패의 원인이라는 판단은 아직 추정이다.

로컬 Dockerfile 보완은 이미지 안의 허용된 검사 소스2개 경로를 COPY --chmod=0555로 복사하고 USER pwuser 뒤 node --check3개를 실행해 중첩 probe/진입점/계약 소스를 읽을 수 있는지 빌드 중 확인하도록 한다. 호스트0700·root 소유·비특권 사용자·기존 격리/자원/시간 제한을 유지한다. 관련 로컬9/9 PASS, exit0,654ms. 모의 Docker/허용 목록/import 검사이며 실제 Linux 빌드·재검사는 미실행이다.

현재 추가 미커밋은 Dockerfile·컨테이너 README·STATUS·RESUME_HANDOFF·WORKER_ROLLOUT 총5개다. 다음 단계는 이 읽기 권한 보완을 공개/병합하고 추가 키 없는 검사1회를 승인받아 실제 원인을 확인하는 것이다. 이번 추가1회 승인은 이미 사용했으며 자동 반복하지 않는다. 사용량78% 남음(사용22%), 초기화권 미사용. 검사 감시 프로세스도 종료됐다.

## 2026-10-05 14:28 KST — PR 병합·운영 제작실 갱신, Linux 검사 1회 실패

사용자가 PR #1 병합·기존 제작실 갱신·키 없는 실행기 검사 1회를 명시 승인했다. 이전 자동 승인 검토의 병합 거부는 이 승인으로 해결됐다. 정확한 head94a3bca를 확인한 뒤 PR #1을 병합했고 main은 `8d9a87657a0341d478bf6706e404657e31ee9e28`이 됐다(14:22:52 KST). 원격 main을 fetch했으며, 로컬 작업 브랜치 HEAD94a3bca와 main의 파일 트리는 같다. 미커밋 기록은 보존했다.

Vercel Production 배포 `dpl_GjajT37AeTqm2gaDBWQ1BHuLyJNm`가 같은 main SHA로 READY이고 기존 [제작실 주소](https://science-simulations-studio.vercel.app/)에 연결된 것을 확인했다. 배포 후 실제 요청: 홈 GET200, session GET401/LOGIN_REQUIRED, worker input POST503/WORKER_SETUP_REQUIRED이며 모두 private, no-store다. 새 worker는 여전히 비활성이다. 로그인 후 실제 UI 왕복은 이번에 검사하지 않았다. 실행 로그 집계 도구는403으로 거부되어 로그 미검증으로 남긴다.

승인한 [Actions 검사 37267554755](https://github.com/Raph-Alpaca/science-simulations/actions/runs/37267554755)는 같은 main SHA, rehearsal 모드로 정확히 한 번 실행했다. Linux 설치와 고정 Docker 이미지 빌드는 성공했으나 `Verify isolation and reviewed 2D/3D fixtures` 단계가 `CONTAINER_REHEARSAL_FAILED`로 실패했다. 실행은14:23:19~14:24:35 KST, failure로 종료됐다. configuration/generate/verify_0/1/2는 모두 skipped다. 유료 AI·운영 DB 변경·학생용 게시는0회다. 원격 재실행은 하지 않았다.

기존 로그에는 세부 오류/격리 probe 체크포인트가 없어 격리 probe와 첫2D 검사 중 어느 내부 단계인지 확정할 수 없다. 2D/3D 통과나 컨테이너 삭제 확인을 성공으로 기록하지 않는다. seccomp의 작업 파일·Git 커밋 SHA256이 모두 기존 `cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`인 것은 확인했다. 실패 상태와 전체 로그는 `.local/studio-worker-review-20261005/rehearsal-37267554755.{json,log}`에 보존했다.

로컬 보완: rehearsal의 단계/isolation 체크포인트와 고정 오류 코드, 컨테이너 create/inspect/execute/report/cleanup 및 정리 확인 상태를 기록하도록 수정했다. 오류 원문·Docker stderr·후보·환경값을 출력하지 않는다. 기존 격리 옵션·정리 필수 조건·시간/자원 상한은 유지했다. 실제 격리 오류를 고친 것으로 판정하지 않는다. 두 관련 검사 파일의 **9/9 PASS, exit0,568ms**를 확인했고 실패 후 다음 fixture 미실행·임의 오류/비밀 문자열 출력 차단·정리 실패 시 성공 거부를 검사했다. 이 결과는 모의 Docker 호출이며 Linux 재검사가 아니다.

현재 미커밋은 진단 코드2개·검사2개·진행 문서3개 총7개다. 다음은 이 진단 보완의 공개 PR/병합과 추가 키 없는 검사1회를 검토한 뒤 실제 실패 단계를 확인하는 것이다. 이번 승인의 검사1회는 이미 소비했으므로 추가 실행은 별도 승인을 받는다. 이후 운영 DB/API키/실제 제작·게시 활성화는 아직 범위 밖이다. 남은 사용량82%(사용18%)이고 초기화권은 사용하지 않았다.

## 2026-10-05 14:17 KST — 제작실 사용 안내·운영 반영 전 확인

사용자가 다음 단계 진행과 과제 입력 위치를 물었다. 별도 설치 없이 기존 [과학 제작실](https://science-simulations-studio.vercel.app/)에서 입력하고 결과·수정 요청을 확인하는 구조이며, 현재 운영 앱은 모의 실행이라고 안내했다. 실제 제작 연결이나 학생용 콘텐츠 게시가 완료되었다고 설명하지 않았다.

PR #1의 head `94a3bca07f708544650ec8ab20c0639b51e5241c`, main 대상, 두 Vercel 검사 SUCCESS와 CLEAN 상태를 확인했다. PR은 draft에서 ready for review로 전환했다. **main 병합은 실행되지 않았다.** 자동 승인 검토가 이전 승인에서 병합을 제외했고 Vercel 운영 배포를 자동 유발하므로 “다음 단계”만으로는 승인이 불충분하다고 거부했다. 사용자에게 PR 병합·제작실 갱신·키 없는 Linux rehearsal 1회를 묶어 승인 요청했다. 운영 DB 변경·유료 AI·학생용 게시는 이 요청에서 제외했다. 승인 전 우회 실행하지 않는다.

Vercel 연결 도구로 실제 조회했다. 환경 변수는 기존 여섯 이름만 등록되어 있으며 모두 Production 범위다. 값을 복호화하거나 출력하지 않았다. 새 INPUT_REVIEW/WORKER_API/DISPATCH/RESULT_REVIEW/REVISION 활성화 변수는 없다. Production은 `4931c7e0445b2d227bac9c6ecfa29fcff62b5607`, 배포 `dpl_FKPC9E44CpVJmJNJB7wWEsBFtg4F`, READY다. 이 배포는 삭제 gate가 닫힌 현재 상태의 이전 앱 복구 기준이며, 향후 삭제 활성화 후에도 무조건 사용할 수 있는 복구 버전은 아니다.

실제 Supabase 프로젝트 science-studio에서 READ ONLY 트랜잭션·statement_timeout 10초로 메타데이터를 확인했다. capability=2, 삭제 gate=false, 기존 8개 테이블 RLS=true, migration은 `20261004111955`와 `20261004111958` 두 개다. 실행기/입력/접수/결과/수정용 새 함수는 없고 새 SQL은 미적용이다. 사용자 행·원문·인증값은 조회 출력하지 않았다. 기존 v2 앱 경로와 새 기능 기본 비활성 경계를 코드와 대조했다.

운영 URL의 익명 GET을 경로마다 한 번·10초 상한으로 확인했다. `/`=200, `/api/studio/session`=401, `/api/worker/input`=404다. 기존 앱의 도달 가능성과 미로그인 API 차단 확인이며 로그인 후 새 UI나 새 worker 검사 성공은 아니다. 소스 변경이 없어 기존 로컬 검사는 반복하지 않았다. Linux rehearsal·운영 재배포·새 DB 적용·유료 호출은 실행하지 않았다.

다음은 위 승인 응답 확인 → 동일 PR head 재확인 → 병합 → 새 main/Production SHA 확인 → rehearsal 1회다. 실패 증거를 보존하고 해당 단계만 수정한다. 이 기록과 RESUME_HANDOFF/WORKER_ROLLOUT는 로컬 미커밋 문서이며 공개한 153개 코드와 구분한다. 사용량 제한으로 중단한 상태가 아니라 병합 승인 응답을 기다리는 상태다.

## 2026-10-05 최신153개 공개 업로드 승인·draft PR 생성

사용자가 기존40개 제안 대신 검토 목록의 최신153개를 Raph-Alpaca/science-simulations의codex/studio-v2-budget에commit/push하고main대상draft PR로 올리는 것을 명시 승인했다. 고정된manifest SHA256 `a5c11dd1d7b1cbf883b090fe14a0fd8d0076c260b569ee40aafba8935ea7cc03`의 전체 파일해시와 Git 필터 적용 후 스테이징 바이트를 확인했다. 기존40개 스테이징은 `.local/studio-worker-review-20261005/original-staged-40.patch`와해시로 보존했다.

커밋 `94a3bca07f708544650ec8ab20c0639b51e5241c`,153files/9614추가/86삭제를 공개 브랜치에 업로드했고 [draft PR #1](https://github.com/Raph-Alpaca/science-simulations/pull/1)을 생성·현재Codex task에 연결했다. PR의head/base/153개/draft·OPEN 상태를 확인했다. 업로드직후Git작업트리는 깨끗했고, 이 진행 기록은 그 뒤 추가한 로컬 미커밋 문서다. 아래 “공개 승인 대기”는 이전 이력이며 최신153개코드의업로드 승인은 해결됐다.

최종 업로드 감사240후보/문제0. `.local`,`.env.local`,원문PDF/HWP와검사자료는 제외했다. 포트3000/3001/4177/55443 수신0·postgres프로세스0을 정상사용자권한으로확인했다. 샌드박스의포트조회는권한거부되어그결과만으로종료를판정하지않았다.

이번 승인은draft PR까지이며 병합·운영DB적용·유료AI·학생용게시를 포함하지 않는다. 실제Actions/Linux검사는현재main전용게이트여서병합전에는실행할수없다. Vercel/GitHub의두PR상태검사는SUCCESS이며Preview배포6851730555가같은94a3bca커밋으로성공했다(UTC05:03:39). [PR미리보기](https://science-simulations-studio-btdszn6fq-alpaca-t.vercel.app/)는로그인없이GET1회/10초상한으로HTTP302리다이렉트까지만확인했고인증후UI동작은미검증이다. Production은4931c7e배포그대로다.

최신사용량은88%남음(사용12%)이며20%중단문턱에도달한것이아니다. 다음외부단계의권한·키가준비되지않아draft PR경계에서인계한다. 로컬/저장소에실제API키와App설정을연결하는단계, 원문근거발급/격리미리보기/배포물승인·게시확인은남아있다. 전체목표를완료처리하지않는다. 현재미커밋변경은업로드후기록용STATUS와RESUME_HANDOFF두문서다.

## 2026-10-05 재개 — 같은 콘텐츠의 후속 수정 연결

사용자가 재개를 지시했고 사용량 중단 기준을 **남은 약20%**로 변경했다. 약25%에서 새 큰 단계를 시작하지 않고 정리하여20% 전에 멈춘다. 재개 시100%, 구현 중 최근93%가 남았으며 초기화권을 사용하지 않았다. 아래21%/15% 중단 문단은 이전 작업 이력이다.

수정 의견→정확한 기존 후보·누적 과제 확인→새 사용 범위/비용 동의→동일 콘텐츠ID의 후속 접수→새5역할/실행 검토→결과 조회를 로컬에 연결했다. 기존 작업·후보·검토·예산은 보존하며 결과 화면에서 수정 전 작업을 열 수 있다. 같은 요청/응답 유실은 같은 접수를 반환하고, 오래된 부모 분기·동일 의견 재소비·권한 철회·만료·예산 차단을 DB에서 거부한다. 후보 없이 종료된 작업만 새 의견/동의를 받아 원래 후보에서 재시도할 수 있다. [구현·상한·권한 경계](FOLLOWUP_REVISION.md).

실제 실행한 검사:

- 제작실 전체151/151 PASS/exit0,85.64초. 새8개 수정 서비스/DB 검사, 수정 파이프라인, 서명HTTP→PGlite→합성 모델5회→별도 보고자→새 후보/후속 수정 준비 왕복 포함. API 모델·보고값은 합성이며 유료/원격 실행은0회다.
- Next production build/TypeScript PASS/exit0. Chrome 기존17개 통과, 새 수정2개는 최초 알림 선택자 실패를 수정한 별도 실행에서2/2 PASS/exit0,16.6초.390/1440px·axe0·가로 넘침 없음·새 동의·중복 클릭·준비/접수 응답 유실·재접속 복원·후보 비실행을 확인했다.19개 모두의 통과 증거가 있으며 “한 번의 전체19/19 실행”을 뜻하지 않는다.
- PostgreSQL17 실제 물리 연결29개/10개 SQL PASS/exit0. `.local/worker-pg17-revision-6a3bfd5997b7498787b3a5261e51c55d/result.json`, UTC04:49:02~04:49:43. 새 수정 경쟁8개, 서로 다른 non-superuser PID와 Lock 확인, stopped=true·PID/임시암호 없음·보호 ACL 확인.
- 컨테이너 복사/import4/4 포함. Windows 샌드박스의 상위 경로 읽기 제한 때문에 실패한 초기 구성 검사는 경로 검사를 유지한 채 정상 사용자 문맥에서 통과했다. 실제 Docker/Linux/Actions는 아직 미검증이다.

새 화면 첫2개는 Next의 숨은 route announcer까지 알림으로 선택해 실패했다. 표시된 오류 알림만 정확히 선택하도록 바꾸고 기존 검사/assertion을 유지했다. 실패 trace는 `.local/evidence/worker/browser-revision-initial-003ec477e57c40a9863076fd527299d1/`에 보존했다. 원격 왕복 검사도 의견 저장 전 스냅샷을 기준으로 삼은 테스트 오류를 고쳐 전체 원본 불변성 비교를 통과했다.

운영 DB/앱/키/원격 Git 변경은 없다. 새 SQL은 제안, `STUDIO_REVISION_ENABLED=false`이며 다른 기능도 기본 비활성이다. 기존40개 스테이징(2261추가/44삭제)을 보존했고 새 작업은 미스테이징이다. 실제 Linux 격리/Actions/OIDC·제한된 유료 첫 제작·신뢰된 원문 검토 발급·격리된 조작 미리보기·배포물 승인/게시/게시 확인은 미완료다. 다음 운영 연결 전에 구체적 공개 변경 범위와 준비된 자격증명을 확인해야 한다.

## 2026-10-05 사용량 보호를 위한 중단·재개 준비

남은 계정 사용량 약21%(사용79%)를 확인하고 새 구현을 멈췄다. 사용자가 요청한15%를 보호하기 위한 여유다. [재개 인계](RESUME_HANDOFF.md)에 목표·완료/미완료·검사/원본 경로·Git 스테이징 보존·대기 중 질문·다음 단계와 주의점을 정리했다. 초기화권은 사용하지 않았고 전체 목표는 아직 미완료다.

실제 코드/SQL을 읽어 [후속 수정 연결 설계안](FOLLOWUP_REVISION_PLAN.md)을 작성했다. 같은 콘텐츠ID의 부모/자식 버전,50KB 승인입력·150KB 모델입력·2MB 후보 상한, 새 비용동의·예산·중복접수·취소 경쟁을 다룬다. 이 API/SQL/화면은 아직 구현하지 않았다. 결과 화면에 남아 있던 “학년도 미확인” 문구는 현재의 학년도 제거 결정과 일치하도록 “적용 교육과정 기준 미확인”으로 수정했다. 마지막 `npm.cmd run typecheck:studio` PASS/exit0. 문구만 변경해 별도 새 테스트와 전체 브라우저 재실행은 하지 않았다.

마지막 확인에서3000/3001/4177 수신 서버와postgres 프로세스 없음. 대기 중 검사 세션·유료 AI/원격 dispatch 없음. 기존40개 스테이징(2261추가/44삭제)은 보존하고 추가 작업은 미스테이징이다. 비공개 자료/키/원본은 Git 제외, 원격 Git/배포/운영 DB는 그대로다. 공개 업로드는 자동 승인 검토의 구체적 대상/범위 동의 요구로 보류 중이며 이미 보낸 승인 질문과 API 키 준비 질문을 반복하지 않는다.

## 2026-10-05 공식 교육과정 부분 대조·멘델 활동 보완

교육부2022-33호 공식 HWP와 제공 PDF의 생식과 유전 단원17개 문단을 실제 읽고 대조했다. 인쇄59쪽/PDF65쪽의 단원 텍스트 순서는 공백·문장부호 제외 후 일치했다. 전체 문서·모든 수정 고시·선정 교과서 대조 완료가 아니다. [확인한 범위·원본 해시·남은 항목](CURRICULUM_MENDEL_REVIEW.md), [출처 검토 기록](../references/reviews/curriculum-2022-mendel.json).

시제품에 멘델 교배 실험의 의의와 공개 완두 자료 조사·모둠별 표본 비교·근거에 따른 설명 수정 안내를 추가했다. ID/주소와 계산 모형은 유지했다. 독립의 법칙의 필수/보충/심화 위치는 추가 확인이 필요하다. 새 후보는 주 에이전트가 보완했으며 과거 후보의 독립 검토를 승계하지 않는다. 출처 검토 기록도 게시 승인 패킷이 아니다.

자료실 단위30/30 PASS(exit0,11.81초), 실제 Chrome 시제품8/8 PASS(exit0,29.4초).390/768/1440px·키보드·axe 위반0·가로 넘침 없음과 기존 조작을 확인했다. 현재 후보 해시 `50d3016ddf9bf1b2098f6d01d6c4dda22291392c859ea49b6be02da80601346f`, 공개 승인 카드0. 서버 종료 뒤3000/3001/4177 수신 서버 없음 확인. 앱/SQL 변경이 없어 앞선 제작실141개/브라우저17개/실제PG17 경쟁21개의 증거를 유지하며 다시 실행하지 않았다.

원문·추출 문단·비교 스크립트는 `.local/reference/curriculum-2022-review-378fe2ab-86f6-4655-8eaa-5932df634425/`에 보존한다. 이전 시제품 증거는 별도 복사했고 최신 브라우저 보고서의 내장 결과도8개 통과로 확인했다. 보고서 추출의 첫 시도는 이전 HTML 형식을 가정해 실패했으며 현재 template 형식을 읽어 해결했다. 기존9월 manifest를 최신 결과로 덮어쓰지 않았다.

운영 DB/앱/키·원격 Git 변경과 유료 호출 없음. 기존40개 스테이징(2261추가/44삭제)을 보존했다. 최신 사용량 스냅샷은 사용77%/남음23%이며15% 보호를 위한 정리 여유를 유지한다. [재개 인계](RESUME_HANDOFF.md)에 현재 단계와 다음 작업을 기록한다. 공개 업로드의 구체적 승인과 API 키 준비 응답은 계속 대기다.

## 2026-10-05 교육과정 기준·원문 근거 게시 규격 정합성

학년도 입력 제거라는 기존 사용자 결정을 유지했다. 새 제작 입력에는 내부2022 개정 기준과unverified 상태를 함께 넣고 화면에도 원문 대조 미확인을 표시한다. 과거 입력/해시/콘텐츠는 변경하지 않았다. 새 게시 승인v2는 연도를 임의로 넣는 대신 정확한 콘텐츠·후보·입력·학년·단원·revision에 결합한 원문 검토 묶음과educationHash를 요구한다. v1 승인 호환은 유지한다. [규격·권한 경계·한계](EDUCATION_EVIDENCE.md).

원문 문서 해시·쪽/절·실제 검토 범위·검토자/시각·방법·판정·AI/요약 이용 허용이 빠지거나 원문 기록이 달라지면 새 규격은 거절한다. 이는 형식/버전 검사이며 실제 원문 수집·검토자 인증·승인 발급 서비스는 미연결이다. 생산 자료실은 계속 승인 카드0, 결과 화면의 게시 적격도false다. 실제 교육과정/교과서 대조를 통과로 기록하지 않았다.

최종 자료실30/30, 제작실141/141, 변경된 컨테이너 의존성 검사4/4, production build/TypeScript·자료실typecheck/validate PASS. Chrome 전체17/17 PASS/exit0(1.1분), 학년도 입력 없음·2022 개정과 원문 미확인 동시 표시·390/1440px·기존 결과/접수 흐름을 확인하고 검사 서버를 종료했다. 실제 Docker는 실행하지 않았다. SQL 변경이 없어 직전 실제PostgreSQL21개/9SQL 해시 증거를 유지하고 반복하지 않았다.

초기 자료실 검사는 build 중dist/catalog를 읽는 다른 파일과 경쟁해 rename EPERM 및 이후 ENOENT로 두 차례 실패했다. 기존 모든 assertion을 유지하고 검사 파일의 실행 순서를 직렬로 고정한 뒤30개 전체가 통과했다. 새 네이티브 번들러/기존realpath 검사도 Windows sandbox의 상위 경로 조회 제한으로 실패했으며, 보호 검사를 완화하지 않고 일반 사용자 문맥에서 동일 검사를 통과했다. 최종 컨테이너 복사본의 import 그래프도 확인했다.

최종 업로드 후보228개 문제0. 기존 스테이징40개/2261추가/44삭제를 유지했다. 유료 호출·원격 Git/키/운영 DB/앱 변경 없음. 최신 사용량은 사용69%/남음31%로, 약20%부터 정리하는 사용자 중단 조건을 [재개 인계](RESUME_HANDOFF.md)에 유지한다. 공개 업로드의 구체적 승인과 API 키 준비 응답은 계속 대기다.

## 2026-10-05 제작 결과·실패 이력·버전별 수정 의견

실제 작업의 결과 조회, 생성 파일을 실행하지 않는 코드 보기, 후보 버전에 결합한 메모·수정 요청 저장을 구현했다. 입력/증거/후보/검사/독립 검토의 해시와 순서를 서버에서 다시 확인하고, AI 의견과 실제 실행 검사 및 미확인 원문 근거를 구분한다. 수정 요청 저장은 추가 유료 실행이나 게시 승인이 아니다. [구현·한계](RESULT_REVIEW.md), [다음 작업 인계](RESUME_HANDOFF.md).

전체 제작실141/141, 추가 상한 검사를 포함한 결과 검토5/5, production build/TypeScript PASS. 실제 Chrome 전체17/17 PASS/exit0(1.1분), 새3개는390/1440px·실패 후 수정 이력·코드/모델 문자열 비실행·응답 유실 후 중복 저장 방지·원문 브라우저 저장 없음·axe 위반0·가로 넘침 없음을 확인했다. 원격 모델/실행 보고는 합성 fixture이며 실제 AI·과학 원문 검토가 아니다.

새 PostgreSQL17 물리 연결 경쟁21개 PASS/exit0, 00:52:42~00:53:19 KST. `.local/worker-pg17-input-dd9b68b0629e41b0be517f1fa49bfd1b/result.json`: 현재9개 SQL 해시 일치, 실제 Lock/차단 PID, stopped=true, PID·임시 평문 암호 없음, 현재 사용자/SYSTEM 보호 ACL 확인. 새3개는 의견 중복·서로 다른 내용의 같은 요청 ID·대화 삭제와 저장 경쟁이다.

초기 브라우저3개는 숨은 Next 알림까지 선택한 locator와 option disabled 판정 때문에 실패했다. 대상/DOM 속성을 정확히 검사하도록 고쳐 최종 통과했으며 실패 추적을 보존했다. 첫 실제 PostgreSQL 실행은21개 동작 통과 뒤 정리 관찰 제한으로 exit1이었다. 원래 보고서를 유지하고 같은 서버의 종료를 별도로 확인한 다음, 정리 관찰을 보완한 새 실행 전체가 정상 종료했다. [실패 기록 경로](RESULT_REVIEW.md).

유료 AI 호출·실제 GitHub dispatch0회, 운영 SQL/앱/키/원격 Git 변경 없음. 결과 검토도 기본 비활성이다. 원문 검증, 후속 수정 실행, 조작 가능한 격리 미리보기, 정확한 배포물 승인·게시·게시 확인이 남았다. 기존 공개 대상/40개 범위 동의와 API 키 준비 응답을 기다린다. 기존 스테이징40개(2261추가/44삭제)는 보존하고 추가 구현은 미스테이징이다.

사용자 지시에 따라 사용량을 확인하며 **남은 약20%부터 새 단계 착수를 멈추고 정리하여15%를 보호**한다. 최신 확인은 사용67%/남음33%였다. 실제 중단 전 최신 상태·검사·프로세스·다음 단계를 RESUME_HANDOFF에 갱신하며 초기화권은 사용하지 않는다.

## 2026-10-05 확인한 과제 → 영구 접수 → GitHub 제작 실행 연결

입력 확인 뒤 제작 시작·접수 상태 조회·실제 중단을 연결했다. 서버는 고정 저장소/main의 검토된 SHA를 확인하고 작업 UUID만 GitHub에 전달하며, 반환된 실행번호·워크플로·저장소·SHA·attempt1을 재검증한 뒤 worker와 연결한다. GitHub App 토큰은 해당 저장소 Actions write/Contents read로 제한하고 생성 코드에 주지 않는다. [구현·한계·공식 문서](DISPATCH.md).

신규 DB 제안은 입력 사용·작업·접수·예산을 원자적으로 결합한다. 영구 claim으로 중복 클릭·응답 유실·시간 만료 뒤에도 재전송하지 않는다. POST 전 실패만 미사용 금액을 닫고, POST 후 불확실 응답은 예약을 유지한다. 취소와 늦은 응답이 겹치면 취소가 우선하며 미연결 worker는 과제·AI 권한을 얻지 못한다. 실제 작업 화면에서 모의 명령을 숨기고 서버도 거부한다.

최종 전체 제작실136/136, production build/TypeScript PASS. 실제 Chrome 전체14개 PASS/exit0(45.3초), 새 제작 접수3개에서390/1440px·불확실 응답·중복 클릭1회·새로고침 복원·중단·axe 위반0·가로 넘침 없음을 검사했다. API는 로컬 서비스/PGlite에 연결하고 Auth/GitHub는 합성 응답이다. 초기 정적 계약 검사는 새 취소 RPC 누락으로 실패해 범위 보완 후 전체 재통과했다. 첫 브라우저5개는 동작 통과 뒤 서버 teardown180초 실패였으며 해당 서버를 검증해 종료한 뒤 전체14개와 정상 종료를 재확인했다. 실패를 삭제하지 않았다.

새 PostgreSQL17 물리 연결 경쟁18개 PASS/exit0, 00:33:09~00:33:46 KST. `.local/worker-pg17-input-e885c87fc32842219aa2099c7673d942/result.json`: 8개 SQL, 모든 사례의 실제 Lock/차단 PID, stopped=true, PID·임시 평문 암호 없음, 현재 사용자/SYSTEM 보호 ACL 확인. 새4개는 접수 경쟁·취소 전후 실행 결합·같은 결과 중복 저장이다. 별도 검사 DB로 기존 불확실 비용과 월10건 한도를 보존했다.

운영 SQL/앱/환경/키/원격 Git은 변경하지 않았고 실제 GitHub dispatch·유료 AI 호출0회다. 기본 비활성 설정을 유지한다. 실제 App 자격증명·Actions OIDC·Linux 컨테이너 rehearsal, API 키 연결, 출처 원문 검토, 결과 검토·게시·게시 확인이 남았다. OpenAI 키 준비와 자동 승인 검토가 요구한 기존 공개 대상/범위 동의는 답변 대기다. 기존 스테이징40개(2261추가/44삭제)는 보존하고 이번 구현은 미스테이징이다.

최종 증거 `.local/evidence/worker/dispatch-system-b68907d5b44147b3bf011c2d13ee71d1.json`에 실패 이력·최종 통과·DB 해시·검사 서버 종료를 함께 보존했다.390px 접수/1440px 불확실 화면 캡처를 직접 확인했다. 업로드 후보217개 문제0, staged/unstaged 공백 검사 통과. 환경/암호/DB/캡처/원본 자료는 계속 Git 제외다.

## 2026-10-05 제작 과제·출처 입력 확인 UI/API와 DB 결합

2D/3D 과제와 공개 참고 링크·직접 작성한 요약을 준비하고 정확한 전달 내용을 확인하는 화면/API를 구현했다. 입력 사용 범위·비용 조건은 해당 본문 해시에 결합하고, 수정 시 다시 확인한다. 브라우저에는 식별자/요청 해시만 보존한다. 준비/확인만으로 AI 호출·작업 예산을 예약하지 않는다. 새 DB 트리거는 실제 승인 기록 없이 임의 UUID를 넘기는 worker 접수를 차단하고 본문/동의 변경, 중복 작업과 다른 사용자 결합을 거부한다. [구현·제한·검증 상세](INPUT_REVIEW.md).

전체 제작실125/125, production build·내장 TypeScript 성공. 최종 DB 제약 보완 후 관련6개 재통과. 실제 Chrome 새 화면2개(390/1440px)와 기존 화면9개 통과, axe 위반0·가로 넘침 없음·중복 클릭1회·새로고침 복원·수정 시 재확인을 확인했다. 새 화면은 합성 입력과 로컬 PGlite SQL을 연결했으며 운영 Auth/API·실제 과학 원문 검증이 아니다.

최종 PostgreSQL17 물리 연결 경쟁14개 PASS(exit0), 00:17:41~00:18:08 KST. `.local/worker-pg17-input-5bd929149b0b4122816e769c2025247b/result.json`: 최신6개 SQL 해시 일치, stopped=true, PID/임시 평문 암호 없음, 현재 사용자/SYSTEM 전용 ACL 확인. 기존11개와 새 입력 확인/중복 접수/삭제 경합3개 모두 실제 Lock·차단 PID 관찰. 추가 그룹은 별도 검사 DB에서 실행해 월10건 한도와 앞선 불확실 비용 상태를 보존했다.

운영 SQL·앱·Git 원격·실제 키 변경 없음, 유료 호출0회. 기능은 기본 비활성이고 실제 dispatch·제작 시작·게시 버튼은 아직 연결하지 않았다. 링크와 교사 요약을 원문 검토 완료로 표시하지 않는다. OpenAI 키 준비 여부와 자동 승인 검토가 요구한 공개 대상/범위 동의는 답변 대기다. 기존40개 스테이징(2261추가/44삭제)은 그대로, 이번 변경은 미스테이징이다.

최종 업로드 후보209개 문제0, staged/unstaged 공백 검사 통과. 인증 정보 URL을 거부하는 합성 테스트 문자열의 감사 지적을 수정했고 거부 assertion은 유지했다. 원본 자료·환경 파일·검사 캡처·암호/DB 파일은 제외 상태다.

## 2026-10-04 GitHub 제작·검사·보고 워크플로와 컨테이너 래퍼

고정 main/SHA의 `studio-worker`, `studio-generate`, `studio-report` 워크플로3개를 작성했다. 기본 rehearsal, 실제 제작은 별도 설정과 키 없는 Linux2D/3D/실패 감지 rehearsal 성공 뒤에만 시작하도록 했다. 제작·후보 수신·컨테이너 실행·OIDC 보고를 별도 job으로 나누고 후보/보고는 같은 실행의 암호화 산출물로만 전달한다. 서버 dispatch의 고정 mode=generate도 맞췄으며 운영 연결은 아직이다. [상세 구현·검증·남은 범위](WORKER_WORKFLOWS.md).

컨테이너는 공식 Playwright 이미지 digest와 seccomp 커밋/해시를 고정하고 허용 목록으로만 빌드한다. 비관리자·읽기 전용·네트워크 없음·호스트 마운트 없음·권한 제거·메모리2GiB/CPU2/프로세스128·실행65초를 설정하고 실제 Docker 설정 확인 뒤 입력을 전달한다. 삭제를 확인하지 못하면 결과를 통과로 반환하지 않는다. Windows에 Docker가 없어 실제 이미지 빌드/OS 격리·Linux Chromium sandbox 동작은 미검증이다. 키·Docker 권한을 풀어 통과시키지 않는다.

제작실 전체117/117 PASS. 새 컨테이너/전달6개와 기존 통합 테스트의 실제 fetch→암호문 파일→모의 격리 검사→별도 서명 보고→PGlite 저장을 확인했다. Docker·모델·관찰 보고는 이 단위 통합에서 모의 값이다. actionlint1.7.12 공식 릴리스 SHA-256 확인 후 YAML3개 문법/재사용 호출 검사 PASS(exit0); shellcheck·pyflakes는 실행하지 않았다. 이후 dispatch mode 수정 관련4개도 별도 확인했다.

실제 Chrome8사례 재검증 PASS(exit0), 23:55:45 KST, `.local/evidence/worker/runtime-browser-57651b87-ea5f-410c-b177-ffb25192d5a5.json`. 정상2D/3D·고장 감지·별도 프로세스 실패→모의 수정→실제 재검사 성공. 검사 예제는 자체 합성 메타데이터를 사용해 콘텐츠 원본 의존성을 제거했다. 실제 모델/과학/원격 검증 성공으로 확대하지 않는다.

유료 호출0회. 운영 DB/앱·게시·Git 원격·실제 비밀 등록 변경 없음. 기존 공개 승인 질문40개 스테이징(2261추가/44삭제)을 보존하고 새 작업은 미스테이징으로 남겼다. OpenAI 키 준비와 자동 승인 검토가 요구한 공개 대상/범위 동의는 답변 대기다. 입력 승인 UI/API·실제 dispatch/실행번호 결합·OIDC·격리 rehearsal·승인 버전 게시/게시 확인은 계속 구현/검증해야 한다.

최종 업로드 후보201개 검사 문제0, staged/unstaged 공백 검사 통과, 기존40개 스테이징 유지. 비공개 원문·환경파일·.local·생성 결과 제외 확인. `.local/evidence/worker/workflows-6260fb83-d1ce-4adc-9d89-b17d5c819068.json`에 워크플로/컨테이너/dispatch 주요 파일 해시와 검사 범위를 기록했다. 브라우저 요약7개와 수정 과정의 세부2개를 각각 읽어 총9회 실행의 browserStopped=true를 확인했다. 단순 요약 구조를 세부 보고로 읽은 첫 증거 집계 오류는 형식별로 확인하도록 바로잡았으며 브라우저 실패 assertion을 제거하지 않았다.

## 2026-10-04 원격 제작 API 연결·후보 전달 암호화 로컬 검증

원격 제작 진입점과 OIDC/API 클라이언트, 서버 승인 입력/예산/증거/별도 검사 대기/종료 연결을 구현했다. 제작 역할은 실행 결과를 직접 작성하지 않고 보고자가 저장한 같은 버전의 결과만 읽는다. 토큰5초/API20초·응답2.3MB·전체200요청·작업20분·종료 정리30초·시도당40회 검사 대기를 강제한다. 요청 유실의 자동 재전송은 없다. 기본 비활성 진입점은 WORKER_SETUP_REQUIRED로 요청 전에 거부됐다.

보고 역할의 verification API에 준비/대기/종료 응답을 추가했고, 종료 시 원문을 반환하지 않는다. 승인 전 후보의 공개 artifact 평문 노출을 방지하기 위한 AES-GCM/HKDF 전송 모듈을 구현했다. 작업/실행/버전/용도를 인증 데이터로 묶고 인증 완료 후에만 복호화한다. 검사 키만 메모리에서 사용했으며 운영 키 등록·artifact 업로드·워크플로·원격 컨테이너는 아직이다. [상세 범위와 한계](REMOTE_WORKER.md)에 기록했다.

최종 제작실111/111, production build·내장 TypeScript 검사 성공. 합성 RSA+HTTP 처리기+PGlite 실제 SQL로 모의5역할→예산 정산→후보 준비 조회→암호화 전달→별도 보고→사람 승인 대기까지 연결했다. 점유 응답 유실 시1회 전송, 생성 뒤 취소 비용 정산, 응답 유실의 불확실 비용/슬롯 유지, 토큰/본문 읽기 취소, 원문2.2MB 암호화 왕복·변조/다른 작업 거부를 확인했다. 실제 유료 호출0회, 실제 모델/과학/원격 GitHub 검토 성공은 아니다.

인증 SQL의 보고 읽기 범위 변경 후 새 PostgreSQL17 물리 연결 경쟁11개 PASS(exit0), 23:35:37~23:35:57 KST. `.local/worker-pg17-fb497742f56f4e2bbf980c1e49d26e7a/result.json`의5개 SQL 해시 일치·서버 종료·PID/임시 평문 암호 없음·루트 ACL 현재 사용자/SYSTEM 전용 확인. 기존 증거를 보존했다. 새 endpoint 준비/종료 분기는 HTTP/PGlite에서 검사했으며 실제 Actions 검증은 미완료다.

운영 DB/앱·게시·Git 원격·실제 키 변경 없음. 기존 공개 승인 요청40개 스테이징은 그대로이며 이번 구현은 미스테이징이다. OpenAI API 키 준비 여부와 자동 승인 검토가 요구한 공개 대상/범위 동의는 답변 대기다.

후보 패킷의 허용되지 않은 추가 필드도 거부하도록 마무리한 뒤 관련11개를 다시 통과했다. 최종 업로드 후보184개 검사 문제0, staged/unstaged 공백 검사 통과, 기존 스테이징40개/2261추가/44삭제 유지. 비공개 원문·환경파일·.local·검사 결과의 Git 제외를 확인했다.

## 2026-10-04 실제 2D·3D 브라우저 검사와 실패→수정 연결

후보 소스 검사·별도 프로세스·Chrome 조작 검사·보고 스키마를 구현했다. 과제의 2D/3D 종류와 입력/후보/기준 코드 해시를 결합하며 제작기에 고정 조작/관찰 계약을 전달한다. 변수 조작·결과/화면 변화·초기화·카메라·대체 설명을 측정하고 보고 API에 버전과 관찰 기록을 보존한다. 기존 콘텐츠나 공개 주소를 변경하지 않았다. [구현과 한계](WORKER_RUNTIME.md)에 OS 격리 미검증·모의 조건과 실제 실행을 구분했다.

Chrome154.0.8037.93 실제 검사8개 기대 결과 일치(exit0). 2D·WebGL3D 정상 예제는 통과, 초기화 고장·정지된 그림·외부 fetch·가짜 PASS·무한 루프는 실패로 잡았으며 브라우저 종료를 확인했다. 별도 프로세스 통합 사례에서 초기화 실패 후보→모의 수정 응답→실제 재검사 통과→모의 독립 검토→사람 검토 후보까지7회 역할 호출로 연결했다. 첫 실패와 후보 버전은 보존하고 승인/게시를 생성하지 않았다. 모델/과학 검토는 모의이며 유료 호출0회다.

23:18:13 KST 증거 `.local/evidence/worker/runtime-browser-77bb9dcd-d54d-4150-b96b-1f77aa5a524e.json`, 앞선6사례도 보존했다. 기준 SHA는 합성 값이고 WebGL 불가는 모의 조건이다. 실제 GitHub 토큰·Actions·원격 격리·생성 교육 콘텐츠·교과 정확성 검증으로 확대하지 않는다. 실제 후보는 폐기 가능한 별도 원격 job과 OS 자원/네트워크 제한을 검증한 뒤 실행해야 한다.

제작실 단위/SQL/HTTP97개 통과, production build와 내장 TypeScript 검사 성공. 관찰 없는 통과 보고·다른 입력 해시 거부, 소스 실패로 브라우저 미실행일 때의 수정과 진짜 미실행 보류를 검사했다. SQL 변경이 없어 앞선 실제 PostgreSQL11개 결과는 보존하고 반복하지 않았다. 기본 활성화 차단·운영 SQL 미적용·API 키/공개40개 승인 대기는 유지한다. 이번 구현은 기존40개 스테이징에 추가하지 않았다.

최종 업로드 후보174개 검사 문제0, Git diff 공백 검사 통과, 기존 스테이징40개/2261추가/44삭제 유지. 비공개 폴더·환경파일·원본 PDF·생성 결과 제외를 확인했다.

## 2026-10-04 작업자 인증·HTTP API 로컬 연결 검증

GitHub OIDC 서명 검증과 DB의 일회용 토큰 영수증, 작업/실행/코드 버전 결합, 제작·검사 보고 역할 분리, 예산/증거 저장 HTTP API를 추가했다. jose6.2.12를 정확히 고정했다. 실제 저장소 API에서 숫자 ID와 immutable OIDC subject 설정을 확인했으며 이름만 있는 과거 형식을 사용하지 않았다. 서명 검사는 합성 RSA 키로 수행했다. 실제 GitHub 발급 토큰이나 신규 Actions 워크플로는 아직 실행하지 않았다. 자세한 구현·제한·근거는 [WORKER_AUTH](WORKER_AUTH.md)에 기록했다.

최종 제작실 검사92/92, 기존 자료실 검사26/26, 타입 검사·production build 성공. 초기 빌드는 로컬 파일 도구의 import.meta.dirname 의존성으로 실패해 파일 읽기가 없는 공통 경로/해시 모듈을 분리했다. 이후 자료실 fixture의 새 파일 누락을 수정했고 sandbox realpath 거절은 일반 사용자 문맥에서 동일 검사를 수행해 해소했다. 실패 검사나 경로 보호를 제거하지 않았다. 빌드한 실제 로컬 서버에서도 worker 비활성 POST503/GET405/no-store를 확인하고 서버를 종료했다.

23:02:23~23:02:38 KST 새 loopback PostgreSQL17에서 독립 물리 연결 경쟁11개 PASS(exit0). 이전9개에 토큰 ID 재사용 PT409, 다른 코드 SHA 접근 PT403을 추가했다. 각 사례에서 실제 Lock/차단 PID를 확인했다. `.local/worker-pg17-e231d8812e5f4ccf91e7418b9f321525/result.json`의 5개 SQL 해시 일치, 서버 종료·PID/임시 평문 암호 없음·사용자/SYSTEM 전용 루트 ACL 확인. 이전 실행 증거도 보존했다.

worker API/예산 gate는 기본 차단, 예산/worker/auth SQL은 운영 미적용이다. 실제 생성 코드 브라우저 검사, AI·과학/교육과정 검토, GitHub 작업, 승인·게시·게시 확인은 미완료이며 유료 호출0회다. 운영 앱과 공개 콘텐츠를 변경하지 않았다. 공개 반영 승인 요청의 기존40개 스테이징(2261추가/44삭제)은 유지하고 이번 추가 구현은 미스테이징으로 보존했다. API 키 준비 여부와 자동 승인 검토가 요구한 공개 범위 동의는 여전히 답변 대기다.

최종 업로드 후보164개 패턴 검사 문제0, staged/unstaged diff 공백 검사 통과. .local·환경파일·원본 PDF·빌드 결과의 Git 제외를 유지했다. 이는 공개 권한이나 모든 형태의 비밀값 부재를 증명하는 검사는 아니다.

## 2026-10-04 실제 작업 저장소 로컬 연결·PostgreSQL 두 연결 검증

앞선 목표 진행 턴은 실행기 구현·67검사 통과로 실제 진전이 있었다. 이번에는 worker DB 검토 SQL과 저장소 어댑터를 추가했다. 검토된 입력/실행번호/예산을 결합한 원자적 접수, 중복 점유 거부, 비공개 증거 기록, 취소, 버전이 일치하는 사람 승인 대기 상태까지 연결했다. 기본 실행 gate=false, 운영 SQL 미적용이며 실제 생성 코드 검사기와 OIDC·게시 기능은 아직 연결하지 않았다. 자세한 범위와 미검증 사항은 [WORKER_STORE](WORKER_STORE.md)에 기록했다.

최종 `npm.cmd run test:studio` 76/76, exit0. 새9개 검사에는 기존 mock 작업 행 불변/기존 RPC 동작과 PGlite 실제 SQL→모의 API 다섯 역할→예산 정산→증거8개→awaiting_approval 통합 사례가 포함된다. 취소·완료 경합에서 취소가 우선하며 후보/검사/검토의 순서·시도·해시가 다르면 승인 대기로 넘어가지 않도록 보완했다. 실제 AI/과학 검토는 실행하지 않았다.

새 로컬 PostgreSQL17의 독립 물리2연결로 최종9사례 경쟁검사 PASS(exit0). 21:53:42~21:53:57 KST, 127.0.0.1:55443. 선행 트랜잭션을 열린 상태로 두고 후행의 실제 Lock/차단 PID를 확인한 뒤 해제했다. 접수/점유 중복, 취소의 두 순서, 완료 직전 취소, API 예약과 취소, 정산과 종료, 과금 불확실 종료 뒤 늦은 정산 거부를 확인했다. 최종 증거 `.local/worker-pg17-fd182d18647049a1b0eabb5aad1b20ef/result.json`과 현재4개 SQL 해시 일치. 앞선8사례 결과도 보존했다.

검사 서버 정상 종료·postmaster.pid 없음·임시 평문 암호 제거·검사 루트 ACL 상속차단/현재 사용자와SYSTEM 전용을 확인했다. 운영 암호·환경파일·DB를 사용하지 않은 가상 데이터 검사였다. 전역 설치·서비스·네트워크 설정 변경 없음. 운영 앱, 유료 호출0회, 공개 저장소 상태는 이전과 같다. 승인 요청한40개 파일의 스테이징은 보존하고 새 파일/문서 추가는 로컬 미스테이징 상태로 남겼다. 자동 승인 검토의 공개 범위 동의 요청과 API 키 준비 여부는 답변 대기다.

추가 업로드 후보 검사153개에서 문제0을 확인했다. 비공개 폴더·환경파일·원본 교육과정 PDF의 제외 유지. Git 스테이징은 여전히40개/2261추가/44삭제이며 이번 저장소 구현을 포함하지 않는다. 공개 업로드·운영 적용 승인이나 실제 게시 성공을 뜻하지 않는다.

## 2026-10-04 비용 제한 실행기 로컬 구현·공개 업로드 승인 대기

사용자 확정 예산 월10,000원/월약10건에 맞춰 Responses API 비용 예약·정산 어댑터, Supabase 예산 RPC 연결, 생성 파일 범위/해시 검사, 역할별 별도 문맥→검토→최대2회 수정 파이프라인을 로컬 구현했다. 2D/3D 입력을 구분하고 3D는 우선 브라우저 WebGL/직접 작성 자산 범위다. [실행기 구현과 한계](BOUNDED_RUNNER.md)에 고정 모델·공식 가격 출처·입력24,000/개발출력16,384/검토출력4,096토큰·9회/20분 한도와 미연결 경계를 기록했다.

새 실행기 검사25개를 포함한 `npm.cmd run test:studio` 67/67, exit0. API 전송은 모두 모의 응답, 실제 SQL 연결은 PGlite 가상 DB였다. 최초 연결 검사는 기존 DB에 없는 needs_review 상태를 사용하여 실패했고 실제 허용 상태 needs_input으로 수정해 다시 통과했다. 예산 예약/정산·중복 거부, 생성 후 취소 비용 처리, 시스템 경로 거부, 후보 버전 검토 결합, 최대2회 수정과 실패 기록 유지, 미실행 검사 보류를 확인했다. 실제 AI 제작·독립 검토·과학/교육과정 검증·3D 실행·게시 검증 성공으로 해석하지 않는다. 유료 호출0회, 예산 SQL 운영 미적용, 운영 앱은 아직 모의 실행이다.

기존 공개 저장소 대상 커밋·push·PR 생성 요청은 자동 승인 검토에서 차단됐다. 사유는 일반적인 게시 요청만으로는 공개 대상과 넓은 코드/문서 범위의 명시적 동의가 충분하지 않고 프로젝트 정보가 노출될 수 있다는 것이었다. 로컬 브랜치 codex/studio-v2-budget의 검토한40개 파일을 구체적으로 설명하고 PR→main→기존 Vercel 제작실 재배포 승인을 요청했다. 실제 커밋·push·PR·재배포는 아직 실행하지 않았다. 비공개 검토안은 `.local/studio-v2-release-review.md`다.

그 후 작성한 실행기4개·검사4개·이 문서의 최신 추가분과 BOUNDED_RUNNER는 로컬 미스테이징으로 분리했다. 승인 요청한40개 파일의 기존 스테이징 내용은 바꾸지 않았다. OpenAI API 키 준비 여부와 공개 반영 승인이 답변 대기다. 키·DB 암호·비공개 원문을 채팅이나 공개 파일로 요청하지 않았다.

최신 업로드 후보 검사147개에서 문제0, `.local`·환경파일·원본 교육과정 PDF·생성물·CLI 임시 파일의 제외를 확인했다. 패턴 검사 결과이며 임의 인코딩 비밀값이나 자료의 공개 권한 전체를 입증하지 않는다. 새 실행기 파일9개는 현재 공개 반영 요청 범위에 자동으로 추가하지 않았다.

## 2026-10-04 운영 v2 적용 완료·비용 제한 SQL 로컬 검증

공식 Supabase CLI2.119.0 Windows 배포본을 `.local/tools`에만 준비하고 공식 checksums.txt의 SHA256 `db4a6ec26d182408ca605efc0d0d938720bd2d8d39541e79c7d69043897affb9`와 대조했다. 전역 설치/PATH 변경 없음. CLI migration new로 `20261004111955_studio_v1_baseline.sql`, `20261004111958_studio_v2_conversations.sql`을 생성했고 기존 검토 SQL의 바이트 해시를 보존했다.

운영 백업을 복원한 로컬 DB와 빈 DB에 실행한 기준선을 대조했다. 최초 함수 본문 CRLF/LF 차이로 실패해 원인을 확인했고, 문자열 상수의 의미를 바꾸지 않는 해당 검토 함수의 줄바꿈만 비교 시 정규화했다. 두 번째 실패는 로컬 auth 대체 스키마의 postgres USAGE 누락이었고 해당 로컬 의존 권한만 보완했다. 실패 기록2개는 보호 폴더에 보존했다. 최종 기준선 구조/권한 일치, v2 적용, 기존 데이터 보존, 삭제 gate=false와 서버 정상 종료를 확인했다. 운영 보안 설정을 완화하거나 실패 조건을 삭제하지 않았다.

20:24:37~20:24:42 KST `apply-conversation-v2.mjs ... apply` exit0/PASS. 직전 읽기 전용 fingerprint가 백업 시점과 일치함을 확인한 뒤 CLI migration repair로 **v1 이력만 기록**했다(v1 재실행 없음). db push --dry-run에서 v2 하나만 대기함을 확인하고 --skip-vault로 적용했다. 운영 기존 8개 테이블의 v1 열 데이터 해시 불변, 로컬 v2 구조/권한 지문 일치, 두 migration 이력 및 삭제 잠금 유지 확인. 별도 실제 Data API에서 capabilities=2, deleteEnabled=false, 오류null을 확인했다. 새 대화·작업 검사용 운영 데이터는 만들지 않았다.

예산 요구를 `config/execution-budget.json`에 저장했다. 월10,000원/10접수, 작업1,000원, 동시1, 수정최대2, 작업20분/호출90초·최대9회. 내부 환산 2,000원/USD는 환율 시세가 아니라 보수적 예산 계산값이며 공급사 최종 청구의 원화 하드캡을 보장하지 않는다. 별도 유료3D 자산·음성 서비스는 포함하지 않는다. 실패·취소 접수도 월 건수에 포함하는 보수적 구현이다.

`studio_budget_v1.sql`은 **아직 운영 미적용**이다. DB의 단일 정책 행 잠금으로 프로젝트 전체 작업 예약, 호출 전 비용 예약, 중복 호출 ID 충돌/재전송 금지, 정산·과금 불확실 유지, 월 경계·만료 처리, 과금 초과 탐지 시 비활성화를 구현했다. 브라우저/anon 권한 없음, 기본 enabled=false. PGlite 실제 SQL 검사7/7 통과: 기본 차단·권한, 소유자/real 모드, 중복·프로젝트 동시 슬롯, 호출/작업/월 금액·월10건, 취소, 불확실 과금·초과, 월 경계. 단일 연결 엔진의 검사이며 다중 연결 경쟁과 실제 API 비용 검증을 대신하지 않는다. 실행기/API/OIDC 연결은 미완료, 유료 호출0회.

이번 적용 후 제작실 기존 단위·SQL 검사35/35, 타입 검사, production build 성공. 새 예산7개는 별도로 통과했다. 제작실 브라우저 검사9/9(exit0), 공개 업로드 후보 검사 문제0을 확인했다. CLI가 만든 supabase/.temp는 Git 제외했다. Vercel get_project는 성공했지만 팀 범위 list_deployments는403으로 현재 커넥터의 범위 부족을 확인했다. 운영 앱은 아직 기존 배포 화면이며 새 앱 업로드·배포 확인은 진행 중이다.

## 2026-10-04 운영 studio 백업·격리 복원 완료, 자동 제작 연결 재개

사용자가 과제 입력→시뮬레이션 제작→검토·수정→게시까지 계속 진행하도록 요청했다. 월 OpenAI API 예산 10,000원, 월 약 10건과 구체적·3D 시뮬레이션 지원 요구를 확정했다. 과거 단계별 대기 기록은 당시 범위이며 현재 재개 지시와 구분한다. 아직 유료 AI 호출은 0회다.

앞선 TLS 판정의 과도한 조건을 바로잡았다. [Supabase 공식 백업 안내](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)는 Session pooler를 기본 경로로 안내한다. PC→pooler의 CA/호스트 verify-full을 필수로 유지하고 DB backend의 pg_stat_ssl은 별도 구간 관찰로 보존한다. Session에서는 DB 측 false를 기록하면서 백업을 허용하고, Direct에서는 계속 DB 측 true도 요구한다. 대상 DB·읽기 전용·studio·PG17·알 수 없는 관찰값 차단은 유지했다. 새 판정/비공개 필드 제거 검사 7/7 통과. 과거 FAIL 원본과 실제 false 관찰은 수정하지 않았다. Direct DNS는 이번에도 조회 불가였으며 Direct DB 접속은 하지 않았다.

실제 실행은 `automation/studio/backup-and-restore.mjs`, 20:15:39~20:16:08 KST, exit0/PASS다. 원격은 읽기 전용 snapshot 세션과 해당 snapshot을 사용하는 pg_dump 2연결로 제한했다. 연결10초, SQL30초, dump/restore 각120초, 본 작업300초와 종료 정리30초 상한. pg_dump17.11 custom studio 백업 45,476bytes, SHA256 `a7241059d3e5628fdc4702ed05f1d2bae045b4e817f4a020258a42167357ac9f`. 원격 데이터·계정·권한·A 세션 변경 없음.

새 로컬 PostgreSQL17.11의 127.0.0.1:55442/빈 studio_restore에만 복원했다. 8개 테이블 데이터 해시와 스키마·테이블·열·함수 소유자/ACL, 제약·인덱스·RLS/policy 지문 일치. 복원 DB에서 authenticated 타인 행0, 직접 UPDATE 거부, service_role 생성 RPC 성공 후 ROLLBACK과 최종 데이터 해시 불변을 확인했다. 실제 Auth 데이터는 복사하지 않았으며 studio 내부 FK UUID와 auth.uid 대체 함수만 로컬 의존물로 준비했다. 전체 Supabase/Auth/Storage 복구 검사가 아니다.

비공개 증거는 `.local/studio-v1-backup-20260916/run-20261004-28b03e0c9e134fd2951eb4f948849979`에 보존한다. DPAPI 암호·백업·DB·로그 전부 Git 제외, 모든 자식 ACL 현재 사용자/SYSTEM만, 임시 평문 초기 암호 파일 제거를 확인했다. localServerStopped=true 및 postmaster.pid 없음. 서버는 SCRAM 전용·loopback으로 실행했고 앱에는 연결하지 않았다.

실제 GitHub CLI 인증은 일반 사용자 문맥에서 정상이며 저장소 권한 조회 성공(repository_id 1368255570). sandbox 안의 keyring 접근 실패를 토큰 만료로 오판하지 않았다. 저장소 Actions Secret 목록은 비어 있고 로컬 앱 환경에도 OpenAI API/GitHub App 변수가 없다(값을 읽어 출력하지 않음). Supabase 연결은 ACTIVE_HEALTHY/PG17로 확인했다. 다음은 v1 기준선 이력과 v2 호환 변경, 예산 강제 및 실제 실행기 연결이다. 운영 v2/runner/삭제 활성화·유료 호출·새 배포는 아직 하지 않았다.

## 2026-10-04 추가 진단1회 완료 — DB 측 TLS=false 확인

사용자가 추가 읽기 전용 진단1회를 승인한 뒤 준비된 단일 실행 도우미를 실행했다. 2026-10-04 20:04:12 KST 종료, preflightRuns1/exit1, REMOTE_TARGET_OR_TLS_CHECK_FAILED다. 이번 재개 작업에서 원격 접속은 최초1회+별도 승인된 진단1회 총2회이며 추가 반복은 없다. 실패 표식과 원본 안전 결과를 .local 보호 폴더에 각각 보존했다.

| 실제 반환 항목 | 결과 |
|---|---|
| queryCompleted / clientVerifyFull | true / true |
| database_ok / read_only / studio_exists | 모두 true |
| server_major | 17 |
| DB 측 pg_stat_ssl.ssl / version | false / null |

현재 암호로 DB 인증과 확인 SQL이 성공했고, 대상 DB·읽기 전용·studio 스키마·PostgreSQL17도 확인됐다. PC→공식 Session pooler는 기존 CA와 verify-full로 접속했으므로 해당 구간의 TLS/호스트 검증은 성공이다. 실패 원인은 기존 판정에서 요구하는 DB 측 tls=true가 충족되지 않은 것이다. 비밀번호 재입력이나 재설정은 현재 실패의 해결 조치가 아니다.

PostgreSQL17 공식 문서에서 pg_stat_ssl은 해당 backend 연결의 SSL 사용 여부를 나타내고, SSL 미사용이면 version이null임을 확인했다. Supabase 공식 문서의 pooler 중간 연결 구조를 함께 보면 이번 false는 DB가 관찰하는 중계 서버 쪽 연결에 대한 결과이며 PC→pooler 검증 결과와 분리해서 해석해야 한다. 전체 전송 경로가 암호화됐다고 확대하지 않으며 Supabase의 모든 프로젝트·내부 연결 기본값으로 일반화하지 않는다. 근거: [PostgreSQL pg_stat_ssl](https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-PG-STAT-SSL-VIEW), [Supabase 연결 구조](https://supabase.com/docs/guides/troubleshooting/monitor-supavisor-postgres-connections), [verify-full 안내](https://supabase.com/docs/guides/database/connecting-to-postgres#ssl).

현재 **DB 인증과 읽기 전용 연결은 확인, 기존 전체 검사 결과는 FAIL 유지**다. 실패 조건을 삭제하거나 TLS 검증을 완화하지 않았다. 후속으로 DB까지 직접 TLS를 검증하는 Direct 연결 경로의 사용 가능성을 확인할 수 있으며, 과거 Direct DNS 실패는 아직 해소 확인이 없다. 이번에는 Direct 접속을 추가하지 않았다.

운영 백업/복원·DB/계정/권한/환경값 변경·v2/runner·커밋·push·배포는 하지 않았다. 이번 추가 진단에서는 검사 코드를 수정하지 않고 실제 결과만 문서에 반영했다.

## 2026-10-04 DB 인증 성공·확인 SQL 실행 — 최종 항목 검사 실패

사용자 재입력 후 실제 입력 표식 SAVED, DPAPI 왕복·ACL 확인 true와 암호 파일 갱신을 확인했다. 승인된 Session pooler에서 기존 backup-preflight.mjs를 **1회** 실행했다. 결과는 REMOTE_TARGET_OR_TLS_CHECK_FAILED, preflightRuns1, exit1이다. 완료 시각은 2026-10-04 19:58:21 KST다. 원본 안전 결과와 단일 실행 표식은 .local 보호 폴더에 보존했다.

이 오류는 psql이 정상 종료하고 확인용 SELECT의 JSON 파싱까지 끝난 뒤에만 발생하는 코드 경로다. 따라서 이번 실행에서 DB 비밀번호 인증·확인 SQL 실행 및 PC→공식 Session pooler 구간의 verify-full 연결은 성공했다. 기존 DATABASE_PASSWORD_AUTHENTICATION_FAILED와 구분한다. 다만 database_ok/read_only/tls/server_major/studio_exists 중 적어도 한 항목이 기존 조건을 통과하지 못했다. 기존 검사기가 실패 시 개별 반환값을 버려 어느 항목인지와 실제 TLS 버전은 이번 결과로 확정할 수 없다. 전체 접속 검증 완료로 처리하지 않는다.

추가 접속 없이 실패 진단 출력을 보완했다. backup-checks.mjs는 고정된 확인 필드의 boolean/null·허용 TLS 버전·제한된 숫자만 반환하고, backup-preflight.mjs가 SQL 완료 후 실패할 때 해당 필드를 남긴다. 성공/실패 기준, TLS 검증, SQL, 시간 제한은 바꾸지 않았다. 로컬 구문 검사와 tests/studio/backup-checks.test.mjs 4/4가 통과했다. 이는 비공개 필드 제외·실패/미확인 값 보존 검사이며 운영 연결 재검사가 아니다.

공식 Supabase 문서의 pooler 중간 연결 구조와 PostgreSQL17 pg_stat_ssl 설명을 확인했다. PC→pooler 연결과 pg_stat_ssl이 관찰하는 DB 측 연결은 구분해야 하며, 이 구조가 이번 실패 원인이라는 판단은 아직 가설이다. 근거: https://supabase.com/docs/guides/troubleshooting/monitor-supavisor-postgres-connections 및 https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-PG-STAT-SSL-VIEW .

기존 승인 계획의 접속1회 상한을 사용했으므로 재접속하지 않았다. 기존 실패 기록을 보존한 별도 단일 실행 진단 도우미를 준비했으며, 추가 읽기 전용 조회1회는 사용자 승인 대기다. 비밀번호 재입력은 필요하지 않다. 운영 백업/복원·DB/권한/계정/환경값 변경·v2/runner·커밋·push·배포 없음.

## 2026-10-04 숨김 입력 후 파일 교체 오류 수정 — 재입력 대기

사용자가 다른 작업 폴더의 VS Code PowerShell에서 절대 경로로 입력 도우미를 실행했고, 두 번 입력 후 LOCAL_INPUT_FAILED가 표시됐다고 보고했다. 완료 표식의 실패 단계는 replace였고 실제 암호 파일 수정 시각은 여전히 2026-09-16이었다. 입력 일치·DPAPI 왕복·후보 파일 ACL 확인 이후 기존 파일 교체에서 실패했으며 DB 접속 표식은 없었다. 도우미가 절대 경로를 사용하므로 터미널의 현재 폴더가 원인은 아니다.

실제 암호를 사용하지 않는 더미 파일로 재현했다. PowerShell에서 File.Replace의 세 번째 string 인자에 $null을 전달하면 빈 문자열로 변환되어 ArgumentException(path)이 발생했고 원본은 보존됐다. [NullString]::Value로 명시적 .NET null을 전달한 동일 더미 교체는 성공했다. 보호 폴더의 기존 password-input-20261004-b7c93d.ps1 한 줄을 수정하고 실패 안내에 단계 표시를 추가했다. ACL·실행 정책·운영 설정은 변경하지 않았다.

수정된 도우미의 전체 암호화·파일 교체·복호화 경로를 별도 더미 파일과 합성 입력으로 검사했다. PowerShell7 및 WindowsPowerShell5 모두 exit0/SAVED, DPAPI 왕복·저장값 일치·ACL 확인·임시 파일 제거 성공이었다. 비대화형 자체 검사에서만 숨김 입력을 합성 입력으로 대체했으며 사용자 실제 입력 성공이나 DB 인증 성공으로 취급하지 않는다. 실제 암호 파일은 검사 전후 동일 수정 시각을 유지했고 실제 접속0회다.

실패한 입력의 후보 파일은 도우미가 정리했으므로 현재 비밀번호 재입력이 필요하다. 같은 절대 경로 명령을 다시 실행해 암호화 저장 완료를 확인한 뒤 기존 승인 범위의 읽기 전용 접속 1회를 진행한다. 사용자 비밀번호·연결 문자열·원문 오류는 출력하지 않았다. 운영 백업/복원·DB 변경·v2/runner·커밋·push·배포 없음.

## 2026-10-04 백업 접속 재개 — 사용자 숨김 입력 대기

사용자가 현재 DB 비밀번호 준비와 접속 확인 계획 실행을 요청했다. 이번 범위는 로컬 DPAPI 암호 갱신과 기존 Session pooler의 읽기 전용 접속 1회 확인까지이며 운영 백업·복원은 후속 단계다.

기존 보호 폴더와 connection.json/db-password.dpapi/server-ca.crt의 ACL을 읽기 전용으로 확인했다. 폴더 상속 차단, 허용 주체가 현재 Windows 사용자/SYSTEM뿐임, reparse point 없음과 Git 제외를 확인했다. 암호 파일 수정 시각은 아직 2026-09-16이다. 더미 문자열의 DPAPI 암호화·복호화 자체 검사와 입력/접속 도우미 구문 검사는 성공했다. 실제 비밀번호를 이 자체 검사에 사용하지 않았다.

별도 PowerShell 입력 창 실행은 입력 단계 LOCAL_INPUT_FAILED로 종료됐고 사용자가 창이 보이지 않는다고 보고했다. 기존 암호 파일은 바뀌지 않았으며 DB 접속은 없었다. 사용자 본인이 연 PowerShell에서 두 번의 숨김 입력을 대조하고 DPAPI 왕복 검증 후 암호화 파일을 교체하는 대체 도우미를 .local 보호 폴더에 준비했다. 입력 완료 안내를 요청한 상태이며 아직 저장 성공으로 처리하지 않는다.

접속 도우미는 입력 성공 기록·ACL·승인된 Session pooler 대상 확인 후 기존 backup-preflight.mjs를 1회만 호출하도록 준비했다. verify-full/기존 CA, 연결 제한10초·검사 타이머20초, 읽기 전용 SQL과 단일 실행 표식을 유지한다. 원문 암호·연결 문자열·psql 오류를 출력하지 않고 허용된 결과 필드만 기록한다. 현재 실제 접속0회, 인증/TLS/대상 DB 확인 미실행이다.

현재 사용자 숨김 입력 대기. 운영 DB/계정/권한/환경값 변경·백업/복원·v2/runner 적용·커밋·push·배포 없음. 기존 앱 코드와 미커밋 변경을 보존했다.

## 갱신한 백업 암호 재확인 — 인증 거절 유지

사용자가 숨김 입력으로 로컬 DPAPI 암호 파일을 갱신했다고 알린 뒤, 공식 Session pooler에 verify-full/기존 CA/읽기 전용 조건으로 인증을 **1회** 확인했다. 결과는 다시 DATABASE_PASSWORD_AUTHENTICATION_FAILED, 검사 프로세스 exit1이다. 암호 저장 완료는 실제 DB 인증 성공을 뜻하지 않으며 비밀번호가 잘못됐다고 원인을 확정하지 않는다. 같은 접속을 반복하지 않았다.

운영 백업·로컬 복원은 미실행, dump 없음. 운영 SQL·비밀번호·계정·권한·환경값·원격 이력 변경, v2/runner 적용, 커밋·push·배포 없음. 인증정보는 출력하지 않았다. 연결 대상·인증 경로 원인 추가 확인 전 대기한다.

## 2026-09-16 Session pooler 진단 — DB 인증 단계 실패

사용자가 공식 Connect → Session pooler 파라미터를 대조한 뒤 재검사했다. 비공개 connection.json의 호스트 형식(공식 서울 리전 pooler), 프로젝트별 사용자, 5432 포트, postgres DB가 모두 일치했다. 호스트에 프로토콜/경로/포트/자리표시자/공백 없음. connectionMode만 빈칸이어서 검증된 host/user 조합으로 메모리에서 session을 판별하도록 사전 검사기를 보완했다. 입력 파일과 기존 암호는 변경하지 않았다.

일반 Windows 사용자 실행 문맥에서 **Windows 기본 이름 조회 3개 성공, Node dns.lookup 3개 성공**. Node resolve4/resolve6은 각각 ECONNREFUSED였으나 직접 DNS 질의 경로의 실패이며 OS/psql 실패로 일반화하지 않았다. PC DNS/hosts/방화벽/VPN/보안 설정, 외부 DNS/강제 IP를 사용하거나 변경하지 않았다.

PostgreSQL17 psql 실제 1회 접속: verify-full, 기존 CA 파일, 연결 제한10초/전체20초, 읽기 전용 옵션을 유지했다. 결과 **DATABASE_PASSWORD_AUTHENTICATION_FAILED**(`password authentication failed`로 분류, psql exit2 / 래퍼 exit1). 연결된 서버의 인증 거절까지 도달하여 DNS/TCP 및 verify-full TLS/호스트 검사 경로를 통과한 근거가 된다. 현재 CA가 pooler에 유효하다는 판단은 이 실제 접속 결과에 근거하며 Direct 인증서를 무조건 호환한다고 가정하지 않았다. 인증 성공 후 실행할 SELECT/pg_stat_ssl 조회는 실행되지 않아 TLS 버전·DB 내부 대상 조회는 미검증이다. 원문 오류/사용자/암호는 출력하지 않았다. 서버가 SQLSTATE 숫자를 제공한 것으로 기록하지 않는다.

**도달 단계: DNS 성공 → TCP/TLS/호스트 검사 이후 DB 인증 거절 → 백업 미실행.** 운영 studio 데이터/구조 백업·로컬 복원 모두 미실행, dump 생성 없음. 운영 SQL·데이터·계정·비밀번호·권한·A 세션·원격 이력 변경 없음. 로컬 복원 서버 시작 없음. 같은 실패 접속을 반복하지 않았다.

다음 필요 사항은 사용자 측에서 저장한 DB 비밀번호가 science-studio의 PostgreSQL 비밀번호인지 확인하는 것이다. Auth 교사 비밀번호/API Secret이 아니며 채팅으로 보내지 않는다. 이번 작업에서 재설정·교체하지 않는다. 인증 문제가 해소되기 전에는 v2/runner·삭제 활성화·커밋·push·배포로 진행하지 않는다.

## 2026-09-16 운영 v1 백업 접속 확인 — DNS 단계 실패

사용자 입력 완료 후 비공개 파일을 프로그램 내부에서만 로드했다. 폴더 ACL 보호·허용 주체 확인. `automation/studio/backup-preflight.mjs`로 검증. 필수 연결값 일치, 빈 connectionMode는 정확한 승인 대상 Direct host/user 조합에서 메모리로만 판별(connection.json 미수정). 인증서 중복 확장자 server-ca.crt.crt를 확인하여 X509 CA/유효기간 검사 후 원본 보존·server-ca.crt 복사. DPAPI 암호 로드 성공, 인증값 출력 없음.

verify-full/공식 CA/읽기 전용 연결 시도는 **DNS_RESOLUTION_FAILED**로 실패했다. 후속 DNS 진단은 Windows OS lookup ENOTFOUND, A/AAAA 별도 조회 ECONNREFUSED. DNS 서버 조회 거부이며 DB 포트 거부로 간주하지 않는다. 실제 TLS/호스트 검증 및 DB 비밀번호 인증에는 도달하지 못해 **미검증**이다. 인증서 파일의 구조 통과와 실제 TLS 성공을 구분한다. 원인이 IPv6 부재인지 보안/DNS 경로인지 아직 확정하지 않았다.

**운영 studio 백업·로컬 복원 모두 미실행**, dump 산출물 없음. 운영 DB 연결 성립 전 실패, 원격 SQL/데이터/계정/권한/세션/이력 변경 없음. 로컬 복원 서버 시작 없음. SSL 검증 완화·네트워크 설정 변경·비밀번호 변경·유료 옵션·v2/runner·커밋·push·배포 없음.

상세 실패 지점과 다음 조치는 [STUDIO_V1_BACKUP.md](STUDIO_V1_BACKUP.md)에 기록. PC의 Direct 호스트 이름 조회 경로 확인을 기다린다. 입력 파일/키/비밀번호/백업 본문을 대화·보고서에 출력하지 않았다. 기존 미검증 항목은 유지한다.

## 2026-09-16 운영 studio v1 백업 — 연결 입력 대기

사용자가 운영 studio 스키마/데이터의 비공개 로컬 백업과 새 로컬 격리 DB 복원을 승인했다. 기존 성공한 두 연결/가상 백업 검사를 반복하지 않았다. 기존 Git 미커밋 작업을 보존했다.

프로젝트 목록 읽기 도구로 science-studio/ACTIVE_HEALTHY/PostgreSQL17 대상 확인. pg_dump용 승인된 직접 DB 접속 설정·암호·CA는 발견하지 못했다(환경변수와 기본 libpq 파일의 존재 여부만 확인). Supabase 도구의 SQL 권한/API Secret은 pg_dump DB 인증을 대신하지 않는다. 운영 데이터를 SQL 도구로 우회 추출하지 않았다.

기존 공식 배포 경로 기록 재확인, ZIP SHA256 기존값 일치, pg_dump17.11 실행 확인. 공식 서명/체크섬 대조 미확인은 유지한다. `.local/studio-v1-backup-20260916`을 새로 만들고 ACL 상속 차단·현재 Windows 사용자/SYSTEM만 접근하도록 실제 확인했다. 빈 연결 입력 파일 connection.json을 준비했고 Git 제외 확인. 실제 비밀번호/CA/백업은 아직 없다. 앱 .env.local/Vercel 환경값 변경 없음.

**운영 백업: 미실행. 로컬 복원: 미실행. 실제 TLS/호스트 검증: 미검증.** 입력 대기이며 실패 파일이나 성공 백업으로 기록할 산출물은 없다. 운영 DB/계정/권한/세션을 변경하지 않았고 로컬 복원 서버도 시작하지 않았다.

[STUDIO_V1_BACKUP.md](STUDIO_V1_BACKUP.md)에 Supabase Connect·인증서 메뉴, VS Code 입력 파일, DB 비밀번호를 표시하지 않고 DPAPI로 저장하는 직접 입력 절차를 기록했다. 사용자는 연결 파라미터·공식 CA·DB 비밀번호를 로컬에 준비한 뒤 알려주면 된다. 채팅으로 인증정보를 요구하지 않는다. 전체 프로젝트 백업이 아닌 studio 범위 한정 백업이며, 실제 v2 적용 직전에 새 데이터가 생겼으면 갱신해야 한다.

운영 SQL 적용·v2/runner·삭제 활성화·원격 migration 이력·커밋·push·배포 없음. 기존 미검증 항목은 유지한다.

## 2026-09-16 후속 — PostgreSQL 17 실제 두 연결·백업 복원 완료

사용자 승인 범위 안에서 공식 PostgreSQL Windows 페이지→EDB Windows x64 ZIP 17.11-3을 받아 프로젝트 .local 아래에만 준비했다. postgres/pg_dump/pg_restore 17.11 확인. 별도 공식 ZIP 체크섬은 확인되지 않았고 핵심 실행파일 Authenticode는 NotSigned였으므로 서명 검증 성공으로 기록하지 않는다. 배포 경로·로컬 해시·정확한 위치와 재시작/종료 명령은 [POSTGRES17_REHEARSAL.md](POSTGRES17_REHEARSAL.md)에 기록했다.

- 실제 실행: `node tests/studio/postgres17-rehearsal.mjs <새 검사 루트> <도구 루트>` 최종 exit0. 기존 미커밋 코드·SQL 보존. studio_runner_v1.sql 미적용.
- 빈 PostgreSQL DB에 가상 auth 함수/역할을 준비한 뒤 v1→v2 실제 적용 성공. Supabase Auth/Data API 자체 검사가 아님.
- 독립된 두 psql 연결(service_role, 비슈퍼유저)의 삭제↔접수, 삭제↔재시도, 중복 삭제(연결 순서 교체), 이름 수정↔삭제 **8/8 성공**. 서로 다른 backend PID와 후행 Lock/transactionid 및 선행 blocker PID, 트랜잭션/대기 시각 기록. 선행 COMMIT을 잠금 관찰 뒤에 보내 실제 중첩 증명. 삭제 우선 PT404, 접수/재시도 우선 삭제 PT423. 대화 부활·잘못된 소유자 연결 없음, 제작 명세·이벤트·검토·승인·배포 가상 이력 전후 동일.
- 네이티브 pg_dump custom 파일→별도 template0 빈 DB에 pg_restore --exit-on-error --single-transaction **성공**. 데이터·함수·제약·인덱스·RLS/policy·테이블/열 ACL 지문 일치. 복원 후 대표 RPC·authenticated 조회와 직접 쓰기/서버 RPC 차단 성공. 클러스터 역할은 별도 사전 준비된 의존 항목이다. 운영 Supabase 백업 확보/복원 완료는 아님.
- 삭제 gate는 로컬 검사 DB에서만 시험 중 true, 끝나면 false로 복구. 원본 SQL 및 운영 gate 변경 없음. v1 SHA256 `6f55bd60c3af35a25564929623e585bc2e026d217de0848aa892cceab8273c67`, v2 `9b79f5824dc8c3de3a8b4f2902175b8cffc997c68372646fb5160e880df0fcdb` 검사 전후 동일.
- 서버: 127.0.0.1:55432만 listen, SCRAM-SHA-256 암호 인증, trust 없음. 암호 보존은 .local의 DPAPI 암호화 파일만, 임시 평문 제거. 실행 파일·DB·백업·로그의 Git 제외 확인. 서비스/자동시작/PATH/방화벽/관리자 설치/추가 런타임 없음.
- 준비 실패: 제한된 sandbox의 DPAPI/프로세스 토큰 오류, 부분 ZIP 해제, 검사 래퍼의 자식 파이프 대기·inet 주소 표기 비교 문제. 일반 사용자 실행 문맥·새 해제 위치·래퍼 수정으로 해결. 실패 폴더 보존, SQL/권한 완화 없음.
- 최종 서버 **정상 종료**: pg_ctl stop 성공, 로그 shutdown, pg_ctl status exit3, 포트 ECONNREFUSED 확인. 기존 UI 서버는 유지했다.
- 추가 읽기 점검으로 복원 전후 스키마 ACL/소유자 일치, 실제 HBA SCRAM 전용, authenticated 비슈퍼유저·BYPASSRLS=false와 service_role 비슈퍼유저·BYPASSRLS=true도 확인했다(supplement.json). 추가 시작 래퍼의 자식 프로세스 대기는 별도 읽기 프로세스로 분리해 해소했고, 해당 서버도 정상 종료했다.

실제 성공 자료는 `.local/pg17-ad1839ec7ba749b4b13fbecf799f1e55/run-7fe0052a53f64d91ad068e90206cc13f`의 db/backups/logs에 보존했다. 앞선 PGlite 결과와 당시 환경 부족 기록은 과거 사실로 유지하며, 로컬 두 연결/네이티브 복원은 이번 실행으로 완료했다.

남은 운영 준비는 실제 Supabase 백업·복구 확인, v1 수동 기준선 이력 관리 승인, 적용 시간·호환 앱/복구 버전 확보다. 기존 B 앱 버튼 로그아웃·자연 만료·reviews/approvals/releases 실제 사용자 토큰 실재 행 검사는 미검증 유지. 운영 접속·SQL/원격 이력 변경·커밋·push·배포·유료 AI 실행 없음. 적용 직전 대기.

## 最新 확인 — 2026-09-16 격리 DB 재현·파일 복원 실제 시험

직전 검토에서 독립 2연결 경쟁 검사와 백업 파일 복원은 실행하지 않았다. 빈 PGlite→v1→v2는 기존 `npm.cmd run test:studio`의 v2-db.test.mjs 두 번째 검사에서 이미 통과했다. 이번에는 전체 UI/호환 검사를 반복하지 않고 백업 복원을 위해 필요한 새 빈 DB 구성만 재현했다.

- 실행: 프로젝트 루트에서 `node tests/studio/backup-rehearsal.mjs`, exit0 PASS. 기존 설치된 @electric-sql/pglite 0.5.8만 사용. 운영 환경파일·네트워크·A/B 데이터 사용 없음.
- 빈 격리 DB의 studio 스키마 부재 확인 → 가상 auth 역할/스키마 준비 → v1 → 합성 검사 기록 → 현재 v2 순서로 실제 실행 성공. 삭제 gate=false 유지, runner 미적용 확인.
- `dumpDataDir('gzip')`로 실제 파일 생성 → 원본 인스턴스 종료 → 파일을 다시 읽어 별도 새 PGlite 인스턴스의 `loadDataDir`로 복원 성공. 이전 데이터가 없는 새 인스턴스에 데이터 디렉터리 백업을 로드한 시험이며, 일반 PostgreSQL의 pg_dump/pg_restore 또는 Supabase 운영 백업 복구 검사가 아니다. 공식 API: https://pglite.dev/docs/api#dumpdatadir
- 복원 전후 studio 전체 행·테이블 RLS/ACL·정책·함수 본문/ACL 지문 일치. 복원 후 새 대화 RPC 성공, authenticated 직접 UPDATE 거부 확인. 실제 대화/승인/배포 데이터를 복제하지 않았다.
- 백업과 결과: `.local/db-rehearsal/0fad3c77-49e8-46db-b244-c20b702db829/synthetic-pglite.tar.gz`, 같은 폴더 `result.json`. `git check-ignore`로 제외 확인. 백업 SHA256: eee6f46506c23fab265dc83079ea1a35dc509f24aec7e74e6447cda6ea1f9b88.
- 검사 SQL SHA256: v1=`6f55bd60c3af35a25564929623e585bc2e026d217de0848aa892cceab8273c67`; v2=`9b79f5824dc8c3de3a8b4f2902175b8cffc997c68372646fb5160e880df0fcdb`. 검사 전후 파일 해시 일치. 이번 SQL 수정 없음. 현재 v2는 직전 검토에서 추가한 기본 false 삭제 gate 포함 버전이다.
- 독립 2연결 경쟁: **환경 부족으로 미실행**, 실패/통과로 기록하지 않는다. PGlite는 단일 연결 엔진. Get-Command psql,pg_dump,pg_restore,postgres,initdb,docker,supabase 조회와 기본 Program Files 위치 확인에서 사용 가능한 도구를 찾지 못했다. 별도 PGlite 인스턴스 두 개는 같은 DB의 경쟁 검사를 대신하지 않는다.
- 다음 필요한 승인 한 가지: 이 PC에 격리 시험용 PostgreSQL 17 서버와 클라이언트 도구를 설치하는 승인. 아직 설치하지 않았으며 설치 방식·범위 확인 후 진행해야 한다. 이후 같은 DB의 독립 연결 두 개와 일반 PostgreSQL 파일 복원 검사를 수행할 수 있다.

이번 검사 실패 없음. 2연결 검사는 미실행. 운영 SQL/원격 migration 이력/계정/권한 변경·삭제 활성화·runner 적용·커밋·push·배포·AI 실행 없음. 기존 B 앱 버튼 로그아웃·자연 만료·세 테이블 실재 행의 사용자 토큰 검사는 계속 미검증이다.

| 단계 | 현재 상태 | 실제 증거 |
|---|---|---|
| 00 환경 | 확인됨 / Git 설정 필요·일부 미검증 | 2026-09-13 이전 대화의 실제 읽기 전용 명령·검색·Chrome·하위 에이전트 결과. 아래 기록 참조 |
| 01 설계 | 문서 정리 완료 / 문서 검증 완료·시스템 미구현 | 구조·계약·계획·검증표·역할 지침. Markdown 링크/JSON 구문/변경 범위 확인 결과는 아래 기록 |
| 02 자료실 | 구현 + 로컬 실제 검증 / 승인 발급·공개 배포 미연결 | validate/typecheck/build 성공, 단위 16/16, Chrome E2E 9/9. 아래 02 기록 |
| 03 유전 | 로컬 시제품 구현 + 실제 검사 완료 / 교육과정·교과서 대조 보류 | 계산·계약 23/23, 시제품 Chrome 8/8, 기존 자료실 9/9. 실제 5역할 실행·아래 기록 |
| 04 Pages | 업로드 전 점검·배포 준비 완료 / 외부 실행 대기 | 로컬 main 초기화, 후보/ignore 검사, SHA 고정 workflow, 최종 빈 산출물 검사. 업로드·커밋·배포 없음 |
| 05 인증/DB | 미구현 | 없음 |
| 06 관리 배포 | 미구현 | 없음 |
| 07 실행기 | 미구현 | 없음 |
| 08 채팅 연결 | 미구현 | 없음 |
| 09 받아쓰기 | 미구현 | 없음 |
| 10 감사 | 미실행 | 없음 |
| 11 운영 | 규칙 설계 / 기능 미구현 | OPERATIONS의 01 설계 규칙. 실제 운영 없음 |
| 12 재개 | 절차 제공 / 별도 단계 미실행 | 시작 요청문 보존 |
| 13 실시간 음성 | 미구현 | 없음 |

완료는 구현+실제검증/구현+미검증/미구현/외부설정필요로 구분하고 파일·명령·커밋·실행 증거를 적는다. 시작 자료가 기능을 설치한 것은 아니다.

## 00 환경 확인 결과 반영 — 2026-09-13

00은 당시 파일 수정 금지였으므로 이 기록은 01에서 작성했다. 아래는 같은 대화에서 실제 확인한 결과이며 이번에 모두 재실행했다는 뜻이 아니다.

- OS: Windows x64, 빌드 26200. Windows PowerShell 5.1.26100.9168 Desktop. 상세 제품명 CIM 조회는 액세스 거부로 미검증.
- 경로: C:\Users\user\Desktop\science-simulations. Windows 네이티브로 실행했고 WSL은 사용하지 않음.
- `git --version`: 2.54.0.windows.1. `node --version`: v24.15.0. `npm.cmd --version`: 11.12.1.
- `npm --version`: npm.ps1 실행 정책 오류. npm.cmd가 정상이며 정책 변경 안 함.
- `git status --short --branch`: not a git repository. `.git` 존재 검사 false. 브랜치·추적/미커밋 변경·정상 커밋·원격 URL은 확인 대상 저장소가 없음.
- `Get-Content`, `rg --files`, 공개 웹 검색, Chrome의 공식 Node 다운로드 페이지 읽기, `environment_readonly` 하위 에이전트의 manifest 탐색 성공. 이는 앱 검사나 외부 서비스 계정 연결 시험이 아님.
- 필수 문서·시작 JSON은 있고 package.json/lockfile/Node 버전 지정 파일은 검색되지 않음. 상세 범위는 [TOOLS](TOOLS.md).

## 01 실제 작업과 범위

요청 범위: 기존 요구사항을 유지한 문서 설계만. 앱 코드·패키지 설치·외부 서비스 연결·배포·Git 초기화·실행 정책 변경은 하지 않았다. 학년도·교육과정·교과서·비용 한도를 정하지 않았다.

먼저 README, AGENTS, OWNER_INPUT, SYSTEM_SPEC, STATUS, setup/01과 실제 Git 상태를 읽었다. 이어 관련 운영/결정/도구/디자인/출처/공개 체크리스트, 참고 목록·수업 초안, 세 JSON 예시·config·.gitignore, 후속 단계 요청문을 실제 읽어 설계에 대조했다. 비밀 .env/키·비공개 원문은 읽어 출력하지 않았다.

| 작업 | 실제 명령/도구·결과 |
|---|---|
| 문서·기존 요구사항 읽기 | `Get-Content -LiteralPath <해당 문서> -Raw -Encoding UTF8` 성공 |
| 프로젝트 지침 탐색 | `rg --files -g AGENTS.md -g '!node_modules/**' -g '!.local/**'` → 루트 AGENTS.md |
| Git 상태 재확인 | `git status --short --branch` → fatal: not a git repository. 외부 연결/초기화 안 함 |
| 수정 전 기준 보관 | 기존 공개 시작 문서·JSON·.gitignore 33개에 `Get-FileHash -Algorithm SHA256` 실행. 세션 내 비교 기준으로만 보관 |
| 공식 문서 확인 | 공개 검색/페이지 읽기 및 Supabase 공개 문서 조회. 확인 범위·조회 오류는 SOURCES/TOOLS에 기록 |
| 문서 작성 | apply_patch로 Markdown만 변경. 에이전트 활성 TOML·SQL·스키마 코드·workflow는 작성 안 함 |
| 문서 링크 검사 | Get-Content + 정규식 링크 추출 + Test-Path. 첫 명령은 중괄호 누락으로 ParserError(종료 1), 수정 후 재실행: Markdown 20개, 상대 링크 46개, 깨진 링크 0, 종료 0 |
| 기존 JSON 구문 검사 | `Get-Content ... -Raw -Encoding UTF8` → `ConvertFrom-Json -ErrorAction Stop`: templates/config/references의 JSON 5개 성공. 스키마/내용 적격 검사는 미실행 |
| 변경 범위 비교 | 수정 전/후 SHA-256 비교: 기존 33개 중 26개 내용 동일, Markdown 7개 수정, Markdown 10개 추가, 삭제 0. config·참고 목록·템플릿·기존 명세/지침 보존 |
| 미구현 경계 확인 | `Test-Path`로 .git/package.json/package-lock.json/apps/packages/tests/.github/workflows/.codex/config.toml 모두 false 확인 |

### 변경 문서

- 새 문서: docs/ARCHITECTURE.md, docs/DATA_CONTRACTS.md, docs/IMPLEMENTATION_PLAN.md, docs/VERIFICATION_MATRIX.md.
- 새 역할 문서: automation/roles/README.md, curriculum_reviewer.md, subject_reviewer.md, learning_designer.md, developer.md, independent_reviewer.md.
- 보완 문서: README.md, docs/OWNER_INPUT.md, docs/DECISIONS.md, docs/OPERATIONS.md, docs/TOOLS.md, docs/SOURCES.md, docs/STATUS.md.
- 기존 SYSTEM_SPEC·AGENTS·DESIGN_BRIEF·RELEASE_CHECKLIST·setup 요청문·templates JSON·config/project.json·참고 목록/수업 초안·.gitignore의 내용은 유지한다.

### 미검증·보류

Git 저장소가 없어 실제 ignore/추적 파일/과거 이력 검증은 보류한다. .gitignore의 .local/.env/키/로그/녹음 제외 규칙만 읽어 확인했다. 제외 규칙은 이미 추적된 자료를 보호하지 않으며, 비공개 자료를 다른 경로에 놓는 실수까지 막지 않는다. 현재 공개 Git/PR/배포물의 유출 검사 완료라고 주장하지 않는다.

JSON 예시는 승인/작동 결과가 아니다. 교육과정·교과서·자료 권리·실제 수업 기기·실행/비용/보존 상한은 미확인이다. 과학 모델·학습 효과·앱 기능·DB/RLS·OIDC·격리·상한 강제·배포/복구 검사는 미실행이다. 새 역할 Markdown은 실행된 하위 에이전트가 아니며 01에서 추가 하위 에이전트를 실행하지 않았다.

01 종료 시점에는 답할 질문 없이 02 요청을 기다렸다. 준비할 항목은 [OWNER_INPUT](OWNER_INPUT.md)에 유지한다.

## 02 실제 구현·검증 — 2026-09-13

README/AGENTS/OWNER_INPUT/SYSTEM_SPEC/STATUS, 01 구조·계약·계획·검증표·디자인, setup/02, 참고 목록과 설정/템플릿을 실제 읽고 대조했다. 현재 작업 폴더를 기준으로 했으며 Git 상태는 여전히 not a git repository다. 구현 파일과 경계는 [CATALOG_IMPLEMENTATION](CATALOG_IMPLEMENTATION.md)에 기록했다.

한국어 화면·메타데이터 카드·학년/단원/검색·초기화·URL 복원·빈 상태/읽기 오류를 구현했다. 실제 콘텐츠는 0개이며 가상 카드는 tests/fixtures와 별도 로컬 출력에만 있다. 신뢰된 승인 발급원은 미연결이므로 실제 공개 선택은 차단 상태다. 검사 함수의 합성 데이터 성공을 실제 승인 통합 완료로 간주하지 않는다.

| 실제 실행 | 최종 결과·증거 |
|---|---|
| `npm.cmd install --no-fund` | 성공; 프로젝트 의존성·잠금 파일 생성, 설치 시 audit 0 vulnerabilities. 전역 설치 없음 |
| `npm.cmd run validate` | 종료 0; 실제 메타데이터/승인 콘텐츠 각각 0개 |
| `npm.cmd run typecheck` | 종료 0 |
| `npm.cmd run test` | 종료 0; 16/16 성공, 실패/skip 0. C01/C02/C04 계약·경로·중복·링크·해시·승인 누락·출력 분리 |
| `npm.cmd run build:catalog` | 종료 0; 카드 0개·4파일. SHA-256 `69ca7830bd56f72acba6bcaa3c6da816afda89679c3d77baa1020ca2abffcfd9` |
| `npm.cmd run test:e2e` | 종료 0; 설치된 Chrome 9/9 성공(13.6초), 재시도 0. C03/C04·L02 자동 검사 범위 |
| 실제 Chrome 탭 | 4173의 /science-simulations/을 열어 제목·필터·공개 자료 0개·빈 상태 확인 |
| 시각 확인 | 데스크톱/390px 캡처를 이미지 도구로 읽음. 모바일 단원 라벨 줄바꿈 수정 후 전체 검사 재통과 |

E2E 범위: 공개 빈 화면, 가상 카드·복합 필터/검색/결과 없음, 직접 링크·새로고침, 하위 경로·없는/비공개 경로 404, HTML 텍스트 처리, 데이터 오류/재시도, 키보드, axe WCAG 자동 검사. 390×844·768×1024·1024×768에서 필터·가로 넘침을 검사했다. 브라우저 요청은 로컬 자산만 사용했다.

### 실패 이력

1. 최초 npm 조회는 캐시 접근 EPERM으로 실패했다. 권한 검토 후 재실행하여 조회·프로젝트 설치에 성공했다. 실행 정책·시스템 설정 변경은 없었다.
2. 최초 단위 검사는 14개 중 6개 성공·8개 실패했고 빌드도 실패했다. 샌드박스가 realpath 경로 보호 검사 중 상위 C:\Users\user 접근을 거절했다. 보호 검사를 제거하지 않고 승인된 실행에서 14개 모두 성공했다. 해시·미확정 근거 회귀 검사 2개를 추가한 최종 결과는 16개 성공이다.
3. 최초 E2E는 5개 실패 후 상한으로 정지, 4개 미실행이었다. esbuild 기본 IIFE 출력에서 import.meta.url이 보존되지 않아 데이터 읽기가 실패했다. ESM 출력으로 수정해 9개 성공했고, 모바일 라벨 수정 후 최종 전체 검사도 성공했다. 실패 증거는 `.local/catalog-tests/e2e-first-run`에 보존했다. 실패 검사를 삭제하거나 기대값을 완화하지 않았다.

최종 보고서: `playwright-report/index.html`. 캡처: `.local/catalog-tests/public-desktop.png`, `fixture-desktop.png`, `fixture-390.png` 등. E2E 상한은 workers 1, retries 0, maxFailures 5, 검사당 20초·전체 180초; 단위 검사는 30초 제한이다. 이는 AI 제작·비용 상한 구현이 아니다.

### 로컬 확인과 남은 사항

자료실 서버를 숨김 Node 프로세스(PID 51204, 포트 4173)로 시작했다. 주소는 http://127.0.0.1:4173/science-simulations/ 이다. 로그는 `.local/catalog-tests/dev-server.log`, `dev-server-error.log`다. 세션/컴퓨터 종료 후 유지 여부는 보장하지 않는다. [README](../README.md#로컬-실행)에 정확한 실행 폴더·메뉴·재시작 명령이 있다. 검사용 4175 서버는 최종 정리 시 종료하며 필요하면 `npm.cmd run test:fixtures`로 다시 연다.

사용자 확인: 공개 화면에 가짜 카드가 없는지, Tab 포커스·좁은 창·브라우저 확대에서 읽기 쉬운지 확인한다. 별도 가상 자료 화면에서는 학년·단원·검색·초기화·결과 없음·새로고침을 확인할 수 있다.

- 신뢰된 승인 발급·Git/커밋 연결·실제 Pages 게시/복구: 미구현·미검증.
- Firefox/WebKit·실제 태블릿·스크린리더·수동 확대 사용성: 미검증. 뷰포트/axe 성공과 구분한다.
- 동적 JS의 전체 안전성·생성 코드 격리·권한·워크플로·비용 상한: 후속 단계.
- Git ignore 실제 적용·추적 파일/이력 검사: 저장소가 없어 미검증. 현재 dist는 명시한 4파일만 포함.
- 학년도·교육과정·교과서·권리·비용: 미확인 유지. 과학 정확성·교육 원문·학습 효과는 이번 검토 대상이 아니었다.
- 유전 본편·관리 앱·로그인·DB·외부 서비스 연결·GitHub 업로드·공개 배포·전역 설정 변경: 미실행.

02 종료 시점에는 03 요청을 기다렸다. 이후 사용자의 명시적 03 요청으로 작업을 시작했다.

## 03 진행 기록 — 2026-09-13

AGENTS·STATUS·OWNER_INPUT·출처 목록·교사 메모·setup/03·README·SYSTEM_SPEC·기존 구조/계약/계획/검증표를 읽었다. Git 상태는 not a git repository. 기존 계약상 미확정 상태의 로컬 초안은 가능하며 지금 필수 질문은 없다. 교육과정·교과서 대조와 공개는 보류한다.

실제 native_subagent로 교육과정 검토, 독립된 교과 검토, 학습 설계, 콘텐츠 개발, 독립 검토를 실행했다. 역할 결과는 [GENETICS_PILOT](GENETICS_PILOT.md)에 기록한다. 주 에이전트는 별도 시스템 작업으로 미리보기·검사 명령과 테스트를 구성했다. 승인 조건과 정식 공개 빌드의 공개 선택 규칙은 유지했다.

### 구현·분리

콘텐츠 ID는 `mendel-inheritance`. meta.json/index.html/model.js/ui.js/styles.css 5파일에 순수 계산, 단계별 UI, 스타일을 분리했다. 메타데이터는 draft·schoolYear null·curriculumRevision null·approvalIsExternal true다. 부모 대립유전자→생식세포→수정→자손, 우열/분리/독립, 예측·설명 입력, 재생/일시정지/전체 초기화, 부모 선택, 1/10/100/1000회 표본 추가와 총 10000 상한, 선택형 2×2/4×4 교배표를 구현했다. 이론 확률과 관찰 빈도를 분리하고 부모/주제 변경 시 이전 표본·예측·설명을 지운다. 입력은 저장·전송하지 않는다.

로컬 초안 카드와 파일은 `.local/catalog-tests/genetics-preview`에만 복사한다. 공개 선택은 여전히 0개이며 가짜 승인은 만들지 않았다. 실제 `dist/catalog`는 index.html/catalog.json/assets/app.js/assets/styles.css 네 파일이다. 새 의존성 설치·잠금 파일 변경·PowerShell 정책 변경은 없었다.

### 실제 검사 결과

| 명령·실행 | 최종 결과 |
|---|---|
| 개발자 `node --check` model.js/ui.js | 최종 각 종료 0. 초기 UI 구문 실패와 수정은 아래 기록 |
| `npm.cmd run validate` | 종료 0; 실제 메타데이터 1개·승인 0개 |
| `npm.cmd run typecheck` | 종료 0; 기존 자료실 TS 검사. 유전 JS 전체 정적 타입 검사와 구분 |
| `npm.cmd run test` | 종료 0; 23/23 성공, skip 0. 기존 계약 16 + 유전 7 |
| `npm.cmd run build:catalog` | 종료 0; 카드 0개, 네 파일. 후보 실행 파일 제외 |
| `npm.cmd run test:genetics` | 종료 0; Chrome 8/8 성공, 15.0초, retries 0 |
| `npm.cmd run test:e2e` | 종료 0; 기존 자료실 Chrome 9/9 성공, 14.0초. 검색 직후 첫 카드 클릭 회귀 추가 |
| 시각 확인·실제 Chrome | 시제품 데스크톱·390px 캡처 열람. 4176 직접 진입점 탭의 부모 RR×rr·초안·버튼·표본 0 표시 확인 |

S01은 RR×rr/Rr×Rr/rr×rr/RrYy×RrYy의 정확 확률과 모든 단일 유전자 교배의 확률 합계, S02는 seed 표본 수 합계·비율 비강제·난수/수량 경계·부모 변경·초기화, S03은 유전자마다 대립유전자 하나인 생식세포와 모형 한계를 검사했다. 브라우저에서 재생/일시정지/단계 이동/카드 연결/새로고침/키보드·표본 상한을 실제 조작했다. 재생 정지는 Playwright 가상 시계로 시간을 진행한 모의 시간 검사이며 실제 교사 사용성 시험이 아니다. 무작위 표본은 교육용 모의 실험이며 실제 완두 실험이 아니다.

390×900·768×900·1440×900의 본문 가로 넘침, 동작 줄이기, 키보드, axe WCAG 2A/AA·2.1AA 자동 검사가 성공했다. 콘솔 pageerror와 로컬 밖 요청이 없음을 시제품 흐름 검사에서 확인했다. 실제 기기·스크린리더·수동 확대와 구분한다.

### 실패·수정 횟수 (최대 2회 사용)

1. 개발자의 초기 `node --check ui.js`가 71행 닫는 괄호 누락으로 실패했다. 1회차 수정 후 model.js/ui.js 구문 검사 성공. 후보 콘텐츠에 대한 이후 수정은 없다.
2. 첫 시제품 E2E는 5개 성공·3개 실패였다. 독립 검토자는 기존 자료실의 검색창 blur/change가 카드를 다시 생성해 첫 클릭을 무시하는 결함을 확인했다. 주 에이전트가 시스템 작업으로 grade/unit 변경에만 render하도록 수정했다. 나머지 2실패는 `1111`/`10000` 검사 문자열과 UI의 `1,111`/`10,000` 구분자 차이였다. 같은 수량에 대한 표시 규격을 수정했고 검사를 삭제/완화하지 않았다. 2회차 이후 시제품8·기존9·단위23 모두 성공했다.

최초 브라우저 실패 trace/캡처는 `.local/evidence/genetics03/browser-first-run`과 `report-first-run`에 보존했다. 최종 시제품 보고서는 `browser-report/index.html`, 기존 보고서는 `playwright-report/index.html`이다. 실행·역할 요약은 `.local/evidence/genetics03/execution-summary.json`, 시제품 캡처는 같은 폴더의 desktop.png/screen-390.png 등이다. 파일 쓰기 도구의 문맥 불일치 오류는 수정 후 적용했으며 앱 검사 성공으로 기록하지 않았다.

시제품 candidateHash: `0991f70040900dab250e5d53191a7e0f06039b286817c74e7c34a7a7a82e5c4a`. 독립 검토자가 5파일 바이트/정렬 manifest로 계산했다. 공개 산출물 해시: `cb3440667699e4c005a2c262adf925d63481023c06cd3072c1b09c843de35ad3` — 자료실 클릭 결함 수정으로 02 해시와 달라졌지만 카드/콘텐츠 공개 범위는 그대로 0개다. 어느 해시도 공개 승인이나 배포를 뜻하지 않는다.

### 직접 확인·남은 사항

검토용 서버를 숨김 Node 프로세스 PID 55068, 포트 4176으로 실행했다. 로그는 `.local/evidence/genetics03/preview-server.log`와 `preview-server-error.log`. 주소·재시작 폴더·메뉴는 [README](../README.md#03-유전-로컬-시제품)에 있다. 컴퓨터/세션 종료 후 유지 여부는 보장하지 않는다.

- 교육과정·교과서·학년도·권리·대조 수준·독립의 법칙의 교육과정 위치: needs_evidence. OWNER_INPUT과 출처 목록의 미확정 값 유지.
- 실제 태블릿·Firefox/WebKit·스크린리더·수동 확대·실제 교사 시연·학생 학습 효과: 미검증.
- 5역할은 실제 별도 문맥 실행이지만 모든 역할의 OS 쓰기 권한을 분리한 원격 격리 실행기는 아직 없다. 토큰 사용량은 측정 불가이며 추정하지 않는다.
- Git 저장소·승인 발급원·공개 업로드/배포·관리 앱·로그인·DB·외부 서비스 연결은 수행하지 않았다.
- 최종 자동 검사에서 재현되는 실패는 0개다. 이는 모든 오류가 없다는 보장이 아니며 수정 2회 한도는 소진했다.

독립 검토자의 최종 추가 검토: 수정 코드·강화된 회귀 검사·두 HTML 보고서의 내부 결과를 실제 읽어 C03 및 표시 검사 오류 해결을 확인했다. 후보 해시 불변, 정식 출력 4파일/cards0도 직접 재확인했다. 판정은 로컬 시제품의 확인된 미해결 차단 오류 없음, 교육과정/교과서 needs_evidence다. 검토자의 보고서 열람을 직접 브라우저 실행이라고 기록하지 않는다.

최종 파일 점검: 작업 전 기준 대비 기존 파일 변경은 README, STATUS, package.json의 실행 스크립트, 자료실 main.ts의 첫 클릭 수정, 기존 E2E의 회귀 추가 5개다. AGENTS·OWNER_INPUT·출처 목록·교사 메모·기존 계약·잠금 파일·.gitignore는 유지했다. 새 파일은 콘텐츠 5개, preview-genetics.mjs, playwright.genetics.config.mjs, tests/unit/genetics.test.mjs, tests/genetics/pilot.spec.mjs, GENETICS_PILOT 문서다. 로컬 실행 증거는 .local에 분리했다. 후보/입력/역할 결과 요약 해시는 `.local/evidence/genetics03/manifest.json`에 있다. 요약 해시를 모델 원문 전사의 해시라고 주장하지 않는다. 변경 문서 3개 상대 링크 검사에서 끊어진 링크 0, 최종 로컬 진입점 HTTP 200, Git 저장소 없음 확인.

03 종료 시점에는 04 요청을 기다렸다. 이후 사용자의 04 준비 범위 요청으로 아래 작업을 수행했다.

## 04 업로드 전 점검·배포 준비 — 2026-09-13

AGENTS/README/OWNER_INPUT/SYSTEM_SPEC/STATUS/04 지침과 기존 구조·계약을 실제 읽었다. 최초 git status/rev-parse는 저장소 없음. 사용자 허가에 따라 현재 폴더에 main으로 Git을 초기화했다. 파일 추가/커밋/원격/사용자 이름·이메일 설정은 하지 않았다. 기존 자료실·유전 콘텐츠 코드는 그대로 유지했다.

### Git 초기화와 범위 검사

첫 git init은 도구의 샌드박스 계정으로 .git을 만들어 소유권 검사가 실패했다. 전역 safe.directory나 OS 정책을 바꾸지 않았다. 이번에 만든 빈 저장소가 커밋·추적 파일 0임을 경로 한정 `git -c safe.directory=...` 읽기로 확인하고, 절대 경로가 프로젝트 내부인지 확인한 뒤 `.local/evidence/pages04/git-init-sandbox`로 보관했다. 사용자 계정으로 다시 init하여 일반 git status가 정상 동작한다. 이전 사용자 이력 삭제·재작성은 없으며 백업은 업로드에서 제외된다.

최종 main, 커밋0, 추적/스테이징0, 원격0. 기존 커밋이 없어 검사할 이력의 비밀 데이터도 없었다. 실제 `git ls-files`, `rev-list --all --count`, `remote -v`, `check-ignore -v`를 실행했다. 후속 커밋이 생기면 추적/이력 검사를 다시 해야 한다.

`automation/catalog/audit-upload.mjs`로 Git이 인식하는 후보의 경로·비밀 키 패턴·파일 종류/크기·.env.example 값을 검사했다. 비밀값 대신 파일 경로/유형만 출력한다. 초기 .env.example 확인필요1건은 빈 키 항목이 아닌 GH_REPO 가안으로 확인하여 그 가안에만 예외를 한정한 뒤 재검사 문제0. 다른 문자열/인코딩으로 숨긴 키나 모든 개인 메모를 완전 탐지하는 도구는 아니며 최종 업로드 목록은 사람 확인이 필요하다.

이번에 발견한 `references/2022 개정 과학과 교육과정.pdf`와 references의 문서 원문 확장자에 ignore 규칙을 추가했다. 원문을 읽거나 이동·삭제하지 않았고 교육과정 대조 완료로 바꾸지 않았다. `.local`, 실제 .env/.env.local, key/pem, dist 등 실제 ignore 결과 확인. 추적된 파일은 0이다. 실제 후보 목록/해시와 제외 경로는 `.local/evidence/pages04/upload-audit.json`, `upload-candidates.txt`, `excluded-paths.txt`에 기록했다.

유전 초안 소스 5개는 ignore 대상이 아니므로 저장소 후보에 포함되어 있다. 사이트에서 제외되는 것과 Public 저장소에서 소스가 보이는 것은 별개다. 업로드 여부는 사용자 결정 대기이며 임의로 삭제하거나 승인하지 않았다. 상세 세 목록은 [PAGES_PREPARATION](PAGES_PREPARATION.md).

### 작성 설정과 실제 검사

새 `.github/workflows/pages.yml`: main의 수동 실행만, publish 기본 false, 추가 변수 PAGES_DEPLOY_ENABLED=true가 있어야 deploy 가능. build contents:read, deploy pages:write/id-token:write, needs:build, github-pages environment. 실행 SHA checkout, 자격증명 저장 안 함. Linux npm ci·Chrome·필수 검사 후 최종 dist/catalog 빌드·정확한 파일 검사·최종 산출물 브라우저 확인·바이트 해시 재확인 뒤 dist/catalog만 artifact로 업로드한다. deploy는 같은 실행 artifact만 사용하고 재빌드하지 않는다. 신뢰된 콘텐츠 승인 발급원은 계속 미연결이며 빈 자료실만 허용하는 검사를 추가했다.

공식 GitHub 문서, Actions release/tag API, 전체 SHA의 action.yml을 실제 읽었다. 브라우저 도구의 API URL 조회는 안전 URL 오류로 실패하여 PowerShell의 인증 없는 공식 API 읽기로 확인했다. checkout v7.0.1/setup-node v7.0.0/upload-pages-artifact v5.0.0/deploy-pages v5.0.1 전체 SHA와 근거는 준비 문서에 기록했다. configure-pages 정의는 읽었으나 자동 enablement 없이 UI 설정하도록 이번 workflow에서는 사용하지 않는다.

| 실제 실행 | 결과 |
|---|---|
| `npm.cmd run validate` | 종료0; 메타데이터1·승인0 |
| `npm.cmd run typecheck` | 종료0 |
| `npm.cmd run test` | 종료0; 기존·유전 단위23/23 |
| `npm.cmd run test:genetics` | 종료0; 8/8, 12.4초 |
| `npm.cmd run test:e2e` | 종료0; 9/9, 13.5초 |
| `npm.cmd run build:catalog` | 종료0; 공개카드0, 4파일 |
| `node automation/catalog/check-pages.mjs` | 종료0; 정확한 파일목록·빈cards·하위경로·금지문자 검사 |
| `node automation/catalog/verify-pages-browser.mjs` | 종료0; 빌드된 출력 그대로 Chrome에서 /science-simulations/·빈화면·검색후새로고침·초안주소404 확인. 테스트서버4180은 검사후종료 |
| `node automation/catalog/audit-upload.mjs` | 최초 수동검토 필요1건, GH_REPO 가안 확인 뒤 최종 문제0 |
| workflow YAML 검사 | 기존 Playwright에 포함된 YAML 파서로 구문 읽기, 수동실행 기본값·needs·최소권한·모든 uses 전체40자리SHA·dist 경로 단정 검사 성공. GitHub 실행과 구분 |

공개 산출물 SHA-256은 03과 같은 `cb3440667699e4c005a2c262adf925d63481023c06cd3072c1b09c843de35ad3`. 사이트 배포 파일은 index.html/catalog.json/assets/app.js/assets/styles.css만이다. 유전 시제품·검사용 자료·PDF·.local·인증키·로그는 배포물에 없다. 테스트·산출물 검사 실패는 없었다. 사용자 Windows에 새 의존성/전역 설정/실행 정책 변경은 없다.

### 미검증과 정지 지점

GitHub 저장소/소유자/이름/Public·Private/요금제/Pages Source/environment 보호는 미설정이다. Linux Actions·브라우저 설치·실제 OIDC/토큰권한·artifact 업로드·배포·공개 URL은 미실행/미검증이다. GitHub 서버의 YAML 수용과 실제 runner 성공을 로컬 파싱 성공으로 대신하지 않는다. 유전 소스 제외 상태의 새 checkout CI는 아직 실행하지 않았으며 해당 경우 유전 전용 검사는 대상 부재로 실행하지 않는 구조다.

04 준비 종료 당시에는 대상과 업로드 확인을 기다렸다. 이후 지정된 기존 저장소를 사용하는 최신 진행은 아래 기록을 따른다. 05·관리 앱·Supabase·Vercel·AI API 연결은 진행하지 않았다.

## 04 첫 로컬 커밋 준비 — 당시 작성자 이메일 확인 대기

사용자가 Raph-Alpaca/science-simulations, Public, 기존 저장소 사용을 확정하고 점검 후 선별 스테이징·첫 로컬 커밋을 요청했다. 원격 추가·push·새 저장소 생성·공개 배포는 이번에도 수행하지 않는다.

실제 git ls-remote로 원격 main/HEAD `8dbba6dc724983cf47ae4f784a9256850ab50f24`를 확인했다. 인증 없는 GitHub API의 tree와 고정 커밋 README를 읽어 기존 내용이 README.md 한 파일(`# science-simulations`)임을 확인했다. 빈 저장소가 아니다. 로컬과 원격은 별도 루트 이력이므로 이후 연결 허가 후 최신 이력을 다시 확인하고 원격 README와 커밋을 보존하여 병합해야 한다. 즉시 push·강제 push·덮어쓰기는 하지 않는다.

현재 파일로 후보를 다시 산출하고 전체 후보 바이트의 비밀키·개인 이메일/전화/식별번호·내장 이미지 표식을 검사했다. 유전 5파일·교사 메모·출처 목록·검토 문서의 실제 내용을 읽었다. 발견한 이미지/키 표식은 검사 정규식·MIME 정의·공격 방어용 합성 테스트 코드이며 원문 이미지나 실키가 아니었다. 교과서 원문·그림·비공개 개인 메모·개인정보·인증값은 검토한 후보에서 발견하지 않았다. .env.example의 비밀 항목은 빈 값, GH_REPO는 기존 가안이다. 완전한 비밀 탐지를 보증하는 것은 아니다.

유전 초안 소스 5개는 이번 요청의 공개 가능 내용 점검을 거친 로컬 커밋 대상이다. README에 교육과정·교과서 대조 미완료인 개발 초안이며 정식 배포 대상이 아님을 명시했다. Pages publish=false·별도 활성화 변수·미승인 콘텐츠 제외는 변경하지 않았다. PDF 원문, .local, 실환경/키, 의존성·산출물·검사로그는 제외하고 원본을 보존한다.

Git 작성자 이름은 기존 설정 Alpaca Teacher. 설정된 이메일은 GitHub noreply가 아니므로 값 자체를 공개하지 않고 사용자의 GitHub 제공 noreply 이메일을 요청했다. 전역 설정을 바꾸거나 이메일을 만들어 쓰지 않았다. 작성자 이메일을 확인하기 전에는 커밋하지 않는다. 준비 문서의 새 저장소 생성 안내는 기존 저장소 연결·이력 보존 절차로 수정했다.

최신 후보 80개의 내용 검사·경로 선택·SHA-256 일치 확인 후 각 파일 경로를 하나씩 git add했다. 과거 목록으로 git add .를 수행하지 않았다. 스테이징80개, 예상 밖 경로0개, 원격0개이며 git diff --cached --check 성공. Git의 기존 LF→CRLF 안내는 발생했으나 줄바꿈 전역 설정은 변경하지 않았다. 제외 자료는 스테이징하지 않았다. 커밋은 작성자 noreply 이메일 확인 대기이므로 아직0개이고 요청된 메시지의 커밋 ID도 없다. 변경한 STATUS도 동일하게 스테이징한다. VS Code push는 기존 원격 이력 통합과 로컬 커밋 완료 전까지 보류한다. 05단계 미진행.

## 04 첫 로컬 커밋 — 이메일 확인 후

사용자가 GitHub 제공 noreply 이메일을 직접 지정했다. 해당 이메일만 현재 저장소의 user.email에 적용하고 기존 작성자 Alpaca Teacher를 유지했다. 개인 이메일을 커밋에 사용하지 않으며 전역 설정은 변경하지 않았다.

이전 스테이징 80개와 작업 파일 사이에 변경이 없음을 재확인했다. 이번 변경은 README의 로컬 커밋 상태와 이 STATUS 기록뿐이며 두 문서만 다시 스테이징한다. 승인된 유전 개발 초안 5개를 포함하고, PDF 원문·.local·실환경/키·의존성·빌드/검사 결과물은 계속 제외한다. Pages 비활성화와 미승인 콘텐츠 제외 규칙은 그대로다. 앱 코드 변경이 없어 기존 전체 검사 결과를 유지하며 이번에는 인덱스·파일 일치·제외 경로·diff 검사를 수행한다.

이 절을 포함하는 최초 커밋의 메시지는 `chore: initialize science simulations catalog`다. 커밋 ID는 자기 참조를 피하기 위해 본문에 넣지 않고 `git log -1 --format=%H`와 완료 보고로 확인한다. 커밋 직후 실제 ID·파일 수·작성자 확인·작업트리 결과는 공개 대상이 아닌 `.local/evidence/pages04/first-commit-result.json`에 기록한다. 원격 추가·이력 병합·push·Pages 배포는 수행하지 않는다. GitHub 기존 README와 커밋은 변경하지 않으며 05단계는 진행하지 않는다.

## 04 기존 저장소 연결·병합 및 업로드 전 재검사 — 2026-09-13

사용자가 기존 Public 저장소에 프로젝트 코드와 유전 초안 소스를 업로드하도록 승인했다. Pages 배포·학생용 사이트 공개는 승인하지 않았다. 시작 시 현재 폴더 science-simulations, main, 첫 커밋 `33e1a1a3d72247c95e7e53eb579377babde44536`, 작업트리 깨끗함, 원격 없음 확인. 해당 커밋에 로컬 백업 브랜치 `backup/pre-origin-merge-33e1a1a`를 만든 뒤 지정 주소를 origin으로 추가하고 fetch했다.

최신 원격 HEAD/기본 브랜치는 main, 커밋 `8dbba6dc724983cf47ae4f784a9256850ab50f24`, 파일은 README.md 하나였다. 공통 조상 없음(merge-base 종료1)을 확인한 경우에만 allow-unrelated-histories로 병합했다. README add/add 충돌만 발생했고 로컬의 상세 설명을 보존하면서 원격의 science-simulations 이름을 제목에 합쳤다. 다른 코드·설정 충돌이나 앱 변경은 없다. 작성자는 기존 Alpaca Teacher와 저장소 전용 GitHub noreply 설정을 유지한다.

업로드 전 GitHub Settings → Pages를 실제 브라우저로 읽었다. “GitHub Pages is currently disabled”, Source=Deploy from a branch, Branch=None이었다. 설정을 바꾸지 않았다. 저장소의 유일한 Pages workflow는 workflow_dispatch만 받고 publish 기본값 false 및 별도 활성화 변수 조건을 유지한다. push 트리거가 없어 이번 소스 업로드로 배포를 실행하지 않는다.

필수 검사 실제 재실행 결과: upload-audit 문제0(후보80개), validate 종료0(승인0), typecheck 종료0, 단위23/23, 유전 브라우저8/8, 기존 자료실 브라우저9/9, build:catalog·check-pages·verify-pages-browser 모두 종료0. Windows에서 npm.cmd를 사용했다. 최종 dist/catalog는 기존과 동일한 SHA-256 `cb3440667699e4c005a2c262adf925d63481023c06cd3072c1b09c843de35ad3`, 파일4개·카드0개다. 실제 Chrome에서 /science-simulations/ 빈 상태·새로고침·유전 주소404를 확인했다.

두 기존 커밋 전체의 파일 버전81개를 추가 검사해 제외 경로·인증키 표식 문제0을 확인했다. 현재 후보 내용 감사도 문제0이다. 유전 초안 소스5개는 업로드에 포함하지만 PDF 원문·.local·실환경값·키·의존성·빌드/검사 산출물은 제외한다. 기존 원본은 보존한다. 패턴 검사가 모든 민감정보 탐지를 보증하지는 않는다.

이 절 작성 시점은 검사 완료·병합 커밋 및 push 직전이다. 실제 업로드 결과는 후속 기록을 따른다. Linux GitHub Actions 및 실제 Pages 배포는 미실행·미검증이며 실행하지 않는다. 교육과정·교과서·이용 범위 미확인을 유지하고 05단계는 진행하지 않는다.

### 실제 업로드 확인

`git push -u origin main`이 종료0으로 성공했다. 병합 커밋 `7b03bccb212372e3aa5c78abaea2365d1c2578c0`을 기존 원격 main에 정상 전진으로 반영했다. 이후 fetch·ls-remote로 로컬 main과 원격 main의 같은 전체 ID를 확인했고, 두 최초 커밋 `33e1a1a`와 `8dbba6d` 모두 원격 main의 조상인지 검사해 각각 종료0을 확인했다. 파일80개, 미커밋 변경0개였다. 강제 push·기존 이력 삭제·새 저장소 생성·전역 설정 변경은 하지 않았다.

업로드 후 GitHub Settings → Pages를 새로고침해 비활성화 안내와 Branch=None이 유지됨을 다시 확인했다. Pages 활성화·배포 실행·05단계는 진행하지 않았다. 이 실제 결과를 기록하는 후속 문서 커밋도 동일한 승인 범위로 업로드한다. 최종 커밋 ID와 최종 원격 일치 결과는 자기 참조 없이 완료 보고와 로컬 증거 파일에 남긴다. 남은 미검증은 Linux Actions 실행, 실제 Pages 배포, 교육과정·교과서·자료 이용 범위 대조다.

## 04 Actions 첫 실행 오류 수정 — 2026-09-13

시작 시 main과 origin/main은 `404e8416f27fdf8122cce14bb362889a868b9ef0`, 미커밋 변경 없음이었다. fetch 및 최신 원격 조회에서 예상 밖 변경은 없었다. 실제 GitHub 실행 34754009619의 build 로그를 브라우저로 읽었다. Required catalog checks의 audit-upload.mjs가 `git symbolic-ref --short HEAD` 종료128로 실패했고 deploy는 skipped였다. 이전의 Linux 전체 미실행 기록은 이제 이 실제 실패 기록으로 갱신한다.

원인은 github.sha 고정 checkout의 정상적인 detached HEAD를 보고서 생성 코드가 처리하지 못한 것이다. audit-upload.mjs의 보고서 부분만 수정했다. HEAD를 실제 commit으로 검증하고 전체 SHA를 commit 필드에 기록한다. symbolic-ref --quiet --short HEAD의 종료1만 브랜치 없음으로 처리해 branch=null, headState=detached를 기록한다. 정상 브랜치는 실제 이름과 headState=branch를 기록한다. 그 외 종료코드·신호·실행 오류는 다시 던져 실패로 유지한다. 비공개 경로·실환경값·비밀키 감사 규칙, github.sha checkout, 검사 단계, 배포 조건은 변경하지 않았다.

tests/unit/upload-audit.test.mjs를 추가했다. .local/upload-audit-tests 아래 독립적인 임시 Git 저장소에서 실제 감사 스크립트를 실행하며 작업 저장소의 브랜치·커밋을 전환하지 않는다. 수정 전 신규 검사3개 중2개가 실패했다(일반 브랜치 상태 필드 누락, detached HEAD 동일 오류); Git 손상 실패 유지 검사는 통과했다. 수정 후3개 모두 통과했다. 일반 브랜치와 detached HEAD 각각 실제 SHA·상태 기록, .env·PDF·강제 추적한 .local 파일 차단, 합성 토큰 탐지 및 값 비출력을 확인했다. 손상된 Git HEAD는 성공 보고서 없이 실패했다. 임시 원본은 테스트 종료 시 해당 생성 폴더만 정리한다.

| 이번 Windows 실제 검사 | 결과 |
|---|---|
| 신규 회귀 검사 | 3/3 통과 |
| audit-upload | 문제0, 후보81개 |
| npm.cmd run validate / typecheck | 모두 종료0; 승인 콘텐츠0 |
| npm.cmd run test | 기존23+신규3=26/26 통과 |
| npm.cmd run test:e2e | 기존 자료실9/9 통과 |
| npm.cmd run test:genetics | 유전8/8 통과 |
| npm.cmd run build:catalog / check-pages.mjs | 종료0; 산출물4개·공개카드0 |
| verify-pages-browser.mjs | 종료0; 최종 산출물 하위 경로·빈 화면·새로고침·초안404 |

빌드 SHA-256은 `cb3440667699e4c005a2c262adf925d63481023c06cd3072c1b09c843de35ad3`로 동일하다. GitHub Settings → Pages의 비활성화 안내·Branch=None을 다시 확인했다. 교육과정·교과서·이용 범위 미확인인 유전 초안은 배포에서 계속 제외한다.

수정·로컬 검증 완료, 사용자의 새 Actions 실행 대기 상태다. 승인한 감사 코드·회귀 테스트·이 상태 문서만 커밋하여 기존 origin/main에 정상 push하며, 최종 SHA·원격 일치·작업트리 결과는 `.local/evidence/pages04/audit-fix-upload-result.json`과 완료 보고에 남긴다. 수정 버전의 Linux Actions는 미실행·미검증이다. 기존 실패 실행의 Re-run은 이전 SHA를 사용하므로 Actions → Verify and optionally deploy empty catalog → Run workflow에서 main을 선택하고 publish를 false(체크 해제)로 유지해 새 실행을 시작해야 한다. Codex는 Actions 실행·Pages 활성화·배포·05단계를 수행하지 않는다.

## 04 게시 확인 및 05 제작실 구현·외부 연결 준비 — 2026-09-13

### 현재 상태와 게시 확인

사용자가 build와 deploy 성공 및 https://raph-alpaca.github.io/science-simulations/ 주소를 보고했다. 이번에는 해당 성공 실행 ID·Actions 로그를 별도로 확인하지 않았으므로 **빌드/배포 성공은 사용자 보고**, **게시 화면은 실제 확인**으로 구분한다. 이전 절의 Pages 비활성화·Linux 미실행 기록은 당시 상태이며 최신 상태를 대신하지 않는다.

Chrome에서 실제 자료실 화면을 열었고 HTTP200, 공개카드0, 학년·검색 조작과 새로고침 복원, 유전 초안 경로404, pageerror0을 별도 Playwright로 확인했다. 증거는 `.local/evidence/studio05/public-site.json`. 초기 웹 가져오기 실패·CUA 조작 시간 초과·PowerShell 파이프 한글 인코딩 문제로 자동 확인이 실패해, UTF-8 로컬 검사 파일로 원인을 분리한 뒤 실제 확인했다. 사이트나 배포 설정은 변경하지 않았다.

작업 시작 main의 커밋은 `34280e883ea94570daf9b6f0659c6898f5a2fae9`, 작업트리는 깨끗했다. 기존 지침·README·OWNER_INPUT·SYSTEM_SPEC·구조·데이터 계약·구현 계획과 05 문서를 읽었다. 이번 변경은 스테이징·커밋·push하지 않는다.

### 구현 결과

apps/studio에 Next.js 제작실을 추가했다. 로그인·로그아웃, 대화 목록/생성, 요청 입력, 작업 상세/이벤트, 모의 단계 실행, 중단 요청/확인, 모의 오류, 최대2회 재시도, DB 기록 재조회 코드를 준비했다. 새로고침 복원은 DB API 준비와 검사용 응답으로 확인했으며 실제 DB 복원은 미검증이다. 미전송 원문은 영속 저장하지 않고 브라우저에는 대화 ID·요청 UUID/해시만 저장한다. 로그아웃·세션 거절 시 입력과 비공개 화면 기록을 비운다.

서버 Route Handler마다 Auth getUser·ALLOWED_USER_IDS·DB 활성 교사를 확인하고 소유자를 서버에서 결정한다. secret 클라이언트와 Auth 쿠키 클라이언트는 분리했다. 설정이 없으면 서버503 SETUP_REQUIRED, 화면 연결 설정 필요로 차단한다. 실제 환경파일·프로세스 설정이 없음을 값 출력 없이 확인했다. 가짜 로그인·실제 AI·음성·제작/배포 자동화는 없다.

supabase/proposals에 전용 studio 스키마·teachers·요청한7테이블·RLS·별도 Data API GRANT·서버 전용 원자적 RPC의 검토안과 변경 이력을 작성했다. 원문 요청·개인 기록·키는 없다. SQL 적용·계정 생성·프로젝트 생성/변경은 하지 않았다. 이 파일은 실제 적용된 migration이 아니다. 실제 SQL 문법·RLS·GRANT·동시성·서비스 연동은 미검증이다. 설정·메뉴·변수·적용 전후 검증표는 docs/STUDIO_SETUP.md에 있다.

### 실제 로컬 검사

| 실행 | 최종 결과 |
|---|---|
| npm.cmd install --ignore-scripts | 프로젝트 의존성 설치·잠금 파일 갱신, 설치 감사 취약점0 |
| npm.cmd run typecheck:studio | 종료0; next typegen + tsc |
| npm.cmd run build:studio | 종료0; 실제 Next.js production build |
| npm.cmd run test:studio | 6/6; 인증/소유권 순수 정책·입력 위조·모의 상태/중단/한도. 실제 Auth 아님 |
| npm.cmd run test:studio:e2e | 최종4/4; 실제 미연결 API 차단,390/1440 화면·키보드·axe, 별도 UI fixture 흐름 |
| npm.cmd run validate / typecheck | 종료0; 기존 메타데이터1·공개 승인0 |
| npm.cmd run test | 기존26/26 |
| npm.cmd run test:e2e | 최종 기존 자료실9/9 |
| npm.cmd run test:genetics | 기존 유전8/8 |
| npm.cmd run build:catalog / check-pages.mjs / verify-pages-browser.mjs | 종료0;4파일·카드0·하위 경로·초안404 |
| audit-upload.mjs | 실행 당시 후보101개, 문제0. 환경파일·.next·.local·PDF·산출물 제외 |

브라우저 검사 초기 실패도 기록한다. 제작실은 Next.js 알림과 앱 오류 안내의 선택자 중복, fixture execution_mode 누락 때문에 각각 실패했고 검사 대상을 정확히 지정하고 누락 필드를 보완해 통과했다. 기존 자료실은 제작실과 동시에 기본 test-results 폴더를 사용하면서 trace ENOENT가1건 발생했다. 제작실 출력 폴더를 .local/test-results/studio로 분리하고 순서대로 재검사해9/9를 확인했다. 실패한 검사나 기준을 삭제·완화하지 않았다.

검사용 UI 응답은 tests/studio/browser에서만 주입한다. 실제 운영 API의 인증을 우회하지 않으며 fixture 검사가 끝난 뒤에도 실제 session API는503임을 확인했다. 전송 응답 유실 후 같은 요청 UUID 재전송, 표시 기록 복원, 모의 단계/중단/오류/재시도/로그아웃은 **화면·모의 검사**다. 실제 Supabase의 로그인·쿠키 갱신·저장·두 사용자 접근·Data API·RLS·원자성·재시작 복원은 전부 미검증이다.

공개 빌드 SHA-256은 이전과 같은 `cb3440667699e4c005a2c262adf925d63481023c06cd3072c1b09c843de35ad3`. 유전 초안은 정식 목록과 배포물에서 계속 제외된다. 교육과정·교과서·비용·자료 이용 범위는 미확인이다.

### 로컬 서버와 정지 지점

제작실 production 서버를 숨김 프로세스 PID52488로 시작했다. http://127.0.0.1:3000/ 에서 실제 연결 설정 필요 화면을 다시 확인했다. 서버 로그와 PID는 .local/evidence/studio05에만 둔다. 종료 시 PID가 해당 Next.js 프로세스인지 확인한 뒤 중단하고, 다시 열 때 프로젝트 루트의 PowerShell에서 npm.cmd run dev:studio를 실행한다. 화면 증거 unconfigured.png와 fixture-only.png는 공개 대상이 아니다.

사용자가 다음에 결정할 것은 Supabase 대상 프로젝트와 검토한 SQL/계정/권한 설정의 실제 적용 여부다. 실제 값은 apps/studio/.env.local에 직접 입력하며 이 파일은 만들거나 출력하지 않았다. 현재 공식 문서·Supabase MCP 문서 검색만 사용했고 외부 프로젝트의 실제 데이터·키는 조회하지 않았다. 이번 변경은 로컬에 남겨 두며 커밋·push·재배포·06단계·Vercel 배포는 하지 않는다.

최종 파일 감사도 후보101개·문제0이었다. 브라우저용 .next/static JavaScript에서 SUPABASE_SECRET_KEY·sb_secret_ 표식 파일0개, 환경파일 ignore 일치, 스테이징0개, HEAD34280e8 유지 확인. 키가 실제로 입력된 환경에서의 유출 검증을 대신하지는 않는다.

## 05 실제 연결 확인·SQL 적용 전 검토 — 2026-09-13

사용자는 science-studio 프로젝트 생성, 신규 가입·익명 로그인 OFF, 교사 계정 생성과 환경값 입력을 완료했다고 보고했다. 이번 작업 시작 시 main/HEAD `34280e883ea94570daf9b6f0659c6898f5a2fae9`와 이전 제작실 구현의 미커밋 변경을 확인했다. 기존 파일·변경을 보존했으며 스테이징·커밋·push는 하지 않았다. 이전 절의 환경값 미입력·외부 미조회는 당시 기록이고 최신 상태는 이 절을 따른다.

### 실제 읽기 전용 확인

`automation/studio/preflight.mjs`를 준비하고 프로그램 내부에서만 apps/studio/.env.local을 로드했다. 필수 6변수의 존재·형식과 앱 config.ts의 변수명 일치가 모두 통과했다. STUDIO_DB_READY의 실제 값은 false였고 파일을 변경하지 않았다. git ls-files 결과 추적0개, git check-ignore 결과 `.gitignore:7:**/.env.*` 일치다. 환경값·키·토큰·비밀번호·인증 헤더·프로젝트 URL·교사 UID·이메일/응답 원문은 출력하거나 보고서에 저장하지 않았다.

대상 프로젝트에 GET 3회만 실행했다. Auth settings HTTP200 및 disable_signup=true, 입력된 첫 허용 교사 한 명의 Admin getUserById HTTP200·ID 일치·비익명 계정 확인. studio Data API의 OpenAPI 메타데이터는 HTTP406/PGRST106이었다. 현재 studio 미노출은 확인했지만 DB가 비어 있다고 판단하지 않는다. 익명 로그인 전체 OFF는 사용자 보고이며 실제 계정 한 명이 비익명인 사실과 구분한다. 증거는 값 없는 `.local/evidence/studio05/connection-preflight.json`이다. presence/format=true는 검사 통과 표시이며 DB_READY=true 설정이 아니다.

원격 테이블·열·함수·기존 GRANT/역할 상속·RLS 정책은 API만으로 확인하지 못했다. SQL 실행 권한을 API 키로 추정하지 않았고 별도 DB/Management 연결이나 SQL 조회도 하지 않았다. 로그인·비밀번호 확인·저장·교사 활성 행 확인·두 사용자 격리·직접 쓰기 거부·동시성·롤백은 미검증이다.

### 로컬 SQL/코드 검토와 보완

적용 후보는 `supabase/proposals/studio_v1.sql` 한 파일이다. 앱의 테이블/열·소유자 복합 FK·RPC 인자·GRANT 시그니처를 대조했다. 전용 studio 스키마, teachers 및 7테이블, 8테이블 RLS, authenticated SELECT만, 서버 전용 INVOKER RPC 3개, 리뷰/승인/배포 쓰기 경로 없음이 검토안의 경계다. 서버는 실제 getUser 검증·허용 UID 검사 이후 secret DB 클라이언트를 사용하고 DB 활성 교사까지 확인한다. 브라우저의 임의 상태·승인·배포 기록은 허용하지 않는다.

중복 command UUID에 명령 종류/예상 버전 결합이 빠진 부분을 command_type 영수증과409 충돌 검사로 보완했다. 재시도 예상 state_version 검증을 서버/SQL/해시에 추가했다. 효과 없는 스키마별 기본 권한 REVOKE를 제거하고 같은 트랜잭션에서 실제 객체 REVOKE/GRANT를 유지했다. Supabase 전역 기본 권한은 변경하지 않는다. 설치 lock_timeout 5초·statement_timeout 30초, null 상태 버전 거부, 초기 이벤트를 포함한20개 저장 상한도 보완했다. RPC 인자와 함수 EXECUTE 시그니처를 같이 갱신했다. 실제 SQL 실행 검증은 아니다.

단일 트랜잭션 실패·응답 유실·재실행 시 기존 스키마를 먼저 확인하고 덮어쓰지 않는 절차를 [SQL 사전 검토](STUDIO_SQL_REVIEW.md)에 기록했다. STUDIO_SETUP.md·DATA_CONTRACTS.md·supabase/proposals/README.md를 함께 갱신했다. Auth 기본 스키마·계정·기존 데이터 삭제/수정 구문은 없다. 이미 studio가 존재하면 적용을 멈추고 별도 변경안을 준비한다.

### 실제 검사와 미검증

| 검사 | 실제 결과 |
|---|---|
| 읽기 전용 연결 checker | 환경/변수명 통과, Auth 및 지정 교사 조회 성공, studio Data API 미노출 |
| npm.cmd run test:studio | 최종13/13. 순수 정책8개·합성 preflight3개·정적 SQL 계약2개 |
| npm.cmd exec -- tsc --noEmit --project apps/studio/tsconfig.json | 종료0. Next.js 환경파일 로드 없이 타입 검사 |
| npm.cmd run test | 첫 샌드박스 실행16통과/10실패(realpath EPERM), 동일 검사 재실행26/26 통과. 코드/기준 완화 없음 |
| audit-upload.mjs | 후보105개·문제0, .env.local/.local/.next/PDF/산출물 제외 |
| git diff --check / 인덱스 / HEAD | 공백 오류0, 스테이징0, HEAD34280e8 유지 |

기존 단위 검사 안에서 공개 빌드 결정성과 미승인 유전 초안 제외도 통과했다. 이번에 제작실 build/브라우저/실제 SQL/PostgreSQL 권한/로그인·저장/Linux 검사는 실행하지 않았으며 이전 모의 성공을 실제 연동 성공으로 바꾸지 않는다. 검사 파일에 사용하는 합성 값·가짜 fetch는 실제 연결 검사와 분리되어 있다.

사용자는 적용 전 대시보드의 Table Editor/Database Schema Visualizer에서 기존 studio 객체, Integrations → Data API → Settings에서 Exposed schemas, 필요한 경우 관리자 SQL Editor의 읽기 전용 카탈로그 조회로 실제 RLS·테이블/열/함수 권한을 확인해야 한다. 실제 설정 변경과 검토 SQL·교사 활성 등록·studio 노출의 적용 여부는 사용자 확인을 기다린다. 비밀번호/키/UID를 채팅에 보낼 필요는 없다.

STUDIO_DB_READY=false 유지. 실제 SQL 적용·원격 데이터/계정/권한 변경·테스트 데이터 삽입·로그인 시도·서버 재시작·커밋·push·배포·AI 호출은 하지 않았다. 공개 자료실 및 유전 초안 배포 제외 규칙을 유지하고 05단계의 사전 검토 지점에서 대기한다.

## 05 SQL 적용 후 실제 로그인 시험 준비 — 2026-09-13

사용자가 studio_v1.sql 적용, 테이블8개 및 전체 RLS 활성화, studio.teachers의 교사 active=true, Exposed schemas에 studio 추가·저장을 완료했다고 보고했다. SQL 적용/전체 RLS 상태는 사용자 보고이며 Codex가 원격 카탈로그를 직접 확인한 결과와 구분한다. 이전 절의 SQL 미적용·API 미노출·DB_READY=false는 당시 기록이다.

README·AGENTS·OWNER_INPUT·SYSTEM_SPEC·STUDIO_SETUP·STATUS와 실제 코드·Git 상태를 읽었다. main/HEAD34280e8와 기존 미커밋 변경을 보존했다. 서버 `apps/studio/lib/supabase.ts`는 `db: { schema: 'studio' }`를 명시하고 secret을 server-only 모듈에서 사용한다. config.ts의6변수 이름과 실제 환경파일 형식이 일치함을 검사 프로그램 내부에서 확인했다. `STUDIO_ORIGIN`은 로컬 주소 http://127.0.0.1:3000 과 일치한다.

### 실제 원격 읽기 전용 검사

환경파일은 `.local/evidence/studio05/prepare-login.mjs` 내부에서만 읽었고 값·키·인증 헤더·UUID·이메일·응답 원문을 출력하거나 보고서에 기록하지 않았다. 지정된 첫 교사 한 명만 owner_id 조건/limit1로 조회했으며, 두 요청 모두 GET /rest/v1/teachers 및 Accept-Profile: studio를 사용했다. Auth 로그인 요청이나 원격 쓰기는 하지 않았다.

| 요청 | 실제 결과 |
|---|---|
| 서버 전용 secret 키 | HTTP200, 지정 교사1행의 ID 일치 및 active=true |
| 로그인 토큰 없는 publishable 키 | HTTP401, PostgreSQL 권한 오류42501, 교사 데이터 반환 없음 |

이는 서버 연결과 **미로그인 접근 거부** 확인이다. secret/service_role 조회는 RLS를 우회하므로 일반 사용자 로그인·authenticated RLS·다른 사용자 격리 성공으로 기록하지 않는다. [공식 API key 역할 설명](https://supabase.com/docs/guides/getting-started/api-keys), [공식 스키마 선택 방법](https://supabase.com/docs/guides/api/using-custom-schemas)을 확인했다. 이번 changelog.md 가져오기는 도구/네트워크 오류로 읽지 못했으며 새로운 앱 기능이나 의존성 변경은 하지 않았다.

두 기본 검사가 통과한 뒤 승인된 범위대로 apps/studio/.env.local의 STUDIO_DB_READY만 false→true로 변경했다. 단일 정의 확인, 동시 변경 확인, 다른 변수와 변경 부위 밖 전체 문자열 보존 및 쓰기 후 재확인을 수행했다. 변경 전후 파일 내용은 출력하지 않았다. git ls-files 결과 추적0개, git check-ignore 결과 `.gitignore:7:**/.env.*` 일치를 다시 확인했다. 값 없는 증거는 `.local/evidence/studio05/login-preparation.json`이다.

### 실제 로컬 미로그인 검사

이전 제작실 PID52488의 이름·Next start 여부·생성 시각·기존 PID 기록을 확인한 뒤 해당 서버만 종료했다. 최초 종료 시도는 생성 시각 소수초 비교 차이로 동작 전에 중단했고, 같은 생성 시각의 초 단위 확인 후 종료했다. 기존 `npm.cmd run dev:studio`로 숨김 개발 서버를 시작했다. 부모PID30168, 최종 대기PID22956, 127.0.0.1:3000을 확인했다. 다른 서버·공개 사이트는 변경하지 않았다.

agent-browser CLI는 설치되어 있지 않아 기존 Playwright와 Chrome으로 독립된 새 미로그인 브라우저 컨텍스트를 사용했다. fixture 주입·가짜 세션·로그인 제출은 없었다. 실제 화면 스크린샷도 읽어 확인했다.

| 검사 | 결과 |
|---|---|
| http://127.0.0.1:3000/ 및 새로고침 | HTTP200, 제작실 로그인 표시, 이메일/비밀번호/로그인 버튼 활성 |
| 미로그인 보호 화면 | 새 대화·요청 입력·작업 접수 비활성, 실제 대화/진행 기록 없음 |
| GET /api/studio/session | HTTP401, LOGIN_REQUIRED만 반환 |
| GET /api/studio/conversations | HTTP401, LOGIN_REQUIRED만 반환 |
| GET /api/studio/jobs/합성UUID | HTTP401, LOGIN_REQUIRED만 반환. 작업 생성/원격 조회 없음 |
| 브라우저 실행 오류·오류 오버레이 | pageerror0, 오버레이 없음 |

증거는 `.local/evidence/studio05/login-browser-check.json`, `login-ready.png`이며 실행 로그도 Git 제외된 같은 폴더에 있다. 개발 서버는 사용자 직접 로그인을 위해 실행한 채 둔다. 비밀번호를 채팅으로 요청하거나 입력·로그 기록하지 않았다. 실제 앱 코드·SQL·의존성을 바꾸지 않아 이번에는 전체 단위/빌드/다른 브라우저 검사를 반복하지 않았다.

남은 미검증: 실제 이메일/비밀번호 로그인과 세션 갱신·로그아웃, 로그인 사용자의 권한/다른 교사 데이터 격리, 저장·모의 작업 흐름·재시도·동시성, 원격8테이블 RLS/전체 GRANT의 직접 카탈로그 확인. DB_READY=true는 로컬 로그인 시험 허용이며 05단계 전체 완료나 공개 승인이 아니다. 기존 mock 전용 모드·유전 초안 배포 제외를 유지한다.

STUDIO_SETUP의 최신 안내를 함께 갱신했다. 원격 SQL/권한 변경·계정 생성·테스트 데이터 생성·AI 호출·스테이징·커밋·push·배포는 하지 않았다. 사용자가 브라우저에서 직접 로그인할 때까지 이 지점에서 대기한다.

## 05 실제 모의 흐름·접근 권한 검사 착수 — 검사 창 로그인 대기

2026-09-13. 사용자는 교사 로그인, 새로고침 후 로그인/시험 요청 유지, 로그아웃, 재로그인 후 대화/작업 복원을 직접 확인했다고 보고했다. 이 항목들은 사용자 실제 확인으로 기록하며 Codex의 자동 검사와 구분한다. 기존 앱·SQL·설정 문서·지침·Git 상태를 읽었고 main/HEAD34280e8 및 미커밋 변경을 보존했다.

실제 서버 전용 키로 지정 교사의 데이터만 GET 4회 조회했다. 대화/메시지의 본문·제목·이메일은 선택하지 않고 ID·소유 관계·상태·버전만 조회했다. 대화1개·메시지1개·작업1개·이벤트2개, 소유자 일치 및 대화→메시지/작업→이벤트 연결을 확인했다. 작업 e909a852-25ea-4f2d-9472-8ef1bca97de1은 mock/running, state_version=1, run_attempt=1이었다. 초기 queued 이벤트0과 running 이벤트1이 저장되어 있다. 증거는 `.local/evidence/studio05/stored-links.json`이다. **서버 키 조회이므로 일반 사용자 RLS 성공을 뜻하지 않는다.**

미로그인 Chrome/Playwright 검사 재실행은 통과했다. 로그인 화면 HTTP200, 작업 입력/접수 비활성, 실제 기록 표시 없음, session·conversations·jobs API 각각401/LOGIN_REQUIRED, pageerror0. 증거는 login-browser-check.json이다. 원격 데이터 변경은 없었다.

기존 Chrome의 제작실 탭 연결은 확인했지만 대화 전체가 자동 스냅샷으로 출력되는 일을 피하기 위해 독립된 Chrome 검사 창을 열었다. Playwright ESM 로딩/자동 Chrome 경로 조회는 도구 실행 환경 차이로 실패했고, 프로젝트 CommonJS 로딩과 실제 설치 경로를 사용해 창 열기에 성공했다. 앱/인증/권한 코드를 바꾸지 않았다. 창 주소는 http://127.0.0.1:3000/ 이며 사용자에게 이 창에서 직접 로그인하도록 요청했다. 현재 별도 검사 세션은401이므로 로그인 사용자 검사에 아직 사용할 수 없다. 비밀번호·쿠키·세션 토큰을 출력/파일 저장하거나 사용자에게 채팅 전송을 요청하지 않았다.

`.local/evidence/studio05/flow-check.cjs`에 실제 세션을 사용하는 제한된 검사 절차를 준비하고 문법을 확인했다. 현재 기존 작업의 모의 진행·이벤트·중복 접수/오래된 명령, 검사용으로 표시한 신규 모의 작업과 재시도 총2건 이내, 중단 및 authenticated 직접 DB 쓰기 거부 검사를 **아직 실행하지 않았다**. DB 직접 UPDATE 검사는 실제 행을 바꾸지 않는 불일치 조건에서 권한 오류를 확인하도록 준비했다. 실제 계정2개 간 격리는 별도 두 번째 계정 없이는 검증할 수 없으며 계정을 임의 생성하거나 기존 권한을 변경하지 않는다. SQL 역할 모의 검사도 미실행이다.

이번 착수 작업에서 추가한 원격 검사용 기록0개, 작업 상태 변경0건이다. STUDIO_DB_READY=true·모의 모드·유전 초안 배포 제외를 유지한다. 기존 코드/SQL/환경값은 변경하지 않았고 원격 SQL·권한·계정 설정 변경·삭제·AI 호출·커밋·push·배포·06단계를 수행하지 않았다. **05단계 검사는 미완료이며 독립 검사 창의 사용자 직접 로그인을 기다린다.**

### 검사 창 로그인 완료 보고 후 확인

사용자가 검사 창 로그인 완료를 알렸으나, Codex가 제어하는 독립 Playwright 컨텍스트의 실제 session API는401이고 해당 창에 Auth 쿠키가 없었다. 화면의 로그인 안내만 존재하고 로그인 실패/교사 권한 거부/설정 오류 안내는 감지되지 않았다. 다른 창의 로그인 성공 여부를 이 검사 세션의 성공으로 간주하지 않는다. 창을 앞으로 가져오고 제목과 노란 안내를 `05 검사 전용 창 · 이 창에서 로그인해 주세요`로 표시하여 사용자가 구분할 수 있도록 했다. 이는 검사 브라우저 DOM의 안내 표시이며 앱 소스나 인증 로직 변경이 아니다. 표시한 창의 직접 로그인을 다시 요청했다. 이번 후속 확인에서도 데이터 생성·모의 명령·권한 변경은 실행하지 않았으며 미검증 항목은 그대로다.

## 05 실제 로그인 세션으로 모의 흐름·접근 권한 검사 — 2026-09-13

### 검사 창 안내 정정

사용자가 노란 검사 창이 보이지 않는다고 알렸다. 이전 node_repl 도구의 창 표시/bringToFront 결과만으로 사용자 Windows에 실제 보였다고 안내한 것은 잘못이었다. Windows 창 목록에서는 해당 제목을 확인하지 못했다. 앞 절의 “앞으로 가져왔다”는 도구 동작 기록이며 실제 표시 확인으로 인정하지 않는다. 기존 격리 브라우저를 닫고 사용자 Windows 세션에서 로컬 Node/Playwright runner로 새 Chrome을 열었다. 새 Chrome PID21552·SessionId15·실제 창 핸들을 확인했다. 사용자 직접 로그인 후 이 새 컨텍스트에서 session API200, 로그인 화면 없음, 로그아웃 버튼 표시를 확인하여 아래 검사를 시작했다. 사용자의 기존 Chrome 로그인과 별개이며 비밀번호를 대신 입력하지 않았다.

### 검사 방식과 실제 통과 항목

검사는 `.local/evidence/studio05/flow-runner.cjs`와 `flow-check.cjs`에서 수행했다. 환경파일·쿠키·토큰은 프로그램/브라우저 내부에서만 사용했고 출력/증거 파일에 저장하지 않았다. 실제 앱 `/api/studio/*`에 사용자 세션 쿠키로 요청했다. 직접 Data API 검사는 **publishable 키 + 이 로그인 사용자의 authenticated 토큰**을 사용했다. 이 검사 프로그램은 secret 키를 요청에 사용하지 않았다. 앱 내부의 정상 서버 DB 경로와 별개다. SQL 역할 모의 검사·가짜 API 응답·가짜 로그인은 사용하지 않았다.

| 항목 | 실제 결과 / 검사 방식 |
|---|---|
| 기존 저장 연결 | 실제 세션의 앱 API로 대화1·메시지1·작업1·이벤트2를 읽고 소유자, 대화/메시지 client_request_id, 작업/이벤트 참조 일치 확인 |
| 같은 요청ID 재전송 | 기존 요청 봉투를 앱 API로 동시에2회 전송해 같은 작업 ID 반환. 작업·메시지·이벤트 증가 없음 |
| 같은 ID의 다른 요청 내용 | 앱 API409, 기존 기록 유지 |
| 모의 진행 | 기존 running/source_review에서 단계별 advance. learning_design→development→independent_review→testing→policy_check→needs_input, 최종 MOCK_FINISHED_NO_EVIDENCE |
| 이벤트 순서 | 최종 상태 버전7, 초기 이벤트를 포함한8개, sequence 연속 및 state_version 일치 |
| 같은 명령ID 재전송 | 이전과 같은 명령·예상 버전은200 재사용, 이벤트 추가 없음 |
| 오래된 상태/명령ID 충돌 | 오래된 버전의 새 명령 및 같은 UUID의 다른 명령 각각409, 상태/이벤트 추가 없음 |
| 모의 오류 | 검사용으로 표시한 새 요청을 앱 API로 생성 후 simulate_error. failed 및 MOCK_SIMULATED_FAILURE 저장/응답 확인 |
| 재시도 | 새 ID·attempt2·retry_of 원본 연결, 원본 failed 유지. 같은 retry UUID 재전송은 동일 successor, 오래된 예상 버전 재시도409 |
| 중단 | 재시도 작업 cancel_requested→별도 advance로 cancelled, 이벤트0/1/2가 queued/요청/중단과 일치. 늦은 중단 명령409 |
| 본인 데이터 직접 조회 | authenticated Data API jobs SELECT200, 기존 작업 표시 및 반환 행의 소유자 일치 |
| 타 소유자 필터 | 동일 실제 사용자 토큰에서 owner_id != 본인 조회가 빈 배열. 다른 사용자 데이터가 실제 존재하는 테스트는 아니므로 두 계정 격리 입증으로 계산하지 않음 |
| 직접 상태/승인/배포 UPDATE | jobs·approvals·releases 모두403/42501. 실제 행을 변경하지 않는 불일치 ID 조건 사용. 단순 빈 결과가 아니라 객체 권한 거부를 확인 |
| 직접 승인/배포/이벤트 INSERT | approvals·releases·job_events에 빈 payload로 각각403/42501. 허위 승인/배포 행은 생성하지 않음 |
| 직접 RPC EXECUTE | authenticated로 new_conversation 호출403/42501. 권한 회귀가 있어도 행을 만들 수 없는 null 제목 사용 |
| 미로그인 보호 | 별도 빈 컨텍스트의 화면 잠금 및 session/conversations/jobs 각401 검사 통과(이번 검사 착수 시 실행) |

실행 helper의 요청49회/상한120, 내부 확인79개 실패0이었다. 내부 확인에는 반복 HTTP/상태 검사도 포함되므로 독립된 테스트79종이라는 뜻은 아니다. 원문 요청·이메일·UID·토큰 없이 필요한 작업 ID/상태/카운트만 `.local/evidence/studio05/real-flow-results.json`에 기록했다. 오류 이유는 실제 API의 error_code와 DB 기록을 확인했으며 한국어 화면 문구 매핑은 기존 UI 코드 검토다. 실패 상태의 실제 화면 렌더링을 자동 확인했다고 주장하지 않는다.

### 추가 기록과 최종 상태

| 구분 | 작업 ID | 최종 상태 | 기록 |
|---|---|---|---|
| 기존 시험 작업 | e909a852-25ea-4f2d-9472-8ef1bca97de1 | needs_input, 버전7, attempt1 | 기존 요청/메시지 보존, 모의 진행 이벤트 추가 |
| 추가 검사용 오류 작업 | 01f25748-8ccf-4595-acbb-20eb1c2e7e63 | failed, 버전1, attempt1 | 주제/요청에 ‘검사용’ 표시, MOCK_SIMULATED_FAILURE |
| 추가 검사용 재시도 | d28587a7-c3ea-4c07-a1f3-9f45bcc3df97 | cancelled, 버전2, attempt2 | 위 오류 작업을 retry_of로 참조, 검사용 요청 상속 |

추가 대화0개·작업2개·메시지2개다. 최종 기존 대화 안에 작업3개·메시지3개가 있고 원본은 삭제/덮어쓰지 않았다. 기존 이벤트2개에서 기존 작업8개+오류 작업2개+중단 작업3개로 기록되도록 각 전이를 확인했다. 직접 DB 값을 바꿔 상태를 꾸미지 않았으며 상태 쓰기는 모두 앱의 모의 API를 거쳤다.

### 실패·수정·미검증과 다음 조작

앱/SQL 기능 검사 실패나 인증·권한 오류를 우회한 수정은 없었다. 검사 창이 사용자에게 보이지 않았던 도구 사용 오류는 위와 같이 정정했다. 로컬 runner 제어 JSON의 PowerShell UTF-8 BOM으로 첫 명령이 읽히지 않아 BOM 없는 UTF-8 기록으로 고쳤다. 이때 앱 호출이나 데이터 변경은 발생하지 않았다. 앱 코드·SQL·권한·의존성은 수정하지 않아 전체 기존 단위/빌드 검사는 이번에 반복하지 않았다. git diff --check 오류0, 스테이징0, HEAD34280e8 및 환경파일/검사 증거의 Git 제외를 확인했다.

남은 미검증은 실제 두 교사 계정 사이의 조회/명령 격리, 비허용 실제 계정·익명 계정, 세션 만료/토큰 갱신, 원격 전체 RLS/GRANT 카탈로그 직접 확인과 SQL 역할 모의 검사, 모의 실패 문구의 실제 화면 확인이다. 현재 사용자로 본인 데이터 조회/직접 쓰기 거부가 통과했다는 사실을 전체 RLS 검증 완료로 확대하지 않는다. [공식 문서](https://supabase.com/docs/guides/database/postgres/row-level-security)의 객체 권한과 행 정책 구분을 유지한다.

사용자는 기존 Chrome의 http://127.0.0.1:3000/ 에서 새로고침 후 작업3개와 실패 이유/중단 상태를 확인할 수 있다. 두 계정 격리를 계속 검증하려면 별도 검사용 교사 계정과 그 계정의 시험 기록이 필요하다. 계정 생성은 Authentication → Users → Add user, 활성 등록은 Table Editor → studio → teachers, 서버 허용 목록은 .env.local의 ALLOWED_USER_IDS에서 준비하되 추가 계정/허용 등록 범위는 사용자 확인 후 진행한다. 이번에 계정을 임의 생성하거나 기존 계정 권한을 변경하지 않았다. 비밀번호·키·토큰은 채팅에 보내지 않는다.

STUDIO_DB_READY=true, 모의 모드, 유전 초안 배포 제외를 유지한다. 원격 SQL·권한·계정 설정 변경·실제 AI·공개 승인/배포·커밋·push·06단계는 수행하지 않았다. STUDIO_SETUP의 최신 상태를 함께 갱신하고 05단계에서 대기한다.

최종 저장 결과는 별도의 서버 키 읽기 전용 GET 4회로 다시 확인했다. 대화1개·메시지3개·작업3개·이벤트13개이며 각 작업의 이벤트는8/2/3개, 소유 관계와 메시지 연결이 모두 일치했다. 이 저장 확인은 authenticated 권한 검사와 분리하여 `stored-links-after-flow.json`에 기록했고 초기 `stored-links.json`은 보존했다. 검사 전용 Chrome 창과 runner는 정상 종료했다. 사용자 기존 Chrome과 제작실 개발 서버는 유지했다.

## 05 두 계정 격리 검사 준비 — 2026-09-15

사용자가 A=기존 본인, B=새 임시 검사용 교사 계정으로 지정했고 B의 Authentication 생성 및 studio.teachers 등록·active=true를 확인했다고 보고했다. 이번에는 해당 원격 상태를 직접 조회하거나 변경하지 않았다. 사용자 ID는 실제 환경파일과 Git 제외된 로컬 준비 프로그램에서만 사용하고 공개 문서에 복사하지 않는다.

AGENTS·README·OWNER_INPUT·SYSTEM_SPEC·STUDIO_SETUP·STATUS·실제 코드와 Git 상태를 확인했다. config.ts는 ALLOWED_USER_IDS를 쉼표 split→trim→빈 항목 제거로 읽고 UUID 형식과 비어 있지 않은 목록을 검사한다. service.ts는 getUser→허용 목록→DB active 교사를 확인한다. 이 코드를 변경하거나 모든 사용자를 허용하지 않았다.

`.local/evidence/studio05/prepare-two-accounts.mjs` 내부에서만 apps/studio/.env.local을 로드했다. 기존 A와 목록 순서를 보존하면서 지정된 B만1회 추가했다. 반영 후 허용 계정2개, 기존 계정 보존, 신규 추가가 B뿐임, 다른 환경값 전체 일치, STUDIO_DB_READY=true 값 보존, Origin=http://127.0.0.1:3000 일치를 확인했다. 파일의 ALLOWED_USER_IDS 값 부분 외 문자열은 그대로 보존했고 파일 내용·키·비밀번호·토큰을 출력하지 않았다. 환경파일은 추적0개이며 `.gitignore:7:**/.env.*`로 계속 제외된다. 값 없는 결과는 `.local/evidence/studio05/two-account-preparation.json`에 기록했다.

확인 당시 3000 포트는 비어 있어 기존 명령 npm.cmd run dev:studio로 제작실만 실행했다. 실행 부모PID28612, 최종 Next 대기PID24540, 주소 http://127.0.0.1:3000/ 이다. A의 계정 데이터·브라우저 쿠키/로그인 정보를 변경하지 않았다. 프로젝트 설치·전역 설정·실행 정책 변경도 없다.

별도 빈 Chrome/Playwright 컨텍스트에서 로그인 화면 HTTP200, 로그인 입력란 활성, 보호 작업 비활성, session/conversations/jobs API 각각401/LOGIN_REQUIRED, pageerror0/오류 오버레이 없음 확인. 이 검사는 접속 준비 확인이며 A/B의 실제 로그인이나 데이터 격리 성공이 아니다. 로그인을 제출하지 않았고 원격 SQL·RLS·권한·계정 변경, 새 대화/작업 생성은 하지 않았다.

**실패 문구의 실제 화면 표시는 사용자도 확인하지 않았으며 계속 미검증이다.** 이전 API 오류 코드 확인과 UI 코드 검토를 화면 통과로 기록하지 않는다. STUDIO_SETUP에 제작실 배포 전 필수 확인 항목으로 명시했다. A/B 실제 데이터 격리와 세션 만료/갱신 등 기존 미검증 사항도 유지한다.

**B는 격리 검사용 임시 계정이며 검사 후 이용 권한 회수가 필요하다.** 후속 사용자 확인을 받고 로컬 허용 목록에서 B 제거·서버 반영, teachers.active 비활성화 및 필요한 세션 처리를 확인해야 한다. 로컬 허용 목록 제거만으로 직접 Data API 접근이 차단된다고 판단하지 않는다. 지금 B를 삭제하거나 권한을 회수하지 않았다.

기존 미커밋 변경과 HEAD34280e8, 스테이징0을 유지한다. 이번 변경은 로컬 환경파일의 B 추가, 관련 준비 증거와 STUDIO_SETUP/STATUS 기록이다. 커밋·push·배포·실제 A/B 격리 검사·06단계는 진행하지 않았다. 사용자의 직접 로그인을 위한 준비 완료 지점에서 대기한다.

## 05 A/B 로그인 실패 진단 — 2026-09-15

사용자는 두 계정의 active/이메일 확인/미차단 상태를 별도로 확인했다고 보고했다. 이번에는 계정·비밀번호·원격 SQL/RLS/권한을 변경하지 않았다. 기존 변경과 이력을 보존하고 로그인 경로, 환경 파싱, 기존 서버 로그를 점검했다.

확인된 실패 원인은 Supabase 비밀번호 로그인 호출의 통신 실패와 이를 자격 증명 오류로 오인하게 만드는 로컬 오류 처리다. 기존 서버 stdout에는 로그인 POST 401이 9건 있었고 stderr에는 `AuthRetryableFetchError`, `status: 0`, `fetch failed`가 34회 있었다(재시도를 포함할 수 있어 사용자 로그인 시도 수와 같지 않음). 설치된 auth-js의 fetch 구현은 통신 예외를 상태0으로 변환하며 service.ts는 signInWithPassword의 모든 반환 오류를 LOGIN_FAILED로 바꾸고 있었다. 해당 경로는 allowlist/active 교사 검사보다 앞선다. 비밀번호가 잘못됐다는 근거로 처리하지 않는다. 원래 로그에는 DNS/TLS/시간 초과 등 세부 원인이 없어 통신 실패의 하위 원인은 미확정이다. 별도 검사 프로세스의 읽기 전용 Auth health GET은 HTTP200이었으나, 이것을 실패 당시 서버의 연결 상태나 로그인 복구 성공으로 간주하지 않는다.

환경파일은 검사 프로그램 내부에서만 읽었으며 수정하지 않았다. 앱과 같은 쉼표 split→trim→빈 항목 제거 및 UUID 검사에서 서로 다른 정상 UUID2개, 기존 A 보존, 지정 B 포함을 확인했다. Next.js의 @next/env 로더로도 .env.local 로드·파일과 값 일치·따옴표/공백/줄바꿈 오염 없음·STUDIO_DB_READY=true 보존·Origin 일치를 확인했다. 셸의 동명 환경변수 덮어쓰기 없음을 확인했고 파일 수정시각도 B 추가 시점 그대로였다. 값 없는 결과는 `.local/evidence/studio05/login-diagnosis-env.json`에 남겼다. Git 추적0 및 ignore 적용을 재확인했다.

최소 코드 수정: login-error.mjs에서 invalid_credentials, 통신/서비스 장애, 요청 제한, 기타 Auth 거절을 분리했다. studio.tsx는 각 범주의 안내를 따로 표시한다. service.ts는 비밀번호 로그인, 세션 사용자 확인, 허용 목록, active 교사 검사 실패 단계를 고정된 코드·숫자 상태만으로 기록한다. 이메일/사용자 ID/비밀번호/원본 오류 객체/메시지/토큰/키는 추가 진단 로그에 포함하지 않는다. 인증·허용 목록·active·RLS·Data API 접근 규칙은 완화하지 않았다. [Supabase 공식 오류 코드 문서](https://supabase.com/docs/guides/auth/debugging/error-codes)와 설치된 Next.js 환경변수/오류 처리 가이드를 확인했다.

소속과 프로세스 트리를 확인한 기존 제작실 서버만 종료하고 `npm.cmd run dev:studio`로 재시작했다(새 부모 PID57080). 새 서버의 .env.local 로드 및 Ready 로그를 확인했다. http://127.0.0.1:3000/ 화면 HTTP200, 로그인 입력 활성, 보호 기능 비활성, 세션/대화/작업 API 모두401 LOGIN_REQUIRED, pageerror0을 실제 브라우저에서 확인했다. 새 로그의 로그인 POST는0건으로 아직 A/B 재로그인을 실행하지 않았다. 증거는 `.local/evidence/studio05/login-diagnosis-browser.json`, `login-diagnosis-dev.*.log`이며 모두 Git 제외 영역이다.

Windows 실제 검사: test:studio 15/15, 제작실 tsc 타입 검사 성공, 기존 test 26/26, build:catalog 성공(공개 카드0/미승인 유전 초안 제외), build:studio 성공, test:studio:e2e 5/5 성공. 추가 회귀 검사는 오류 분류와 민감 정보 제외, 모의 응답에 따른 로그인 안내 구분이다. 화면 fixture 결과는 실제 Supabase 로그인 성공이 아니다. 실제 로그인으로 발생한 모의 작업 실패 이유의 화면 확인은 기존대로 미검증이다. Linux 실행, A/B 재로그인과 두 사용자 데이터 격리, 기존 세션 만료/갱신 등은 미검증으로 유지한다.

B는 임시 격리 검사 계정으로 유지하며 검사 후 사용자 확인을 거쳐 이용 권한 회수가 필요하다. 기존 대화/작업/쿠키를 변경하거나 검사용 계정을 만들지 않았다. 커밋·push·배포·실제 AI 호출·06단계는 수행하지 않았다. 사용자 A/B 재로그인을 기다린다.

### 사용자 확인: A/B 화면에서의 데이터 분리 — 2026-09-15

사용자가 A 로그인과 기존 기록 조회, B 로그인 후 A 기록 비표시, B 요청 생성 및 새로고침 후 유지, A에서 B 기록 비표시를 직접 확인했다고 보고했다. 이는 사용자 확인 화면 검사 결과이며 아래 에이전트의 실제 API/RLS 검사 결과와 구분한다. 세션 만료/갱신, 모의 작업 실패 문구의 실제 화면 표시, 검사 후 B 이용 권한 회수는 후속 미검증 항목으로 유지한다.

### A/B 실제 API·RLS 격리 검사 결과 — 2026-09-15

Windows의 서로 분리된 실제 Chrome 프로세스/브라우저 컨텍스트 두 개에 사용자가 직접 A/B로 로그인했다. 처음 열린 창을 사용자가 닫아 다시 열었고, 기존 검사 실행기를 종료하여 이중 실행을 방지했다. 실제 표시되는 창 핸들2개 및 두 컨텍스트의 session HTTP200을 확인했다. 검사 프로세스만 node --use-system-ca로 실행했으며 기존 NODE_USE_SYSTEM_CA=1 제작실 서버는 재시작하거나 변경하지 않았다.

쿠키에서 사용자 토큰을 검사 프로세스 메모리 안에서만 사용했다. 토큰의 계정 구분에 더해 공개용 키+각 사용자 토큰으로 Supabase Auth /user GET을 실행해 각 계정의 실제 사용자임을 검증했다. 공개용 키와 실제 authenticated 사용자 토큰으로 Data API를 호출했다. 관리자 Secret key·SQL 역할 모의 검사는 사용하지 않았다. 이메일·키·토큰·쿠키·본문은 출력/보고서에 저장하지 않았고 storageState/trace/스크린샷도 만들지 않았다.

제작실 API 결과: 각 사용자 본인 대화 목록/대화 상세(메시지·작업 포함)/작업 상세(이벤트 포함)는 HTTP200이었다. 상대의 실제 대화 ID와 작업 ID를 교차 조회하면 양방향 모두404 NOT_FOUND만 반환했다. 별도 messages/events 전용 경로는 없으므로 실제 구현된 상위 상세 응답에서의 차단을 확인했다. 상대 모의 작업에 cancel/retry/advance/simulate_error 명령을 보내 모두404를 확인했다. owner_id 쿼리로 목록 소유자를 바꿀 수 없었고, 본인 작업 명령 본문에 상대 owner_id를 추가하면400 INVALID_REQUEST였다. x-user-id 헤더 위조로도 상대 작업 조회가 허용되지 않았다.

Supabase RLS 결과: teachers/conversations/messages/jobs/job_events 5개 테이블에서 각 계정의 실제 본인 행을 공개용 키+본인 토큰으로 HTTP200/1행 조회했다. 동일한 실재 ID를 상대 토큰으로 조회하면 양방향 HTTP200/0행이었다. 연결 실패·임의 ID·관리자 조회 성공을 RLS 차단으로 간주하지 않았다. 두 계정의 직접 jobs UPDATE는 본인/상대 실제 작업 모두403/42501이었다. 안전을 위해 상태 값은 현재 값과 같게 요청했으며 권한 거절 자체를 확인했다. approvals/releases/job_events INSERT는 빈 본문으로, approvals/releases UPDATE는 일치하지 않는 ID로 보내 모두403/42501을 확인했다. 제약 오류나 빈 수정 성공을 통과로 처리하지 않았다. 서버 전용 RPC new_conversation/submit_job/transition_mock_job 3개는 부작용을 만들 수 없는 null 인수로 호출하여 두 계정 모두403/42501 EXECUTE 거절을 확인했다. 실제 승인/배포 행을 생성하거나 공개 작업을 실행하지 않았다.

기존 A의 검사용 모의 실패 작업은 failed/state_version1/이벤트2, 기존 B의 시험 요청은 queued/state_version0/이벤트1로 검사 전후 동일했다. 각 대상 대화의 메시지·작업 목록과 상세 작업·이벤트 응답을 메모리에서 전체 비교하여 변경 없음도 확인했다. A 대화는 메시지3/작업3, B 대화는 메시지1/작업1을 유지했고 추가 생성0건이다. 무단 접근·변경 성공은 발견되지 않았다.

검사 프로그램 기준 실제 요청80회, 검증 조건97개 모두 통과(중복 확인을 포함한 assertion 수이며 독립 시나리오97개를 뜻하지 않음). 실제 로그인/화면 로드 및 별도 status 확인 요청 수는 이80회에 포함하지 않는다. 코드와 조건, 실제 기록 ID/상태 및 결과는 Git 제외된 .local/evidence/studio05/isolation-check.cjs 및 isolation-evidence.json에 남겼다. 원본 응답과 사용자 ID/토큰은 보고서에 없다. 검사 전용 창/실행기는 정상 종료했고 사용자 일반 창·제작실 서버는 유지했다. git diff --check 통과, 환경파일 및 증거의 Git 제외를 확인했다. 앱 코드 변경이 없어 기존 빌드/단위 검사는 이번에 반복하지 않았다.

남은 미검증: 세션 만료/갱신, 모의 작업 실패 문구의 실제 화면 표시, B 권한 회수 후 차단, reviews/approvals/releases의 실재 타인 행을 이용한 RLS 격리, 원격 전체 정책 카탈로그/SQL 역할 모의 검사. 이번 결과는 검사한 5개 테이블의 실재 행 격리와 명시한 쓰기/RPC 권한 검사의 범위다. 원격 SQL/RLS/권한/계정 설정 변경, 기존 기록 삭제/덮어쓰기, 실제 AI 호출, 커밋·push·배포·06단계는 수행하지 않았다. 05단계에서 후속 지시를 기다린다.

### 시스템 CA를 사용하는 일회성 제작실 재시작 — 2026-09-15

후속 진단에서 Windows가 보는 사이트 인증서는 Subject=supabase.co, Issuer=ePrism SSL이며 자체 서명 ePrism SSL 루트가 CurrentUser/LocalMachine Trusted Root 모두에 있음을 확인했다. 기본 Node v24.15.0 fetch는 SELF_SIGNED_CERT_IN_CHAIN, 별도 --use-system-ca 프로세스는 인증 헤더 없는 Auth health HTTP401이었다. Windows 별도 체인 검사에는 RevocationStatusUnknown이 남았으며 폐기 여부 검증 완료로 처리하지 않는다.

사용자가 일회성 서버 적용을 승인하여 소속을 확인한 기존 제작실 프로세스 트리만 종료했다. 시작 셸의 프로세스 환경에만 NODE_USE_SYSTEM_CA=1을 잠시 적용하고 기존 npm.cmd run dev:studio로 새 서버를 실행했으며, 시작 셸 값은 즉시 원복했다. 새 서버와 자식 프로세스가 설정을 상속한다(부모PID33840, Next 대기PID63060). 서버를 종료하면 이 일회성 적용은 끝나며 다음 일반 실행에 자동 적용되는 설정은 만들지 않았다.

같은 실행 환경의 별도 Node 검사에서 TLS 검증을 유지한 인증 헤더 없는 /auth/v1/health GET이 HTTP401을 반환했다. 실제 비밀번호 로그인은 제출하지 않았다. 브라우저에서 http://127.0.0.1:3000/ HTTP200, 로그인 제목 및 입력/버튼 활성, 미로그인 session API401 LOGIN_REQUIRED, pageerror0을 확인했다. 최초 인라인 화면 검사는 실패했으며 한글 전달 문제를 피한 Unicode 이스케이프 검사로 재확인했다. .env.local 및 루트/제작실 package.json은 변경 전후 해시가 같았다. 인증서 저장소·Windows 영구 환경변수·원격 SQL/RLS/계정·비밀번호·키를 변경하지 않았고 인증서 검증을 비활성화하지 않았다. 기존 미커밋 파일은 보존한다. 로컬 실행 로그는 Git 제외된 .local/evidence/studio05/system-ca-dev.*.log에만 남는다. 커밋·push·배포·06단계 없이 사용자의 A/B 직접 로그인 시험을 기다린다.

## 05 실제 세션 갱신·실패 안내 화면 확인 — 2026-09-15

현재 인증 코드와 STATUS를 읽고 이번 두 항목만 검사했다. 기존 A/B API·RLS 격리 검사를 처음부터 다시 실행하지 않았다. 별도 실제 Chrome A/B 검사 창에 사용자가 직접 로그인했고 기존 일반 브라우저의 A 세션은 사용하거나 변경하지 않았다. B 검사 프로세스에는 --use-system-ca를 적용했으며 기존 제작실 서버의 프로세스 한정 NODE_USE_SYSTEM_CA=1은 유지했다. 영구 환경값·TLS 검증·인증서 저장소·원격 SQL/RLS/계정/Auth 설정은 변경하지 않았다.

**실제 갱신 요청과 앱 반영:** B의 유효한 사용자 세션으로 설치된 Supabase SSR SDK의 refreshSession을 실행했다. 검사 fetch 어댑터가 실제 /auth/v1/token?grant_type=refresh_token 요청1회와 HTTP200을 확인했고, SDK의 cookie setAll 어댑터가 B 검사 컨텍스트에 새 인증 정보를 반영했다. 이 첫 검사는 별도 SDK/검사 쿠키 어댑터 경로임을 명시한다. 갱신 후 실제 앱 session·본인 대화 상세·페이지 새로고침이 성공했고 A 대화는404였다. 사용자 토큰/쿠키/키는 프로세스 메모리에서만 사용했으며 값·원문 응답을 저장하거나 출력하지 않았다. [공식 refreshSession 문서](https://supabase.com/docs/reference/javascript/auth-refreshsession)를 확인했다.

**실제 앱 SSR 갱신 경로:** 수동 갱신 API를 추가하지 않았다. 서명된 access token과 refresh token은 그대로 두고 B 검사 쿠키의 서명되지 않은 SDK expires_at 메타데이터만 과거 값으로 바꿔 기존 getUser 경로가 갱신을 실행하게 했다. 실제 /api/studio/session은 HTTP200과 Set-Cookie를 반환했고 refresh token 교체 및 유효한 B 인증 정보를 확인했다. 다음 요청과 새로고침에서 B 기록 조회와 A 기록404를 확인했다. 이는 실제 서버 갱신/쿠키 반영 검사지만 만료 조건은 재현한 것이며 서명된 JWT의 자연 만료 검사는 아니다.

**만료·갱신 불가의 구분:** 검사 시작 당시 정상 서명 B 토큰의 수명은3600초, 잔여3574초였다. 만료까지 기다리지 않았으며 JWT 내용·시스템 시각·프로젝트 만료 설정은 바꾸지 않았다. 자연 만료 후 갱신, 실제 전체 세션 종료/폐기 후 재사용 차단은 미검증이다. 별도로 B 검사 쿠키의 갱신 자격정보를 사용 불가 검사용 값으로 바꾸고 SDK 만료 메타데이터를 재현했을 때, 실제 앱의 모의 중단 명령은401 LOGIN_REQUIRED로 차단됐다. 페이지에는 재로그인 안내, 비활성 작업 접수, 비공개 기록 제거가 표시됐다. 이후 검사 메모리에 보관한 유효한 B 쿠키를 해당 검사 컨텍스트에 복원하고 기존 대화/작업 응답이 그대로인지 확인했다. 기존 기록 삭제·중복 생성0건이다. 이는 모의 실패 조건에 대한 실제 앱 거부 검사이며 원격 세션을 실제 폐기하거나 자연 만료시킨 검사가 아니다. access token 만료와 전체 세션 종료를 동일하게 취급하지 않는다. [공식 세션 설명](https://supabase.com/docs/guides/auth/sessions)을 확인했다.

**실패 안내의 실제 화면과 발견한 문제:** 기존 A 소유 failed 작업 01f25748-8ccf-4595-acbb-20eb1c2e7e63을 실제 소유자 세션으로 열었다. 최초 검사 도구가 목록 첫 대화를 잘못 선택해 진행되지 않았으므로 대상 대화의 실제 ID로 탐색하도록 수정했다. 작업 선택 컨트롤에는 명시적인 접근성 이름을 부여했다. 올바른 대상에서 ‘모의 오류’, ‘검사용 모의 오류입니다. 실제 제작은 실행하지 않았습니다.’ 및 활성 재시도 버튼을 확인했지만, 새로고침하면 최신 작업으로 돌아가 실패 안내가 사라지는 앱 문제를 재현했다.

**최소 수정과 재검사:** studio.tsx에서 조회에 성공한 작업 ID만 studio:last-job에 기록하고, 대화를 열 때 해당 대화의 작업 목록에 포함된 ID에 한해 선택을 복원한다. 포함되지 않으면 기존대로 최신 작업을 선택한다. 로그아웃/인증 실패 때는 이 탐색 ID도 제거한다. 인증 정보나 본문을 저장하지 않는다. 새로고침 복원 회귀 테스트를 추가했다. 실제 A 소유자 화면의 재검사에서 실패 상태·이유·재시도 버튼이 새로고침 후에도 유지됐고 작업/이벤트 전체 응답은 변경되지 않았다. 초기 안내 요소가 주입된 검사 화면에서 pageerror2가 관찰됐으므로 최종 검사는 안내 요소를 주입하지 않은 별도 브라우저 컨텍스트에서 실시했다. 최종 pageerror0, 자격정보/내부 오류 노출 없음, 하얀 화면/무한 로딩 없음을 확인했다. 재시도 버튼은 표시·활성만 확인하고 실행하지 않았다.

Windows 실제 검사 결과: test:studio 15/15, 기존 test 26/26, build:catalog 성공(공개 카드0), build:studio 및 포함된 타입 검사 성공, test:studio:e2e 6/6, git diff --check 성공. 실제 B 검사 결과는 .local/evidence/studio05/lifecycle-evidence.json, 실제 실패 화면의 수정 전 실패와 수정 후 성공은 failed-screen-evidence.json에 구분해 보존했다. 모두 Git 제외이며 쿠키/토큰/키/이메일/화면 전체 내용을 기록하지 않았다. 앞선 화면 검사 도구 실패는 API/세션 검사 통과와 구분한다.

남은 미검증은 정상 서명 토큰의 자연 만료 시점 및 그 후 갱신, 실제 전체 세션 종료/폐기 처리, reviews/approvals/releases의 실재 타인 행 격리, B 권한 회수 후 차단이다. 이번 실제 세션 갱신·앱 반영, 모의 갱신 불가 처리, 실제 실패 안내 화면은 위 범위에서 확인했다. 기존 미커밋 변경을 보존하고 앱 선택 복원/접근성 이름·관련 화면 테스트·STATUS만 보완했다. 실제 AI 호출·커밋·push·배포·06단계 없이 05단계에서 대기한다.

## 05 reviews/approvals/releases 실제 DB 역할별 격리 확인 — 2026-09-15

이번 요청의 세 테이블만 검사했다. 연결된 Supabase 관리 도구의 SQL 실행 수단을 확인했고, science-studio 프로젝트가 로컬 환경 설정의 대상과 일치함을 값 노출 없이 확인했다. Secret key로 임의 SQL을 실행한 것이 아니다. 실제 원격 카탈로그에서 열·PK/FK/UNIQUE 제약조건·정책·테이블 및 열 권한을 조회하여 준비 SQL과 대조했다. 세 테이블 모두 RLS 활성, 소유자 postgres, FORCE RLS 비활성이고, authenticated에는 SELECT만 있으며 INSERT/UPDATE/DELETE 권한은 없다. owner_read 정책은 auth.uid() 소유 관계와 활성 교사를 요구한다. 사용자 정의 트리거와 rewrite rule은 없고 내부 FK 트리거만 있어 검사용 INSERT로 실행되는 사용자 정의 외부 작업은 없었다.

하나의 SQL 호출/연결/트랜잭션에서 기존 A/B 검사용 mock 작업을 부모로 사용하여 각 테이블에 계정별 1행씩 총 6행을 임시 생성했다. 기존 작업·교사·기록을 수정하지 않았다. 모든 값은 rollback-only 검사용 표시와 비실제 해시/주소를 사용했다. 관리자 준비 단계에서 각 테이블 2행의 존재를 먼저 확인한 뒤 SET LOCAL ROLE authenticated 및 A/B의 실제 사용자 ID에 해당하는 트랜잭션 한정 JWT claim 조건을 설정했다. current_user=authenticated, superuser=false, BYPASSRLS=false, 테이블 소유자 권한 상속 없음, row_security_active=true와 auth.uid() 일치를 실제로 확인했다.

| 테이블 | A/B 각각 본인 조회 | A→B 및 B→A 조회 | A/B 각각 직접 INSERT·UPDATE·DELETE |
| --- | --- | --- | --- |
| reviews | 각 1행, 통과 | 실재 상대 행 각 0행, 통과 | 모두 42501 권한 거부 |
| approvals | 각 1행, 통과 | 실재 상대 행 각 0행, 통과 | 모두 42501 권한 거부 |
| releases | 각 1행, 통과 | 실재 상대 행 각 0행, 통과 | 모두 42501 권한 거부 |

본인/상대 조회 12개 조건과 쓰기 거부 18회를 확인했다. INSERT는 제약조건에 맞는 본인 fixture 복제/새 ID, UPDATE는 본인 fixture의 동일 값, DELETE는 본인 fixture ID만 대상으로 했다. 따라서 빈 대상이나 잘못된 입력의 제약조건 오류를 권한 차단으로 처리하지 않았다. 예상 권한 오류만 하위 EXCEPTION 블록에서 처리하여 다음 검사를 진행했다. 다른 오류/예상 밖 성공은 전체 fixture 블록을 취소하고 중단하도록 구성했으며, 최상위에는 COMMIT 없이 반드시 ROLLBACK을 실행했다. 이번 실행은 모두 통과했다.

ROLLBACK 후 별도 읽기 전용 SQL 요청으로 각 테이블의 fixture ID 잔존 0행과 전체 행 수 0행을 재확인했다. 검사 전 전체 행 수도 각각 0행이었으므로 승인/배포 기록을 남기지 않았다. 기존 부모 작업의 A/B 교사 active 상태는 모두 유지됐다. 공개 사이트는 검사 전후 HTTP200이고 HTML SHA-256이 동일했다. 배포 실행은 없었다.

이 결과는 **실제 DB에서 authenticated 역할과 사용자 식별 조건을 설정한 RLS 검사**이다. 실제 A/B 로그인 토큰의 Data API 호출 검사가 아니며, 미커밋 행을 별도 HTTP에서 조회하지 않았다. 세 테이블의 실재 타인 행 격리는 이 SQL 방식으로 확인했지만, 실제 로그인 토큰을 사용한 세 테이블의 실재 행 격리 경로는 이번에 확인하지 않았다. 정상 서명 토큰의 자연 만료 및 이후 갱신, 실제 전체 세션 종료/폐기, B 이용 권한 회수 후 차단은 계속 미검증이다. B는 활성 임시 검사용 계정으로 유지하며 후속 권한 회수가 필요하다.

실행 SQL·조건별 결과·롤백 후 확인은 Git 제외 경로 .local/evidence/studio05/remaining-rls-rollback.sql, remaining-rls-evidence.json, remaining-rls-postcheck.sql에 보존했다. 키·토큰·비밀번호·연결 문자열을 출력/저장하지 않았다. 기존 제작실 서버의 프로세스 한정 시스템 CA 설정을 유지했고, 공개 사이트 확인용 별도 Node 프로세스도 --use-system-ca를 사용했다. 영구 환경값·인증서·원격 스키마/RLS/권한/계정은 변경하지 않았다. 앱 코드 수정이 없어 기존 전체 검사·빌드를 반복하지 않았고, docs/STATUS.md와 비공개 검사 증거만 추가했다. 커밋·push·배포·실제 AI 호출·B 권한 회수·06단계 없이 05단계에서 대기한다.

## 05 B 이용 권한 회수 — 실제 로그인 준비 중, 2026-09-15

사용자는 B의 teachers.active=false, 로컬 허용 목록에서 B만 제거, 마지막 B 검사 세션의 공식 local 로그아웃을 승인했다. 기존 A 소유 시험 작업과 사용자 지정 B UUID·B 소유 시험 작업·현재 허용 목록을 대조하여 대상을 확정했다. 목록 순서로 추정하지 않았다. 원격 읽기 전용 확인에서 두 active 모두 true, teachers 사용자 정의 트리거0이었다. 기존 데이터 보존 비교용 행 수/해시를 본문 노출 없이 기록했다(대화3, 메시지4, 작업4, 이벤트14, reviews/approvals/releases 각0).

별도의 실제 Chrome 파란 A·노란 B 검사 창을 열었다. 기존 일반 A 브라우저 세션은 건드리지 않았다. 검사 프로세스에만 --use-system-ca를 적용했고 현재 제작실 서버 설정은 유지했다. 두 검사 창의 session API는 아직401로, 사용자 로그인 대기 중이다. 회수 전 유효한 B 세션의 정상 조회가 선행 조건이므로 **아직 원격 active 변경·로컬 허용 목록 변경·로그아웃을 실행하지 않았다.** 회수 효과·세션 종료 검사는 모두 이 시점에는 미검증이다.

Git 제외 .local/evidence/studio05에 revocation-runner.cjs, revocation-check.cjs, send-revocation.mjs, remove-b-allowlist.cjs와 보존 확인용 SQL/집계 증거를 준비했다. 검사 코드 구문 확인은 통과했다. 이후 B의 실제 기존 세션으로 Auth 유효성·앱403·Data API200/빈 결과를 분리하고, 검증 통과 후에만 로컬 목록에서 B를 제거하도록 구성했다. 공식 signOut local은 해당 B 검사 쿠키 어댑터에만 적용하며, 폐기된 refresh token은 메모리에서만 1회 확인할 계획이다. 권한을 잃은 사용자는 기존 앱 logout 경로에서도 session()에 의해 차단되므로 이 마지막 종료는 공식 SDK로 직접 수행할 예정이다. 아직 이 계획을 실행 성공으로 처리하지 않는다.

## 05 B 이용 권한 회수·기존 세션 차단 완료 — 2026-09-15

이전 창 실행은 사용자 데스크톱에 표시되지 않았다. 사용자의 보고 후 그 검사 실행을 종료하고 데스크톱에 보이는 별도 Chrome 두 창을 다시 열었다. Windows 창 목록에는 실제 제작실 창2개가 확인됐지만 네이티브 화면 확인 도구는 URL 식별 실패로 중단됐다. 이후 사용자가 실제 로그인 완료를 알렸고, 별도 A/B 검사 컨텍스트의 실제 session API200·Auth /user200·기존 소유 기록 조회로 각 계정을 확인했다. 이전 창 표시 시도나 준비 코드만을 인증 성공으로 처리하지 않았다.

**대상과 변경:** 사용자 지정 B UUID와 기존 B 검사용 작업 소유자를 대조하고, A는 기존 본인 시험 대화/작업의 소유자 UUID 및 로컬 허용 목록과 대조했다. 생성/목록 순서로 추정하지 않았다. 실제 세션 claim과 Auth /user의 사용자 ID도 일치했다. 회수 전 B 토큰은 정상 서명·유효한 authenticated 세션이며 잔여3543초였다. A/B의 teachers/conversations/messages/jobs/job_events 본인 실재 행을 공개용 키+각 실제 사용자 토큰으로 먼저 HTTP200/1행 조회했다.

승인된 관리 SQL로 teachers의 정확한 B 한 행만 active=true→false로 UPDATE하고 COMMIT했다. 두 교사 행 잠금, 이전 active 상태, 기존 작업 소유 관계, 사용자 정의 트리거0, 변경 행 수1 및 A active=true를 같은 트랜잭션에서 검사했다. 이 변경은 임시 검사 롤백 대상이 아니며 유지한다. Auth 사용자·교사 행·기존 기록을 삭제하지 않았고 스키마/RLS/GRANT는 변경하지 않았다.

**DB active 회수 효과 — 허용 목록 A/B 유지 상태:** B의 회수 전 access token이 쿠키에서도 동일하고 만료 전임을 확인했다. Auth /user는 검사 전후200이었다. 제작실 session·대화 목록·실재 대화 상세(메시지/작업 포함)·실재 작업 상세(이벤트 포함)는 모두403 TEACHER_NOT_ALLOWED였다. 기존 유효 요청 봉투/원래 요청 ID를 재전송한 jobs POST도403이었다. 중단 명령은 기존 기록 보호를 위해 추가 방어선으로 불일치 상태 버전을 사용했으며, 상태 검증409가 아니라 인증 단계403인 경우만 통과 처리했다. 실제 서버 로그의 실패 단계는 active_teacher였다.

B의 동일 실제 사용자 토큰+공개용 키로 teachers/conversations/messages/jobs/job_events의 앞서 존재를 입증한 본인 ID를 조회하면 모두HTTP200/0행이었다. 연결 실패나 관리자 조회를 RLS 성공으로 처리하지 않았다. 직접 jobs 동일 값 PATCH와 reviews/approvals/releases 빈 INSERT는403/42501, 서버 전용 RPC3개의 안전한 null 인자 호출도403/42501이었다. 실제 승인·배포 행은 생성하지 않았다. A의 앱 본인 상세 조회와 실제 토큰 Data API 본인 작업 조회는200을 유지했고 응답 내용도 동일했다.

**로컬 목록 정리:** 위 검사가 통과한 후 apps/studio/.env.local의 ALLOWED_USER_IDS에서 B만 제거했다. A 한 명 유지, 다른 변수 및 STUDIO_DB_READY=true 보존, 환경파일 Git 제외/미추적을 검증했다. 기존 Next 개발 서버가 환경파일 변경을 다시 읽었고, 새 B 요청의 서버 진단은 allowlist 단계의403으로 바뀌었다. A 조회200과 B의 여전히 유효한 Auth /user200을 동시에 확인하여 Supabase 인증과 제작실 이용 허용을 구분했다. 새 비밀번호 로그인을 다시 실행한 것은 아니다. 실제 B 검사 화면을 다시 로드해 로그인 화면과 ‘허용된 교사 계정이 아닙니다’ 안내를 확인했다. 이때까지 B 쿠키/토큰은 유지됐다. 서버 재시작은 필요 없었으며 기존 프로세스 한정 시스템 CA 설정을 보존했다.

**B 검사 세션만 종료:** 마지막에 공식 Supabase SSR SDK와 해당 B 검사 컨텍스트의 쿠키 어댑터로 signOut({scope:'local'})을 실행했다. 실제 /logout?scope=local 1회 HTTP204 및 SDK의 B 인증 쿠키 제거를 확인했다. 바로 그 세션의 실제 refresh token으로 갱신 요청1회를 보내 HTTP400 refresh_token_not_found를 확인했다. 토큰은 메모리에서만 사용했고 새 쿠키에 복원하지 않았다. 이후 제작실 session API는401 LOGIN_REQUIRED였다. A 검사 쿠키는 B 로그아웃 전후 동일했고 A의 앱/Data API 본인 조회는200을 유지했다. 기존 일반 A 브라우저는 조작하지 않았다. auth.sessions 같은 내부 테이블이나 프로젝트 Auth 설정을 변경하지 않았다. 공식 문서에 따라 로그아웃이 기존 access token을 즉시 무효화했다고 주장하지 않는다: [signOut](https://supabase.com/docs/reference/javascript/auth-signout). 앱의 기존 logout 경로는 비활성 교사에 대해 session() 단계에서403이므로 이번 종료는 해당 경로가 아니라 공식 SDK 직접 호출이다. 앱 자체의 비활성 사용자 로그아웃 경로 개선 여부는 별도 검토 사항이며 이번에는 앱 코드를 변경하지 않았다.

**종료·보존 확인:** 실제 세션 검사 프로그램의 조건75개가 모두 통과했다(반복 확인 포함). 별도 읽기 전용 SQL로 검사 전후 7개 데이터 테이블의 전체 행 수와 전체 행 내용 해시가 모두 동일하고, teachers의 active 외 행 내용도 동일함을 확인했다. 대화3·메시지4·작업4·이벤트14, reviews/approvals/releases 각0 유지. 마지막 DB 조회에서도 A active=true/B active=false였다. 관리 SQL은 변경 및 데이터 보존 확인에만 썼으며 사용자 접근 검사를 대신하지 않았다. 추가 작업·승인·배포 기록0건이다.

증거는 Git 제외 .local/evidence/studio05/revocation-evidence.json, revocation-local-env.json, revocation-db-before.json, revocation-db-after.json, revocation-preservation-result.json에 저장했다. 이메일/비밀번호/키/토큰/쿠키/원문 응답은 저장·출력하지 않았다. 기존 미커밋 변경을 보존했고 이번에는 로컬 허용 목록·STATUS·비공개 검사 증거만 변경했다. 앱 코드 변경이 없어 기존 전체 검사·빌드는 반복하지 않았다. 자연 만료 및 그 후 갱신, reviews/approvals/releases의 실재 행을 실제 사용자 토큰으로 조회하는 검사는 여전히 미검증이다. 이번 B 검사 세션의 공식 local 종료와 실제 갱신 거부는 확인했지만 모든 세션/기기의 종료를 검사한 것은 아니다. B를 다시 활성화하지 않으며 커밋·push·배포·실제 AI·06단계 없이 대기한다.

## 05 앱 로그아웃 경로 수정 — 실제 A/B 검사 미완료, 2026-09-15

코드에서 logout 전에 session()이 ALLOWED_USER_IDS와 teachers.active를 검사하고, 화면 버튼도 auth=ready일 때만 노출하는 문제를 확인했다. 로그아웃 전용 설정/처리를 lib/logout.mjs로 분리하고 POST logout만 공통 교사 권한 검사 전에 처리한다. 다른 API의 권한 검사는 그대로다. 정확한 Origin·JSON·요청 크기 제한을 유지하며 빈 객체만 받고 사용자 ID 등 추가 필드는 거부한다. GET logout은405다. 프로젝트 Auth 쿠키와 숫자 chunk/해당 인증 보조 쿠키만 현재 host/path 범위에서 정리한다. 다른 프로젝트/앱 쿠키·원격 대화/작업은 삭제하지 않는다.

공식 SDK signOut(scope:local)을 사용하고 실제 logout HTTP 성공만 remoteSignOut=confirmed로 기록한다. SDK가 만료/없음 오류를 무시하는 경우나 통신 실패에는 브라우저 정리를 수행하되 unconfirmed로 표시한다. 처음부터 인증 쿠키가 없으면 not_required다. 권한 없는 로그인 화면에도 ‘현재 브라우저 로그인 정보 정리’ 버튼을 제공한다. 로그인 화면으로 돌아가며 원격 종료 미확인 문구를 성공과 구분한다. 정상 만료를 기다리는 검사나 프로젝트 Auth 설정 변경은 하지 않았다.

실제 앱 API: 인증 없는 logout 2회가200/not_required로 완료됐고, 다른 쿠키 유지와 보호 API401을 확인했다. 실제 B 검사 쿠키가 있는 컨텍스트에서 GET405, 타 출처/누락 Origin/잘못된 Content-Type403, 타 사용자 ID를 넣은 본문400을 확인했다. 이 거부 요청들은 쿠키를 변경하지 않았다. 이 결과는 실제 로컬 Route Handler 검사이며 로그인된 정상/비활성 사용자의 logout 완료를 대신하지 않는다.

모의·로컬 회귀: 제작실 단위22/22(정상·권한 없는 조건의 공통 로그아웃 함수, 무세션 반복, 쿠키 범위, 모의 통신 실패·만료 응답·손상 세션 포함), 제작실 화면7/7, 기존 단위26/26, catalog 빌드0카드, studio 빌드/타입 검사 통과. 기존 단위/빌드는 첫 샌드박스 실행에서 realpath EPERM으로 실패하여 정상 Windows 권한으로 재실행했다. 새 화면 검사는 Next의 빈 route announcer와 사용자 안내 alert가 중복 선택돼1회 실패했고, 실제 안내를 특정하도록 선택자를 수정한 뒤7개 모두 재검사했다. 검사를 삭제하거나 인증/RLS를 완화하지 않았다.

실제 로그인 검사 창은 표시 문제로 지연됐다. 검사 도구 상태상 새 B Auth 쿠키는 있으나 A 검사 컨텍스트는 아직 인증 쿠키가 없었다. 사용자는 A 창이 없다고 보고했다. 사용자 Chrome에 별도 탭을 직접 열어 기존 A 기록이 조회되는 것을 확인했지만, 그 기존 A 세션을 임의 종료하지 않았다. 검사 프로세스 제어 복구를 위한 일시 디버거 연결은 자동 승인 검토가 인증 메모리 노출/프로세스 중단 위험으로 거부하여 실행하지 않았다. 다른 수단으로 디버거 제한을 우회하지 않았다. 기존 B 검사 세션은 앞선 작업에서 종료됐으나, **이번 Auth 전용 화면에서 새로 만든 B 세션의 앱 로그아웃 및 종료 확인은 아직 남아 있다.** 창을 닫는 것만으로 종료됐다고 처리하지 않는다.

현재 읽기 전용 DB 확인: A active=true, B active=false. 로컬 허용 목록 A만 포함, STUDIO_DB_READY=true 유지. 이번 원격 SQL/권한/계정 변경0건, 새 콘텐츠/작업 생성0건이다. 기존 작업 내용의 전후 해시 재검사는 실제 A/B logout 마무리 때 수행할 예정이다. 검사 스크립트/결과는 Git 제외 .local/evidence/studio05/logout-*에만 저장하며 자격정보와 전체 응답은 기록하지 않는다.

05 완료 근거는 기존 실제 로그인·저장·모의 흐름·5개 테이블 사용자 토큰 격리·3개 테이블 DB 역할 격리·실제 세션 갱신·실패 화면·B 권한 회수와 이전 세션 종료 기록이다. 이번 앱 자체의 정상 A/비활성 B 로그아웃 실증과 새 B 검사 세션 종료가 남아 있으므로 실제 06 배포 전 해결해야 한다. 자연 만료는 별도 B 재활성화 없이 허용 교사의 분리 세션에서 정상 서명 토큰의 실제 만료 시각을 지나 갱신/보호 요청을 관찰하며, 제작실 공개 전 인증 검증에서 확인한다. reviews/approvals/releases의 실재 행에 대한 실제 사용자 토큰 조회는 승인/배포 데이터를 임의 생성하지 않고, 승인된 비운영 프로젝트/안전한 fixture 방식이 마련된 때 검증하며 실제 승인·배포 기능 활성화 전에 필요하다. 계획을 통과로 처리하지 않는다. 커밋·push·배포·실제 AI·06단계 없이 대기한다.

## 05 A 앱 버튼 로그아웃 확인 — 재로그인 대기, 2026-09-15

사용자가 현재 Chrome의 A 로그인 세션을 앱 자체 로그아웃 검사에 사용하는 것을 명시적으로 승인했다. 시작 시 로컬3000이 ERR_CONNECTION_REFUSED이고 수신 서버가 없어 기존 npm.cmd run dev:studio로 제작실 서버만 재실행했다. NODE_USE_SYSTEM_CA=1은 새 서버 프로세스에만 전달하고 실행 셸의 이전 값은 복원했다(실행 부모PID30232). 환경파일·영구 환경변수·TLS 검증 방식은 변경하지 않았다.

허용된 cua_repl 화면 조작으로 동일 Chrome 프로필의 제작실 탭을 열었다. A 기존 대화와 작업 화면, 로그아웃 버튼, 서버 session200을 확인했다. 실제 앱 로그아웃 버튼을 클릭하여 ‘이 브라우저에서 로그아웃했습니다’와 제작실 로그인 화면 전환을 확인했고, 서버 POST /api/studio/logout200도 확인했다. 이어 실제 새로고침 후 session401, ‘로그인이 필요합니다’ 안내, 새 대화/모의 작업 접수 버튼 비활성을 확인했다. SDK 별도 호출이나 토큰/쿠키 추출을 사용하지 않았다. 원격 Auth의 개별 logout HTTP 응답을 별도로 수집한 검사는 아니며, 이번 증거는 실제 앱 버튼·화면·앱 서버 응답이다. 기존 액세스 토큰 즉시 무효화를 주장하지 않는다.

A의 재로그인을 사용자가 해당 보이는 탭에서 직접 수행했다. 이어 cua_repl 화면 조작으로 로그아웃 버튼과 기존 대화2개를 확인하고, 9월13일 오후11:08 대화를 선택했다. 기존 메시지3개와 작업3개(중단 d28587a7, 실패 01f25748, 모의 흐름 종료 e909a852)가 다시 표시됐다. 중단 작업의 기존 진행 기록을 확인한 뒤 정상 선택 메뉴/키보드로 실패 작업을 선택하여 동일 작업ID, ‘모의 오류’, ‘검사용 모의 오류입니다’ 안내와 활성 재시도 버튼을 확인했다. 재시도/새 대화/작업 생성은 실행하지 않았다. 서버 로그에서도 실제 POST login200, GET session200, 해당 대화/작업 GET200을 확인했다. 이 보존 결과는 실제 재로그인 후 앱 화면/읽기 응답에 근거하며 이번에 DB 전체 내용 해시를 재검사한 것은 아니다. 다른 브라우저의 A 세션을 조작하지 않았고 계정·대화·작업 변경 요청은 보내지 않았다. A 탭은 로그인된 기존 실패 작업 화면으로 유지했다.

B 창에 대한 사용자의 현재 보고는 ‘보이지 않습니다’이다. 사용자에게 보이고 B용임을 확인한 창에서만 진행하라는 제한에 따라 B의 새 Auth 세션을 추가 생성하거나 숨겨진 검사 컨텍스트를 조작하지 않았다. 이전 작업에서 종료한 B 세션과 이번 Auth 전용 화면에서 만든 미정리 B 세션을 구분하며, 후자의 앱 로그아웃/원격 종료는 계속 미확인이다. 해당 B 창이 다시 확인되면 같은 창의 제작실 주소에서 ‘현재 브라우저 로그인 정보 정리’ 버튼으로 수행해야 한다. 새 탭/새 프로필을 여는 것만으로 기존 B 세션을 종료할 수 있다고 가정하지 않는다. 거부된 디버거 연결을 재시도하거나 우회하지 않았고 메모리 덤프·토큰/쿠키 출력도 하지 않았다. A의 앱 버튼 로그아웃·새로고침 차단·사용자 재로그인·기존 기록 복원은 이번에 확인했다. B 새 검사 세션 정리, 자연 만료, reviews/approvals/releases 실재 행의 실제 사용자 토큰 조회는 계속 미검증으로 남긴다. 커밋·push·배포·06단계 없이 대기한다.

## 05 B 전체 세션 정리 — 완료, 2026-09-15

사용자가 B 전체 세션의 공식 global 종료를 승인했다. 승인된 Supabase SQL 연결에서 읽기 전용 트랜잭션으로 다시 확인한 결과 B active=false/세션4개, A active=true/세션7개다. 기존 데이터 보존 비교용으로 대화3·메시지4·작업4·이벤트14개와 reviews/approvals/releases 각0개의 내용 해시, 교사 식별 정보 해시 및 A 세션 집합 해시를 확인했다. 아직 종료 후 결과가 아니다.

공식 Supabase JavaScript signOut 문서를 확인하고, 앱 기본 local 로그아웃은 변경하지 않은 채 Git 제외된 .local/evidence/studio05/cleanup-b-global.mjs에 일회성 정리 페이지를 준비했다. loopback 127.0.0.1:3186에서만 수신하고 동일 출처·일회성 nonce·중복 인증 제한을 적용한다. B 식별 확인은 서버 내부 읽기 전용 조회로 수행한다. 사용자 입력으로 B Auth 인증1회 성공 시 SDK의 정상 인증 문맥에서 signOut({scope:'global'})을 즉시 호출하며 실제 logout HTTP204 여부를 별도로 확인한다. 제작실 쿠키를 읽거나 설정하지 않고 인증 정보는 파일/로그에 저장하지 않는다. 별도 Node 프로세스의 --use-system-ca만 사용한다. 문법 검사와 페이지 HTTP200을 확인했고, 허용된 cua_repl로 실제 Chrome에 ‘B 전체 세션 정리 전용’ 입력 화면을 열었다. 아직 사용자 인증·global 종료는 실행하지 않았으며 잔여 세션 재조회와 종료 후 A 정상 이용/보존 확인은 대기다. B 앱 버튼 로그아웃, 자연 만료, 세 테이블 실재 행의 실제 사용자 토큰 조회는 별도 미검증으로 유지한다. 커밋·push·배포·06단계는 수행하지 않는다.

후속 실제 실행: 사용자가 보이는 정리 페이지에서 B 인증을 직접 수행하고 성공을 보고했다. 비밀 정보 없는 결과 파일에서 B 대상 일치, 비밀번호 인증 HTTP200, SDK global signOut 성공 및 실제 Auth logout HTTP204를 확인했다. B 인증은 정리 목적으로 1회만 실행했고 새 인증 세션도 함께 종료했다. 승인된 읽기 전용 SQL로 종료 후 B의 auth.sessions 수가 0개임을 확인했다(실행 전 4개). A 세션은 7개이고 세션 ID 집합의 해시도 실행 전과 동일하다. A active=true/B active=false, 로컬 허용 목록 A만 1명/B 제외 상태를 다시 확인했다. 환경파일이나 권한 설정은 변경하지 않았다.

A의 기존 Chrome 제작실 탭을 실제 새로고침한 뒤 로그인 상태와 기존 대화2개, 작업3개의 식별자 및 기존 실패 안내가 계속 표시되는 것을 확인했다. DB 읽기 전용 비교에서도 대화3·메시지4·작업4·이벤트14개 및 reviews/approvals/releases 각0개의 건수·내용 해시와 교사 식별 정보 해시가 모두 실행 전과 일치했다. 기존 데이터의 수정·삭제, Auth 내부 테이블의 직접 변경, A 로그아웃을 수행하지 않았다. 정리용 별도 서버는 프로세스 신원을 확인해 종료했고 3186 포트가 더 이상 응답하지 않음을 확인했다. PowerShell Stop-Process 오류 뒤 동일 프로세스를 .NET Process.Kill로 종료했으며 제작실 서버의 시스템 CA 설정과 앱 기본 local 로그아웃은 유지한다.

이번 완료는 B 정상 Auth 문맥의 공식 SDK global 세션 종료와 DB 잔여 세션0개 확인이다. 기존 액세스 토큰이 즉시 무효화된다는 뜻은 아니며 자연 만료를 실제 관찰한 검사도 아니다. B 앱 버튼 로그아웃 화면은 여전히 미검증이고, reviews/approvals/releases 실재 행에 대한 실제 사용자 토큰 조회도 미검증으로 유지한다. 해당 UI/토큰 검사는 추후 별도 승인된 검사 시점에 진행하며, 이번 정리를 위해 B 권한을 다시 부여하지 않는다. 커밋·push·배포·06단계 없이 대기한다.

## 06 Vercel 배포 전 준비 — 로컬 준비 완료, 2026-09-15

사용자 요청에 따라06의 배포 전 준비만 진행했다. AGENTS、README、OWNER_INPUT、SYSTEM_SPEC、STATUS、setup/06_vercel.md와 제작실 코드·설정·루트/각 workspace package.json·루트 잠금 파일·실제 Git 상태를 대조했다. main HEAD `34280e883ea94570daf9b6f0659c6898f5a2fae9`, origin은 기존 Raph-Alpaca/science-simulations이며 05 미커밋 변경을 보존했다. 계정/원격 SQL/환경값은 변경하지 않았다. A 활성·B 비활성·B 세션0의 직전 실제 확인 결과를 유지하고 이번에 기존 사용자 로그인 절차를 반복하지 않았다. 로컬 환경의 허용 목록1명과 DB_READY=true는 값 비출력 검사로 확인했다.

### 준비한 문서와 변경 범위

- docs/VERCEL_PREPARATION.md: 실제 구조 기준 Vercel 설정, Production/Preview 분리, 주소 확정 전 미연결 배포→확정 후 환경값/정확한 Origin 반영 순서, Supabase URL Configuration 대조, 남은 검사 영향/시점과 승인 경계를 기록했다. Vercel 공식 Build/Monorepo/Node24/환경변수/Secret/Fork Protection 문서를 실제 확인했다.
- docs/STUDIO_UPLOAD_REVIEW.md: 기존 변경8파일+새 후보32파일의 명시적 목록과 비공개/생성물 제외 범위. 총 저장소 후보113파일 중 이번 변경은40파일이며 일괄 스테이징하지 않았다.
- README、STUDIO_SETUP、OWNER_INPUT 및 SQL proposals README의 오래된 ‘미연결/미적용’ 상태를 현재 결과와 구분했다. SQL 원문과 기존 데이터 계약·구현은 보존했다.
- 앱 .env.example에 Production 전용/Preview 차단/PC 전용 CA 비복사 안내를 추가했고, 루트 예시는 후속 단계 템플릿임을 표시하며 실제 앱 변수 이름과 혼동하지 않게 했다. 실제 .env.local은 변경하지 않았다.
- .gitignore에 .vercel/와 **/.vercel/ 제외를 추가했다. Vercel CLI 설치·연결은 하지 않았다. 앱 런타임·인증·권한·기존 Pages 워크플로 코드는 이번06에서 수정하지 않았다.

### 확정한 배포 입력 계획

Framework Next.js, Root Directory apps/studio, Node24.x, Install Override `cd ../.. && npm ci --include=dev`, Build 기본 `npm run build`(next build), Output Next.js 기본값/Override OFF, 루트 바깥 소스 포함 Enabled. 잠금 파일/TypeScript가 루트에 있어 전체 workspace 설치 문맥을 유지한다. 현재 제작실에는 packages/contracts 또는 후보 시뮬레이션 import가 없다. 후보 코드를 인증 origin에서 실행하는 경로를 추가하지 않았다. Skip unaffected projects는 기본적으로 사용하되 workspace 외부 content 변경은 global change로 빌드될 수 있음을 명시하고 보안/잠금 파일 변경을 제외하는 사용자 정의 생략 규칙은 추가하지 않았다.

실제 앱 변수는 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, ALLOWED_USER_IDS, STUDIO_ORIGIN, STUDIO_DB_READY의6개다. Production에만 운영값을 제공하고 Preview에는 운영키를 등록하지 않으며 DB_READY=false/설정 누락 차단을 유지한다. AI_EXECUTION_ENABLED/AUTO_PUBLISH는 현재 앱이 읽는 실행 스위치가 아님을 명시했다. 실제 AI/승인/배포 API가 없고 mock 규칙/DB 제약으로 실제 실행을 차단한다. PC의 시스템 CA 설정은 Vercel에 복사하지 않는다.

### 이번 실제 로컬 검사

| 검사 | 결과/범위 |
|---|---|
| npm.cmd ci --dry-run --ignore-scripts --offline | 성공. 잠금 파일/workspace 설치 계획만 확인; 실제 재설치 또는 Linux 설치 아님 |
| npm.cmd run test:studio |22/22 성공. 인증·로그아웃·모의 worker·SQL 계약 등의 로컬 회귀 |
| npm.cmd run build:studio | Next16.3.5 production 빌드와 포함된 TypeScript 검사 성공. 정적 / 및 /_not-found, 동적 /api/studio/[...path] |
| npm.cmd run test:studio:e2e | 최초7항목 통과 후 teardown180초 시간 초과로 명령 실패. 신원 확인한3001 미연결 검사 서버만 종료 후 동일 검사 재실행7/7、exit0、10.2초. 실제 A/B 로그인 재검사가 아닌 모의/미연결 서버 검사 |
| npm.cmd run validate / typecheck / test | 성공. 단위26/26. 최초 validate는 샌드박스 realpath EPERM, 같은 검사에 허용된 실행 권한으로 재실행 성공 |
| npm.cmd run build:catalog / node automation/catalog/check-pages.mjs | 성공. dist/catalog4파일·승인 콘텐츠0카드·유전 초안 제외 |
| node automation/catalog/verify-pages-browser.mjs | 최초 realpath EPERM, 허용된 실행 권한 재실행 성공. 최종 산출물 하위경로/빈 화면/새로고침/초안404 |
| node automation/catalog/audit-upload.mjs | 현재 tracked81+untracked32=후보113, 금지 파일/기존 패턴 문제0. .local/env/원문PDF/빌드 결과 제외 |
| 추가 비출력 검사 | 후보113에서 실제 로컬 키/허용 교사 식별값 및 Supabase/JWT 키 패턴 문제0. 브라우저 빌드11파일 실제값 포함0. 서버 추적 manifest6개에 환경파일/원문/후보 시뮬레이션 참조0 |
| Git 제외·diff | .env.local 미추적/제외, .local 및 향후 .vercel 제외 확인. Pages workflow diff없음. git diff --check 성공(CRLF 안내만) |

검사 증거는 공개하지 않는 .local/evidence/studio05/phase06-audit.json 및 기존 pages04 감사 출력에 남겼다. 알려진 패턴/실제값 대조와 코드·파일 검토 범위의 결과이며 모든 형태의 인코딩된 비밀정보 부재를 보증하는 것은 아니다. 최종 스테이징 전 다시 검사한다. 기존3000 개발 서버와 프로세스 한정 CA 방식은 유지했다.

### 판단·미검증과 정지 지점

검토 범위에서 **A 전용 모의 제작실 배포 준비를 막는 새 보안 결함은 발견하지 않았다.** 실제 배포에는 별도 코드 업로드 승인, Vercel 계정/프로젝트/주소 확정, 운영 Secret의 Production 전용 범위 확인이 선행돼야 한다. Vercel/Linux 설치·빌드, Production/Preview 실제 분리, HTTPS Origin/쿠키/인증/로그는 아직 미검증이며 로컬 빌드 성공으로 대체하지 않는다.

B 앱 버튼 로그아웃은 미검증: B 비활성·허용 제외·세션0으로 현재 A 전용 준비의 차단 사유로 보지 않지만, 추후 권한 없는 사용자 지원 검증 시 승인된 보이는 검사 창에서 실제 앱 버튼 경로를 확인한다. 자연 만료는 미검증: 실제 refresh 및 모의 실패 차단 증거와 구분하며, 장시간/정식 운영 전 정상 서명 세션의 자연 만료를 기다려 기록 보존·갱신/재로그인을 확인한다. reviews/approvals/releases 실재 행의 실제 사용자 토큰 조회는 미검증: 현재0행·쓰기/승인/공개 기능 없음으로 mock 준비는 가능하다고 판단하며 실제 해당 기능 또는 데이터의 다중 사용자 운영 전 비운영 환경에서 두 실제 토큰으로 검사한다. 어느 항목도 완료로 바꾸지 않았다.

다음 사용자 작업은 업로드 후보 문서를 읽고05·06 변경의 선별 커밋·기존 저장소 push 여부를 결정하는 것이다. 이번에는 stage/commit/push, Vercel 프로젝트 생성/연결/환경값 업로드/배포, Supabase 변경, 유료 가입, 실제 AI 호출을 수행하지 않았다. 06 배포 실행과 이후 단계로 넘어가지 않고 대기한다.

## 06 제작실 선별 커밋·업로드 승인 후 점검 — 2026-09-15

사용자가 기존 origin/main에05·06 제작실 변경을 선별 커밋·push하도록 승인했다. 실제 변경40개와 STUDIO_UPLOAD_REVIEW의 명시 목록40개가 정확히 일치하며 예상 밖 추가/삭제는0개다. fetch 성공 후 로컬 main과 origin/main 모두34280e883ea94570daf9b6f0659c6898f5a2fae9로 일치했다. 첫 샌드박스 fetch는 FETCH_HEAD 쓰기 권한 때문에 실패했고 허용된 Git 실행 권한으로 재실행했다. 작성자 Alpaca Teacher와 저장소 전용 GitHub noreply 이메일을 확인했고 설정은 변경하지 않았다.

직전 검사 때 남긴 후보별 SHA256 manifest와 비교한 결과 런타임·테스트·패키지·잠금 파일·설정은 모두 동일하며 STATUS 기록만 추가됐다. 따라서 이미 성공한22/26 단위 검사,7개 모의 브라우저 검사, 제작실/자료실 빌드를 이번에 반복하지 않았다. 실제 환경값과 알려진 비밀값 패턴을 출력 없이 재대조했으며 후보113파일에서 문제0개다. 실제 .env.local、.local 검사/세션 자료、원문PDF、로그、.next/dist는 제외돼 있다. SQL은 정의만 포함하고 실제 사용자/대화/작업 덤프는 후보에 없다.

배포 연결은 실제 화면으로 추가 확인했다. 저장소 Settings → Webhooks에 등록된 webhook이 없고, Pages Source는 GitHub Actions다. 저장소 workflow는 pages.yml 하나이며 workflow_dispatch만 있고 push 트리거가 없다. GitHub Apps에 Vercel 설치는 있으나, 현재 로그인한 Vercel 대시보드의 전체 프로젝트 목록에는 다른 저장소 프로젝트만 있고 science-simulations 연결 프로젝트는 없다. Vercel 도구의 팀 목록은 빈 응답이어서 그것만으로 미연결을 단정하지 않고 실제 대시보드를 확인했다. 로컬 .vercel 연결 파일도 없다. 확인 가능한 설정에서 이번 push가 자동 배포를 시작할 경로는 발견하지 않았고 외부 설정은 수정하지 않았다. 이 기록 시점에는 선별 스테이징·커밋·push 결과는 아직 기록하지 않는다.

B 앱 버튼 로그아웃, 자연 만료, reviews/approvals/releases 실재 행의 실제 사용자 토큰 조회는 그대로 미검증이다. A/B 설정·실제 환경파일·시스템 CA 방식·Supabase·기존 공개 사이트를 변경하지 않는다.

### 실제 제작실 업로드 완료

명시된40개 경로만 스테이징하고 인덱스의 파일 집합·내용 해시가 검토한 작업 트리와 일치함을 확인했다. 금지 파일/실제 환경값 비출력 재검사 및 staged diff 검사 후 `feat: add teacher studio auth and mock job management` 메시지로 **e869525820163a1901103ae8f7ab1c793823f0ed** 커밋을 생성했다(40파일). push 직전 fetch에서도 예상한 원격 HEAD가 유지됨을 확인하고 기존 origin/main에 일반 push했다. push 후 다시 fetch하여 로컬 main과 origin/main이 모두 해당 SHA와 일치했고 그 시점의 작업 트리는 깨끗했다. 기존 로컬 초기 커밋33e1a1a와 원격 초기 커밋8dbba6d도 조상으로 유지됐다. 이 구현 커밋에 대한 GitHub Actions 실행 수는 확인 시0개였다.

이 문단은 위 push가 실제 성공한 뒤 추가한 결과 기록이다. STATUS.md만 후속 문서 커밋으로 반영하며 구현 파일은 다시 수정하지 않는다. 실제 .env.local/비공개 원문/검사 자료와 로그는 Git 제외 상태로 로컬에 남는다. Vercel 프로젝트 연결·환경값 등록·배포와 Pages 재배포는 실행하지 않았다. 다음에는 별도 요청으로 기존 저장소의 Vercel 연결 준비를 시작할 수 있으나 Deploy나 운영값 입력은 아직 진행하지 않는다. 남은 세 미검증 항목은 위 상태를 그대로 유지한다.

## 06 Production 배포 후 점검 — 최초 점검과 후속 확인, 2026-09-15

사용자가 Production 재배포 및 A 로그인·새로고침 유지·기존 대화/작업 복원을 직접 확인했다고 보고했다. 이번 대상은 **https://science-simulations-studio.vercel.app/**이며 localhost 검사를 반복하지 않는다. 시작 시 로컬 Git 작업 트리는 깨끗하고 HEAD는4931c7e0445b2d227bac9c6ecfa29fcff62b5607였다. 이번에는 STATUS 기록만 수정하고 코드/커밋/push/재배포는 하지 않는다.

### 실제 배포·접근 확인

Vercel 전용 도구의 배포 조회는 접근 오류여서 성공으로 취급하지 않았다. 대신 사용자가 로그인한 실제 Vercel 대시보드를 읽기 전용으로 새로고침하여 Production Deployment、Ready、기존 저장소 main/apps/studio、Source commit **4931c7e0445b2d227bac9c6ecfa29fcff62b5607**와 위 운영 도메인을 확인했다. 배포 식별자는66sbaeCgSHAhEreVYwkbGwUKdSwN이며 공유/우회 링크는 만들지 않았다.

프로세스 한정 `node --use-system-ca`의 쿠키/키 없는 HTTPS 요청에서 운영 루트200, session/대화 목록/실재 A 대화 상세/실재 A 작업 상세는 모두401 LOGIN_REQUIRED와 기록 없음이었다. 다른 Origin `https://example.invalid`에서 대화 API에 빈 객체 POST는403 INVALID_ORIGIN, 같은 Production Origin의 동일 무인증 POST는401 LOGIN_REQUIRED였다. 따라서 미로그인 차단과 출처 차단을 별도 응답으로 확인했고 실제 대화/작업을 생성하지 않았다. 이 응답들의 Cache-Control은 private,no-store、Vary:Cookie、x-vercel-cache:MISS이며 공개 CORS 허용 헤더는 없었다.

현재 Production A 탭에서 기존 대화2개·작업3개의 식별자를 확인한 뒤 사용자가 승인한 앱 로그아웃 버튼1회를 눌렀다. ‘이 브라우저에서 로그아웃했습니다’와 로그인 화면, 새 대화/작업 접수 비활성을 확인했다. 새로고침 후에도 로그인 필요 안내와 보호 작업 비활성이 유지됐다. Vercel Production 로그 화면에서 해당 POST /api/studio/logout HTTP200을 확인했다. 코드의 범위는 scope=local이며 다른 A 브라우저/기기·로컬 세션은 조작하지 않았다. 사용자에게 같은 보이는 Production 탭에서 A 재로그인을 요청했고, **재로그인 후 복원 재확인은 현재 대기**다. 이번 전용 로그아웃 이후의 사용자 재로그인을 처음 보고한 로그인과 혼동하지 않는다.

### 환경변수 범위 문제 — 변경하지 않음

실제 프로젝트 Settings → Environment Variables의 All Environments 목록에서 아래5개가 **Production and Preview**로 표시됐다: SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY、SUPABASE_SECRET_KEY、STUDIO_ORIGIN、ALLOWED_USER_IDS. STUDIO_DB_READY는Production만 표시됐다. 실제 값/편집/Reveal/Download는 열지 않았다. Shared 탭에는 **No shared variables linked**가 표시됐다. 이는 이 프로젝트의 연결 상태이며 팀 전체의 모든 변수에 대한 감사가 아니다.

운영 서버 Secret을 Preview에 제공하지 않는 승인된 준비 규칙과 다르므로 **07 제작 실행기 연결 준비 전에 수정해야 할 문제**로 사용자에게 먼저 보고했다. 수정안: Project → Settings → Environment Variables에서 해당 운영 변수의 Preview 적용을 제거하고 Production은 유지한다. Preview는 운영키 없이 설정 누락으로 차단하고 STUDIO_DB_READY=false 원칙을 유지한다. 기존 Preview 배포/빌드에 운영값이 제공됐는지도 확인해야 하며, 범위 변경만으로 과거 배포의 환경 스냅샷이 자동 정리됐다고 가정하지 않는다. 실제 노출/신뢰하지 않은 실행이 확인되면 별도 승인된 회수·교체 조치를 검토한다. 이번에는 설정·키·계정·접근 보호·배포를 수정하지 않았다.

### 쿠키·캐시·노출 검사 한계

배포된 커밋의 서버 코드에서 cookieOptions는 HTTPS이면 Secure、HttpOnly=true、SameSite=Lax、Path=/이며 Domain 지정이 없어 발급 호스트에 한정되는 설계다. **실제 브라우저 발급 쿠키의 속성은 미검증**이다. 허용된 브라우저 도구에는 쿠키 메타데이터 전용 조회가 없고 거부된 디버거 연결을 재시도/우회하지 않았다. 후속 확인은 Production 로그인 후 Chrome F12 → Application → Storage → Cookies → 운영 주소에서 Secure/HttpOnly 체크、SameSite=Lax、Domain=운영 호스트、Path=/만 확인한다. 값 복사·HAR 저장·스크린샷 공유는 하지 않는다. 인증된 개인 응답의 실제 캐시 헤더도 현재 도구로 세션을 추출하지 않고 수집하지 못했으므로, 이번 HTTP 결과는 **미로그인 응답**이고 인증된 응답은 동일 공통 응답 코드의 검토 결과로 구분한다. 후속 Chrome Network → Fetch/XHR → 기존 대화 조회 → Headers에서 응답 Cache-Control private,no-store와 Vary:Cookie만 확인한다. Request Headers의 Cookie/Authorization은 복사하지 않는다.

Production HTML이 참조한 실제 공개 JS/CSS8파일을 키 없는 HTTPS로 읽어 서버 Secret/JWT/개인키/OpenAI키 문자열 패턴을 검사했고 발견0이었다. Vercel 실행 로그 전용 도구도 접근 제한 응답이어서 대신 대시보드 Logs의 최근30분 Production 필터(표시30행、Preview0)를 읽었다. 화면에 표시된 로그에서 서버 Secret/JWT/개인키 패턴은 없었고 auth 진단은 고정 stage/code/status 형태였다. 로그 전체 내보내기나 개별 요청의 인증 헤더 열람은 하지 않았다. 이 결과는 해당 시간대·표시 행/공개 파일 범위이며 과거 모든 로그·파일 또는 탐지되지 않는 임의 형식의 비밀정보 부재를 보증하지 않는다.

기존 미검증인 B 앱 버튼 로그아웃、자연 만료、reviews/approvals/releases 실재 행의 실제 사용자 토큰 조회는 그대로 유지한다. B 로그인/새 세션、작업 생성/중단、원격 SQL/권한 변경、실제 AI、커밋/push/재배포、07 진행을 하지 않았다.

### 후속 확인 — A 재로그인·Production 전용 범위 확인

사용자가 A 재로그인과 환경변수의 Production 전용 변경을 보고한 뒤 실제 화면을 다시 확인했다. Production 앱을 새로고침한 새 요청에서 로그인 상태와 기존 대화2개가 복원됐고, 기존 대화를 선택하여 이전 작업3개(d28587a7 / 01f25748 / e909a852)의 식별자가 그대로 표시됨을 확인했다. 추가 로그아웃이나 작업 생성·변경은 하지 않았다. 앞서 대기였던 A 앱 로그아웃 → 새로고침 후 차단 → 직접 재로그인 → 기존 대화/작업 복원은 이제 실제 화면 확인 완료다.

Vercel Environment Variables 페이지를 새로고침한 All Environments 목록에서 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, STUDIO_ORIGIN, ALLOWED_USER_IDS, STUDIO_DB_READY의6개 모두 **Production만** 표시됐다. 실제 값은 열지 않았다. 따라서 앞서 발견한 현재 변수의 Preview 중복 적용 문제는 사용자 수정 후 해소된 것으로 확인한다. 앞선 Shared 연결 없음 확인과 별개로, 과거 Preview 배포에 제공됐던 환경 스냅샷의 잔존 여부는 이번에 확인하지 못했다. 현재 범위 수정만으로 과거 노출까지 없었다고 기록하지 않는다.

대시보드에는 새 배포 **FKPC9E44CpVJmJNJB7wWEsBFtg4F**가 Ready / Production / Current Domains(운영 주소)로 표시됐다. Source는 동일한 **4931c7e0445b2d227bac9c6ecfa29fcff62b5607**이다. 도구로 배포를 실행한 것이 아니라 사용자 작업 이후의 실제 상태를 읽은 결과다. 이전 HTTP·공개 파일·로그 검사는 앞서 기재한 배포와 시간대의 증거이며 새 배포에서 전체 반복한 것으로 처리하지 않는다.

현재 범위의 설정 문제는 해소됐고 새 코드 결함은 발견하지 않았다. 다만 실제 HTTPS 인증 쿠키 속성, 인증된 개인 응답의 캐시 헤더, 과거 Preview 배포의 운영값 제공 여부는 남아 있다. 위 메뉴 안내에 따라 값 없이 속성만 확인하고, 과거 Preview 배포/빌드 존재 여부를 Vercel Deployments에서 확인한 뒤 실제 제작 실행기 연결 전에 보안 점검을 마무리한다. 기존 B 버튼 로그아웃·자연 만료·세 테이블 실재 행의 실제 사용자 토큰 검사는 여전히 미검증이다. 이번 로컬 변경은 이 상태 문서뿐이며 커밋·push·재배포·07단계는 진행하지 않았다.

### 06 남은 세 항목의 한정 점검 — 2026-09-15

**과거 Preview:** 연결 도구 list_deployments는 해당 팀 접근 권한403으로 실패했다(isError=false 외형을 성공으로 취급하지 않음). 로그인된 Vercel 대시보드의 프로젝트 Deployments에서 날짜/브랜치/작성자/상태 제한 없는 목록을 읽고 끝까지 스크롤했다. 표시3건이며 추가 페이지/Load more가 보이지 않았다. 상단 Author/Environment/Status 버튼은 추천 필터이며 실제 선택 시 URL 쿼리가 생기는 것을 구분했다. Environment=Preview만 지정한 별도 조회는 No Results였다. Recently Deleted Deployments도 No recently deleted deployments were found였다.

각 상세 화면의 Environment는 모두 Production, Source는 main / 4931c7e0445b2d227bac9c6ecfa29fcff62b5607이었다. URL 모양으로 판정하지 않았다. 표시된 가장 오래된 배포 EufoivZTQu8UkVSR97h1j2BKd4E4, 다음66sbaeCgSHAhEreVYwkbGwUKdSwN, 현재FKPC9E44CpVJmJNJB7wWEsBFtg4F 순이다. 상세 Duration 영역의 절대 시각은 각각2026-09-15 22:24:31, 22:43:46, 23:04:17 GMT+9였고, Created는 각각 상대 시각으로 표시됐다. 이 절대 시각을 정확한 생성 시각이라고 대체하지 않는다.

판정: **대시보드에서 조회 가능한 전체3건과 최근 삭제 범위에서 그 기간에 생성된 Preview 없음**. 따라서 운영값이 제공됐을 의심 Preview 대상은 발견하지 못했고 현재 증거만으로 삭제나 키 교체를 요구할 근거는 없다. 단, API 전체 이력/페이지 메타데이터는 접근 불가이고 영구 삭제 이력 및 프로젝트 생성부터의 감사 기록까지 확인하지 못했으므로, ‘첫 배포부터 절대 누락 없음’과 과거 운영값 제공 가능성0을 완전히 증명한 것은 아니다. 최근 삭제 목록도 영구 삭제 전체의 증거가 아니다. 비밀값 조회/복호화/다운로드, Preview로 A 인증 전송, 삭제/설정 변경은 하지 않았다.

**실제 인증 쿠키:** 허용된 브라우저 도구에 값과 분리된 쿠키 속성 전용 조회 기능이 없어 미검증을 유지한다. A 세션은 건드리지 않았고 개발자 도구/디버거로 값을 추출하지 않았다. 사용자 확인 위치: Production 탭 F12 → Application → Storage → Cookies → https://science-simulations-studio.vercel.app/. 인증 쿠키 행의 Secure, HttpOnly, SameSite, Domain, Path 열만 확인한다. 기대값은 체크/체크/Lax/science-simulations-studio.vercel.app(호스트 한정)/이다. Value 열 복사, 전체 화면 캡처, HAR, Copy as cURL은 하지 않는다. 코드 설정만으로 실배포 통과 처리하지 않는다.

**개인 응답 캐시:** 실제 A 인증 요청의 응답 헤더를 안전하게 조회하는 기능도 없어 미검증이다. 로컬의 배포 커밋 코드에서 API 공통 응답과 next.config.mjs 모두 Cache-Control private,no-store, API Vary:Cookie이며 이를 공유 캐시 허용으로 덮어쓰는 프로젝트 파일은 발견하지 않았다. Vercel CDN의 별도 원격 규칙은 이번에 검증하지 못했다. 사용자 확인 위치: F12 → Network → Fetch/XHR → 기존 대화/작업 읽기 요청 → Headers → Response Headers. Cache-Control(no-store와 private 또는 동등한 공유 캐시 차단), CDN-Cache-Control, Vercel-CDN-Cache-Control, Age, Vary, x-vercel-cache를 확인한다. 본문/Request Cookie/Authorization은 공유하지 않는다. MISS만으로 통과 판정하지 않는다.

동일 Production의 별도 무인증 Node 프로세스에서 대화 목록 및 기존 작업 상세 GET을 이번에 실제 실행했다. 둘 모두401 LOGIN_REQUIRED, 기록 반환 없음, Cache-Control private,no-store, Vary Cookie, Age0, x-vercel-cache MISS, CDN-Cache-Control/Vercel-CDN-Cache-Control 응답 헤더 없음이었다. 이는 **무인증 응답과 접근 차단만 통과**이며 A의200 응답 캐시 검사를 대체하지 않는다. 환경파일·키·쿠키는 로드하지 않았고 프로세스 한정 --use-system-ca를 사용했다.

07 준비 전 발견된 새로운 결함은 없으나 실제 인증 쿠키/개인 응답 헤더 확인은 남아 있다. 배포 이력의 절대 완전성이 필요하면 팀 권한이 있는 배포 이력 API/감사 기록으로 누락 범위를 보완해야 한다. 기존 B 앱 버튼 로그아웃, 자연 만료, reviews/approvals/releases 실재 행의 실제 사용자 토큰 조회는 그대로 미검증이다. 이번에는 STATUS만 갱신하고 코드/데이터/원격 설정/커밋/push/배포/07단계는 변경·실행하지 않았다.

## 06 현재 범위 완료 — Production 최종 사용자 확인, 2026-09-15

**현재 범위의06단계 Production 검증은 완료로 정리한다. 07단계는 미착수·대기다.** 위의 쿠키/개인 응답 헤더 미검증 기록은 당시 상태이며, 아래 사용자 직접 확인으로 해당 항목을 갱신한다. 도구가 직접 검사한 결과와 사용자 보고를 구분한다.

대상은 https://science-simulations-studio.vercel.app/, Production·Ready, 커밋4931c7e0445b2d227bac9c6ecfa29fcff62b5607이다. 사용자가 실제 Production에서 인증 쿠키의 Secure=true, HttpOnly=true, SameSite=Lax, Path=/, 제작실 Production 호스트 범위를 직접 확인했다. 서버 중심 인증 설계와 일치하며 **사용자 실제 확인으로 통과**다. 쿠키 값·토큰은 수집하거나 기록하지 않았다.

사용자가 로그인된 개인 데이터 조회의 실제 응답에서 Cache-Control: private, no-store 및 x-vercel-cache: MISS를 직접 확인했다. 개인 응답의 캐시 방지 헤더는 **사용자 실제 확인으로 통과**이며, MISS 하나만으로 판정한 것이 아니다. 별도 CDN 헤더/원격 CDN 규칙 전체를 새로 검증했다고 확대 해석하지 않는다.

기존 실제 증거인 A 로그인·새로고침 유지·기존 기록 복원, 앱 로그아웃 후 보호 접근 차단과 재로그인 복원, 무인증 API401·기록 미반환, 잘못된 Origin403, 환경변수6개 Production 전용, 조회 가능한 배포 이력의 Preview 없음, 한정된 공개 파일/로그 점검과 함께 완료 근거로 삼는다. 앞서 기록한 API 권한 제약·영구 삭제 포함 배포 이력의 완전성 한계·파일/로그 검사 범위는 그대로 보존하며 미실행 검사를 통과로 바꾸지 않는다. 현재 A 전용 모의 제작실 범위에서 새 차단 결함은 발견하지 않았다. 실제 AI·자동 승인·공개 제작 실행에 대한 승인을 뜻하지 않는다.

### 후속 미검증 — 완료로 처리하지 않음

- **B 비활성 사용자의 앱 버튼 로그아웃:** B 비활성·허용 목록 제외·잔여 세션0을 유지한다. 향후 권한 없는 사용자 지원 경로 검증 시 별도 승인된 실제 보이는 검사 세션에서 앱 버튼 경로를 확인한다. SDK 전체 세션 종료 성공과 구분한다.
- **정상 서명 토큰의 자연 만료:** 정상 수명의 세션을 기다려 만료 후 갱신/재로그인 안내와 기록 보존을 확인한다. 장시간 정식 운영 검증에서 수행하며 기존 실제 갱신 성공·모의 실패 검사로 대체하지 않는다.
- **reviews/approvals/releases 실재 행의 실제 사용자 토큰 기반 격리:** 해당 기능의 실제 사용 또는 다중 사용자 운영 전에 승인된 비운영 환경에서 실재 본인/타인 행을 실제 사용자 토큰으로 검사한다. 기존 DB 역할 기반 RLS 검사를 같은 검사로 취급하지 않는다.

이번 작업은 기존 미커밋 변경을 보존한 docs/STATUS.md 갱신뿐이다. 코드 수정, 계정/데이터/환경 설정 변경, 커밋, push, 재배포 및07단계 진행은 하지 않았다.

## 07-1 대화·요청 UI와 실행기 구조 준비 — 로컬 구현, 2026-09-16

06 완료까지의 미커밋 STATUS 기록을 보존하고 사용자 승인 범위의07-1을 구현했다. 현재 main HEAD4931c7e는 그대로이며 stage/commit/push는 없다. 운영 A/B·Production 환경변수·Supabase·Vercel·Pages는 조작하지 않았다. 기존 studio_v1.sql과 Pages workflow도 변경하지 않았다.

### UI·요청 규격 변경

새 대화 이름 입력/취소/생성, 대화별 이름 수정/삭제 메뉴, 120자·빈값 검증, 즉시 중복 클릭 잠금·생성 요청 UUID를 구현했다. 서버는 기존 Auth·허용 목록·active 교사·소유자 검사와 POST Origin 검사를 유지한다. SQL capability가 없는 기존 DB에서는 새 기능을 `DB 변경 적용 필요`로 표시·차단한다. 기존 조회/모의 진행/v1 재시도는 유지한다.

삭제 확인창에 웹앱 보존과 제작 명세 별도 보존을 명시했다. SQL은 메시지를 실제 삭제하고 제목을 제거하며 FK용 tombstone을 남긴다. jobs의 불변 요청 스냅샷에는 기존 requirements 등 제작 명세가 남으며 이를 전체 원문 삭제라고 주장하지 않는다. jobs/events/reviews/approvals/releases와 콘텐츠 ID·카드·파일·공개 주소는 보존한다. 삭제/접수는 같은 teacher→conversation 잠금 순서로 원자화하며 진행/중단 처리 중 삭제를 거부한다. 삭제된 대화와 UI 작업 상세/API/접수/재시도는 차단한다.

학년도 입력·상태·안내·신규 전송을 제거했다. v2는 schoolYear를 허용하지 않고 SQL의 기존 school_year 열에는null을 저장한다. v1 스냅샷/값/해시는 보존하고 과거 재시도·중복 방지 규칙은 유지한다. 새 명세의2022 개정 기본은 별도 내부 설정이며 실제 원문·성취기준 검토는 미확인이다. 기존 콘텐츠에는 소급하지 않는다. 자유 입력창에 고정 안내·접이식 작성 예시·비강제 안내를 추가했고 예시는 자동 입력되지 않는다.

### 실행기 연결 준비

Dispatcher의 Store.claim/finish 계약, MockAdapter, GitHubActionsAdapter의 고정 대상·설정 검증·job_id만 전송하는 요청 구성·응답/오류 분류·불확실 전송 자동 재시도 방지를 코드와 테스트로 구현했다. 기본 HTTP transport가 없고 제품 API에도 연결하지 않아 실제 GitHub 호출은0이다. mock 작업은 real로 전환하지 않는다. 실제 실행기 연결 필요를 화면에 표시한다.

독립 명세 추출과 선택적 dispatch_intents SQL 저장 구조는 준비했으나 운영 Store/토큰 발급/OIDC/공개 가능 근거 발급/실행 한도/취소·timeout 제어/worker 자체는 후속 구현이다. 동시1·수정2 목표를 실제 비용/일일 한도 강제 완료로 기록하지 않는다. 예산과 실제 호출 승인도 미확인이다. 역할별 실행·최소 GitHub App 권한·생성 코드 격리·PR까지의 초기 경로는 STUDIO_07_1에 명시했다.

### 실제 로컬 검사와 한계

| 검사 | 결과와 실제 범위 |
|---|---|
| npm.cmd run test:studio | 최종28/28 성공. 기존 인증/로그아웃/모의 도메인·SQL 계약과 신규 v1/v2/Dispatcher/SQL 실행 검사 |
| 격리 PostgreSQL SQL 실행 | @electric-sql/pglite0.5.8 메모리 DB에 v1→v2→선택 outbox안을 적용. 실제 SQL 소유자 거부·공백 이름 거부·중복 생성/접수·수정·진행 중 삭제 거부·삭제 후 접수 거부·메시지 삭제·jobs/events/reviews/approvals/releases 보존·인증 역할 직접 수정 거부·재실행 실패 후 롤백을 확인 |
| 과거 데이터 호환 | v1 적용 상태에서 만든 fixture를 v2로 변경한 뒤 기존 school_year2024/snapshot/hash 보존, legacy 재시도 연결·중복 재전송을 실제 로컬 SQL로 확인 |
| 삭제/접수 동시 요청 | 로컬 단일 연결 엔진의 Promise 동시 호출에서 삭제 우선 후 접수 거부 확인. 반대 순서는 진행 중 삭제 거부로 확인. 다중 연결 잠금 대기/경쟁 타이밍은 미검증 |
| npm.cmd run build:studio | 최종 Next 프로덕션 빌드·포함 TypeScript 성공. Vercel 배포 성공을 뜻하지 않음 |
| npm.cmd run test:studio:e2e | 최종9/9, exit0. 390/1440px 실제 UI의 이름 입력·취소·중복 클릭·수정/복원·삭제/빈 상태·학년도 없음·예시 열기/입력 보존·키보드·기존 인증 안내 회귀. API는 테스트 fixture로 대체하며 실제 로그인/운영 DB 검사가 아님 |
| 기존 자료실 | npm.cmd run validate, typecheck, test26/26, build:catalog, check-pages 성공. 승인 카드0·유전 초안 제외 유지 |
| 공개 후보 감사 | audit-upload: tracked113/candidates121, 문제0. .env.local/.local/원문PDF/빌드·검사 산출물 제외 확인. 알려진 패턴 감사 범위이며 모든 비밀 형태 부재 보증은 아님 |
| 로컬 직접 화면 | http://127.0.0.1:3002/에서 격리 검사 배너·학년도 없는 요청 화면·이름 dialog/입력 초점·취소를 실제 브라우저로 확인. 운영 계정 로그인 없음 |

개발 중 기존 SQL 정적 테스트가 v1의RPC3개만 가정하여 실패했다. v2 RPC 시그니처와 증분 SQL을 대조하도록 갱신해 통과시켰고 검사를 삭제하지 않았다. PowerShell의 기본 파이프 인코딩으로 새 문구가 손상된 부분을 UTF-8로 교정한 뒤 최종 빌드·화면 검사를 통과했다. npm 기본 캐시의 권한 오류는 프로젝트 .local 캐시 사용으로 해결했고 PGlite 하나만 devDependency로 고정 설치·잠금 파일 반영했다. 초기 자료실 검사의 sandbox realpath EPERM은 동일 검사에 허용된 실행 권한으로 재실행해 통과했다. 최초 브라우저9개는 통과했으나 sandbox 서버 정리가 완료되지 않아 중단(exit1)했고, 허용된 권한으로 같은 검사를 재실행하여 최종 exit0을 확인했다.

### 파일·로컬 확인·다음 단계

UI/서버/domain/dispatcher, 증분 SQL2개, SQL·단위·브라우저 검사, 별도 tests/fixtures/studio07/serve.mjs, package/lock, DATA_CONTRACTS/IMPLEMENTATION_PLAN/STUDIO_07_1/STATUS를 변경·추가했다. 환경값 예시/실제값 파일은 변경하지 않았다. 실제 운영 SQL은 미적용이다.

정확한 확인 주소는 **http://127.0.0.1:3002/**. 별도 로컬 UI fixture 서버를 실행해 두었다(내부 Next3003). 메모리 검사 기록만 사용하며 실제 로그인/권한/SQL 검증을 대신하지 않는다. 재시작은 프로젝트 루트 C:\Users\user\Desktop\science-simulations에서 `npm.cmd run build:studio` 후 `node tests/fixtures/studio07/serve.mjs`다. 기존3000 서버나 Production 세션은 종료하지 않았다. 이 연습 서버의 재시도 버튼은 지원하지 않으며 실제 재시도 검증은 기존 모의 UI 검사와 별도 SQL 검사 결과를 따른다.

다음 사용자 작업은 해당 로컬 화면에서 이름/예시/삭제·보존 안내를 검토하는 것이다. 그 후 별도 승인으로 studio_v2.sql 적용 전 검토를 진행할 수 있다. studio_runner_v1.sql은 독립 선택안이며 실제 실행을 활성화하지 않는다. 운영 SQL 적용 후 Auth/Data API/다중 연결 동시성, 실제 외부 실행기·한도·OIDC·토큰 발급 검사는 아직 미검증이다.

기존 **B 비활성 사용자 앱 버튼 로그아웃, 정상 서명 토큰 자연 만료, reviews/approvals/releases 실재 행의 실제 사용자 토큰 기반 격리**는 후속 미검증으로 유지한다. 이번 로컬 fixture 역할 검사를 그 항목의 완료로 처리하지 않는다. 커밋·push·Vercel/Pages 재배포·원격 SQL/권한 변경·GitHub App 생성·유료 AI 제작 실행은 하지 않았으며07-1 이후 단계는 대기한다.
# 2026-09-16 — 07 대화 관리·v2 DB 적용 전 검토 (운영 미적용)

사용자 UI 확인: 격리 검사 화면에서 대화 이름 생성·취소·수정·삭제 정상, 적용 학년도 제거 확인, 작성 안내와 접이식 예시 만족. 사용자 확인으로 기록하며 운영 DB 검사로 취급하지 않는다. 기존 UI를 재설계하거나 통과한 화면 검사를 반복하지 않았다.

Supabase 승인 연결 도구로 science-studio의 현재 메타데이터를 읽기 전용 조회했다. 8개 테이블 RLS 활성, service_role BYPASSRLS, v1 함수 3개·권한·FK·정책 확인. 함수 본문 공백 제거 MD5가 로컬 v1과 모두 일치했다. 사용자 정의 트리거 없음. v2 열/RPC와 runner 테이블은 아직 없으며 migration 목록은 비어 있고 이력 테이블 자체가 없다. 기존 수동 v1 적용이 존재하므로 재실행하면 안 된다. 전체 DB 동일성·백업 복원 가능 여부는 이 조회로 증명하지 않았다.

구버전 4931c7e 서버는 deleted_at 필터 없이 service_role로 조회하여, 삭제 후 구버전으로 복구하면 표식이 노출되는 문제를 발견했다. 로컬 v2 SQL에 기본 false인 삭제 gate와 PT412 차단을 추가하고 앱에 별도 활성화 안내를 추가했다. 운영 삭제 활성화는 호환 앱·복구 버전 검증 후 별도 승인할 변경이다. 삭제 후 4931c7e로 되돌리는 방식은 안전하지 않다.

적용 후보는 supabase/proposals/studio_v2.sql 하나이며 studio_runner_v1.sql은 분리 보류한다. 별도 의존 없이 v2 단독 적용을 격리 DB에서 확인했다. 기존 미커밋 파일을 보존했고 환경값/원격 DB/계정/권한은 변경하지 않았다.

실제 검사: npm.cmd run test:studio 28/28 성공(격리 PGlite SQL 2개 포함), npm.cmd run typecheck:studio 성공, npm.cmd run build:studio 성공. 기존 v1 snapshot/hash/school_year 보존과 재시도·중복 접수, 변경 후 구버전 대화 생성, v2 접수, 소유자·삭제·보존 검사, 기본 삭제 잠금과 서비스 역할의 잠금 함수 변경 거부를 확인했다. 구버전 조회가 삭제 표식을 읽는 위험도 격리 SQL로 재현했다. 이는 실제 Production에 SQL 적용 후 검사한 결과가 아니다.

다중 연결 동시성은 미검증: 기존 PGlite는 단일 연결이며 Promise 병렬 호출도 큐 처리다. psql/postgres/docker/supabase CLI가 없어 신규 설치나 외부 프로젝트 생성은 하지 않았다. 격리 PostgreSQL 두 연결의 경쟁·잠금 검사와 백업 복원 확인을 운영 적용 전에 준비해야 한다. 로컬 프로덕션 빌드 성공은 배포 성공을 뜻하지 않는다. 새 차단 안내의 실제 브라우저 표시는 이번에 재검사하지 않았다.

정식 migration 기준선 기록(수동 v1 재실행 금지), v2 생성·적용 순서, 잠금 영향·실패/재실행·백업/전진 복구 계획은 docs/STUDIO_V2_DB_REVIEW.md에 기록했다. 적용 전 격리 DB 준비·기준선 이력 관리·백업·작업 시간 승인이 필요하다. 실제 적용 직전 대기한다.

기존 B 비활성 사용자 앱 버튼 로그아웃, 정상 서명 토큰 자연 만료, reviews/approvals/releases 실재 행의 실제 사용자 토큰 기반 격리는 계속 미검증이다. 3002 화면의 운영 연결, 운영 데이터 삭제, SQL 적용, 커밋·push·재배포·실제 AI 실행은 하지 않았다.
