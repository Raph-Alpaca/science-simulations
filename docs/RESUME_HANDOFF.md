# 재개 인계 — 과학 시뮬레이션 제작실

**최신 2026-10-14 13:22 KST:** 사용자가 GitHub 본인 확인과 Vercel 로그인을 완료했고 두 화면으로 확인했다. 이전 로그인 질문을 반복하지 않는다. GitHub 탭971976955는 미제출 App 초안(Science Studio Raph Alpaca/계정전용/webhook off/Actions write/Metadata read)이며 Contents 메뉴가 열린 채 Read-only 클릭을 자동 승인 검토가 차단했다. 해당 App 자체는 아직 생성되지 않았다. Vercel 탭971976956은 기존 프로젝트의 Production 환경 화면이다. 재개 시 CUA 세션 변수가 사라질 수 있으므로 오류가 있으면 기존 브라우저3/두 tab ID로 다시 연결한다. 탭을 handoff로 유지한다.

대기 질문은 **새 App 생성·science-simulations 한 저장소에만 설치·개인키 보호/Vercel Production App 설정3개/GitHub Actions 기존 키2개 등록/조회 전용 App 검사1회**다. 사용자 답변에 따라 허용된 부분만 수행한다. 질문 옵션은 전체 승인/App 생성·설치만 승인/보류. 아직 답변 없으며 포괄 진행 위임으로 거부된 Contents 선택을 재시도하지 않는다. 검토 `.local/studio-setup-20261014/app-registration-review.json` 및 두 PNG, [LIVE_CONNECTION](LIVE_CONNECTION.md). 기존 DB·공개 PR 승인을 반복하지 않는다.

Vercel 확인 ID prj_sneEZSgi9cWcn6Ryg7WBZDcyi4tR, 팀 alpaca-t/프로젝트 science-simulations-studio. Production의 기존6개 변수 이름만 확인했고 값 조회/변경은 없다. MCP teams는 빈 목록이라 재조회/403 반복 대신 공식 CLI64.0.2를 `.local/tools/vercel-cli-64.0.2/node_modules/.bin/vercel.cmd`에 준비했다. 도움말 확인 완료(초기 캐시 EPERM은 실제 사용자 도움말 실행으로 해결), 아직 CLI 로그인 없음. --global-config는 보호된 별도 폴더, env add는 stdin/production/--type secret/--project/--scope/--non-interactive를 사용 가능하다. 실제 등록 전 project inspect로 ID/팀 확인하고 키를 argv/로그에 넣지 않는다. `env pull`로 운영 비밀값을 평문 저장하지 않는다.

로컬97c0a85는 연결 검사8개 PASS를 포함한다. 이후3개 문서만 갱신하며 운영 main은1f4df40이다. 새 공개 push/DB/환경/유료/Linux/학생 게시0회, 현재 검사 프로세스 없음. 사용량59% 남음,53~55%부터 인계/50% 보존. 목표 상태는 앞선 로그인 blocker로 blocked였으며 도구로 임의 resume하지 않는다. 사용자가 재개한 이번 접근 권한 대기는 새 blocked 감사의 첫 턴이다.

**최신 2026-10-14 12:37 KST:** 로그인 두 건은 실제 탭 재확인 결과 여전히 대기다(971976955 GitHub Confirm access /971976956 Vercel login). 탭 handoff를 갱신했고 중복 질문·인증 코드 요청·계정 생성은 하지 않았다. 사용자 응답 후 같은 탭의 현재 화면부터 이어간다. 이전 턴에서 완료한 DB/PR #18은 재실행하지 않는다.

대기 중 App 연결 검사 도구3개(automation/studio/app-connection.mjs, app-connection-cli.mjs, tests/studio/app-connection.test.mjs)와 [연결 절차](LIVE_CONNECTION.md)를 로컬 구현했다. 모의8개 PASS/공백 검사PASS. GET 최대6회/20초이며 쓰기 토큰 발급·dispatch·유료 호출·게이트 변경이 없다. App 소유/설치/권한과 공개 main/workflow 메타데이터를 검증하지만 실제 OIDC 왕복이나 설치 저장소 전체 개수까지 증명하지 않는다. 성공도 executionReady=false를 유지한다. 공개 업로드하지 않았으며 운영 앱 코드는 main1f4df407298b72a104ec0abcc0303eaf7ce434cf다.

`.local/studio-setup-20261014/check-app-connection.ps1`은 나중에 보호 폴더의 `github-app-metadata.json`(appClientId/installationId)과 `github-app-private-key.dpapi`를 읽고 표준 입력으로 전달한다. 지금 두 파일은 없고 **래퍼는 구문 검사만** 했다. 실제 키 준비·등록 범위 확인 후 검토한 main SHA를 `-ExpectedSha`로 전달해1회 수행한다. `app-check-attempt.json`/result가 생기면 지우거나 자동 재시도하지 않는다. 키 값을 명령 인수/채팅/로그에 넣지 않는다. 새 App·키 업로드·환경 변경은 아직0회다.

아래 12:25의 문서4개는 이미78546835b1469cae6640bb569e6e640691bc6780으로 로컬 commit했다. 그 이후 새 연결 준비6개 파일을 이번 checkpoint에 추가한다. 사용량62% 남음,50% 보존. 검사 프로세스는 종료됐다. 다음은 사용자 로그인 완료→정확한 App 설치 범위 검토→실제 메타데이터1회 검사→키 등록 범위 확인이며, 전체 시스템/실제 제작/게시 완료로 간주하지 않는다.

