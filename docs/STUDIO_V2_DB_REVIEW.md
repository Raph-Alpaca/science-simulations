# 07 대화 관리·v2 DB 적용 전 검토 — 2026-09-16

**최신 2026-10-04:** 운영 studio 백업·격리 복원, 기준선 대조 후 v1 이력만 기록하고 v2를 적용했다. 운영 기존 데이터 보존·검증 DB와 구조/권한 일치, migration2개·Data API capabilities2·삭제 gate=false 확인. 앱 배포는 별도 진행 중이다. 아래 승인 대기와 장애 설명은 당시 이력이며 현재 상태는 [STATUS](STATUS.md) 맨 위를 따른다.

상태: **운영 미적용, 적용 승인 대기**. 사용자 확인: 격리 UI의 이름 생성·취소·수정·삭제, 학년도 제거, 작성 안내·접이식 예시 정상. 사용자 화면 검사이며 운영 DB 검사와 구분한다.

## 실제 원격 대조

승인된 Supabase 연결 도구로 science-studio의 PostgreSQL 17 메타데이터를 READ ONLY 트랜잭션으로 조회했다. 운영 사용자 데이터나 인증값은 출력하지 않았다.

- studio 8개 테이블 모두 RLS 활성, FORCE RLS 아님. service_role은 BYPASSRLS다.
- conversations에 deleted_at/creation_request_id 없음. jobs.request_version은 1만 허용. v2 RPC·dispatch_intents 없음.
- 기존 RPC 3개는 SECURITY INVOKER, 빈 search_path, service_role만 외부 EXECUTE 허용. authenticated는 8개 테이블 SELECT와 본인·활성 교사 정책만 보유한다. anon/public 테이블 권한 없음.
- service_role은 기존 명시 SELECT/INSERT와 jobs 상태 열·teachers.active UPDATE 권한을 가진다. 승인·배포 INSERT 권한 없음.
- 사용자 정의 트리거 없음. 대화→작업→검토·승인·배포 FK는 연쇄 삭제 설정이 아니다.
- migration 목록은 빈 배열이고 supabase_migrations.schema_migrations 자체가 없다. **기존 수동 v1 적용은 존재**하므로 빈 DB라고 해석하지 않는다.
- 원격 함수 3개 본문의 공백 제거 MD5가 로컬 v1과 모두 일치했다. 메타데이터 대조는 전체 DB dump의 동일성 보증이 아니다.

## 적용 대상과 분리

1. `supabase/proposals/studio_v2.sql`: v1 기반 증분안. 대화 열 2개와 중복 생성 인덱스, 요청 버전 1/2 허용, 새 생성·수정·삭제·v2 접수 RPC, 기존 접수 함수의 삭제 확인 및 잠금, 대화 RLS 보완. 기존 school_year/snapshot/hash 및 이력은 이 SQL 적용만으로 변경하지 않는다.
2. `supabase/proposals/studio_runner_v1.sql`: **보류**. dispatch_intents만 추가하는 선택안. v2 SQL은 이를 참조하지 않으므로 v2만 적용 가능하다. runner의 실제 FK 의존은 v1 jobs이며, 파일의 AFTER v2는 향후 적용 순서이지 v2의 필수 의존성이 아니다. 실제 실행 권한·claim RPC도 아직 없다.

v1을 재실행하거나 운영 DB를 초기화하지 않는다. 이번 작업에서 두 SQL 모두 원격에 실행하지 않았다.

## 구버전 호환성과 수정

배포 기준 4931c7e의 코드와 대조했다. 로그인·교사 검사·기존 생성 함수는 변경하지 않으며 v1 함수 서명과 재시도 해시 계약을 유지한다. 격리 SQL에서 이전 school_year/snapshot/hash, v1 재시도·중복 접수와 DB 변경 후 구버전 대화 생성을 확인했다. 실제 Production에 변경을 적용한 검사는 아니다.

**발견:** 구버전 서버의 service_role 조회에는 deleted_at 필터가 없다. RLS만 고쳐도 구버전 서버는 삭제 표식을 읽는다. 새 서버는 목록·상세·작업 조회에서 삭제 대화를 거부하고, 변경된 접수 함수도 삭제 대화를 거부한다.

