# 05 제작실 구현과 외부 연결 준비

## 현재 상태 — 2026-09-15 최종

아래 날짜별 안내는 준비 당시 기록을 포함한다. 현재는 SQL 적용과 studio 노출이 완료됐고 STUDIO_DB_READY=true다. A만 활성·허용 상태이며 B는 비활성·허용 목록 제외·공식 global 종료 후 세션0개다. 실제 로그인/저장/주요 A/B 격리/세션 갱신/실패 화면/A 앱 로그아웃·재로그인은 확인했다. **B 앱 버튼 로그아웃, 자연 만료, reviews/approvals/releases 실재 행의 실제 사용자 토큰 조회는 미검증**이다. 아래 과거의 B 추가, 계정 생성, SQL 적용, 미연결 설명을 현재 다시 수행할 지시로 읽지 않는다.

06단계는 [배포 전 준비 안내](VERCEL_PREPARATION.md)까지만 진행했다. Vercel 생성·연결·환경값 등록·배포와 커밋·push는 아직 하지 않았다. 환경변수는 apps/studio/.env.example의6개를 기준으로 한다. 모의 제작 모드를 유지하며 실제 AI/승인/자동 배포는 없다.

현재 주소는 http://127.0.0.1:3000/ 이다. 이미 실행 중이면 재시작하지 않는다. 이 PC의 ePrism TLS 환경에서 직접 재시작해야 할 때는 VS Code **터미널 → 새 터미널 → PowerShell**에서 프로젝트 루트로 이동해 아래처럼 **현재 프로세스와 자식 서버에만** 시스템 CA를 적용한다. 기존 .env.local이나 영구 환경변수는 변경하지 않는다.

```powershell
Set-Location -LiteralPath 'C:\Users\user\Desktop\science-simulations'
$studioPreviousSystemCa = $env:NODE_USE_SYSTEM_CA
try {
  $env:NODE_USE_SYSTEM_CA = '1'
  npm.cmd run dev:studio
} finally {
  if ($null -eq $studioPreviousSystemCa) { Remove-Item Env:NODE_USE_SYSTEM_CA -ErrorAction SilentlyContinue }
  else { $env:NODE_USE_SYSTEM_CA = $studioPreviousSystemCa }
}
```

Ctrl+C로 해당 서버를 끝내면 셸 값도 복원된다. 이 설정은 Vercel에 복사하지 않는다. 이후 절은 최초 연결 준비와 진단의 이력이며 최신 증거는 STATUS 마지막 절을 따른다.

2026-09-13 최신 상태: 사용자가 SQL 적용·8테이블 RLS 활성화·교사 active 등록·studio Data API 노출을 완료했고 실제 로그인/새로고침/로그아웃/재로그인 후 기록 유지를 확인했다고 보고했다. 이후 독립 검사 창에서 사용자가 직접 로그인한 실제 세션으로 모의 진행·오류·재시도·중단·중복 방지와 authenticated 직접 DB 쓰기 거부를 확인했다. STUDIO_DB_READY=true와 모의 모드를 유지한다. 실제 두 계정 사이의 데이터 격리·세션 만료 등은 아직 미검증이다. 아래 SQL 사전 준비 절은 이전 과정의 안내이며 이미 적용한 SQL을 다시 실행하지 않는다. 최신 증거는 [STATUS](STATUS.md)의 마지막 절을 따른다. 06단계 또는 배포 지침이 아니다.

## 현재 열어 볼 화면

2026-09-15 두 계정 격리 검사 준비: 기존 A 계정을 유지하고 임시 검사용 B 계정만 ALLOWED_USER_IDS에 추가했다. 허용 목록은2개이며 STUDIO_DB_READY와 다른 환경값은 보존했다. B의 Authentication 생성·teachers.active=true는 사용자 확인 사항이다. 이번에는 A/B 로그인이나 데이터 격리 검사를 실행하지 않았다. 계정 ID/이메일/키는 이 문서에 기록하지 않는다.

주소: http://127.0.0.1:3000/

VS Code **터미널 → 새 터미널**에서 PowerShell을 열고 다음을 실행한다.

```powershell
Set-Location -LiteralPath 'C:\Users\user\Desktop\science-simulations'
npm.cmd run dev:studio
```

서버가 이미 실행 중이면 주소만 연다. 종료는 실행한 터미널에서 Ctrl+C. 환경값을 바꾼 뒤에는 서버를 재시작한다. 제작실은 Pages의 /science-simulations/와 분리된 서버 앱이다. 빌드된 제작실을 열려면 `npm.cmd run build:studio` 후 `npm.cmd run start --workspace @science/studio`를 쓴다.