**최신 2026-10-14 12:25 KST:** DB/PR #18 완료 후 실행 연결 단계에서 사용자 본인 확인/로그인을 기다린다. Chrome `🔧 제작실 연결` 그룹의 GitHub 탭971976955는 https://github.com/settings/apps/new 의 Confirm access이고 Raph-Alpaca 계정으로 로그인되어 있다. 현재 계정에 GitHub App이 없음을 실제 확인했다. Vercel 탭971976956은 기존 alpaca-t/science-simulations-studio 설정으로 돌아가는 로그인 화면이다. 두 탭은 handoff 표시했으며 임의로 다시 탐색/새 계정 생성하지 않는다. 다음 턴에는 cua 문서를 다시 읽고 실제 화면을 확인한 뒤 필요한 handoff를 다시 표시한다. 인증 코드/비밀번호를 채팅에 요청하지 않는다.

사용자에게 GitHub 본인 확인 완료와 Vercel 기존 계정 로그인 완료를 각각 물었으며 아직 응답이 없다. App 생성/설치 권한은 아직 부여하지 않았다. 생성할 App은 저장소1개 한정 Actions write/Contents read/Metadata read, webhook·OAuth 사용자 인증 불필요를 기준으로 폼/설치를 검토한다. 실제 보안 접근 권한 부여 전 정확한 범위를 확인해야 한다. App private key는 서버(Vercel) 전용이며 생성 코드/Actions 후보 컨테이너에 제공하지 않는다.

전달 키는 **이미 로컬 준비 완료**: `.local/studio-worker-secrets-20261014/transfer-key.dpapi`와 transfer-key-status.json(STORED_AND_VERIFIED,remoteRegistered=false), 사용자 전용 ACL/Git 제외/DPAPI 왕복PASS. 값 출력 없이 외부 등록 단계에서 사용하며 생성 스크립트를 재실행하지 않는다. OpenAI 키도 기존 저장/GET 인증 완료다. GitHub repo secrets0 확인, Vercel 환경 유무는 연결 권한403과 브라우저 로그인 때문에 아직 미확인이다. 두 키를 원격에 올리거나 기능을 활성화하지 않았다.

진행/실패/다음 단계는 STATUS 최신 두 절과 PUBLICATION_MIGRATION_REVIEW를 따른다. Git local checkpoint로 문서4개만 추가 저장할 예정이며 공개 main 기능 코드는1f4df40과 같다. 최근 사용량63% 남음,50% 보존. 대기 중 테스트/DB/서버 프로세스 없음. 아래는 앞선 단계 이력이다.

**최신 2026-10-14 12:18 KST:** PR #18의11개·운영 증분1개 명시 승인 후 모두 완료. main1f4df407298b72a104ec0abcc0303eaf7ce434cf/deployment7055900789.12:15:58 운영 적용·데이터/스키마/이력 검증PASS,12:17:58 실제HTTP PASS. 운영은 이제26테이블/79함수·migration4개이며 모든 실행 gate false/새게시행0이다. 아래 foundation만 적용됐다는 문구는 과거 이력이다.

**반복 금지:** `.local/studio-v1-backup-20260916/publication-preflight-20261014-4d422ff8d2ab4850ae82b617f6ba6875/publication-production-apply.json` applied/verified/PASS와 `publication-production-write.claim`이 있다. SQL 해시38665dc7590464e199a6864468b033bb86e9e35c568b8def2524a38aaa24af27 적용을 다시 하지 않는다. PR #16~#18 및19/32/11개 승인을 다시 묻지 않는다. OpenAI 키 저장/인증GET1회·Linux 새1/1·제작4/4·누적8도 완료 상태다. 초기 실패/모든 백업 증거는 보존했다.

현재 branch `codex/studio-live-connection`, HEAD는 위 main, 최신 상태 문서 갱신만 로컬에 있다. 프로세스/DB/브라우저 검사 모두 종료. 다음은 실제 실행용 GitHub App/전달 키·OpenAI secret 연결이다. GitHub repo secret0, 로컬 App client ID/install ID/private key3개 없음. 원격 Vercel 환경은 MCP403(alpaca-t 범위), App 목록은 gh 토큰 종류403으로 미확인. 403을 다른 범위/키로 우회하거나 없다고 단정하지 않는다. 기존 API키 입력은 다시 요청하지 않는다. 새 활성화/유료·학생 게시 승인과 혼동하지 않는다.

실제 원문 검토와 최종 버전별 교사 승인은 남아 있고, 불확실 게시의 별도 관찰/조정도 미구현이다. 사용량53~55% 남음부터 정리해50% 보존한다. 이전 DB 적용 대기/차단은 아래 이력이다.

**최신 2026-10-14 12:08 KST:** PR #17의32개 명시 승인/검사/병합·운영 배포·HTTP 확인 완료. main12001d2c3b5b90a62f7c2eec8962ba77cf45c1a0/deployment7055622915. 기존19개/32개 차단은 모두 해결돼 재질문하지 않는다. 새 Pages workflow는 비활성이며 실제 게시/추가 Linux는 실행하지 않았다.

현재 branch `codex/studio-publication-migration`, 운영 증분/백업 범위/검사/문서가 미커밋이다. [PUBLICATION_MIGRATION_REVIEW](PUBLICATION_MIGRATION_REVIEW.md)의 SQL 해시38665dc7590464e199a6864468b033bb86e9e35c568b8def2524a38aaa24af27을 따른다. 새 테이블8/함수34·기존 함수2만 변경, gate 전부 false. 로컬11개·운영18개 읽기 전용 백업/복원·복원본 증분13개·운영 dry-run 단1개 PASS. 백업/복원 서버 종료. `.local/studio-publication-migration-20261014/latest-backup-run.json`이 보호 폴더를 가리킨다.

