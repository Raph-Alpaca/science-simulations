# 제작 작업자 인증·HTTP 연결

2026-10-04 로컬 구현·검사 결과다. 운영 API 활성화, 실제 GitHub 작업 실행, 유료 AI 호출과 게시를 아직 수행하지 않았다.

## 신뢰할 실행의 범위

`apps/studio/lib/worker-auth.mjs`는 `jose@6.2.12`의 RS256 서명 검증을 사용한다. 고정된 GitHub issuer/JWKS, 제작실 전용 audience, 저장소·소유자의 이름과 숫자 ID, main ref, caller/reusable workflow, 명시적으로 허용한 코드 SHA, 실행번호와 attempt 1을 모두 확인한다. PR·fork·self-hosted runner·환경 이름이 붙은 토큰은 허용하지 않는다. JWT 헤더가 지정하는 외부 키 서버는 사용하지 않는다.

저장소 읽기 API에서 repository_id=1368255570, owner_id=248908443과 Public 상태를 확인했다. 별도의 OIDC 설정 조회는 `use_default=true`, `use_immutable_subject=true`와 `repo:Raph-Alpaca@248908443/science-simulations@1368255570` 접두사를 반환했다. 따라서 이름만 있는 과거 subject 형식을 추측하지 않고 ID가 포함된 형식을 사용했다. 실제 discovery 문서의 issuer/JWKS/RS256과 필요한 claim 목록도 확인했다. 이는 **실제 Actions가 발급한 토큰을 검증한 결과가 아니다**.

정책이 기대하는 `studio-worker.yml`, `studio-generate.yml`, `studio-report.yml`을 이후 로컬에 작성하고 문법 검사를 통과했다. [워크플로 연결 범위](WORKER_WORKFLOWS.md)를 참고한다. 실제 발급 토큰의 claim과 재사용 워크플로 관계는 운영 연결 전에 검증해야 한다. 코드의 성공 검사만으로 GitHub 연결 완료로 처리하지 않는다.

환경 설정은 기본 `STUDIO_WORKER_API_ENABLED=false`, 허용 SHA 없음이다. true와 검토한 40자리 SHA 1~2개를 명시해야만 API를 사용할 수 있다. 오래된 코드와 새 코드의 제한된 전환을 위한 두 값이며 자동 main 추적은 없다. 토큰 발급 후 120초, 시계 오차 5초, 토큰 수명 최대 20분을 검사한다. JWKS는 고정 URL의 GET만 사용하며 5초·256KiB 제한, 10분 캐시와 30초 갱신 제한을 둔다. 토큰을 키 서버나 로그로 전달하지 않는다.

## 요청·저장 경계

`/api/worker/[action]`은 제작실의 정확한 origin에서 POST만 처리한다. 브라우저 cookie/Origin 요청, JSON 외 형식, 추가 권한 필드, 2.2MB 초과 본문을 거부하고 본문 읽기를 5초로 제한한다. 응답은 no-store이고 원문 DB 오류·입력·JWT를 오류 메시지로 반환하지 않는다.

`studio_worker_auth_v1.sql`은 **운영 미적용 검토안**이다. 서버가 서명을 확인한 뒤 작업/실행/SHA 결합과 토큰 ID 해시의 일회 사용을 DB 트랜잭션으로 확인한다. 같은 토큰은 다른 API 읽기에도 다시 사용할 수 없다. 검증 뒤 작업 실패나 응답 유실이 생겨도 자동 재전송하지 않는다. 작업당 512개 영수증, 정책→작업→실행 행 잠금, 첫 SHA 고정으로 재사용과 버전 혼합을 막는다. 토큰 원문과 요청 본문은 영수증에 저장하지 않는다. anon/authenticated는 해당 테이블과 RPC를 사용할 수 없다.

제작 역할은 검토된 입력 읽기, 점유, 상태 확인, 예산 예약/정산, 역할 출력·후보·검토 저장, 검사 결과 읽기와 종료만 할 수 있다. 별도 보고 역할만 후보를 가져오고 실행 검사 결과를 저장한다. 제작 역할이 `runtime_evidence`를 쓰거나 보고 역할이 비용을 예약하는 요청은 거부한다. 비용 정산과 종료 확인은 실행 중지/교사 비활성 이후에도 허용해 발생한 비용이 사라지지 않게 한다. 승인 대기 전이는 기존 DB의 현재 상태·검토 조건을 다시 확인한다.

`worker-gateway.mjs`는 승인된 입력 해시, 실제 호출 비용 영수증, 개발 출력에서 다시 계산한 후보/파일 목록, 최신 후보→실행 검사→검토 순서와 해시를 대조한다. 보고 검사 해시는 서버가 보고 본문·입력 해시·인증된 코드 SHA에서 계산한다. 생성된 JavaScript는 이 서버에서 실행하지 않는다. 역할 분리는 실제 브라우저 격리 검사기를 대신하지 않는다.

