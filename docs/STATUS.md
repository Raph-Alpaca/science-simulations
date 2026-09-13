# 구현 현황

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