다음은 파일 고정/공개 PR 검토·병합 뒤 정확한 운영 증분1개 적용 권한 확인이다. 운영은 아직 foundation18테이블/45함수다. private `rollout.mjs`는 preflight/apply 모드가 분리돼 있으며 apply는 main SQL/최신 백업1시간/데이터/이력을 재확인하고 쓰기 표식1회를 강제한다. **첫 preflight는 READ_ONLY_TARGET_REQUIRED로 쓰기0 중단, preflight-2는 성공**이다. 실패/시도 파일을 삭제해 재실행하지 않는다. 오래되면 새 백업·복원으로 준비한다.

기존 `refresh-backup.ps1`(20261013)은 foundation 재적용을 포함하므로 쓰지 않는다. 새 20261014 helper는 worker-foundation 백업만 하고, 별도 rehearse.ps1은 복원본에만 적용한다. OpenAI 키 인증 GET1회, Linux 새1/1·제작4/4·누적8은 반복하지 않는다. 키 등록·실제 제작·원문 검토·교사 최종 승인·학생용 게시·불확실 게시 후속 조정은 남았다. 남은66%/50% 보존. 아래는 과거 이력이다.

**최신 2026-10-14 11:52 KST:** PR #16의 검토19개 명시 승인·정확한 head 검사·병합·운영 배포·HTTP 확인 완료. main15f34bceca4f321abf7df233e08f017b913c9009/deployment7055544849. `.local/studio-publication-authority-review-20261014/production-http.json`. 이전 자동 승인 차단과 미커밋 표기는 이력이며 이19개 공개/병합 승인을 다시 묻지 않는다.

현재 `codex/studio-publication-deploy`는 authority 커밋819676f에서 분기했고 같은 코드가 원격 main에 병합됐다. [PUBLICATION_COMPLETION](PUBLICATION_COMPLETION.md)의 동일 파일 전송·공개 바이트 검증·완료 SQL/UI/workflow는 로컬 미커밋이다. 새21+공통25=46개, native PG17 경합6개·종료, Chrome4개, Next build/타입·추적8개/금지0·HTTP5개·actionlint3개 PASS. `.local/studio-publication-deploy-review-20261014/`, `.local/release-postgres17-da92d32e-d6f0-4c31-9dee-9f37973a0bfd/result.json`. 실행 중 검사/DB/브라우저 없음. 변경이 없으면 검사를 반복하지 않는다.

다음은 이 변경을 검토/고정하고 운영 적용용 SQL·새 백업/복원·적용 리허설을 준비한다. 기존 `refresh-backup.ps1`은 과거 foundation 적용을 포함하므로 그대로 재실행하면 안 된다. `backup-and-restore.mjs`도 과거8개 테이블을 기대하므로 현재 foundation18개에 맞는 별도 검토가 필요하다. 운영 변경은 아직 수행하지 않았다. 불확실한 게시의 나중 관찰/조정은 미구현이며, 새 실행으로 기존 OIDC를 대신하거나 claim/슬롯/시도 파일을 삭제하면 안 된다.

운영에는 foundation만 적용돼 있다. 새 승인/준비/게시 SQL·App/전달 키·기능 활성화·실제 제작/원문 검토/최종 교사 승인·학생용 게시가 남았다. OpenAI 키는 이미 저장/인증 완료이며 인증 GET을 반복하지 않는다. Linux 새1/1·제작4/4·누적8 상한도 유지한다. 사용량68% 남음,53~55%부터 정리/50% 보존. 아래 문단은 과거 이력이다.

**최신 2026-10-14 11:11 KST:** PR #15 보고 단계17개 공개/검사/병합/운영 배포·HTTP 확인 완료. main ccd0cfbb1665d1e791794aa2217c75cb27fbddca, deployment7054819984. 이 단계는 자율 위임으로 승인 검토를 통과했으며 추가 질문/차단 없음. 이전 보고 미커밋 기록은 이력이다.

현재 `codex/studio-publication-completion`에서 [PUBLICATION_AUTHORITY](PUBLICATION_AUTHORITY.md)의 전송 전 승인 소비/같은 바이트 준비·철회 경계 UI를 미커밋으로 구현했다. 관련35개·실제 PG17 경합7개·Chrome3개·Next build/타입·추적/비활성 API PASS, 모든 검사 종료. 증거 `.local/studio-publication-authority-review-20261014/`, native `.local/release-postgres17-273510ab-7211-4805-b9bf-7dd3caa0fa32/`. claim API는 소비 영수증을 재발급하지 않는다. 응답 유실 시 authority-send.claim을 지우거나 다시 실행하지 않는다. 아직 실제 업로드·deploy workflow·완료 처리는 없다.

다음은 변경 검토/공개 뒤 고정 Pages 전송기와 원격 바이트 검사·완료/불확실 결과 기록을 연결한다. 완료 후 기존 자료실 기준을 같은 트랜잭션에서 갱신하고 전역 슬롯을 풀어야 한다. DB와 외부 게시를 원자적이라고 취급하지 않는다. 실제 운영 SQL은 foundation만, 새 SQL/키·기능 활성화는 대기다. OpenAI 인증 GET1회와 Linux 새1/1·기존4/4/누적8은 완료했으니 반복하지 않는다. 사용량71% 남음,53~55% 정리 시작/50% 보존.