후속 [브라우저 검사 구현](WORKER_RUNTIME.md)에서 runtime-report 입력에 측정 details를 추가했다. 390/1440 viewport 변화·초기화, 3D/WebGL/카메라/대체 화면과 브라우저 종료 여부를 확인하고 입력/기준 SHA가 다른 보고는 거부한다. 해당 관찰을 포함한 전체 보고 해시와 details를 검토 evidence에 보존한다. 실제 원격 job·OIDC 토큰 연결은 여전히 미완료다.

그 뒤 [원격 제작 연결](REMOTE_WORKER.md)에 보고 역할의 verification 조회를 추가했다. 준비된 같은 시도의 후보만 반환하고 대기는 pending, 종료/이미 보고된 버전은 원문 없는 done이다. 이 조회에 한해 종료 상태의 인증된 보고자가 대기를 끝낼 수 있으며 실행 재개/쓰기 권한은 늘리지 않았다. 운영 SQL에는 아직 반영하지 않았다.

## 실제 검사와 실패 수정

| 검사 | 결과와 한계 |
|---|---|
| 제작실 전체 단위·SQL 검사 | 92/92, exit0. 새 인증 6개·DB 5개·HTTP 5개 포함 |
| 서명·HTTP 통합 | 테스트에서 만든 RSA 키로 실제 JOSE 서명 검증. PGlite SQL에 HTTP 예산/증거/별도 보고를 연결해 승인 대기까지 검사. 공급사·과학 검토·실행 검사 결과는 합성 데이터 |
| PostgreSQL17 독립 물리 연결 | 11/11, 각 후행 연결의 실제 Lock 및 차단 PID 관찰. 기존 9개에 같은 토큰 재사용 PT409, 다른 SHA 접근 PT403 추가 |
| 제작실 타입·production build | 성공. 새 동적 worker API 포함 |
| 빌드한 실제 로컬 서버 | 비활성 POST=503/WORKER_SETUP_REQUIRED, GET=405, no-store. 운영 DB 환경을 무효 값으로 덮어쓴 검사 서버를 정상 종료 |
| 기존 자료실 단위 검사 | 26/26, exit0 |

첫 production build는 로컬 파일 도구의 `import.meta.dirname` 의존성을 서버에 가져와 실패했다. 경로 검사·해시·상한만 파일 읽기가 없는 `packages/contracts/content-source.js`로 분리하고 기존 catalog export를 유지했다. 뒤이은 자료실 검사에서는 임시 저장소 fixture에 새 파일을 복사하지 않은 실패와 Windows sandbox의 상위 경로 realpath 접근 거절을 확인했다. fixture를 수정하고 일반 사용자 실행 문맥에서 같은 26개 검사를 통과했다. 경로/링크 검사나 실패 assertion은 제거하지 않았다. 수정 후 제작실 92개도 다시 통과했다.

최종 PostgreSQL 실행은 23:02:23~23:02:38 KST, 새 loopback DB였다. 비공개 결과 `.local/worker-pg17-e231d8812e5f4ccf91e7418b9f321525/result.json`의 5개 SQL 해시와 현재 파일 일치, stopped=true, postmaster.pid와 임시 평문 암호 없음, 현재 Windows 사용자/SYSTEM 전용 루트 ACL을 확인했다. 보호 결과의 sandbox 읽기 거절 후 원래 사용자 문맥으로 확인했으며 ACL을 완화하지 않았다. 이전 9개 결과는 그대로 보존했다. 서버 검사는 `.local/evidence/worker/route-smoke-4cbef07c-1776-4e60-8dd9-d07078947cd9.json`에 남겼다.

## 남은 실제 연결

후속 브라우저 검사/보고 연결 이후 전체97개와 실제 Chrome 합성8사례가 통과했다. 위92개는 앞선 실행 기록이며 자세한 구분은 [WORKER_RUNTIME](WORKER_RUNTIME.md)에 있다.

GitHub App dispatch와 서버의 실행번호 결합, reusable workflow와 실제 OIDC 토큰, 검토된 입력 발급 UI/API, 키·쓰기 토큰·OIDC 없는 생성 코드 검사 job, 승인·게시·게시 확인이 필요하다. API 키 준비 여부와 기존 공개 업로드 범위 승인은 답변 대기다. 예산/worker/auth SQL은 운영에 적용하지 않았고 기본 차단을 유지한다. 이번 구현을 기존 승인 요청 40개 파일의 스테이징에 추가하지 않았다.

근거: [GitHub OIDC claims와 immutable subject](https://docs.github.com/en/actions/reference/security/oidc), [재사용 워크플로 OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-with-reusable-workflows), [jose remote JWKS](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md). claim 정책은 실제 저장소 설정을 함께 확인해 정했다.
