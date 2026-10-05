# 07-1 로컬 구현과 적용 경계

2026-09-16. UI·요청 규격과 실행기 연결 준비를 분리한다. 운영 DB/환경값, GitHub, Vercel, Pages는 변경하지 않았다. 06 완료 기록은 STATUS에 유지한다.

## UI와 데이터 계약

- 새 대화는 이름 입력 후 생성하며 취소는 요청을 보내지 않는다. JS·화면은 원래의 최대120 UTF-16 길이 제한과 trim 후 빈 이름 거부를 사용한다. 서버도 검증한다. SQL은 추가로 공백/120자 제한을 검사한다.
- 즉시 ref 잠금과 버튼 비활성화로 중복 클릭을 차단한다. 생성 UUID와 `(owner_id,creation_request_id)` 고유 제약으로 동일 전송을 재사용한다. 이름이 다른 동일 UUID는 충돌이다.
- 대화별 메뉴에서 이름 수정·삭제를 제공한다. POST JSON 및 기존 동일 Origin 검사·실제 Auth·로컬 허용 목록·active 교사 검사 이후 소유자 ID를 서버에서 결정한다. 브라우저의 owner_id는 받지 않는다. 로그아웃 예외를 다른 API로 확대하지 않는다.
- 제목 수정은 conversations.title만 변경한다. 콘텐츠 ID·사이트 제목·카드·GitHub·공개 주소를 수정하는 연결은 없다.
- SQL capability 함수가 없는 현재 운영 DB에서는 `DB 변경 적용 필요`로 새 생성/이름 수정/삭제/v2 접수를 차단한다. 기존 조회와 v1 작업의 모의 진행·재시도는 유지한다. 함수 누락을 모의 성공으로 덮지 않는다.

## 삭제와 보존

메시지 행은 실제 DELETE한다. 대화 제목은 `[deleted]`로 지우고 deleted_at을 기록한다. FK 연결용 대화 ID·owner·생성 시각·생성 요청 UUID·콘텐츠 연결 필드만 남는 tombstone이며, 단순 숨김으로 원문 삭제를 주장하지 않는다. 선택된 대화의 브라우저 선택/작업 ID, 입력·pending 요청을 정리한다. 새로고침 때 이미 삭제된 저장 ID는 제거한다.

jobs의 원래 request_snapshot에는 주제·학년·단원·requirements 등 제작 명세가 남는다. requirements는 메시지 내용과 중복되지만 작업 재현·기존 해시·재시도·증거 연결에 필요한 불변 명세로 보존한다. 이 사실을 삭제 확인창에 표시한다. 추가 원문 백업을 만들지 않는다. 과거 스냅샷을 재작성하거나 해시를 재계산하지 않는다. 향후 별도 보존기간 정책이 필요하며 본 기능은 모든 작업 명세의 완전 삭제 기능이 아니다.

jobs/job_events/reviews/approvals/releases 및 웹앱·카드·콘텐츠 ID·주소·GitHub 파일은 삭제하지 않는다. FK에 CASCADE를 추가하지 않는다. 삭제된 대화 및 그 대화 UI의 작업 직접 API는404이며 새 접수/재시도도 거부한다. 향후 실행기는 대화 UI와 분리된 jobs 명세를 job_id로 읽어야 한다. 승인된 콘텐츠는 독립 content_id로 식별한다.

삭제·접수 RPC 모두 teacher → conversation 순으로 같은 행 잠금을 잡는다. queued/running/cancel_requested가 있으면 PT423으로 거부한다. 접수가 먼저면 삭제가 거부되고 삭제가 먼저면 접수가 PT404로 거부된다. 단일 트랜잭션 실패는 메시지 삭제도 롤백한다. 다중 연결의 실제 경쟁 타이밍 검사는 후속이다.

## v1/v2 호환

새 입력은 topic/grade/unit/requirements/targetContentId/expectedVersion만 가진 schemaVersion=2이다. schoolYear 필드를 보내면 거부한다. UI 입력·상태·안내·작업 표시에서 학년도를 제거했다. SQL v2는 request_version=2, school_year=null을 저장한다. 기존 열은 DROP하지 않는다.