**최소 보완:** v2에 `conversation_delete_enabled_v2()`를 추가해 기본 false로 고정했다. 삭제 RPC는 PT412로 종료하며 메시지·제목을 바꾸지 않는다. 앱은 별도 활성화 필요를 안내한다. 일반 사용자/서비스 역할은 이 함수 정의를 바꿀 수 없다. 이름 수정·v2 접수와 별개다. 격리 SQL 검사에서만 DB 소유자 역할로 true를 설정했다.

| 시점 | 허용 및 복구 조건 |
|---|---|
| DB 먼저 적용, 구버전 운영 | 삭제 잠금 유지. 기존 기능 유지; v2 신규 기능은 새 앱에만 존재 |
| 새 앱 배포 후 | 로그인·기록·v1 재시도·v2·삭제 필터를 확인. 삭제는 계속 잠금 |
| 삭제 활성화 전 | 다중 연결 경쟁 검사와 백업 복구, 삭제 필터를 유지한 복구용 앱 버전 확보 후 별도 활성화 마이그레이션 승인 |
| 실제 삭제 후 | 4931c7e로 앱을 되돌리면 안 됨. 삭제 잠금을 다시 닫아도 이미 생긴 표식의 구버전 노출을 해결하지 못함. 호환 앱으로 복구 |

삭제 활성화 SQL은 이번 적용 대상이 아니다. 삭제 자체는 제목을 [deleted]로 치환하고 messages 원문을 삭제한다. FK 유지용 대화 행과 독립 제작 명세인 jobs.request_snapshot(요구사항 포함), 해시·이벤트·검토·승인·배포 이력은 보존한다. 이 명세 보존을 대화 원문 완전 삭제로 설명하지 않는다. 웹앱·카드·파일·공개 주소를 변경하는 호출은 없다.

## 검사 방식과 한계

기존 설치된 PGlite의 격리 메모리 PostgreSQL에서 실제 SQL을 실행했다. 운영 데이터 복제 없이 가상 UUID/내용만 사용했다. v2 단독 적용, 소유자 확인, 이름 검증, 삭제 잠금·진행 중 거부, 삭제 후 접수 거부, 메시지 제거·이력 보존, v1/v2 및 재시도 호환, authenticated 직접 변경 거부, 실패 재실행 후 롤백을 확인했다.

이 엔진은 **단일 연결**이다. Promise 병렬 호출은 큐 처리이며 실제 두 연결의 잠금 경쟁 검사가 아니다. 설치된 psql/postgres/docker/supabase CLI를 찾지 못했으며 설치하거나 새 외부 프로젝트를 만들지 않았다. 별도 격리 PostgreSQL을 준비한 뒤 두 연결로 teacher→conversation 잠금 순서, 접수 우선/삭제 우선, lock timeout·교착 및 재전송을 확인해야 한다. 운영 DB로 대체하지 않는다. Supabase Auth/PostgREST의 실제 연동 회귀 역시 적용 후 확인 대상이다.

SQL 권한 검사는 DB 역할 검사이며 실제 사용자 토큰 검사가 아니다. 현재 RLS를 유지하고 새 RPC는 public/anon/authenticated EXECUTE를 철회한다. 서비스 역할에 추가되는 권한은 대화 title/deleted_at UPDATE, messages DELETE, 필요한 RPC EXECUTE뿐이다. 삭제 활성화 전이라도 서버 Secret은 이 권한을 가지므로 서버 전용 보관·인증 검사가 계속 필수다.

## 정식 적용·실패·복구 계획

