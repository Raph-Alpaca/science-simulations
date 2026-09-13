# 04 업로드 전 점검과 Pages 준비

2026-09-13. 로컬 준비 기록. 이후 사용자가 기존 Public 저장소 `Raph-Alpaca/science-simulations`를 지정했다. 새 저장소를 만들지 않는다. 원격 연결·push·Actions 실행·Pages 공개는 하지 않았다. 최신 로컬 커밋 진행 상태는 STATUS를 따른다.

## Git와 업로드 범위

현재 main, 커밋 0, 추적/스테이징 파일 0, 원격 0이다. 처음 저장소가 없어서 초기화했다. 도구 계정 소유권 문제로 처음 만든 빈 .git은 커밋/추적 파일 0을 검사한 뒤 `.local/evidence/pages04/git-init-sandbox`에 보관하고 사용자 계정으로 다시 초기화했다. 삭제·이력 재작성·전역 safe.directory·사용자 이름/이메일 설정은 하지 않았다.

아래 후보는 승인된 업로드 목록이 아니다. 전체 정확한 목록은 `.local/evidence/pages04/upload-candidates.txt`, 제외 경로는 `excluded-paths.txt`, 검사 시각·파일 SHA-256·문제 유형은 `upload-audit.json`에 있다. `git add .` 또는 Stage All은 아직 사용하지 않는다.

