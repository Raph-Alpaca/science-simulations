# 05 연결 확인과 SQL 적용 전 검토

2026-09-13. **검토안이며 실제 SQL을 적용하지 않았다.** STUDIO_DB_READY=false를 유지하며 계정·데이터·권한 변경, 테스트 데이터 삽입, 로그인 시도, 커밋·push·배포는 하지 않았다. 사용자가 기존에 만든 프로젝트·계정을 사용했고 추가 프로젝트나 계정을 만들지 않았다.

## 실제 연결 확인과 확인하지 못한 범위

`automation/studio/preflight.mjs` 내부에서만 `.env.local`을 읽었다. 필수 6개 변수의 존재·형식과 `apps/studio/lib/config.ts`의 이름 일치를 확인했다. HTTPS 프로젝트 주소, 새 publishable/secret 키 형식, 교사 UUID 목록, 로컬 Origin, DB_READY=false 검사를 통과했다. 환경값 파일은 수정하지 않았으며 Git 추적0개, `.gitignore`의 `**/.env.*` 규칙으로 제외됨을 확인했다.

실제 요청은 다음 GET 3회뿐이다. 요청마다 10초 제한·리디렉션 차단·응답 1MiB 제한을 적용했다. 새 API 키는 apikey 헤더로만 전달했다. 원문 응답·오류·이메일·프로젝트 URL·UID·키는 보고서에 저장하지 않았다.

| 실제 원격 요청 | 결과 | 판단 가능한 범위 |
|---|---|---|
| Auth 설정 조회 | HTTP200, disable_signup=true | 연결 및 신규 가입 차단 확인 |
| 입력된 첫 허용 교사 한 명 조회 | HTTP200, ID 일치, 비익명 계정 | 지정 계정 존재 확인. 로그인 성공·비밀번호 검사는 아님 |
| studio Data API OpenAPI 메타데이터 조회 | HTTP406, PGRST106 | 현재 studio 스키마가 Data API에 노출되지 않음 |

익명 로그인 전체 OFF는 사용자 보고다. 교사 한 명의 비익명 여부 확인만으로 전체 설정 검증을 대신하지 않는다. Data API 미노출은 DB가 비어 있다는 증거가 아니다. 실제 테이블·함수·기존 권한·RLS 정책·역할 상속·SQL 문법·세션·저장·원자성은 미검증이다. API 키만으로 임의 SQL을 실행할 수 있다고 가정하지 않았으며 Management/DB 접속 권한을 추가 요청하거나 사용하지 않았다.

값 없는 실제 결과는 Git 제외 경로 `.local/evidence/studio05/connection-preflight.json`에 있다. `present`와 `format`의 true는 검사 통과이며 STUDIO_DB_READY를 true로 바꿨다는 뜻이 아니다.

## 적용 대상과 순서 — 지금 실행하지 않음

검토 대상은 **`C:\Users\user\Desktop\science-simulations\supabase\proposals\studio_v1.sql` 한 파일**이다. 적용된 migration이 아니다.

1. 대시보드에서 대상 science-studio 프로젝트의 기존 studio 스키마·객체·권한을 먼저 확인한다. studio가 이미 존재하거나 기존 데이터가 있으면 적용을 멈추고 별도 비파괴 변경안을 만든다.
2. 사용자가 검토본 적용을 승인한 후 SQL Editor에서 파일 **전체를 한 번에** 실행한다. CLI 방식은 별도 승인 후 `supabase migration new studio_v1`로 migration 파일을 만들고 이 검토 내용을 옮긴다. 두 방식으로 중복 적용하지 않는다.
3. 트랜잭션 성공과 객체/GRANT/RLS를 확인한 뒤, 별도 승인한 교사 등록·Data API 스키마 노출을 수행한다. 이 SQL은 teachers 행을 추가하거나 Auth 계정을 바꾸지 않는다.
4. 실제 권한 검증을 준비하고 사용자가 활성화를 승인하기 전까지 DB_READY=false를 유지한다. 이후 로그인·두 사용자 격리·위조 쓰기 거부·동시 요청을 별도로 검증해야 한다.

