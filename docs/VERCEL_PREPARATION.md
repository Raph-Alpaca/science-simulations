# 06 제작실 Vercel 배포 전 준비

2026-09-15. **로컬 준비·검사만 완료하며 Vercel 프로젝트 생성, 연결, 환경값 등록, 배포는 아직 하지 않는다.** 05 변경도 미커밋이다. 실제 배포 URL·Vercel 설치/빌드·HTTPS 인증 검사는 미검증이다. 다음 업로드 승인 전에는 현재 Git 작업 상태를 다시 확인한다.

## 대상과 현재 범위

- 기존 Public GitHub 저장소 `Raph-Alpaca/science-simulations`, production branch `main`을 사용한다. 새 GitHub 저장소를 만들지 않는다.
- 배포 대상은 `apps/studio`의 A 전용 모의 제작실이다. 공개 자료실은 기존 [GitHub Pages](https://raph-alpaca.github.io/science-simulations/)를 유지한다. `.github/workflows/pages.yml`과 `dist/catalog` 배포 범위는 변경하지 않는다.
- A는 active=true 및 로컬 허용 목록에 포함된다. B는 active=false·허용 목록 제외이고 공식 global 로그아웃 후 세션0개를 확인했다. 이번 준비에서 계정/DB/세션은 변경하지 않는다.
- 제작실은 모의 단계 전진·오류·중단·재시도만 지원한다. 실제 AI·음성·코드 실행·승인·자동 공개 API가 없다. 유전 초안은 이미 공개 저장소 소스에 있으나 정식 사이트 배포에서는 계속 제외한다.

## 실제 구조에 맞춘 설정

루트 `package.json`은 npm workspaces `apps/*`, `packages/*`이고 **루트 `package-lock.json` 한 개(lockfileVersion=3)**를 사용한다. Node 범위는 `>=24 <25`다. `apps/studio/package.json`의 `build`는 `next build`다. Next16.3.5/React19.3.0 및 Supabase 의존성은 잠금 파일과 일치한다. TypeScript는 루트 devDependency, React/Node 타입은 제작실 devDependency다. 설치에서 devDependencies를 제외하면 안 된다.

`packages/contracts`는 자료실이 사용하는 공유 패키지이며 현재 제작실이 import하거나 dependency로 선언하지 않는다. 제작실의 상대 import는 `apps/studio` 안에서 끝난다. 설치·타입 도구에는 저장소 루트가 필요하므로 Vercel 빌드에 루트 바깥 파일 포함을 유지한다. 이를 사이트에서 저장소 전체를 정적으로 제공한다는 뜻으로 해석하지 않는다.

아래는 **나중에 승인 후** Vercel **Add New → Project → Import Git Repository → 해당 기존 저장소 Import** 화면 및 **Project → Settings → Build and Deployment**에서 확인할 값이다. Import 과정의 Deploy 버튼은 실제 배포를 시작하므로 이번에는 누르지 않는다.

| 항목 | 설정값 | 기본값/직접 입력 |
|---|---|---|
| Framework Preset | **Next.js** | 자동 감지값 확인. Other/정적 사이트로 바꾸지 않음 |
| Root Directory | **apps/studio** | Edit에서 직접 선택 |
| Node.js Version | **24.x** | 현재 기본값도24.x. 다르면24.x로 선택. Vercel은24.15.0 패치 고정이 아닌24계열 관리 업데이트 |
| Install Command | **`cd ../.. && npm ci --include=dev`** | Override ON. apps/studio에서 루트로 이동해 루트 잠금 파일로 설치 |
| Build Command | **`npm run build`** → `next build` | Next.js 기본값, Override OFF. apps/studio 기준; 루트의 build:catalog가 아님 |
| Output Directory | **Next.js 기본값** | Override OFF, 직접 경로 입력하지 않음. 로컬 산출물은 apps/studio/.next이며 Vercel이 정적 파일과 서버 함수를 구성 |
| Include source files outside of the Root Directory in the Build Step | **Enabled** | 신규 프로젝트 기본 ON을 확인. OFF이면 위 루트 설치를 진행하지 말고 ON으로 설정 |
| Production Branch | **main** | 기존 저장소 main 확인 |

Vercel Linux에서는 `npm`을 사용한다. Windows의 `npm.cmd` 또는 `C:\...` 경로를 Vercel 명령에 넣지 않는다. `dist/catalog`, `.`, `out`을 제작실 Output Directory로 설정하지 않는다. 현재 별도 `vercel.json`, 정적 export, standalone 전환은 필요하지 않아 추가하지 않았다.

근거: [Build 설정](https://vercel.com/docs/builds/configure-a-build), [모노레포 루트 외부 파일](https://vercel.com/docs/monorepos/monorepo-faq), [Node 버전](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). 실제 Linux 설치와 Vercel 어댑터 출력은 로컬 검사가 대신하지 않는다.

### 불필요한 배포와 보안 업데이트

Root Directory의 **Skip deployment / Skip unaffected projects**를 Enabled로 유지한다. npm workspace 및 잠금 파일의 영향 관계를 Vercel이 계산한다. 현재 루트 `content/`는 workspace가 아니므로 콘텐츠만 변경해도 global change로 판단되어 제작실 빌드가 발생할 수 있다. 초기에는 이 보수적인 동작을 허용한다. 의존성/루트 설정/보안 수정이 누락될 수 있는 임의 경로 필터는 추가하지 않았다. 콘텐츠 작업량이 늘면 공식 Ignored Build Step에 ‘알려진 콘텐츠 경로만 변경된 경우’의 검증된 생략 규칙을 별도로 준비한다. 알 수 없는 변경·비교 실패·잠금 파일·제작실·공유 패키지·검사·설정 변경은 항상 빌드하는 방향이어야 한다. [공식 모노레포 변경 감지](https://vercel.com/docs/monorepos)

## 환경변수: Production과 Preview 분리

현재 앱은 아래 **6개**만 읽는다. 기준은 `apps/studio/.env.example`, `lib/config.ts`, `lib/logout.mjs`, `lib/supabase.ts`다. Vercel **Project → Settings → Environment Variables → Add**에서 각 값을 직접 입력한다. 키를 채팅에 보내거나 `.env.local` 전체를 Vercel에 일괄 업로드하지 않는다.

| 변수 | Production에 입력할 내용 | Preview |
|---|---|---|
| SUPABASE_URL | 기존 science-studio Project URL | 등록하지 않음 |
| SUPABASE_PUBLISHABLE_KEY | 기존 프로젝트 publishable key | 운영 프로젝트 키 등록하지 않음 |
| SUPABASE_SECRET_KEY | 기존 프로젝트 서버 Secret key, **Secret 유형**으로 등록 | **등록하지 않음** |
| ALLOWED_USER_IDS | 운영 계정 **A의 UUID 한 개**만, 쉼표 목록 형식. 실제 값은 로컬 설정/Authentication → Users에서 직접 확인 | 등록하지 않음 |
| STUDIO_ORIGIN | 확정된 제작실 주소의 **`https://호스트`**, 경로/끝 슬래시 없음 | 등록하지 않음 |
| STUDIO_DB_READY | 최초 미연결 배포 false → 주소/환경 범위 점검 후 승인된 연결 배포에서 true | **false** |

Production 변수는 **Production만** 선택하고 Preview/Development/All Environments에 복제하지 않는다. 팀 Shared Environment Variables/연결된 Integration에도 Preview로 주입되는 운영값이 없는지 확인한다. Secret 유형은 코드의 접근을 막는 장치가 아니다. 해당 값을 받은 악성 빌드 코드는 읽을 수 있으므로 검토한 main에만 운영 Secret을 제공한다. 신뢰하지 않은 PR을 main으로 병합하거나 운영 환경으로 승격하지 않는다. **Settings → Security → Git Fork Protection**을 유지하고 미검토 fork 배포를 승인하지 않는다. Preview는 설정 누락503과 연결 설정 필요 화면만 검증한다. Preview에서 실제 로그인 검사가 필요해지면 별도 비운영 프로젝트/계정/Secret을 먼저 승인받는다. [환경 범위](https://vercel.com/docs/environment-variables), [Secret 유형](https://vercel.com/docs/environment-variables/sensitive-environment-variables), [Fork Protection](https://vercel.com/docs/git/vercel-for-github)

`NEXT_PUBLIC_*`, `DATABASE_URL`, OpenAI/GitHub 쓰기 키, VERCEL_TOKEN은 현재 Git Import 방식/앱에 필요하지 않다. 루트 `.env.example`은 후속 단계용 역사적 변수도 있는 템플릿이며 현재 제작실 입력 파일이 아니다. `AI_EXECUTION_ENABLED=false`, `AUTO_PUBLISH=false`는 유지해야 할 정책이나 **현재 제작실은 이 변수로 실제 실행을 전환하지 않는다**. 코드·DB의 mock 고정, 승인/공개 경로 부재로 차단되며 true를 입력해도 실제 기능을 제공하지 않는다. 사용하지 않는 변수를 실제 안전 스위치로 설명하지 않는다.

`NODE_USE_SYSTEM_CA=1`/`--use-system-ca`는 이 PC의 ePrism 인증서 환경에 대한 프로세스 한정 설정이다. Vercel 변수에 넣거나 인증서를 업로드하지 않는다. 현재 개발 서버는 그대로 유지한다. 로컬 재시작 시 필요하면 시작 PowerShell 프로세스에만 적용하고 종료 후 원래 값으로 복원한다. TLS 검증은 끄지 않는다.

### 주소가 아직 없을 때의 순서 — 모두 향후 별도 승인 후

1. 먼저 코드 선별 검토·커밋·기존 저장소 push를 완료한다. 현재는 미수행이다.
2. 위 Vercel 설정으로 **운영 키 없이**, STUDIO_DB_READY=false인 최초 미연결 배포를 승인받아 실행한다. 설정 미완료 상태이므로 보호 기능은503으로 닫혀 있어야 한다. 출처 검사를 해제하거나 임의의 주소를 정상값으로 넣지 않는다.
3. Vercel **Project → Settings → Domains**에서 실제 안정적인 Production HTTPS 주소를 확인한다. 이때 STUDIO_ORIGIN을 정확히 설정한다. 임시 커밋별 Preview URL을 운영 origin으로 쓰지 않는다.
4. 해당 Production에만 나머지5개 값을 등록하고 이미 적용된 DB 상태를 확인해 STUDIO_DB_READY=true로 바꾸는 연결 배포를 별도로 승인받는다. 환경값 변경은 새 배포에 반영되므로 명시적으로 Redeploy한다.
5. Supabase **Authentication → URL Configuration → Site URL**을 확정 주소와 대조한다. 변경은 별도 승인 후이며 기존 허용 주소는 임의 삭제하지 않는다. 현재 signInWithPassword에는 OAuth/메일 callback이 없어서 URL Configuration 변경이 로그인 자체를 대신하거나 자동으로 요구되지는 않는다. 향후 초대/비밀번호 재설정/OAuth 도입 때는 필요한 정확한 callback만 Redirect URLs에 추가한다. `*.vercel.app` 전체 허용은 하지 않는다. [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
6. 실제 HTTPS에서 미로그인 API 차단, A 수동 로그인·새로고침·기존 기록 복원·로그아웃, Origin 불일치 POST403, Secure/HttpOnly 쿠키, 로그 비밀값 비노출을 확인한다. 새 시험 기록이 필요하면 최소 범위로 별도 승인받는다. 그 전에는 Vercel 운영 검증 완료가 아니다.

## 인증 origin과 후보 코드 격리

제작실에는 후보 HTML/JS를 실행하는 iframe, eval, 임의 정적 파일 제공 경로가 없다. 공개 자료실 링크는 다른 origin인 GitHub Pages로 이동한다. Next.js 빌드의 경로는 `/`, `/_not-found`, `/api/studio/[...path]`뿐이다. 소스 포함 옵션은 빌드 접근을 위한 것이며 후보 코드를 `apps/studio/public`으로 복사하거나 rewrite/proxy로 같은 origin에서 제공하지 않는다. 향후 후보 미리보기는 인증 쿠키 없는 별도 origin에서 구현하고 별도 보안 검토한다.

## 남은 검사의 영향과 시점

| 미검증 항목 | 현재 A 전용 모의 제작실에 대한 판단 | 확인 방법/시점 |
|---|---|---|
| B 앱 버튼 로그아웃 | B inactive·허용 제외·세션0이고 A 앱 경로는 실제 통과했다. B SDK global 정리를 버튼 검사 통과로 대체하지 않는다. 현재 제한된 배포 준비의 차단 사유로 보지 않음 | 추후 권한 없는 사용자 UI 지원 검증 시, 명시적 승인된 비활성 검사 계정의 보이는 창에서 실제 앱 버튼→로그인 화면→새로고침 차단 및 원격 종료 결과 확인. 지금 B 재인증/재활성화 안 함 |
| 자연 만료 | 실제 refresh 성공·앱 반영과 모의 갱신 실패 차단은 확인했으나 정상 서명 토큰의 자연 만료 관찰은 미완료. A 모의 시범 운영은 가능하다고 판단하되 장시간 운영 안정성 확정은 보류 | 승인된 전용 세션을 실제 만료 시점까지 대기하고 다음 요청의 정상 갱신 또는 재로그인, 기존 기록 보존 확인. JWT 설정/시스템 시각 변경 없이 장기 운영 전 실시 |
| reviews/approvals/releases 실재 행의 실제 사용자 토큰 조회 | 세 테이블은0행, 현재 쓰기·승인·공개 기능이 없다. DB 역할 기반 격리·직접 쓰기 거부를 토큰 검사와 구분. 현재 모의 배포 준비의 차단 사유로 보지 않음 | 실제 검토/승인/배포 기능 또는 그 데이터를 다루는 다중 사용자 운영 전, 승인된 비운영 실재 행과 두 실제 사용자 토큰의 Data API 조회로 본인 성공/타인 차단. 미커밋 SQL fixture는 별도 HTTP에서 보이지 않으므로 단일 rollback 시험으로 대체 불가 |

현재 검토 범위에서 A 전용 모의 제작실의 배포 준비를 막는 새 보안 결함은 발견하지 않았다. **실제 배포 시작 전에는 코드 업로드 승인, Vercel 계정/프로젝트/운영 주소, Production Secret 범위 확인이 필요하다.** 비공개 수업 자료를 실제 운영 데이터로 넣기 전에는 보존·삭제·복구 정책도 확정한다. 비용 상한과 교육과정 등 미확인 사항을 이번에 정하지 않았다.

## 이번 로컬 검증과 한계

- `npm.cmd ci --dry-run --ignore-scripts --offline`: 루트 잠금 파일과 workspace 설치 계획 성공. 기존 설치와 A 서버 보호를 위해 실제 npm ci 재설치/의존성 업그레이드는 하지 않았다. Vercel Linux의 실제 설치는 미검증이다.
- `npm.cmd run test:studio`:22/22. `npm.cmd run build:studio`: Next 프로덕션 빌드 및 포함된 TypeScript 검사 성공. 실제 원격 Auth/DB 변경 요청을 위한 빌드가 아니다.
- `npm.cmd run test:studio:e2e`: 최초 실행은 항목7개 통과 후 검사 서버 teardown180초 시간 초과로 명령 전체 실패. 3001 검사 서버만 정리하고 허용된 실행 권한으로 동일 검사를 재실행하여 **7/7·exit0·10.2초**로 종료까지 통과했다. 별도3001 미연결 서버/모의 API 검사이며 실제 A/B 로그인 시험을 다시 수행한 것이 아니다.
- 자료실 validate/typecheck/test26개/build:catalog/check-pages 및 최종 결과물 브라우저 검사: 통과. dist/catalog는4파일·0카드이고 하위 경로·빈 목록·초안404를 확인했다. 일부 최초 호출은 샌드박스 realpath EPERM으로 중단됐으며 같은 검사에 허용된 실행 권한으로 재실행해 통과했다.
- 업로드 후보 감사와 실제 환경값의 비출력 대조에서 문제0. 제작실 브라우저 빌드11파일에서 키/교사 식별값 포함0, 서버 추적 manifest6개에서 환경파일/비공개 원문/후보 시뮬레이션 참조0. 패턴 검사는 알려지지 않은 모든 개인 메모·인코딩된 비밀값 부재를 수학적으로 보장하지 않으므로 최종 스테이징도 다시 검토한다.
- 실제 Vercel 배포·Linux·Production/Preview 분리·HTTPS 로그인/쿠키/갱신/로그는 미검증. 실제 배포 성공으로 기록하지 않는다.

파일 범위는 [업로드 후보 안내](STUDIO_UPLOAD_REVIEW.md), 실제 진행 기록은 [STATUS](STATUS.md)를 따른다. **다음 사용자 작업 한 가지:** 업로드 후보 범위를 읽고, 05·06 로컬 변경을 기존 저장소에 선별 커밋·push할지 결정한다. 지금 Vercel 프로젝트를 만들거나 Deploy를 누르지 않는다.