| 구분 | 파일·범위 |
|---|---|
| 저장소 업로드 검토 후보 | .github/workflows/pages.yml, apps/catalog, packages/contracts, automation/catalog·roles, tests, config, templates, setup, docs, README/AGENTS, package.json/package-lock.json, TS/Playwright 설정, .gitignore, 값 없는 키 항목의 .env.example, references/source_index.json·teacher_notes.md |
| 별도 결정이 필요한 후보 | content/simulations/mendel-inheritance의 index.html/meta.json/model.js/styles.css/ui.js 5개. 현재 ignore 대상이 아니므로 Git 후보에 포함됨. Public 저장소에 올리면 원본이 보임 |
| 업로드 제외 | .local 전체(개인자료·검사기록·첫 Git 메타데이터 포함), 실제 .env/.env.local 등, *.key/*.pem, node_modules, dist, playwright-report, test-results, 로그/녹음, references의 PDF/DOCX/HWP/HWPX 원문 |
| 실제 Pages 파일 | dist/catalog/index.html, catalog.json, assets/app.js, assets/styles.css 4개만 |

`references/2022 개정 과학과 교육과정.pdf`가 이번 파일 탐색에서 발견됐다. 내용/적용 학년도/이용 범위는 검토하지 않았다. 원문 업로드를 보류하도록 ignore를 추가했으며 파일은 이동·삭제하지 않았다. 파일이 존재한다는 사실을 교육과정 대조 완료로 바꾸지 않는다. source_index/OWNER_INPUT의 미확정값은 그대로다.

`.env.example` 검사는 처음 값 확인 필요를 보고했다. 값 자체를 출력하지 않고 변수별 형식을 확인한 결과 비밀 키 항목은 빈 값이고 저장소 가안 GH_REPO가 원인이었다. 기존 가안 한 값에만 허용 조건을 추가했다. 비밀키 패턴 검사·경로 검사는 유지했다. 최종 감지 문제 0은 임의 인코딩·모든 개인정보·모든 문서의 안전을 보증하지 않는다. 개인 메모로 사용한 문서가 있다면 업로드 승인 전에 경로를 지정해야 한다.

유전 소스 업로드 여부는 미결정이다. 제외를 선택하더라도 로컬 원본은 유지한다. 워크플로의 필수 자료실 검사는 소스가 없어도 실행되며 유전 전용 검사는 해당 소스가 저장소에 포함된 경우에만 추가 실행된다. 유전 미리보기·유전 전용 로컬 검사 명령은 소스가 없는 checkout에서 사용할 수 없다. 사이트 공개 제외와 저장소 원본 비공개는 다른 조건이다.

## 워크플로와 검증 경계

`.github/workflows/pages.yml`은 workflow_dispatch 전용이며 main만 허용한다. push/PR 자동 배포는 없다. 기본 입력 publish=false. 배포하려면 추가로 저장소 변수 PAGES_DEPLOY_ENABLED=true가 필요하다. 이 변수는 운영자가 빈 자료실 게시를 명시적으로 켜는 장치이며 콘텐츠 승인이나 AI AUTO_PUBLISH 설정이 아니다.

build는 contents:read만, deploy는 pages:write/id-token:write만 가진다. checkout은 실행 github.sha 고정, persist-credentials:false. Ubuntu 24.04에서 Node 24.15.0, npm ci, Chrome 설치, 업로드 경로 검사, 메타/타입/단위/기존 E2E와 포함된 유전 검사를 실행한다. Linux 명령은 npm을 사용한다. 설치는 GitHub의 일회용 runner에서만 수행하도록 작성했으며 사용자 Windows의 전역 설치는 없다.

최종 dist/catalog를 다시 빌드해 정확한 네 파일·빈 cards·하위 경로를 검사한다. 이 최종 출력만 별도 Chrome에서 열고 전후 SHA-256을 비교한다. 빌드 뒤 소스 재빌드나 다른 커밋 checkout 없이 같은 실행의 artifact를 deploy가 needs:build로 받는다. 전체 프로젝트나 trace를 artifact에 올리지 않는다. 검사 실패 시 업로드/배포 단계로 진행하지 않는다. 현재 콘텐츠가 0개인 준비용 정책이므로 이후 콘텐츠 공개에는 별도 시스템 변경·정식 승인 연결이 필요하다.

각 Action의 공식 GitHub release/tag API로 아래 tag가 commit을 가리킴을 확인하고 해당 SHA의 action.yml을 실제 읽었다. 조회일 2026-09-13. configure-pages v6도 읽었지만 자동 사이트 활성화가 필요 없어 워크플로에 사용하지 않았다. Pages Source는 소유자가 UI에서 설정한다.

| Action | 버전 | 전체 SHA |
|---|---|---|
| actions/checkout | v7.0.1 | 3d3c42e5aac5ba805825da76410c181273ba90b1 |
| actions/setup-node | v7.0.0 | 820762786026740c76f36085b0efc47a31fe5020 |
| actions/upload-pages-artifact | v5.0.0 | fc324d3547104276b827a68afc52ff2a11cc49c9 |
| actions/deploy-pages | v5.0.1 | 368f82528645a54fb793d4d04e342629a3f51346 |

공식 업로드 Action 내부 upload-artifact 호출도 v7.0.0 전체 SHA로 고정된 정의를 확인했다. GitHub 실행 환경·권한·요금제·environment 보호·실제 OIDC·게시 URL은 아직 미검증이다. 로컬 YAML 파싱과 권한/SHA/경로 검사는 실제 GitHub workflow 실행을 대신하지 않는다.

근거: [GitHub Pages 공식 workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Pages Source 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [고정된 upload-pages-artifact 정의](https://github.com/actions/upload-pages-artifact/tree/fc324d3547104276b827a68afc52ff2a11cc49c9), [Playwright CI](https://playwright.dev/docs/ci-intro).

## 사용자 결정과 다음 조작 — 아직 실행하지 않음

대상은 기존 Public 저장소 https://github.com/Raph-Alpaca/science-simulations 로 확정했다. 원격 main에는 `8dbba6dc724983cf47ae4f784a9256850ab50f24` 커밋과 README.md가 있음을 git ls-remote·공식 API·원문 읽기로 확인했다. 빈 저장소가 아니므로 로컬 첫 커밋을 곧바로 push하지 않는다. 원격 연결을 허가받은 뒤 최신 이력을 다시 읽고 기존 README와 로컬 README를 보존하며 병합해야 한다. 강제 push나 원격 이력 덮어쓰기는 하지 않는다. Public 저장소에서는 포함된 개발 초안·문서·검사 코드도 보인다.

승인 후의 순서:

1. VS Code 왼쪽 **소스 제어**에서 승인한 파일만 개별 `+`로 스테이징하고 diff를 재검사한다. 커밋 작성자 설정이 없으면 본인이 선택한 이름/이메일을 이 저장소의 local 설정으로만 입력한다. GitHub 이메일 비공개 설정은 GitHub 프로필 → Settings → Emails에서 확인한다.
2. 로컬 커밋 확인 뒤 별도 허가를 받아 기존 저장소를 원격으로 연결한다. VS Code **소스 제어 → … → 원격(Remote) → 원격 추가(Add Remote)** 또는 명령 팔레트의 **Git: Add Remote**에서 위 기존 URL을 사용할 수 있다. 하지만 현재는 원격 연결도 수행하지 않는다. 연결 후 먼저 Fetch로 기존 이력을 확인하고 로컬 독립 이력과의 병합 및 README 충돌 처리를 검토한다. 이를 마친 뒤 사용자가 VS Code에서 로그인·Push를 진행한다. 인증키는 채팅에 붙이지 않는다. 새 저장소 생성 명령은 사용하지 않는다. [VS Code GitHub 공식 안내](https://code.visualstudio.com/docs/sourcecontrol/github)
3. 저장소 **Settings → Pages → Build and deployment → Source → GitHub Actions**를 선택한다. **Settings → Environments → github-pages**에서 main 배포 제한과 가능한 승인 보호를 확인한다.
4. **Actions → Verify and optionally deploy empty catalog → Run workflow**, main·publish=false로 먼저 원격 검사를 실행한다. 이때도 Actions artifact 업로드는 있으나 Pages 게시 단계는 건너뛴다.
5. 원격 검사 결과를 확인하고 별도 공개 승인을 받은 뒤 **Settings → Secrets and variables → Actions → Variables → New repository variable**에서 PAGES_DEPLOY_ENABLED=true를 설정한다. 그 후 main·publish=true로 수동 실행한다. 최종 환경 승인과 실제 게시 URL·버전·하위 경로를 확인하기 전에는 게시 완료라고 기록하지 않는다.

이번 요청은 1~5의 실제 업로드/공개를 허가한 것이 아니다. 로그인·계정정보 없이 가능한 로컬 준비를 마친 상태에서 멈춘다.