`BEGIN`부터 `COMMIT`까지 하나의 트랜잭션이다. 설치 중 잠금 대기 5초, 문장 실행 30초를 초과하면 실패한다. 중간 오류 시 뒤 문장을 따로 실행해 보충하지 않는다. 열린 실패 트랜잭션은 ROLLBACK으로 정리하고 기존 상태를 확인한 후 원인을 고친다. 응답 유실로 성공 여부를 모르거나 재실행이 필요한 경우 먼저 스키마·객체를 조회한다. 성공 후 재실행은 `CREATE SCHEMA studio`에서 실패하며 기존 객체를 덮어쓰지 않는다. DROP·TRUNCATE·CREATE OR REPLACE·기존 데이터 이관·Supabase 전역 기본 권한 변경은 없다.

## 앱과 SQL 계약 대조

| 객체 | 앱이 쓰는 주요 열·관계 | 검토 결과 |
|---|---|---|
| teachers | owner_id, active | Auth users.id를 참조. 세션 검증 후 활성 교사 조회 |
| conversations | id, owner_id, title, created_at | 목록/상세와 new_conversation의 반환 형식 일치 |
| messages | conversation_id, owner_id, role, body, client_request_id, created_at | 작업 요청과 원자적으로 기록, 대화/사용자 복합 FK |
| jobs | id, owner_id, conversation_id, request_snapshot, state/state_version, phase/error_code, execution_mode, run_attempt, retry_of | 서버 조회·모의 전이·재시도와 일치. 요청 스냅샷에 미확인 학년도 null 유지 |
| job_events | job_id, owner_id, sequence, command_id, command_type, state_version, from/to_state, phase, error_code | 작업/사용자 복합 FK. 동일 명령의 영수증 및 상태 변경과 같은 트랜잭션 |
| reviews/approvals/releases | owner_id 및 job_id, 버전/증거 해시·승인/배포 참조 | 향후 기록용 빈 구조. 이번 앱에 생성/승인/배포 기능 없음 |

new_conversation(2개 인자), submit_job(9개), transition_mock_job(8개)의 서버 인자 이름과 SQL 정의, EXECUTE GRANT의 타입 시그니처를 정적 검사로 대조했다. 서버에서 조회하는 테이블은 모두 정의되어 있다. 정적 검사는 PostgreSQL 컴파일·실제 반환형·권한 검증을 대신하지 않는다.

## RLS와 객체 권한을 나누어 검토

| 역할/경로 | 객체 접근 권한 | 행·행동 제한 |
|---|---|---|
| PUBLIC / anon | studio USAGE·테이블 권한·RPC EXECUTE 회수 | 비로그인 직접 접근 차단 설계 |
| authenticated | schema USAGE 및 테이블 SELECT만 | 8개 테이블 RLS. 본인 owner_id와 활성 teachers 조건. 쓰기/RPC 권한 없음 |
| 서버 service_role | SELECT, 대화·메시지·작업·이벤트 INSERT, jobs 상태 관련 열만 UPDATE, RPC 3개 EXECUTE | RLS 우회 역할이므로 서버/함수에서 소유자·활성 교사 재검사 |
| reviews/approvals/releases | authenticated/service_role SELECT만 | 이번 단계에 INSERT/UPDATE/DELETE·승인/배포 RPC 없음 |

teachers의 UPDATE(active)는 함수의 SELECT FOR UPDATE 잠금에 필요한 권한이다. 앱이나 RPC는 active를 변경하지 않는다. 서비스 키 자체가 유출되면 RLS를 우회할 수 있으므로 일반 사용자 JWT와 같은 권한으로 설명하지 않는다. 미로그인/다른 사용자의 실제 거부 및 현재 원격 역할의 권한 상속은 아직 검증하지 않았다.

서버는 `getUser()`로 확인한 사용자 → 익명/ALLOWED_USER_IDS 검사 → secret DB 클라이언트 → teachers.active 확인 순서다. active 검사는 DB 접근이 필요하므로 secret 사용 이후지만, 그 전 이미 검증된 세션과 서버 허용 목록이 필요하다. 이후 조회에는 owner_id 필터와 단일 객체 소유권 검사를 둔다. 쓰기 owner_id는 브라우저 입력이 아닌 세션에서 정하며 RPC 안에서도 FK·소유자·active를 확인한다. secret 모듈에는 server-only를 유지한다.