2026-09-15 확인 시 3000 포트의 서버가 종료되어 있어 `npm.cmd run dev:studio`로 제작실만 다시 실행했다. 확인 당시 127.0.0.1:3000의 Next.js PID는24540, 실행 부모 PID는28612다. 재시작이 필요할 때는 현재 포트·프로세스가 이 제작실인지 확인한 뒤 중단한다. 컴퓨터를 재시작했거나 프로세스가 달라졌다면 이 PID를 재사용하지 않는다. 위 주소에서 사용자가 직접 로그인한다. 기존 A의 브라우저 로그인 정보는 변경하지 않았다.

## 제작실 배포 전 남은 확인과 임시 계정 정리

- **실패 문구의 실제 화면 표시: 미검증.** 사용자가 직접 확인하지 않았음을 명시한다. 실제 API 오류 코드/상태 확인 및 UI 코드의 문구 매핑 검토를 화면 표시 성공으로 대체하지 않는다. 제작실 배포 전에 실패 작업을 선택해 한국어 이유가 실제로 표시되는지 확인해야 한다.
- **A/B 실제 데이터 격리: 미검증.** 이번에는 로컬 허용 목록과 접속 준비까지만 완료했다. 로그인·새 작업 생성·교차 접근 검사는 별도 후속 작업이다.
- **B는 격리 검사용 임시 계정이다.** 검사 후 사용자 확인을 받고 B의 이용 권한을 회수해야 한다. 로컬 ALLOWED_USER_IDS에서 B 제거 및 서버 반영, studio.teachers의 active 비활성화와 필요한 세션 처리를 함께 확인한다. 로컬 목록에서만 제거하는 것으로 직접 Data API 접근까지 회수됐다고 판단하지 않는다. 이번에는 계정 삭제·허용 회수·원격 설정 변경을 하지 않았다.

미연결 상태에서는 **연결 설정 필요**가 보인다. 로그인·새 대화·작업 접수는 비활성화되고, 직접 API를 호출해도 503 SETUP_REQUIRED다. 가짜 로그인이나 실제 데이터로 보이는 기본 카드는 없다. 연결 이후 화면 흐름은 현재 검사용 브라우저 응답으로만 확인했으며, 그 응답은 tests/studio/browser에만 있다.

## 환경변수 — 실제 값은 공개 문서에 넣지 않기

정확한 입력 파일: `C:\Users\user\Desktop\science-simulations\apps\studio\.env.local`

VS Code 왼쪽 **탐색기 → apps → studio → .env.example**을 열어 복사하고 같은 폴더에 **새 파일 → .env.local**을 만든다. `.env.example`에 실제 값을 넣지 않는다. 기존 `.env.local`이 있으면 덮어쓰지 말고 필요한 항목만 편집한다. 실제 파일과 .next·.local 결과물은 기존 .gitignore에 의해 제외됨을 확인했다. 파일 내용이나 키를 채팅·터미널 출력·스크린샷으로 공유하지 않는다.

| 변수 | 값의 위치 / 입력 방법 | 전달 범위 |
|---|---|---|
| SUPABASE_URL | 선택한 프로젝트의 상단 **Connect**에서 Project URL | 서버 |
| SUPABASE_PUBLISHABLE_KEY | **Connect** 또는 **Project Settings → API Keys → Publishable key** | 인증 클라이언트. 이번 앱에서는 서버 Route Handler에서 사용 |
| SUPABASE_SECRET_KEY | **Project Settings → API Keys → Secret keys** | 서버 전용. NEXT_PUBLIC_ 접두사 금지 |
| ALLOWED_USER_IDS | **Authentication → Users → 허용할 교사 → User UID**. 여러 ID는 쉼표로 구분 | 서버 전용 허용 목록 |
| STUDIO_ORIGIN | 로컬에서는 `http://127.0.0.1:3000`을 직접 입력. 끝 슬래시 없음 | 서버의 POST Origin 검사 |
| STUDIO_DB_READY | 기본 false. 승인된 SQL·스키마 노출·교사 등록을 완료하고 권한 확인 후 true | 연결 활성화 스위치, 인증 대체가 아님 |

