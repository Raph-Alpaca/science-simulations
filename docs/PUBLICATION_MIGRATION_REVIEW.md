# 승인·게시 DB 증분 적용 검토

**2026-10-14 12:18 KST 완료:** 사용자 명시 승인 후 PR #18을 병합했고12:15:58 운영 적용/검증을 마쳤다. 기존 데이터 보존·복원본과 스키마 일치·이력4개·새 행0·모든 gate false PASS. `publication-production-apply.json` applied/verified/PASS와 write.claim이 있으므로 재적용하지 않는다. 아래는 적용 전 검토 이력이다. 적용 후 advisor는 의도된 RLS INFO18·기존 Auth WARN1이며 설정은 바꾸지 않았다.

2026-10-14 12:08 KST. **운영 미적용**이며 검증된 적용 후보1개다. 실제 적용·활성화·유료 제작·학생용 게시는 서로 다른 단계다.

대상은 기존 science-studio의 `studio` 스키마다. Supabase CLI2.119.0의 `migration new`로 만든 `20261014025610_studio_publication_foundation.sql`의 LF SHA256은 `38665dc7590464e199a6864468b033bb86e9e35c568b8def2524a38aaa24af27`이다. 기존 v1/v2/worker migration을 다시 적용하지 않는다.

## 변경 범위

검토·검사한 approval/preparation/dispatch/artifact/report/authority/completion proposal7개를 단일 트랜잭션으로 결합했다. 각 원본의 경로·LF 해시를 SQL에 남겼다. 테이블은18→26개, 함수는45→79개다. 기존 함수는 게시 뒤 후속 수정을 허용하는 `record_result_feedback`, `assert_revision_ready` 2개만 변경한다. 기존8개 데이터 영역에 승인 연결/게시 결과 연결용 nullable 컬럼을 추가하고 모든 기존 값은 보존한다.

새 테이블8개는 release_baseline/release_reviews/source_reviews/publication_dispatches/publication_oidc_receipts/publication_checks/publication_authorizations/publication_outcomes다. 모두 RLS, anon/authenticated 권한 없음, 필요한 서버 권한만 부여한다. 모든 함수는 security invoker와 빈 search_path를 사용한다. 새 자료실 기준·원문 검토·승인·작업·게시 행은 만들지 않는다.

worker/dispatch/budget/delete/publication dispatch/artifact/deploy gate는 모두 false를 유지한다. 환경값·키·계정·Auth 설정·Vault·seed·roles 변경을 포함하지 않는다. 기본 비활성 스키마 설치이며 실제 실행 권한 활성화가 아니다. lock_timeout5초·statement_timeout30초, 실패 시 전체 SQL을 취소한다. 중복·다른 기준 DB·이미 활성인 기준은 거부한다. DDL 동안 짧은 잠금이 발생할 수 있다.

## 실제 증거

- 새 증분·백업 범위 검사4개와 기존 접속 검사7개, 합계11개 PASS. 기존 데이터 보존, 뒤쪽 오류 주입 시 전체 롤백, 중복 거부, 권한/기능 비활성, worker 테이블만 바뀌었을 때 해시 변화 감지를 검사했다.
- 현재 운영18개 테이블을 공식 Session pooler에서 TLS verify-full·읽기 전용 snapshot으로 백업했다. 원격 연결2회(검사/snapshot와 동일 snapshot dump), 전체5분 상한. 새 로컬 PG17 복원 후 데이터/스키마 해시, 기존 사용자 격리, worker 테이블의 브라우저 권한 차단, RPC와 직접 쓰기 거부 PASS. 서버 종료 확인.
- 해당 복원본에 해시 고정된 증분을 적용해13개 검사 PASS. 모든 기존 행 보존, 허용된 기존 함수2개 외 변경 없음, 새8개 테이블 모두 빈 상태, 함수/권한/비활성 상태, 기존 대화 RPC, 유료 작업 거부, 중복 적용 거부·이후 데이터/스키마 보존을 확인했다. 운영 연결0회, 서버 종료 확인.
- 12:07:38 KST 운영 읽기 전용 preflight PASS. 백업 이후 데이터/스키마 일치, migration 이력3개, CLI `--dry-run --skip-vault` 적용 계획이 이 증분1개이고 seed/roles0개임을 확인했다. 실제 적용0회.

보호 증거는 `.local/studio-v1-backup-20260916/publication-preflight-20261014-4d422ff8d2ab4850ae82b617f6ba6875/`의 backup-result.json, publication-migration-result.json, publication-production-preflight-2.json이다. `.local/studio-publication-migration-20261014/`에는 해시 목록·진단·실행 도구가 있다. 백업·원문·비밀번호·개인 식별자는 공개 Git에 포함하지 않는다.

초기 CLI의 telemetry 파일 권한 오류와 합성 검사에서 존재하지 않는 컬럼을 사용한 실패42703을 보존했다. 첫 운영 preflight는 첫 SELECT에서 읽기 전용 상태가 off여서 쓰기 없이 중단했다. 연결 옵션에 의존하지 않고 각 조회를 명시적인 읽기 전용 트랜잭션으로 감싼 뒤1회 재검증했다. 첫 실패 파일은 삭제하지 않았다.

## 보안 점검과 남은 작업

운영 Supabase advisors를 읽기 전용으로 확인했다. 서버 전용 테이블의 [RLS 정책 없음 INFO10개](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)는 브라우저 권한을 주지 않는 의도된 구성이다. 기존 [유출 비밀번호 보호 비활성 WARN1개](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)는 남아 있으며 Auth 설정은 변경하지 않았다. 성능 INFO는 외래키 인덱스22개·미사용 인덱스8개다. 현재 소량 데이터와 비활성 실행의 증분 적용을 막는 오류는 아니며, 이 작업에서 인덱스를 삭제하거나 관계없는 튜닝을 섞지 않는다. 새 스키마는 로컬 SQL 권한 검사로 확인했으며 운영 advisor 결과로 새 증분을 통과했다고 주장하지 않는다.

[Supabase 변경 이력](https://supabase.com/changelog)과 [PostgreSQL17.11 호환성 변경](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)을 확인했다. 이 증분은 ltree/GiST/PGP/사용자 정의 연산자를 추가하지 않는다. 기존 studio의 실제 복원 성공을 검증했으며 프로젝트 전체 확장 상태를 모두 검토했다고 주장하지 않는다.

다음은 이 코드의 공개 검토/병합 뒤 **해당 증분1개의 운영 적용 범위**를 확인하는 것이다. 실행 도구는 최신 백업1시간 이내·동일 데이터/이력·정확한 main SQL 해시를 재확인하고 쓰기 표식을 먼저 남겨 적용을1회만 시도한다. 응답이 불확실하면 재실행하지 않고 상태를 읽어 판정한다. 적용 후 데이터·스키마·이력·새 행0·모든 gate false를 확인한다. 이후에도 App/전달 키, 실제 제작 연결, 불확실 게시의 후속 조정, 원문 검토와 교사 최종 버전 승인이 남는다.