8개 테이블 모두 RLS를 활성화하고 사용자 쓰기 정책을 만들지 않았다. RLS만 믿지 않고 별도의 객체 REVOKE/GRANT로 INSERT/UPDATE/DELETE/EXECUTE를 막는다. FK는 대화·작업·승인·배포의 owner_id를 함께 참조한다. 일반 사용자가 완료·승인·배포 상태를 정하는 요청은 서버에서 거절하고 mock 작업의 마지막 상태는 needs_input이다. future 승인/배포 내용의 의미 검증은 해당 기능 구현 단계의 별도 작업이다.

## 발견한 문제와 로컬 보완

- 동일 command UUID를 다른 명령·다른 예상 버전에 재사용해도 이전 성공으로 처리할 수 있었다. command_type을 이벤트에 저장하고 서버/SQL에서 명령 종류와 예상 버전을 비교해 충돌409로 처리했다. SQL에서는 결과 상태·phase·오류 코드도 결합한다.
- 재시도가 기대하는 state_version을 확인하지 않았다. 서버와 submit_job에 동일 검증을 추가하고 요청 해시에도 재시도 예상 버전을 포함했다. 기존 작업은 수정하지 않고 successor를 생성한다.
- 스키마별 ALTER DEFAULT PRIVILEGES REVOKE는 전역 기본 PUBLIC EXECUTE를 제거하지 못한다. 효과 없는 구문을 제거하고 같은 설치 트랜잭션의 실제 객체 REVOKE/명시 GRANT를 유지했다. 향후 새 객체도 커밋 전에 각각 제한해야 한다. [PostgreSQL 공식 설명](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html)
- 설치의 잠금 대기·문장 실행 상한을 추가했다. 모의 접수의 교사 잠금과 전이의 작업 잠금, 상태 버전, 명령 UUID를 통한 중복/동시성 설계는 유지했다. 실제 경합·부분 실패 롤백은 DB에서 미검증이다.
- SQL의 상태 버전 비교는 null도 거절하도록 보완했고 초기 접수 이벤트0을 포함해 저장 이벤트20개 상한이 되도록 전이 상한을 정정했다. 일반 모의 흐름의 단계 수는 바꾸지 않았다.

## 실제 로컬 검사

Windows에서 `npm.cmd run test:studio` 13/13, `npm.cmd exec -- tsc --noEmit --project apps/studio/tsconfig.json` 종료0. 교사/소유권·모의 상태 검사, 중복 명령·오래된 재시도 회귀 검사, 합성 환경값과 가짜 fetch로 읽기 전용/비출력 검사, RPC 정적 계약 검사다. 모의 요청을 실제 연결 성공으로 계산하지 않는다.

기존 `npm.cmd run test`는 첫 실행에서 샌드박스 realpath EPERM으로 16통과/10실패했고 코드·기준 변경 없이 접근 제한 밖에서 다시 실행해 26/26 통과했다. 이 검사에는 실제 공개 빌드의 결정성·초안 제외 검사도 포함된다. 이번에는 제작실 빌드·화면 검사나 Linux 검사, 실제 SQL·로그인·저장·권한 검사를 실행하지 않았다.

## 적용 전 사용자가 확인할 위치

- **Table Editor → schema 선택: studio** 또는 **Database → Schema Visualizer**에서 기존 studio 객체 존재 여부를 확인한다. 목록 미노출만으로 없다고 단정하지 않고, 관리자 **SQL Editor → New query**에서 필요할 때 pg_namespace/pg_class/pg_policies 및 테이블·열·함수 권한을 읽기 전용으로 확인한다. 이번에는 SQL 조회도 실행하지 않았다.
- **Integrations → Data API → Settings → Exposed schemas**에서 현재 목록을 확인만 한다. studio 추가는 별도 승인 후다. 기존 노출 스키마를 제거하지 않는다.
- **Authentication → Sign In / Providers**에서 익명 로그인 OFF를 확인한다. 가입 차단은 API로도 확인했으며 계정은 재생성할 필요 없다.
- 기존 studio 스키마가 없는지 확인한 뒤, 위 단일 SQL과 이후 교사 활성 등록·studio 스키마 노출의 적용 범위를 승인할지 결정한다. 실제 UID·키·비밀번호는 채팅으로 보낼 필요가 없다. 교과서·교육과정·비용 상한은 계속 미확인으로 유지한다.