**최신 2026-10-14 10:55 KST:** PR #14의29개 명시 승인·병합·운영 배포/HTTP 및 새 Linux1회 성공 완료. main dbc3aaa053f4763eca835ab1ad8c1b962e568ce9. publication rehearsal run38496755442에서2D/3D·링크/초기화 고장 감지·정리를 확인했다. **새1/1 사용 완료, 기존 제작4/4·누적8 유지, 추가 실행 금지.** 기존 API 키 입력/GET 인증과 PR #12~#14 승인·병합은 반복하지 않는다. 이전 대기 문구는 이력이다.

현재 branch codex/studio-publication-report에 검사 보고서 저장 SQL/HTTP/암호화 보고 job이 미커밋으로 있다. [PUBLICATION_REPORT](PUBLICATION_REPORT.md): 관련17개·실제 PG17 경합6개·Next build/타입·배포 추적8개·비활성 HTTP3개·actionlint PASS. 검사 프로세스 종료 확인. `.local/studio-publication-report-review-20261014/` 및 `.local/release-postgres17-75d91a31-1bbe-4cf7-896d-34bb58e9a549/result.json`이 증거다. 내용이 변하지 않으면 통과 검사를 반복하지 않는다. 역사적 보고는 철회 후에도 기록되지만 승인/게시 권한을 발급하지 않는다. 전송 유실은 자동 재시도하지 않는다.

다음은 보고 변경 검토/공개와 게시 직전 승인 소비·같은 바이트 Pages 배포·확인·불확실 결과 조정 구현이다. DB와 외부 게시를 원자적이라고 가정하지 않는다. 공개 파일 업로드 전에 유효한 최종 교사 승인 권한을 확보하고, 전송 개시 후 철회 경계를 화면/DB에 일치시켜야 한다. 아직 정책 구현을 완료하지 않았다. 운영에는 worker foundation만 적용, 나머지 승인/준비/게시 SQL은 proposal이며 기능은 비활성이다. App/전달 키 준비·유료 제작·실제 원문 검토/최종 교사 승인도 남았다. 남은73%,53~55%부터 정리하여50% 보존.

**최신 2026-10-14 10:33 KST:** PR #13 명시 승인·병합·운영 배포/HTTP 확인 완료, main b0885c2edc4803ea185793260bc43f241a6a0228. API 키 입력/인증과 PR #12·#13 병합은 다시 요청하지 않는다. 현재 branch codex/studio-publication-check, 새 게시 검사 미커밋이다. [PUBLICATION_CHECK](PUBLICATION_CHECK.md)의27개 로컬/Chrome13개/build/배포 추적/비활성 HTTP/워크플로 검사가 통과했다. 현재 실행 중 앱·브라우저·검사 프로세스는 없다.

승인 설명은 manifest와 봉투v2로 전달하고 실제 자료실 하위 경로에서 같은 파일을 검사한다. 보안 프로필/권한 변화 없이 컨테이너 진입 모드와 allowlist/COPY 순수 파일만 추가했다. report.sealed.json은 암호문만 저장하며 아직 보고서 HTTP/DB 연결·게시 권한 소비·실제 Pages 배포/확인은 없다. 새 수동 publication rehearsal은 키 없는 합성4사례·job12분이며 아직0회, 구체적 승인 후1회 기록을 만들 예정이다. 기존 제작 rehearsal4/4·누적8 제한과 구분하고 자동 반복하지 않는다.

다음은 검토 목록/해시 고정→PR→새 Linux 확인, 동시에 보고서/게시 권한 연결 로컬 구현이다. 운영 SQL은 worker foundation만 적용됐고 나머지 승인/준비/게시 SQL은 proposal이다. App/전달 키 등록·유료 제작·실제 원문 검토·최종 교사 승인도 남았다.75% 남음/50% 보존(53~55%부터 정리). 기존 기록의 미커밋/승인 대기는 아래 이력으로 구분한다.

**최신 2026-10-14 10:13 KST:** PR #12의 명시 승인·병합·운영 배포/HTTP 확인 완료. main dc277c232f369c861534e9e4245942a999ba1606, deployment7053737818. API 키 인증도 완료이므로 기존 병합 승인/키 입력/GET 인증을 반복하지 않는다. 이전 미커밋/승인 대기는 이력이다.

현재 branch codex/studio-publication-auth에는 별도 게시 OIDC/SQL 원자 읽기·분할 파일 전달·암호화 준비 래퍼·비활성 워크플로가 미커밋으로 있다. [PUBLICATION_ARTIFACT](PUBLICATION_ARTIFACT.md)의29개 검사+실제 PG17 경쟁5개/build/추적8개/비활성 HTTP2개/actionlint PASS를 확인했다. PG/로컬 앱 종료 확인. `.local/studio-publication-auth-review-20261014/`와 `.local/release-postgres17-ab44381d-471c-410d-a2d8-7dd03c40b5ea/`가 증거다. 내용이 변하지 않으면 이미 통과한 검사를 반복하지 않는다.

다음은 변경을 고정/검토해 PR로 공개하고 격리 게시 검사, 배포 직전 버전 승인 소비, 동일 바이트 배포, 불확실한 원격 상태 조정, 실제 게시 확인을 연결하는 것이다. 현재 워크플로는 암호화 파일 준비까지만 하며 Pages 권한/게시 완료 기능은 없다. 운영 SQL/환경/키 등록·유료 호출·학생 공개는 실행하지 않았다. 전체 활성화 전에 GitHub App/전달 키/운영 승인·준비·게시 SQL 준비가 필요하다. 남은77%,50% 보존(53~55%부터 정리). 이전 Linux rehearsal 상한4/4·누적8을 늘리거나 재실행하지 않는다. 개인 에이전트는 같은 백엔드를 사용하되 최종 교사 승인을 대행하지 않는다.