현재 구현은 새 `sb_publishable_` / `sb_secret_` 유형 키를 사용한다. legacy anon/service_role 키를 임의 대입하지 않는다. 비밀번호는 앱 로그인 화면에만 입력하고 환경파일에 저장하지 않는다. OpenAI·음성·GitHub 쓰기 키는 필요하지 않다. DB 접속 비밀번호나 DATABASE_URL도 이번 서버의 Data API 연결에는 필요하지 않다.

키 위치와 종류는 [공식 API keys 안내](https://supabase.com/docs/guides/getting-started/api-keys)를 확인했다.

## 외부 설정의 다음 순서 — 선택과 SQL 검토 후 진행

아래는 전체 준비 순서다. 사용자가 이미 완료한 1~3번을 다시 수행할 필요는 없다. 현재는 기존 스키마·정책 확인과 SQL 적용 여부 검토에서 멈춘 상태다. Codex는 외부 설정을 변경하지 않았다.

1. 사용자가 science-studio 프로젝트를 생성·선택했다. 요금·비용 상한은 별도 미확인으로 유지한다.
2. **Authentication → Sign In / Providers**에서 이메일·비밀번호 로그인을 사용하고 **Allow new users to sign up**, **Allow anonymous sign-ins**는 끈다. 앱에 가입 화면이 없다는 것만으로 Supabase 가입이 차단되는 것은 아니다. [공식 설정](https://supabase.com/docs/guides/auth/general-configuration)
3. 사용자가 **Authentication → Users**에서 교사 계정을 생성했다. 입력된 허용 목록의 첫 교사 한 명만 읽기 전용으로 조회해 존재와 비익명 계정임을 확인했다. 계정을 재생성하지 않는다. 앱에 자동 가입 API를 추가하지 않는다.
4. **Authentication → URL Configuration**의 Site URL을 로컬 검사 주소로 설정할 준비를 한다. 현재 이메일·비밀번호 흐름에는 OAuth callback이 없으며 소셜 로그인·비밀번호 재설정·초대메일 callback은 구현하지 않았다.
5. [SQL 변경안](../supabase/proposals/studio_v1.sql)을 검토한다. 전용 `studio` 스키마가 이미 있으면 **멈추고 기존 구조를 대조**한다. 덮어쓰기나 DROP은 하지 않는다. 적용을 승인한 뒤 **SQL Editor → New query**에서 검토본을 실행한다. CLI를 쓰는 경우 먼저 `supabase migration new studio_v1`로 이력 파일을 생성하고 검토한 내용을 넣는다. 이번에는 CLI 설치·migration 생성·SQL 적용 모두 하지 않았다.
6. SQL 적용 후 **Table Editor → schema: studio → teachers → Insert row**에서 교사 UID를 owner_id로, active를 true로 등록할 준비를 한다. 이 관리 작업도 승인 후 수행한다. 서버의 ALLOWED_USER_IDS와 이 DB 허용 목록 모두 일치해야 한다.
7. **Integrations → Data API → Settings → Exposed schemas**에서 `studio` 추가를 검토한다. 기존 목록은 유지한다. 스키마 노출과 테이블 GRANT, RLS는 별도 설정이다. 공식 예제의 `GRANT ALL ... TO anon`은 이 프로젝트에 적용하지 않는다. [공식 custom schema 안내](https://supabase.com/docs/guides/api/using-custom-schemas), [Data API 보안](https://supabase.com/docs/guides/api/securing-your-api)
8. 환경파일을 입력하고 권한 점검 준비가 완료되면 STUDIO_DB_READY=true로 바꿔 서버를 재시작한다. 아래 실제 연동 검증을 수행한다. 연결 오류를 false 성공으로 처리하지 않는다.

## 구현한 서버·DB 경계

- 로그아웃만 교사 허용 목록/active 검사에서 분리한다. POST /api/studio/logout은 정확한 STUDIO_ORIGIN, JSON, 빈 객체 본문을 요구하며 사용자 ID를 받지 않는다. 현재 요청의 프로젝트 인증 쿠키로 공식 scope=local 로그아웃을 시도한 후 해당 프로젝트 쿠키만 정리한다. 응답의 localSessionCleared와 remoteSignOut(confirmed / unconfirmed / not_required)을 구분한다. SDK 반환만으로 원격 종료를 추정하지 않고 실제 logout HTTP 성공을 확인한다. Auth 통신 실패/만료/잘못된 쿠키에는 로컬 정리 후 원격 종료 미확인 안내를 표시한다. 실제 세션 검사의 완료 여부는 STATUS의 최신 기록을 따른다.

- Next.js는 공개 화면 틀만 제공한다. 비공개 데이터는 `/api/studio/*` Route Handler마다 Supabase `auth.getUser()`로 실제 사용자 정보를 확인하고, 서버 ALLOWED_USER_IDS와 DB teachers.active를 검사한 후 읽고 쓴다. user_metadata와 getSession().user는 권한 근거로 쓰지 않는다.
- 쿠키 기반 `@supabase/ssr` Auth 클라이언트와 secret 기반 DB 클라이언트는 분리했다. 쿠키를 갱신하는 코드는 쿠키 쓰기가 가능한 Route Handler에만 있다. Server Component에서 인증 정보를 읽지 않으므로 현재 구조에는 Proxy 갱신 경로가 필요하지 않다. 쿠키는 HttpOnly, SameSite=Lax, HTTPS에서는 Secure다. 모든 API 응답은 private/no-store다. [공식 SSR 인증 방식](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- 서버 secret은 RLS를 우회하므로 **모든 조회에 owner_id 조건**, 단일 객체 소유권 재검사, RPC 안의 소유권·active 검사를 별도로 둔다. 서버 파일에 server-only를 선언하고 브라우저에는 Supabase 키를 전달하지 않는다.
- Data API: anon은 studio schema/테이블/함수 접근 불가. authenticated는 SELECT만 받고 RLS로 본인+활성 교사 행만 조회한다. INSERT/UPDATE/DELETE와 모든 RPC EXECUTE는 거부한다. 단순히 RLS만 켜 놓거나 버튼만 숨기는 방식이 아니다.
- 상태 쓰기 함수는 SECURITY INVOKER이며 서비스 역할에만 EXECUTE를 준다. jobs의 변경 가능한 컬럼을 제한하고 이벤트는 append-only INSERT만 허용한다. reviews/approvals/releases는 이번 단계에 데이터 쓰기 경로가 없다.
- 부모 FK와 owner_id의 복합 FK로 타인의 대화·작업·승인에 연결하지 못하게 한다. 상태 변경과 이벤트는 같은 트랜잭션이며 expectedStateVersion과 command UUID를 검사한다.
- POST는 설정된 Origin과 JSON 형식을 검사하고 요청 본문은 최대 16,000바이트로 제한한다. 입력은 최대 주제/단원120자·요청4,000자다. 교사별 대화100개, 대화별 작업100개, 교사별 활성 작업1개, 실행시도3회(최초+재시도2회), 이벤트20개 상한을 준비했다. 이는 **모의 검사용 상한**이며 유료 제작 한도나 사용자가 미확정한 비용을 대신하지 않는다.

## 데이터 계약과 모의 실행

기존 DATA_CONTRACTS의 schemaVersion=1 요청 봉투와 null 미확인 값을 유지했다. 05에서는 create_simulation 모의 접수·조회·중단·재시도만 지원하며 알 수 없는 권한/상태 필드를 거절한다. 실제 수정·승인·배포 API는 없다.

서버가 jobId/idempotencyKey를 생성한다. DB는 `(owner_id,conversation_id,client_request_id)` 유일성과 payload hash를 비교해 동일 요청을 재사용하고 다른 내용이면409를 반환한다. 임시 통신 실패 시 브라우저 sessionStorage에는 요청 UUID와 해시만 남겨 같은 전송을 재시도한다. 요청 본문·비밀번호·토큰은 브라우저 영속 저장소에 저장하지 않는다. 새로고침 후에는 마지막 대화 ID로 DB 기록을 다시 읽는다. 미전송 입력 자체는 새로고침하면 사라진다.

모의 작업의 execution_mode는 DB 제약으로 mock에 고정했다. 실제 제작에 필요한 자료가 미확인인 상태에서도 **작업 흐름만** 점검하도록 queued → running의 6개 모의 phase → needs_input으로 끝난다. 이 mock queued는 실제 제작 접수·출처 검토 완료를 뜻하지 않는다. run_id에는 mock: 접두사를 쓰고 최종 오류 코드는 MOCK_FINISHED_NO_EVIDENCE다. 학년도·교육과정·교과서·자료 이용 범위는 미확인으로 남는다.

“모의 한 단계 실행”은 인증된 서버의 순수 mock worker를 한 번 호출하고 SQL로 상태를 저장한다. 자동 백그라운드 실행기가 아니며 창을 닫으면 자동 전진하지 않는다. 재접속 후 저장된 단계에서 이어갈 수 있도록 준비했다. 중단은 cancel_requested 후 별도의 모의 중단 확인으로 cancelled가 된다. “모의 오류 확인”은 failed를 만들며 재시도는 원본 이력을 보존한 새 작업으로 연결한다. AI·코드 생성·검토·승인·실제 Pages 배포는 호출하지 않는다.

## 실제 연결 검증표 — 최신 실행 결과는 STATUS 참조

| 검사 | 실제 기대 결과 |
|---|---|
| 허용 교사 이메일·비밀번호 로그인 / 새로고침 / 세션 만료 | 정상 로그인과 기록 복원, 만료 후 차단 및 재로그인 |
| 미로그인·위조 쿠키·비허용 교사·익명 계정 | 서버401/403, 비공개 응답 없음 |
| 교사 A/B 각각 대화·작업 생성 후 서로의 UUID 조회·명령 | 서버404, 타인 데이터·변경 없음 |
| publishable key + anon, authenticated A/B로 Data API 직접 조회 | anon 차단, 각 교사 본인 행만 조회 |
| authenticated의 jobs state / job_events / approvals / releases 직접 쓰기 및 RPC | 권한 거부; 역할 위조 불가 |
| 동일 요청 동시 전송·응답 유실·동일 키 다른 내용 | 작업1개, 내용 충돌409, 상태+이벤트 원자성 |
| 중단·늦은 명령·재시도 한도·서버 재시작 | 과거 이력 보존, 상태 되돌림 없음, 실제 DB 복원 |
| teachers 비활성화·ALLOWED_USER_IDS 제거 | 서버 접근 차단. RLS 직접 조회 차단에는 teachers 비활성화도 필요 |
| SQL 문법·FK·GRANT·RLS·PostgREST schema 캐시·Supabase 보안 advisor | 대상 프로젝트에서 실제 점검, 실패 시 연결 보류 |

현재 단위/화면 모의 검사는 이 표의 실제 Supabase 검증을 대신하지 않는다. SQL 초안은 외부 DB에 적용하지 않았고 실제 PostgreSQL 구문·동시성 검사는 미검증이다. 기존 데이터 삭제·자동 이관·보존 기간 확정은 하지 않았다.

## 명령과 확인한 공식 자료

루트에서 `npm.cmd run typecheck:studio`, `npm.cmd run test:studio`, `npm.cmd run build:studio`, 빌드 후 `npm.cmd run test:studio:e2e`를 실행한다. 브라우저 검사는3001에서 별도 미연결 서버를 띄우고 종료한다. 검사용 데이터는 테스트 안에만 있으며 공개 콘텐츠에 넣지 않는다. `npm.cmd run test`, `npm.cmd run test:e2e`, `npm.cmd run test:genetics`, `npm.cmd run build:catalog` 등 기존 명령을 유지했다.

Supabase changelog.md를 실제 가져와 관련 breaking change를 확인했다. 해당 요약의 Management logs endpoint·extension pinning·self-hosted gateway 변경은 이번 사용 경로에 해당하지 않는다. Supabase MCP search_docs도 실제 응답했으며, 외부 프로젝트 목록·실제 키·데이터는 조회하지 않았다. 위 공식 링크와 [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation)를 확인하고 npm registry 버전으로 Next16.3.5, React19.3.0, SSR0.12.7, supabase-js2.116.0을 고정했다. 루트 잠금 파일을 갱신했으며 전역 설치·실행 정책 변경은 없다.

위 문단은 최초 구현 당시의 조사 범위다. 후속 연결 검사는 `node automation/studio/preflight.mjs`로 실행했다. 이 검사 프로그램만 환경파일을 내부에서 읽고 값 없이 존재·형식·검사 결과를 기록한다. 프로젝트 URL·UID·키·응답 원문은 출력하지 않는다. GET 3회(인증 설정, 지정 교사 1명, studio Data API 메타데이터)만 사용한다. 재실행하면 같은 읽기 요청을 다시 보내므로 단순 로컬 회귀 검사에는 `npm.cmd run test:studio`를 사용한다. 현재 Data API는 studio 미노출(PGRST106)이며 실제 테이블 존재 여부는 판단하지 못했다.

실환경파일이 입력된 이번 사전 검토에서는 Next.js 빌드·서버를 다시 실행하지 않았다. 환경파일을 읽지 않는 타입 검사는 `npm.cmd exec -- tsc --noEmit --project apps/studio/tsconfig.json`으로 수행했다. 이전 빌드·화면 검사는 이전 구현의 기록이며 이번 수정 이후 실제 연동 검사로 간주하지 않는다.
