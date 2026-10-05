# 확인된 과제의 제작 접수

2026-10-05 로컬 구현·검사. 운영 SQL·환경 변수·GitHub App·워크플로를 변경하거나 실제 실행하지 않았다. 유료 AI 호출0회. 기존 공개 업로드 승인 질문은 계속 대기 중이다.

## 사용자 흐름과 실행 경계

입력 확인을 저장한 버전에서 **제작 시작 · 최대1,000원**을 누르면 서버가 같은 입력 해시로 작업과 예산을 접수한다. 중복 클릭·새로고침·응답 유실 뒤의 같은 요청은 같은 작업을 반환한다. 수정한 입력은 새 확인을 받아야 한다. 확인 기록의 사용은 제작 결과의 검토나 게시 승인이 아니다.

화면은 실행번호 확인/접수 불확실/실행 전 실패를 구분한다. 실제 작업에는 모의 진행·모의 오류·무조건 재시도 버튼을 표시하지 않고 서버에서도 거부한다. 중단은 실제 worker 취소 RPC를 호출한다. 상태는 새로고침 또는 접수한 작업 보기에서 읽는다. 실행 접수는 제작 또는 게시 완료가 아니다.

기본 설정은 닫혀 있다. `STUDIO_DISPATCH_ENABLED`, 입력 준비 설정, worker API 설정, 검토된 SHA와 유효한 GitHub App 설정, DB `dispatch_execution_enabled()` 및 worker 설정이 갖춰져야 제작 버튼이 열린다. DB 예산 정책은 별도로 접수 때 검사한다. 실제 환경 변수는 변경하지 않았다.

## 서버 GitHub 연결

`github-dispatch.mjs`는 서버에만 있는 RSA 키로 RS256 App JWT를 만들고 설치 토큰을 요청한다. 토큰 범위는 고정 저장소 ID1368255570 하나, Actions write/Contents read/Metadata read다. 응답이 더 넓은 권한·다른 저장소를 주면 요청을 멈춘다. 키·JWT·설치 토큰은 브라우저·DB·로그·생성 코드에 전달하지 않는다. 토큰은 호출 후 폐기를 시도하며, 폐기 실패 시에도 유효기간은 남는다.

고정 `api.github.com`에만 요청하고 리다이렉트·자동 재시도를 하지 않는다. 저장소와 소유자 ID, 기본 main 브랜치, 활성 `studio-worker.yml`, 검토된 main SHA를 먼저 확인한다. dispatch 본문은 `ref=main`, `mode=generate`, 작업 UUID뿐이다. 과제·요약·대화는 포함하지 않는다. API가 반환한 실행번호를 GET으로 다시 읽어 저장소·워크플로 ID/경로·workflow_dispatch·main·정확한 SHA·attempt1을 확인한 뒤에만 DB와 연결한다. main이 요청 사이에 바뀌면 안전하게 보류한다.

요청별5초·응답128KiB, GitHub 단계30초·토큰 폐기 별도2초, 최대7요청이다. 서버 접수는45초 신호를 공유하고 마지막 DB 기록은 별도5초를 둔다. 운영 경로의 GitHub App 자격증명과 실제 반환 형식은 아직 검증하지 않았다.

## 영구 접수와 취소

새 `studio_dispatch_v1.sql`은 제안일 뿐 운영에 적용하지 않았다. 기존 runner 저장소와 worker_auth/input_review 뒤에 적용하는 전제이며 신규 worker 행에만 접수 기록을 만들고 이전 작업을 덮어쓰지 않는다. RLS와 anon/authenticated 테이블·함수 실행 거부를 유지한다.

- 입력 승인 사용·작업·접수 기록·예산 예약은 같은 트랜잭션으로 커밋한다.
- budget → teacher → conversation → job → worker → intent 순서로 잠근다. 접수 claim은 한 번뿐이다. 시간 만료가 재전송 권한이 되지 않는다.
- POST 전 실패는 worker를 실패로 끝내고 미사용 금액을 닫는다. 월 제작 시도 횟수는 보존한다.
- POST 후 응답 유실·오류·실행 검증 실패는 uncertain으로 남겨 예약과 동시 작업 슬롯을 보존한다. 확인되지 않은 실행번호는 관찰값으로만 기록하고 worker에 연결하지 않는다.
- 취소와 응답이 겹치면 취소가 우선한다. 늦게 도착한 실행번호를 기록할 수 있지만 취소된 미연결 worker에 입력/AI 권한을 주지 않는다.
- DB 최종 기록의 응답을 잃어도 이미 저장된 claim/결과를 읽는다. 같은 요청으로 GitHub를 다시 호출하지 않는다.

불확실 실행의 자동 복구·자동 재전송은 구현하지 않았다. 미연결 queued 작업은 명시적으로 중단할 수 있다. 실제 AI 호출의 미확정 비용을 지우는 기능은 없다.

## 검증과 한계

전체 제작실 단위·SQL 통합136/136 통과, production build/TypeScript 통과. GitHub 응답은 로컬 합성 서버 함수로 제공하고 실제 RS256 서명·범위 제한·검증·실패를 검사했다. 기존 SQL 정적 계약 검사가 새 취소 RPC를 포함하지 않아 한 번 실패했으며, 검사 범위에 해당 worker SQL/다섯 번째 호출을 추가한 뒤 전체 재통과했다. 실패 검사를 없애지 않았다.

실제 PostgreSQL17 물리 연결 경쟁18개 PASS/exit0, 00:33:09~00:33:46 KST. `.local/worker-pg17-input-e885c87fc32842219aa2099c7673d942/result.json`: 8개 SQL 해시, 모든 Lock/차단 PID 관찰, stopped=true, PID·임시 평문 암호 없음, 현재 사용자/SYSTEM만 접근하는 보호 ACL 확인. 새4개는 접수 경쟁, 취소→실행 결합, 실행 결합→취소, 같은 결과 중복 저장이다. 별도 검사 DB를 사용해 앞선 불확실 비용과 월10건 한도를 보존했다.

브라우저의 최초5개 동작 검사는 통과했지만 검사 서버 teardown이180초에 실패했다. 실패를 유지하고 남은 해당 PID를 검증해 종료했다. 이후 실제 Chrome 전체14개 PASS/exit0(45.3초)로 검사 서버의 정상 종료까지 확인했다. 새3개는390/1440px·불확실 응답·중복 클릭1회·새로고침 복원·중단·axe 위반0·가로 넘침 없음을 검사했다. 화면 검사는 실제 Chrome/Next 빌드와 로컬 PGlite 서비스에 연결하며 Auth와 GitHub는 합성 응답이다. 운영 연결 성공으로 해석하지 않는다.

실제 GitHub App/Actions OIDC/컨테이너 rehearsal, OpenAI 키 연결, 과학·교육과정 원문 검토, 결과물 검토·게시·게시 확인은 남아 있다. 최신 구현은 미스테이징이며 기존40개 승인 검토용 스테이징은 보존했다.

## 확인한 공식 문서

- [GitHub workflow dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event): 2026-03-10 API의 실행번호 포함200 응답과 Actions write 권한.
- [설치 토큰 인증과 범위 제한](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation): repository_ids/permissions, 응답 범위와 만료.
- [GitHub App JWT](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app): RS256, client ID issuer, 시간 여유.
- [실행 조회](https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10#get-a-workflow-run): 실행 식별자·SHA·attempt·저장소 정보.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): 브라우저 역할과 서버 권한 분리.