**최신 2026-10-14 09:37 KST:** 실제 OpenAI 키는 DPAPI/사용자 전용 ACL/Git 제외 확인 완료.09:30 GET/models1회 HTTP200/PASS, 유료 추론0회. `.local/studio-worker-secrets-20261014/auth-check-result.json`에 안전한 결과만 저장했다. **키 입력 질문과 인증 요청을 반복하지 않는다.** 이전 입력 실패/대기 기록은 이력이다. 아직 서버/Actions secret 등록은 없다.

branch codex/studio-publication-dispatch에는 게시 접수 proposal/서비스·고정 GitHub 전송·GET/POST API·상태 화면·검사가 미커밋으로 있다. 관련17/17·새 Chrome2/2·기존 승인2/2·Next build/타입/배포 추적 PASS. 실제 PG17 최신5개 PASS, 최초 종료 대기 초과exit1은 보존했고 `.local/release-postgres17-831d8bdb-ddd3-4ab4-b4c9-7cbdd7bd01f2/shutdown-followup.json`에서 종료 확인. 초기 Chrome2개 실패는 테스트 라우터 method() 누락을 수정했으며 재검사 전용 출력 폴더와 기존 trace 둘 다 보존했다. 실행 중 검사 프로세스는 없다. PUBLICATION_DISPATCH/STATUS 맨 위를 따른다.09:21 비공개 checkpoint는 이후 변경/키 입력 전의 이력이므로 최신 스냅샷으로 사용하지 않는다.

다음은 변경 목록/해시를 고정해 코드 PR로 검토한 뒤 게시 워크플로·별도 실행 인증·동일 파일 전달/검사·게시 권한 소비·실제 공개 확인을 연결하는 것이다. GitHub App 설정/전송 키·운영 승인/원문/게시 SQL 적용도 남았다. 기존 worker DB와 PR #11 병합 승인은 완료됐으며 재요청하지 않는다. 새 활성화/유료 제작/학생용 공개는 수행하지 않았다. 남은81%,50% 보존/53~55% 정리 기준이 과거20% 기준보다 우선한다.

**최신 2026-10-14 09:20 KST:** PR #11은 명시 승인 후 병합·Production 성공·HTTP 확인 완료. main0252157a7bf42a3f2ee7971907fe39a275a1add8, 새 로컬 branch codex/studio-publication-dispatch. 게시 실행 접수 proposal/서비스/fixture/검사와 native --publication 모드를 미커밋 상태로 추가했다. 로컬8개(7+추가1), 실제 PG17 경쟁5개 PASS·종료 확인. PUBLICATION_DISPATCH/STATUS 맨 위를 따른다. 아직 실제 전송기·워크플로·게시 권한·확인은 연결하지 않았다. 운영 SQL·환경값·유료·학생용 게시 변경0회. PR #11 승인 차단은 해결됐으므로 재질문하지 않는다.

API 키는 준비 답변 완료지만 숨김 입력 저장 성공은 대기 중이다. 경로/실행 기호 누락 후 마지막 INPUT_FORMAT_INVALID였다. `.local/studio-setup-20261014/receive-api-key.ps1`을 전체 / 경로와 `[scriptblock]::Create(...).Invoke()`로 실행하고 오른쪽 버튼 붙여넣기로 전체 키를 입력하도록 안내했다. 도구는 안전한 INPUT_TOO_SHORT/INPUT_WHITESPACE_OR_CONTROL/INPUT_PREFIX_INVALID를 추가 표시한다. 동일 명령을 & 없이 실행하면 스크립트 본문만 표시됐던 문제를 반복하지 않는다. 성공 뒤 보호 폴더 studio-worker-secrets-20261014의 상태/ACL/DPAPI를 값 출력 없이 확인한다. `check-api-auth.ps1`은 GET/models1회·15초·응답512KiB·리다이렉트 금지·모델 호출0의 준비 helper이며 구문 검사만 했다. auth-check-attempt.json이 있으면 재실행하지 않는다. 키는 채팅/환경값/명령문/로그에 넣지 않는다. 다음은 이 키 입력 결과 대응과 게시 전송 연결이다.

**최신 2026-10-14:** branch codex/studio-release-preparation, main4f774ebb 유지. 원문 근거/준비 발급 로컬8/8와 실제 PG17 경합7/7 PASS·종료 확인. RELEASE_PREPARATION.md와 STATUS 맨 위를 따른다. 새 SQL은 proposal이며 운영 미적용이다. 실제 원문/교사 행위는 아직 없다. 사용자 API 키 준비 답변은 완료됐고 숨김 입력 도구를 합성 문자열로 검사한 뒤 VS Code PowerShell 명령을 안내했다. 입력 완료 응답과 DPAPI 저장 상태 확인은 대기 중이다. 키를 채팅으로 받거나 출력하지 않는다. .local/studio-setup-20261014/receive-api-key.ps1이 고정 보호 폴더에 저장하며 기존 키는 덮어쓰지 않는다. 실제 유료 호출0회, 다음은 키 상태 확인 및 게시 중복/철회 경쟁 연결. 남은86%,50% 보존. PR #9 DB/PR #10 병합 승인 완료는 반복하지 않는다.

## 2026-10-13 23:20 KST — PR #10 병합·제작실 재배포 확인