requestEnvelope는 과거 v1의 schoolYear와 필드 순서를 유지하여 읽을 수 있다. 기존 작업 재시도는 원래 snapshot을 사용하고 기존 해시 계산 규칙을 바꾸지 않는다. 새 일반 접수에는 v1을 허용하지 않는다. 삭제된 대화의 재시도는 불허한다. 실행기용 독립 명세 추출은 학년도/대화 제목/메시지 목록을 보내지 않는다.

새 v2 명세의 교육과정 기본은 내부 `CURRICULUM.revision='2022'`, `verification='unverified'`이다. 사용자 결정에 따른 기본값이며 실제 원문·성취기준 대조 완료가 아니다. 기존 v1 콘텐츠는 소급 변경하지 않고 revision=null을 유지한다. 출처 묶음을 실제 확인하기 전 외부 실행에 넘기지 않는다.

## SQL 적용안과 검사

기존 적용 파일 studio_v1.sql은 수정하지 않았다. 별도 `supabase/proposals/studio_v2.sql`이 UI 변경안이다. 이후 별도 선택안 `studio_runner_v1.sql`은 실행 의도 저장소만 준비하며 쓰기/claim API를 부여하지 않는다. 둘 모두 원격 미적용이다. 최초 적용은 트랜잭션이며 재실행은 기존 객체 충돌로 실패하여 ROLLBACK한다. `IF NOT EXISTS`로 부분 적용을 숨기지 않는다. 실제 migration 파일을 만들 때 Supabase CLI migration new를 사용한다.

로컬 @electric-sql/pglite 0.5.8 메모리 PostgreSQL에 원본 v1과 v2를 적용하여 SQL·역할 권한·삭제 보존을 검사한다. auth.users/역할은 가짜 로컬 fixture다. Supabase Auth/Data API 검사가 아니다. 단일 연결 엔진의 동시 Promise 요청은 직렬화되므로 실제 다중 연결 경쟁 검증을 대신하지 않는다.

브라우저 검사에서 실제 Next UI를 열되 API 응답만 테스트 안에서 가로챈다. 이는 실제 로그인/운영 DB 검사와 구분한다. `tests/fixtures/studio07/serve.mjs`는 별도 loopback 전용 UI 연습 서버이며 운영 경로에 포함되지 않는다. 실제 UI에 격리 검사 배너를 표시하고 기록은 메모리에만 둔다. 이 서버의 API는 UI 연습용 모형이며 보안/SQL 성공 증거가 아니다.

로컬 화면: `http://127.0.0.1:3002/`. 프로젝트 루트에서 `npm.cmd run build:studio` 후 `node tests/fixtures/studio07/serve.mjs`로 시작한다(내부3003도 사용). 실제 계정으로 로그인하지 않는다. 기존3000 서버와 Production은 건드리지 않는다. 테스트 데이터는 종료 시 사라진다.

## 실제 실행기 준비

`apps/studio/lib/dispatcher.mjs`는 저장된 job과 주입된 Store/Adapter를 받는다. MockAdapter와 GitHubActionsAdapter는 execution_mode를 강제하며 기존 mock을 real로 승격하지 않는다. 실제 어댑터는 고정 저장소 Raph-Alpaca/science-simulations, main, studio-worker.yml에 job_id만 구성한다. 임의 저장소/워크플로, 미설정, 모드 불일치를 거부하고 인증/권한/호출 제한/통신 불확실 오류를 구분한다. 기본 네트워크 transport가 없어서 원격 호출하지 않는다. 제품 API에도 real dispatch를 연결하지 않았다.

공식 [GitHub dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)를 확인하여 API 버전2026-03-10, ref/inputs, 응답200의 workflow_run_id를 사용한다. 수신을 제작 성공으로 기록하지 않는다. Store.claim은 원자성을 요구하며 메모리 테스트에서 중복 전송을 막고 불확실 응답은 자동 재전송하지 않는다. **운영 DB Store·설치 토큰 발급·실제 HTTP transport·run 조회·OIDC·한도 RPC는 아직 미연결**이다. AbortSignal 10초는 transport가 준수해야 하는 요청 제한이며 외부 실행 timeout/비용 상한이 아니다.

### 다음 연결의 실행 단위와 권한

