# 자동 제작 DB 증분 적용 검토

2026-10-07. **로컬 복원본 검증 완료, 운영 미적용.** 이 문서의 DB 변경은 앞서 승인한 PR #8 보안 필터 변경과 별도 범위다. 실제 적용 전후 증거는 STATUS에 기록한다.

## 적용 파일과 영향

CLI 2.119.0의 `migration new studio_worker_foundation`으로 생성한 [단일 migration](../supabase/migrations/20261007123947_studio_worker_foundation.sql)을 사용한다. 기존 v1/v2 이력은 재실행하지 않는다. LF 정규화 SHA-256은 `d683387b09003dbe56a63e839d5991cfd3feffe50cc454730021bfa1c6a79a24`다.

이미 공개·검사된8개 제안의 순서와 본문을 보존해 하나의 트랜잭션으로 묶었다: runner → budget → worker → worker_auth → input_review → dispatch → result_review → revision. 각 원본 경로와 LF 해시는 SQL 내부에 있다. 시작 시 기존 capability2와 삭제 비활성을 확인한다. 잠금 대기5초·문장30초 제한, 오류 시 전체 롤백이며 부분 성공을 이어 붙이지 않는다.

| 추가 대상 | 내용 |
|---|---|
| 10개 테이블 | 접수, 월/건 예산·호출 비용, 실행·검토 증거, OIDC 재사용 차단, 입력 동의, 결과 의견, 콘텐츠 수정 계보 |
| 37개 함수 | 승인 입력·예약·실행번호 결합·보고·취소·결과 조회·후속 수정. 모두 SECURITY INVOKER와 빈 search_path |
| 기존 jobs/job_events 제약 | 향후 real 작업 상태와 실행 이벤트를 허용하도록 확장. 기존 행은 갱신하지 않음 |
| 권한 | 새 테이블 RLS 활성화, anon/authenticated 접근 거부. 필요한 서버 service_role 권한만 부여 |
| 기본 상태 | worker=false, dispatch=false, budget=false, 대화 삭제=false. 비용 정책 행1개 외 기존/신규 작업·콘텐츠 생성 없음 |

이 적용은 DB 구조와 서버 역할 권한을 변경한다. 기능 플래그·키·GitHub App·유료 제작·학생용 게시 활성화는 포함하지 않는다. 월 정책은 최대10건/US$5, 건당US$0.50의 보수적 상한으로 저장되며, 실제 활성화 시 기존 원화10,000원 예산 정책의 환율/비용 유효성을 별도로 다시 확인한다.

## 실제 검증

- 선행 Linux 격리 검증: [run37621641105](https://github.com/Raph-Alpaca/science-simulations/actions/runs/37621641105), main17c7447. isolation·2D·3D 통과, 고장 초기화 실패 감지, 모든 종료/삭제 확인.
- 운영 DB는 읽기 전용으로 확인했다. 기존 이력2개·테이블8개 모두 RLS이며 기존 자료가 실제 존재한다. 메타데이터 목록의 추정 rows=0을 빈 DB로 해석하지 않았다.
- 최신 studio 백업은 읽기 전용 snapshot과 pg_dump 총2연결. 인증서/호스트 검증 유지. 새 로컬 PostgreSQL17 복원 후 데이터·메타데이터 일치, RLS/기존 RPC/직접 쓰기 거부를 확인했다. Auth 원문은 복사하지 않았다.
- 보호된 복원본에만 위 해시의 증분을 적용해13개 조건을 통과했다(2026-10-07 21:43:39~21:43:41 KST). 기존8개 테이블의 전체 행 지문과 기존 함수 정의·소유자·ACL 보존, 신규10개 RLS/공개 역할 차단, 함수 권한과 SECURITY INVOKER, 비활성 gate4개, 기존 대화 RPC, 유료 예약 PT412 거부, 중복 적용42P07 거부와 무변경을 확인했다. 서버 종료도 확인했다.
- 검사 도구는 [worker-migration-rehearsal.mjs](../automation/studio/worker-migration-rehearsal.mjs)다. 운영 설정을 읽지 않고127.0.0.1의 확인된 복원 DB/클러스터만 허용한다. 전체180초·별도 종료30초 상한이다. 이전29개 물리 경쟁 검사와 합성 모델 검증은 별도 증거다.

백업/복원/적용 시험 원본은 Git 제외 보호 경로 `.local/studio-v1-backup-20260916/worker-preflight-20261007-d893b4507d214aba935495dbf711032f/`의 backup-result.json, worker-migration-result.json, 백업 archive 및 지문에 있다. 비밀번호는 DPAPI이며 값과 실제 사용자 기록을 공개하지 않는다.

CLI 실제 dry-run도 읽기 전용/verify-full/skip-vault로 완료했다. 대기 migration은 위 파일1개, seed/role 적용은0개다. 검사 원본은 `.local/studio-worker-review-20261005/migration-dry-run.txt`에 있다.

## 적용 전후 확인과 복구 범위

1. 승인된 파일 해시, 현재 migration 이력2개와 기존 스키마 상태를 다시 확인한다. 응답 유실 시 이력/객체를 읽어 성공 여부부터 확인하고 같은 SQL을 무조건 다시 실행하지 않는다.
2. 해당 단일 migration만 적용한다. 기존 자료 일치·총18개 테이블 RLS·함수/역할 권한·비활성 gate·이력 추가를 읽기 전용으로 재확인한다. 실제 유료 제작을 시험 데이터로 실행하지 않는다.
3. 성공 후에도 예산/worker/dispatch는 닫힌 상태다. 앱의 기존 기능과 준비 응답을 확인한 뒤 키 연결/입력 기능의 별도 준비 단계로 이동한다.
4. 적용 중 오류는 트랜잭션 롤백으로 처리한다. 적용 완료 후에는 새 구조를 무조건 DROP하지 않는다. 비활성 상태를 유지하며 원인을 고친다. 운영 복원은 최신 기록 손실 범위를 별도로 검토해야 하며 이 검토의 자동 복구 범위가 아니다.

## 미검증과 기존 주의 항목

실제 OpenAI/GitHub App/OIDC 전체 왕복, 로그인한 운영 UI, 유료 제작·원문 근거·버전 결합 게시 승인은 아직 미검증이다. Supabase 보안 점검에는 기존 Auth 유출 비밀번호 보호 비활성 경고1개가 있었다([설명](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). 이번 DB 증분으로 Auth 설정을 변경하지 않는다. [최신 변경 이력](https://supabase.com/changelog.md)과 PostgreSQL17.11 관련 변경을 검토했으며 제안 SQL은 ltree/btree_gist/pgcrypto의 해당 기능을 사용하지 않는다. 실제 백업 복원으로 현재 studio 호환성도 확인했다.