검토된38개를7b8d294ca4cf15cdfefeff4f6babe21901c59896으로 공개하고 [PR #10](https://github.com/Raph-Alpaca/science-simulations/pull/10)을 생성했다. 정확한 head의 Vercel 검사2개 SUCCESS. 자동 승인 검토는 포괄 위임만으로 main 병합/재배포 권한이 불명확하다며 첫 시도를 차단했고, 사용자의 **PR #10 병합·제작실 재배포 승인** 후 같은 head를 병합했다. main4f774ebb4f9db20edfa077441a50bd8992e7017a,23:17:01 KST 병합. GitHub Production deployment7040960009/success(23:17:52 KST)를 확인했다. 운영 홈200·정확한 session401/LOGIN_REQUIRED·worker503/WORKER_SETUP_REQUIRED와 private,no-store 확인. 보호 증거 .local/studio-release-review-20261013/production-http.json. Vercel 직접 상세 조회/로그인 이후 운영 화면은 별도 미검증이다.

이번에는 앱 코드만 반영됐다. release_approval proposal과 신규 source preparation SQL은 운영에 적용하지 않았고 환경값 변경·유료 AI·학생용 게시는0회다. 관련 병합 승인 대기는 해결됐으며 다시 묻지 않는다. 다음 작업은 신뢰된 원문 검토 기록의 철회/수정 경쟁 처리와 같은 산출물 게시 연결이다.


**최신 2026-10-13 23:08 KST:** worker 운영 증분은 완료. 별도 최종 버전 승인 SQL/API/화면 로컬 검증과 실제 PG 동시성9개·Chrome5개·2D/3D4관찰을 완료했다. 검사의 종료20초 초과는 별도 확인으로 종료 확정했고 실패 보고서는 보존했다. RELEASE_APPROVAL/STATUS 맨 위를 따른다. 현재 추가 변경은 미커밋이며 다음은 파일 검토 후 코드 PR, 신뢰된 원문 검토/준비 발급과 게시 연결이다. 새로운 승인 SQL은 운영 미적용, 제작/비용/게시 비활성. 사용량90% 남음,50% 보존.

**최신 2026-10-13 22:35 KST:** 사용자 재개·자율 진행 후 PR #9 병합/main985cf54와 명시 승인한 worker 기반 운영 DB 증분20261007123947 적용을 완료했다. 기존 데이터와 로컬 검증 스키마/권한 일치,18개 테이블 RLS,worker/dispatch/budget/delete 비활성,이력3개 확인. STATUS 맨 위와 `.local/studio-worker-review-20261013/` 및 새 보호 백업 worker-preflight-20261013-e266b6ff16c8440d8a96536b387a3739를 확인한다. 운영 DB 승인 대기는 해결됐으므로 이전 요청을 다시 묻거나 증분을 재적용하지 않는다. 별도 release_approval proposal과 fixture3개는 아직 미검증으로 후속 로컬 작업 중이다. 유료0회/학생용 게시0회/기능 활성화 없음,남은94%,50% 보존. 아래10월8일 이전 대기 상태는 이력이다.

**현재 2026-10-07 21:48 KST:** Linux 격리/2D/3D/고장 감지 완료 후, 최신 운영 읽기 전용 백업·로컬 복원과 worker DB 증분13개 호환 검증을 완료했다. CLI dry-run은20261007123947_studio_worker_foundation.sql1개만 대상이다. 새6개 파일은 로컬 미커밋, 운영 미적용. WORKER_MIGRATION_REVIEW.md의 정확한 hash/10개 테이블·37개 함수/비활성 gate 범위에 대한 공개·병합·운영 적용 승인이 다음 단계다. backup/migration 보고서와 로컬 비밀번호 DPAPI는 보호된 worker-preflight-20261007-d893b4507d214aba935495dbf711032f에 있다. 서버 종료, 사용량95% 남음. 원격 rehearsal4/4회 상한 도달이므로 새 dispatch를 하지 않는다.


**2026-10-07 21:34 KST 실제 Linux 통과:** 사용자 명시 승인 후 PR #8을 병합했다. HEAD98f86b29836b86335470ba8bf101feb849bcfedc, main17c744785952e3f370928018c605a9ff5c2d490b, Production dpl_CkEi38s8gQyXKr4kZxSunfuDrNFS READY. run37621641105에서 isolation/2D/3D 통과, broken-reset은 의도대로 fail로 감지됐으며 모든 브라우저 종료·컨테이너 삭제 확인, 전체 conclusion success다. 이번 단계4/4회·누적8회이며 추가 dispatch 금지. 초기 PR #8 병합 자동 승인 거부는 사용자의 정확한 보안 필터 변경·병합/검사1회 승인으로 해결됐다. 다음은 운영 데이터 최신 백업/별도 로컬 복원본에 신규8SQL 호환 적용 시험이다. 운영 SQL/환경값/유료AI/학생용 게시 변경은 아직 없다.


**현재 2026-10-07:** PR #7 병합/main16be52e, Production READY. run37620220753 실패를 보존하고 암호화 오류를 실제 DPAPI 키로 복호화했다. Chromium 내부 sys_chroot 실패가 확인돼 단일 syscall 허용 파생 프로필을 로컬 준비했고 관련15개 검사 통과했다. 현재 branch codex/studio-chromium-chroot, 아직 미커밋. capability 추가 없이 초기5종 capability0을 검사한다. STATUS 맨 위/컨테이너 README의 근거와 변경 범위를 따른다. 다음은 수정 PR 검사/병합→기존 dispatch helper로 이번 단계4/4번째 실제 Linux 검사. 이번 단계3/4회 사용·누적7회이며 모두 실패, 유료0회다. 이전 중단/승인 대기는 이력이다. 사용량96% 남음·50% 보존. 기존 private.dpapi와 run37620220753 원문은 보호 폴더에 보존하며 공개하지 않는다.


이 문서는 다음 작업자가 그대로 이어갈 수 있도록 유지한다. 마지막 실제 검증은 STATUS 맨 위와 비공개 `.local/evidence`를 함께 확인한다. 키·암호는 이 문서에 쓰지 않는다.

## 현재 지점 — 2026-10-05 재개 후

**2026-10-07 재개:** 사용자 계속 요청으로 아래 중단 상태를 해제했다. 저장된12개/전체 해시·원격 main·종료 실행 상태가 일치하고 기존 DPAPI 키 대응도 재확인했다. 남은 사용량97%,50% 보존/53~55% 정리 기준 유지. 암호화 시작 진단12개를 새 PR에 반영한 뒤 기존 단계3/4번째 실행을 진행한다. 이전 실패/비밀키/증거를 덮어쓰지 않는다.

**사용자 종료 요청 — 2026-10-06:** 컴퓨터를 끄므로 즉시 중단했다. 추가 실행/업로드 금지. 모든 검사/감시 세션은 종료했고 이 작업에서 실행 중인 로컬 서버/DB는 없다. 암호화 시작 진단12개는 로컬 미커밋, 아직 PR #7 없음. 현재 branch codex/studio-launch-markers / HEADc81aa0f4e8ec480133d7871e2c3a03bbdc717881, origin/main4cfa44a1e6c45df52c921733bfeb34bf9c80cfbe이며 HEAD/main 파일 트리는 같다. 마지막 원격 run37327477053 종료/failure, 이번 단계2/4회 사용. 마지막 사용량72% 남음, 재개 시 다시 확인하며 남은50% 보존/53~55% 정리 기준 유지.

재개 첫 작업은 `.local/studio-worker-review-20261005/shutdown-checkpoint.json`의12개 목록/해시와 실제 Git 상태를 비교하는 것이다. 새 공개키에 대응하는 실제 사용자 전용 startup-diagnostic/private.dpapi가 이미 있고 왕복 검증도 통과했다. 새 키를 만들거나 기존 파일을 덮어쓰지 않는다. 관련17개 및 Chrome8개 검사는 이미 통과했으므로 소스 변경 없이 반복하지 않는다. 공개 업로드 후보247개/금지 경로·키 패턴 문제0개였다. 이후 로컬 진단 변경을 검토·PR/병합한 뒤 dispatch-rehearsal.mjs로 세 번째 제한 실행을 수행한다. 상세 오류는 공개하지 않고 로컬에서 복호화한다. 다음 원인 수정과 실제2D/3D 통과 전 운영 DB/유료 제작 단계로 넘어가지 않는다.

**최신 2026-10-06 00:01 KST:** PR #6 병합, HEADc81aa0f/main4cfa44a1e6c45df52c921733bfeb34bf9c80cfbe, Production dpl_ASUCiVoHyD2mspTu8YSfvvcCEcZL READY. run37327477053은 시작 실패이며 MISSING_PATH/CRASHPAD/ZYGOTE/SIGABRT 표식, 원인은 아직 미확정이다. 누적6회·이번계속2/4회. 로그/상태는 보호 폴더의 rehearsal-37327477053.{log,json}. 진행 중 검사/감시 없음. 사용량72% 남음·50% 보존.

다음은 준비한 암호화 시작 진단 PR/병합 후 세 번째 제한 실행이다. 후보 없는 별도 컨테이너에 공개키만 주고 최대32KiB 시작 오류를 봉인한다. 원래 실패 유지·한 번만 추가 probe·기존 격리/정리 검증 유지. 공개키는 container/startup-public-key.json에만 있고 이미지에는 복사하지 않는다. 제거하면 추가 probe가 꺼진다. 관련17개·실제 Chrome8개 PASS, 실제 DPAPI 왕복 PASS. 비밀키와 평문 결과는 `.local/studio-worker-review-20261005/startup-diagnostic/`의 실제 사용자 전용 ACL 내부다. private.dpapi는 일반 사용자 문맥에서만 복호화한다. `.local/studio-worker-review-20261005/decrypt-startup.mjs`에 비밀키를 표준입력 파이프로 전달하며 명령문/환경/로그로 보내지 않는다. 새 run의 startup-diagnostic 로그에서 report.sealed만 보호 기록으로 추출한 후 복호화한다. 암호문도 원래 실패 로그와 함께 보존한다. sandbox나 권한을 추측으로 변경하지 않는다.

**최신 계속 요청:** 남은50%를 보존하며53~55%부터 정리한다. 과거20% 기준은 대체됐다. 사용자는 단계가 끝나도 계속 진행하도록 요청했으므로 완료된6개/10개 승인을 반복 질문하지 않는다. 이번 키 없는 진단 단계는 `.local/studio-worker-review-20261005/continuation-50-budget.json`과 dispatch-rehearsal.mjs로 최대4회 및 같은 SHA 중복/활성 실행 중복을 차단한다. 현재1/4회 사용, 전체 누적5회다.

PR #5 병합 완료: branch codex/studio-sandbox-diagnostic, HEAD1fee8b5, main85f740249109159aa899bac6baa8315616b124f9, Production dpl_FA2MYNJ5yKnQEbv2W77hti6vbffh READY. run37326412392는 격리/삭제·소스 통과 뒤 브라우저 시작 실패(RUNTIME_BROWSER_LAUNCH_FAILED, runtime not_run,827ms,requests0,cleanup confirmed). Playwright 요약 문구 보완으로도 원인이 확정되지 않았다. 실제 sandbox 원인이라고 단정하지 않는다. 다음 변경은 원문 대신14개 고정 오류 표식 추가, 관련13/13 PASS. 사용자 사용량 기준도 OWNER_INPUT에 갱신했다. 실제 Linux 재검사 전이며 다음 PR로 반영한다. 운영 DB/환경값/유료AI/학생용 게시 변경0회, 사용량73% 남음.

**최신 22:45 KST:** 승인10개는 PR #4로 공개·병합 완료다. branch codex/studio-runtime-diagnostics / HEAD `6031b8b1213d0a026200e3566de5f9b467e4749c`, main/Production `6e186b6e15ee16eff460e59fc78e8a5d67682d72`, 배포 `dpl_7w39jE91pXnZJ2q5NPJ9JpxAcuVW` READY. HEAD/main 파일 트리는 같다. 홈200·session401·worker503 및 no-store를 실제 확인했다. 운영 DB/환경값·유료AI·학생용 게시 변경 없음.

추가1회 run37318625336은22:40:30~22:41:35 KST failure 종료했다. 이미지 빌드·격리/삭제·2D 소스 contract 통과, Chromium 시작 실패다. RUNTIME_BROWSER_LAUNCH_FAILED / runtime not_run / browserStarted false / browserStopped true / requests0 / duration985ms / cleanup confirmed. 3D/고장 fixture 미실행, 제작/검토 jobs skipped. 누적 원격4회이며 추가 dispatch 없음. `.local/studio-worker-review-20261005/rehearsal-37318625336.{log,json}` 및 runtime-diagnostic-production-http.json과 앞선 실패를 보존했다.

Playwright1.63.0이 일부 sandbox 오류를 `Chromium sandboxing failed!`로 다시 쓰는데 분류기가 이를 누락한 것을 확인했다. 로컬 분류기/회귀 입력에 추가해 관련7/7 PASS(exit0,324ms). 실제 Linux 메시지가 그 문구였는지는 모른다. OS 원인을 sandbox/AppArmor로 확정하거나 권한을 풀지 않는다. 미커밋6개는 runtime-diagnostics.mjs, runtime-diagnostics.test.mjs, container/README.md, STATUS/RESUME_HANDOFF/WORKER_ROLLOUT다. 위 보호 폴더의 rewritten-sandbox-review.md 및 rewritten-sandbox-manifest.json을 확인한다. 직전10개 승인은 완료됐으며 새6개 공개/병합·추가 진단1회는 별도 범위다. 현재 검사/감시 세션 없음, 사용량74% 남음·20% 보존·초기화권 미사용. 실제 Linux2D/3D 통과 전 운영 DB/키/유료 제작으로 넘어가지 않는다. 아래22:33 이전 내용은 이력이다.

**최신 22:33 KST:** 앞서 준비한 읽기 권한5개는 PR #3 공개·병합 완료다. 로컬 branch codex/studio-checker-readability / HEAD `94cdd9f8cfd5ec1efe96500899de833aba559e04`, main/Production `f5e58f47ce535eb7dcf9e9e4ecbc379051568dea`, 배포 `dpl_CMkLJQ6Rp7nZXiHGKhpvhVapkocM` READY. HEAD/main 파일 트리는 같다. 홈200·session401·worker POST503/WORKER_SETUP_REQUIRED를 확인했다. 기존5개 승인은 해결됐다.

승인된1회 run37316382745는 이미지 빌드와 실제 격리 probe/삭제를 통과하고 2D의 반환 보고서 기대값 확인에서 failure 종료했다. 2D의 세부 runtime issue는 기존 로그에 없으므로 원인은 미확정이다. 반환 경로는 보고서 형식/대상/브라우저 종료 및 컨테이너 삭제를 확인한다. 3D·고장 fixture는 미실행, 제작/검토 jobs는 skipped다. 보호 기록 `.local/studio-worker-review-20261005/rehearsal-37316382745.{json,log}`, 운영 HTTP 기록 readability-production-http.json. 앞선 실패2회도 보존했다. 누적 원격 실행3회이며 추가 실행하지 않았다.

새 미커밋10개: runtime-diagnostics(신규), runtime-browser, container/build-context, container/rehearsal, runtime-diagnostics.test(신규), container-rehearsal.test, container/README, STATUS, RESUME_HANDOFF, WORKER_ROLLOUT. 실패 보고서의 허용된 issue/제한된 수치와 브라우저 시작 오류 분류만 추가하며 원문/경로/환경값을 출력하지 않는다. 권한/격리/시간 상한 유지. 관련12/12 PASS와 실제 Chrome8개 PASS/정상 종료, 증거 `.local/evidence/worker/runtime-browser-a62f5d46-7b93-41b3-bc4c-4f8c2572380c.json`. 합성 모델7회·실제 유료0회이며 Linux 성공 증거가 아니다.

다음은 runtime-diagnostic-review.md와 runtime-diagnostic-manifest.json에 고정한10개 공개/병합·추가 키 없는 Linux1회 범위를 확인한 뒤 실행한다. 보호 폴더는 `.local/studio-worker-review-20261005/`다. 실패하면 원문 대신 새 고정 issue를 확인하고 해당 단계만 보완한다. sandbox/권한 확대로 우회하지 않는다. 통과 후에만 WORKER_ROLLOUT의 운영 DB 증분/키 연결 단계로 이동한다. 사용량76% 남음,20% 보존·초기화권 미사용, 진행 중 검사/감시 세션 없음. 아래14:36 이전 승인 대기와 원격 SHA는 이력이다.

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