Supabase 공식 [마이그레이션 안내](https://supabase.com/docs/guides/deployment/database-migrations)를 기준으로 수동 기준선과 향후 이력을 일치시킨다. 현재 CLI가 없으므로 이번에는 가짜 타임스탬프 migration 파일이나 원격 이력을 만들지 않았다.

1. 승인 후 CLI 사용 환경을 준비하고 원격 스키마를 재대조한다. 수동 적용된 v1 기준선을 `supabase migration new`로 생성하고 검토한 정의를 기록한다. 원격에는 v1을 실행하지 않고, 정확히 일치함을 확인한 기준선만 `migration repair --status applied`로 기록한다. 이 원격 이력 변경도 별도 승인 대상이다.
2. CLI로 v2 migration을 생성해 이번 검토 SQL을 넣는다. baseline→v2를 격리 DB에서 재현하고 두 연결 검사까지 완료한다. runner 파일은 넣지 않는다. migration list/dry-run으로 적용 예정 파일이 v2 하나인지 확인한다.
3. Dashboard의 Database → Backups에서 실제 백업·복원 가능 범위와 시점을 확인한다. 제공 여부/보존 기간/PITR은 현재 미확인이다. 필요한 별도 암호화 백업과 격리 복원 시험을 준비하고 인증값·운영 자료를 공개 Git에 넣지 않는다. 임의 유료 기능 활성화 금지.
4. 사용이 적은 시간에 적용한다. ALTER TABLE과 제약 검사·인덱스 생성은 읽기/쓰기 대기와 테이블 스캔을 일으킬 수 있다. lock_timeout 5초, statement_timeout 30초이며 같은 트랜잭션 안에서 DDL·권한·RLS를 완료한다. 큰 테이블에서는 제한 시간 초과 가능성이 있어 실제 크기·트래픽을 적용 직전에 확인한다.
5. 실패하면 트랜잭션을 ROLLBACK하고 원인을 수정한다. 연결 중단으로 COMMIT 여부가 불명확하면 열·함수·제약과 migration 이력을 조회한 뒤 판단한다. 재실행은 중복 열 오류로 실패하도록 되어 있으므로 무조건 재실행하지 않는다.
6. 적용 후 열·인덱스·제약, RPC ACL, RLS, 삭제 gate=false, baseline/v2 이력을 확인한다. 기존 건수/해시 등 승인된 비민감 비교로 데이터 보존을 검증하고 운영 사용자 로그인/읽기를 확인한다. 새 요청 검사는 별도 승인된 검사 기록만 사용한다.
7. 적용 후 문제는 호환 앱 또는 검토된 전진 수정으로 복구한다. DROP 열/스키마나 v1 덮어쓰기를 안전한 역마이그레이션으로 취급하지 않는다. 이미 삭제된 메시지는 단순 SQL 역변경으로 복구되지 않는다. 전체 백업 복원은 이후 정상 변경도 잃을 수 있으므로 범위와 중단 영향을 별도 승인한다.

2026-09-16 후속 승인으로 격리 PostgreSQL 17.11을 준비하여 독립 두 연결 경쟁 8/8, 빈 DB v1→v2, pg_dump/pg_restore 복원을 실제 통과했다. SQL은 이 문서 검토 버전과 동일하다. [실행 명령·PID·해시·정상 종료 증거](POSTGRES17_REHEARSAL.md)를 확인한다. 위 단일 연결 환경 부족 설명은 당시 상태이며, 해당 로컬 검사 세 항목은 후속 시험으로 해소되었다.

운영 적용 전 남은 준비: 기준선 관리 승인, **운영 Supabase** 백업·복구 확인, 적용 시간 승인. 로컬 복원을 운영 복구 근거 전체로 대체하지 않는다. 삭제 활성화는 추가로 호환 복구 앱 확보가 필요하다. 운영 적용은 아직 승인받거나 실행하지 않았다.

후속 운영 studio v1 범위 한정 백업·로컬 복원은 사용자 승인되었다. 현재 pg_dump용 DB 접속 정보/CA/암호가 없어 **입력 대기, 백업·복원 미실행**이다. [안전한 직접 입력 및 범위](STUDIO_V1_BACKUP.md)를 따른다. 이 백업은 auth/Storage 등 전체 프로젝트를 복구하지 않으며, 백업 후 데이터가 추가되면 실제 v2 적용 직전에 갱신한다. 운영에 복원하거나 v2를 적용하는 승인은 포함하지 않는다.

2026-09-16 후속: 입력 파일 준비 후 검증했으나 Direct 호스트 DNS 단계에서 실패했다(OS lookup ENOTFOUND, 별도 A/AAAA 조회 ECONNREFUSED). CA 파일 형식은 유효하지만 실제 TLS·호스트·DB 인증은 미검증이다. 현재는 입력 미완료가 아니라 **DNS 연결 장애로 백업/복원 미실행** 상태다. 연결 오류를 해결하기 위해 보안 검증이나 운영 설정을 바꾸지 않았다. 원본 운영 백업이 없으므로 v2 적용으로 진행하지 않는다.

최신 후속: 사용자 확인된 Session pooler로 바꾼 입력을 검사했다. Windows/Node lookup 성공, psql verify-full + 현재 CA로 서버 DB 비밀번호 인증 거절에 도달했다. 현재 차단 지점은 **DB 인증 실패**이며 이전 Direct DNS 실패와 구분한다. 백업·복원 미실행, 운영 변경 없음. 인증 문제 확인 전 운영 v2 적용을 진행하지 않는다.