1. 인증 서버: 허용 교사 검사 후 작업 저장 + 같은 트랜잭션 outbox. claim에서 동시 실행1·일일 예산/호출량을 원자적으로 예약한다. 응답 유실은 run 대조 후 결정한다.
2. 신뢰된 시작 제어: 고정 main/workflow의 OIDC 서명·issuer·audience·exp·repository_id·workflow_ref/SHA·ref·run_id/run_attempt 검증. 재사용 workflow는 job_workflow_ref도 검증한다. job_id는 기본 claim으로 간주하지 않고 등록된 실행과 결합한다. nonce/eventId 재사용 차단 후 하나의 실행만 claim한다.
3. 역할별 별도 실행: 교육과정 검토 → 교과 검토 → 학습 설계 → 개발 → 독립 검토. 단계별 입력·근거·산출물·버전 기록. 이번에 이 역할들의 실제 제작을 실행한 것은 아니다.
4. 제작 방식 계획: 공식 [Codex 비대화형 exec](https://developers.openai.com/codex/noninteractive/)를 Linux 격리 환경에서 사용한다. workspace-write 및 명시적 허용 경로, 네트워크 제한, 명령/시간/호출 상한을 적용할 후속 구현이 필요하다. unsafe나 sandbox 우회는 사용하지 않는다. 제작 AI에는 GitHub App 키·DB secret·쓰기 토큰·보고 OIDC를 전달하지 않는다.
5. 생성 코드 검사: 별도 깨끗한 실행 환경, 네트워크/키 없음, 기준 main의 검사·허용 경로·용량·심볼릭 링크 검사. 공통 코드/검사/AGENTS/워크플로 변경 금지.
6. 신뢰된 결과 기록: OIDC와 등록 run을 검증한 서버만 상태 갱신. 취소·timeout·늦은 결과와 버전 충돌을 원자적으로 거부한다. 첫 실제 산출물은 검토 가능한 PR까지. 자동 병합·공개·Pages/Vercel 배포는 비활성 유지.

GitHub App은 지정 저장소만 설치하고 서버에 GH_APP_CLIENT_ID/GH_APP_PRIVATE_KEY/GH_APP_INSTALLATION_ID/GH_REPOSITORY_ID를 보관할 계획이다. 이번에는 환경값/키 생성·입력을 요구하지 않는다. dispatch용 짧은 설치 토큰은 Actions:write만, PR 작성 단계에서 필요한 Contents/Pull requests:write만 부여한다. Administration/Workflows 쓰기는 부여하지 않는다. 설정 메뉴는 GitHub Settings → Developer settings → GitHub Apps이며 생성·설치는 후속 승인 대상이다. GITHUB_TOKEN 이벤트/bot 실행 조건은 아직 실제 미검증이다.

비공개 대화·원문은 공개 Actions 입력/로그/PR/아티팩트로 옮기지 않는다. 독립 명세의 requirements도 여전히 비공개다. 서버의 명시적 공개 가능 근거 묶음과 출처 이용 범위 검토가 통과한 버전만 worker에 제공해야 한다. 현재 안전한 공개 묶음 발급기는 없으므로 실제 실행은 차단 상태다.

### 실제 실행 전 확정·구현할 조건

예산·모델·월/일 비용·일일 작업 수·호출 수·단계별 timeout·토큰 한도는 미확인이다. 동시1, 수정 최대2는 목표 정책이다. 현재 모의 worker 한도와 실제 제작 한도를 혼동하지 않는다. durable claim/lease·취소 요청·일일 카운터·비용 예약/정산·알림·토큰 발급·OIDC 검증·공개 입력 발급·격리 worker가 구현되고 검사된 후에만 실제 연결 승인과 첫 유료 PR 시험을 요청한다. 변수 이름이나 outbox 테이블만으로 이 안전장치를 구현했다고 주장하지 않는다.

다음 사용자 작업은 로컬 격리 화면에서 이름 입력/예시/삭제 설명을 검토하는 것이다. SQL 적용·GitHub App 생성·실제 실행은 아직 하지 않는다.
# 2026-09-16 적용 전 검토 보완

사용자가 격리 UI의 대화 생성·취소·수정·삭제, 학년도 제거와 작성 예시를 직접 확인했다. UI 재설계는 하지 않았다. [DB 적용 전 검토](STUDIO_V2_DB_REVIEW.md)가 기존 적용 순서 안내를 보완한다. v2는 runner 없이 먼저 적용할 수 있지만, 삭제는 DB gate=false로 잠긴다. 구버전 서버의 삭제 표식 노출 때문에 호환 앱과 복구 버전 확보 후 별도 활성화가 필요하다. 운영 SQL은 아직 적용하지 않았다.
