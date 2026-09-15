# 파일·데이터 계약 — 01단계 설계

2026-09-13. 아래는 구현 예정 규격이며 JSON Schema, API, SQL은 아직 작성하지 않았다. 기존 `templates/*.example.json`과 `references/source_index.json`을 입력 예시로 보존한다. 예시 파일은 실행·승인·공개 결과가 아니다.

## 공통 규칙

- JSON은 UTF-8, `schemaVersion: 1`로 시작한다. 구현 시 알 수 없는 버전과 금지 필드를 거절한다. API는 camelCase, DB는 snake_case로 명시적으로 변환한다.
- 미확인 값은 `null` 또는 규정된 미확인 상태로 둔다. 빈 값을 현재 연도·임의 성취기준·기본 비용으로 채우지 않는다. 초안 허용과 공개 적격 검사는 별도다.
- 콘텐츠 ID는 소문자 영문·숫자·하이픈, 1~64자, 양 끝 하이픈 금지다. 대소문자 차이로 중복을 허용하지 않는다. 경로·제목·자연어를 ID로 임의 해석하지 않는다.
- 내부 작업/대화/승인 ID는 서버 생성 UUID, GitHub 실행 번호는 문자열, 시간은 UTC ISO 8601로 저장하고 화면은 Asia/Seoul로 표시한다. 일일 한도도 Asia/Seoul 기준임을 설정에 기록한다.
- 텍스트를 HTML로 실행하지 않는다. 상대 경로는 콘텐츠 루트 내부만 허용하며 외부 자산은 기본 금지다. 입력 길이·파일 수·용량 제한은 구현 전 유한값으로 결정하고 미설정이면 작업을 거절한다.
- 객체 소유자는 요청 본문이 아닌 검증된 로그인에서 정한다. 비밀 값과 원문 요청은 공개 JSON이나 오류 메시지에 넣지 않는다.

## 콘텐츠 패키지

`content/simulations/<id>/meta.json`의 `id`는 폴더명과 같아야 한다.

| 필드 | 형식·의미 |
|---|---|
| schemaVersion, id, title | 버전 1, 영구 ID, 비어 있지 않은 표시 제목 |
| grade, unit | 학년 1/2/3, 공통 단원 목록과 일치하는 문자열. 실제 교육과정 대응은 별도 검토 |
| summary, concepts | 짧은 설명, 중복 없는 개념 문자열 목록 |
| schoolYear, curriculumRevision | 연도 정수 또는 null, 실제 확인한 교육과정 명칭 또는 null |
| entry | 기본 `index.html`, 내부 파일 존재·경로 이탈 검사 |
| sourceIds | 참고 자료 목록의 기존 ID를 참조, 존재와 실제 검토 여부를 별도로 검사 |
| stage | `draft`, `in_review`, `ready`, `withdrawn` 중 편집 상태. 어떤 값도 공개 권한이 아님 |
| assumptions | 모형 가정·한계. 실제 과학 검토에서 충분성을 판단 |
| approvalIsExternal | 반드시 true. 외부 승인 기록을 요구한다는 선언일 뿐 승인 증거 아님 |
| note | 선택적 공개 설명. 개인 메모·키 금지 |

`index.html`은 진입점이며 계산과 화면 코드는 분리한다. 로컬 JS/CSS/SVG 등 자산은 패키지 안에 둔다. 실행 가능한 파일과 자산의 허용 종류를 신뢰된 검사에서 고정한다. iframe 미리보기 또는 standalone 페이지가 학생 데이터를 외부로 전송하지 않는지 검사한다. 기본 글꼴·자산도 로컬 제공을 우선한다.

초안 스키마 통과는 공개 가능을 뜻하지 않는다. 공개 적격 검사에는 학년도·교육과정 확인, 교과서 대조 상태와 선택한 수준, 출처/이용 범위, 과학·학습·실동작 검사, 사용자 승인과 동일 버전이 필요하다. 미확정 필수 근거는 보류하며 사람의 승인만으로 실패 검사를 덮지 않는다.

## 참고 자료와 학년별 대조

`references/source_index.json`의 기존 `id/title/url/publisher/edition/pages/scope/status/visibility/redistribution/aiUsePermission/localPath`를 유지한다. `localPath`는 공개 가능한 논리 경로만 쓰고 실제 원문 내용은 읽어 공개하지 않는다. 자료의 존재, 접근, 내용 검토, 외부 AI 제공, 재배포 허용을 서로 다른 판단으로 기록한다.

| 현재 source ID | 현재 상태 | 이번 단계 판단 |
|---|---|---|
| curriculum-required | missing | 적용 학년도·교육과정 원문 미확인 |
| openstax-inheritance | candidate_not_project_reviewed | 공개 링크 후보. 이번 단계에서 교과 내용·AI 이용 권한 검토 안 함 |
| textbook-selected | missing | 출판사·저자·판본·쪽수·이용 권한 미확인 |

학년별 대조 표는 [OWNER_INPUT](OWNER_INPUT.md)에 둔다. 향후 검토 기록은 `sourceId`, `schoolYear`, `grade`, `curriculumRevision`, `achievementCode`, `locator`(원문 쪽/절), `checkedAt`, `reviewerRole`, `result`, `limitations`를 갖는다. 성취기준 코드와 독립의 법칙의 필수/보충/심화 구분은 원문 확인 전 null이다. source ID가 존재하는 것만으로 확인됨을 표시하지 않는다.

## 요청과 중복 방지

문자·받아쓰기·실시간 음성 모두 같은 서버 계약을 사용한다. 모델은 다음 인자만 제안하며 임의 셸·URL·repository·workflow를 실행하지 않는다.

| operation | 필수 인자 | 처리 |
|---|---|---|
| create_simulation | topic, grade, unit, requirements, 설정 참조 | 서버가 중복 여부를 확인하고 콘텐츠 ID 예약 |
| revise_simulation | targetContentId, expectedVersion, requirements | 현재 버전과 다르면 충돌. 제목만으로 대상 확정 금지 |
| get_job_status | jobId | 로그인·소유권 확인 후 DB 상태 조회 |
| cancel_job | jobId, expectedStateVersion | 취소 요청 저장, 실제 실행 중단 여부를 구분 |
| approve_release | jobId, candidateHash, artifactHash, policyVersion | 해당 버전의 검토 화면에서 교사가 확인한 경우만 승인 |
| withdraw_simulation | targetContentId, expectedVersion, reason | 대상·영향 확인 후 게시 중단 작업 등록 |

초기 추가 운영 동작 `retry_job`, `republish_simulation`, `restore_release`는 관리 UI의 서버 명령으로 설계한다. 08단계 모델 도구에 넣으려면 별도 제한 스키마와 검사를 추가한다. 승인·중단·복구는 모델의 발화만으로 확정하지 않는다.

요청 봉투에는 `schemaVersion`, `conversationId`, `clientRequestId`, `operation`, `payload`가 들어간다. `clientRequestId`는 교사 입력 1건에 붙는 재전송 식별자로, 같은 전송의 네트워크 재시도·새로고침에서는 보존한다. 서버는 `(ownerId, conversationId, clientRequestId)`의 유일성을 보장하고 정규화한 payload 해시를 비교한다. 동일 키·동일 내용이면 기존 작업을 반환하고, 내용이 다르면 409 충돌이다.

기존 request 예시의 `idempotencyKey: SERVER_MUST_GENERATE`는 서버 발급값이 필요하다는 표시다. API에서 그 문자열을 실제 키로 수락하지 않는다. 서버는 위 clientRequestId 매핑에 대해 idempotencyKey와 jobId를 한 번만 생성하여 DB 트랜잭션으로 저장한다. 새로고침마다 서버 키를 다시 만들어 중복 실행하는 구현을 금지한다. 권한 확인 후에만 기존 작업을 반환한다.

서버 저장 내용에는 `ownerId`, `requestVersion`, 정규화한 요청 snapshot, `targetContentId`, `expectedVersion`, `sourceSnapshotHash`, `policyVersion`, 상한 snapshot, `createdAt`을 포함한다. 학년도 등 누락은 `needs_input`으로 돌리고 관련 작업을 시작하지 않는다. 근거를 보완하면 기존 snapshot을 덮지 않고 후속 작업을 만들며 `supersedesJobId`로 연결한다. 통신 재전송과 사용자가 요청한 재시도는 구분한다.

## 상태와 이벤트

| job.state | 의미·전이 조건 |
|---|---|
| needs_input | 필수 근거/설정 부족. 질문·부족 항목 기록. 보완 시 연결된 후속 작업 생성 |
| queued | 인증·계약·설정 검사 후 저장됨. 아직 실행 접수와 다름 |
| dispatching | 신뢰된 제어가 실행 접수를 시도. outbox/lease로 재접속과 무관하게 처리 |
| running | 검증된 runId/runAttempt가 결합됨. 현재 phase 표시 |
| awaiting_approval | 검사 증거와 PR·후보 아티팩트가 준비됨. 공개 아님 |
| ready_to_publish | 해당 버전 승인 및 정책 적격. 최종 취소·버전 재검사 필요 |
| publishing | 승인된 버전 병합·배포 중. 완료 선언 금지 |
| verifying | 배포 결과는 있으나 실제 공개 주소 검사 중 |
| published | 실제 URL과 버전 표식·진입점 검사 성공 및 release 증거 저장 |
| needs_review | 수정 2회 소진, 충돌, 자료/보호 정책 문제 등 사람 판단 필요 |
| failed / timed_out | 실제 오류/한도 초과. 오류 코드·phase·복구 가능성 기록 |
| cancel_requested / cancelled | 취소 접수와 실제 중단 확인을 분리. 중단 확인 전 cancelled 금지 |

running.phase는 `source_review → learning_design → development → independent_review → testing → policy_check`다. 수정 가능한 문제는 `repair → independent_review → testing → policy_check`로 최대 2회 되돌아간다. 실패한 검사는 이력에서 삭제하지 않는다. 승인 뒤 변경·동시 main 변경은 이전 승인을 무효화하고 새 후보 검사로 돌아간다.

중단 작업은 안내 페이지의 실제 게시를 확인한 뒤 job은 published, release.action은 withdraw로 기록한다. 재공개·복구도 release.action으로 구분한다. 성공한 job은 과거 사실로 보존하고, 현재 공개 상태는 최신 검증 release로 판단한다. 이미 게시된 작업의 취소는 새 중단/복구 작업으로 처리한다.

`job_events`는 append-only이며 `eventId`, `jobId`, 단조 증가 `sequence`, `stateVersion`, `fromState`, `toState`, `phase`, `actorType`, `runId/runAttempt`, `occurredAt`, `evidenceRef`, 비밀 없는 `errorCode`를 기록한다. 상태 변경과 이벤트 기록은 한 트랜잭션이다. 이전 stateVersion·중복 eventId·종료 후 늦은 콜백은 중복 처리 또는 거절하고 상태를 되돌리지 않는다. 재접속 시 DB snapshot과 마지막 sequence 이후 이벤트를 가져온다.

## Actions와 서버의 연결

서버는 지정 저장소·main·workflow에 입력 `job_id`만 보낸다. 공개 workflow 입력/로그에 교사 요청 원문을 넣지 않는다. 현재 공식 dispatch API는 Actions 쓰기 권한과 `ref/inputs`를 사용하며 응답의 실행 ID·URL을 제공한다. 응답을 받았다는 사실은 실행 성공이 아니다. 07단계에서 API 버전을 고정하고 응답·오류를 실제 시험한다. [GitHub dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)

DB 트랜잭션과 외부 dispatch는 원자적이지 않으므로 `dispatch_intents`를 outbox로 두고 lease·전송 상태·시도 번호를 저장한다. 응답이 유실되면 무조건 재전송하지 않고 지정 workflow의 실행과 대조한다. 중복 run이 생겨도 신뢰된 시작 job이 서버의 원자적 claim을 통과한 하나만 제작을 시작한다. 다른 run은 유료 호출 전에 종료한다. 진행 중 작업 하나와 게시 작업의 직렬화를 서버·실행기 양쪽에서 강제한다.

보고자는 OIDC의 서명·issuer·audience·만료·`repository_id`, `workflow_ref`, `workflow_sha`, `ref`, `run_id`, `run_attempt`를 검증받는다. 재사용 workflow는 `job_workflow_ref`도 검사한다. `job_id`는 기본 OIDC 클레임이 아니며, 서버의 등록 실행과 연결한다. GitHub API로 지정 실행의 입력·커밋·이벤트가 맞는지 대조하고 일회성 보고 nonce·eventId로 재사용을 막는다. 토큰 문자열은 저장/출력하지 않는다. 검사 환경에는 OIDC 발급 권한을 주지 않는다. [GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc)

## 최소 DB 모델 — 05·07단계 구현 예정

모든 비공개 행은 owner_id 또는 소유권을 검증할 상위 FK를 가진다. 대화·작업·검토·승인·배포 FK의 소유자 일치도 검사한다.

| 테이블 | 주요 데이터·제약 |
|---|---|
| conversations | id, owner_id, title, 마지막 content/version 참조, timestamps |
| messages | id, conversation_id, owner_id, role, private body, client_request_id; 대화 내 요청 키 유일 |
| jobs | id, owner_id, conversation_id, operation, immutable request snapshot, target/base version, state/version/phase, idempotency_key, payload_hash, repair_count, retry_of/supersedes_job_id, 제한 snapshot |
| job_events | id, job_id, sequence, 상태 전이·실행·증거. job/sequence 유일, 수정 금지 |
| reviews | id, job_id, role, candidate_hash, 기준/근거 버전, 결과와 실행 증거, 미실행 검사 |
| approvals | id, job_id, content_id, candidate_hash, artifact_hash, policy/checks version, 비공개 approver, 승인/무효화 시간. 브라우저 직접 쓰기 금지 |
| releases | id, job_id, content_id, action, approval_id, source/candidate/artifact hash, release_commit, run_id/attempt, public_url, 검증 상태·시간, 이전 release 참조 |
| dispatch_intents | 07: job_id, attempt, lease, dispatch 상태, run_id/attempt; 재전송 복구 |
| execution_claims | 07: job_id, 실행 결합·lease·nonce 사용 기록; 작업당 활성 claim 하나 |
| usage_reservations | 07: job_id, 기간, 예상/실제 사용량, 예약/정산 상태; 동시 한도 우회 방지 |

직접 DB 쓰기는 기본 서버 경유다. 공개 스키마에 노출하는 경우에도 RLS와 최소 GRANT를 적용한다. 상태/승인 컬럼의 권한과 행 단위 권한은 별개로 검증한다. raw user_metadata는 권한 근거로 사용하지 않는다. 비공개 테이블에 학생용 anon 접근은 없다.

## 검토·승인·배포 규격

검토 결과는 기존 review 예시를 확장한다. `role`, `candidateHash`, `status`(pass/fail/needs_evidence), `sourceChecks`, `checksExecuted`, `checksNotExecuted`, `blockingIssues`, 모형 한계, 입력/출력 해시, 실행 ID와 증거 위치를 기록한다. 실행한 검사에는 명령·환경·종료 코드·시간·결과를 넣는다. 검토자 모델의 pass는 게시 권한이 아니다.

후보 버전은 다음 요소를 결합한다.

- candidateHash: 정규화한 상대 경로를 정렬한 파일 manifest와 각 파일의 실제 바이트 SHA-256으로 계산. 메타데이터·계산·UI·자산을 포함하며 파일 변경은 새 후보가 된다.
- evidenceVersion: 출처 snapshot, 검사 코드의 기준 커밋/해시, 정책 버전, 빌드 도구·잠금 파일 해시.
- artifactHash: 실제 배포할 정적 출력의 정렬된 manifest와 파일 바이트 해시. archive 자체의 무관한 시간 필드와 구분한다.

교사가 승인하는 대상은 contentId + candidateHash + artifactHash + evidenceVersion이다. 승인 후 main이 바뀌면 영향 검사를 하고 최종 조합으로 다시 검사·승인한다. 01단계에서 예외 자동 승인은 설계하지 않는다. 병합 커밋은 원본 커밋과 다를 수 있으므로 문자열 동일성을 요구하기보다 콘텐츠·도구·검사·아티팩트 연결을 검증한다. 검사한 아티팩트를 그대로 배포하며 다시 빌드해 해시가 달라지면 새 검증이 필요하다.

05 이전 공개 승인 목록의 목표 위치는 `automation/publish/approved-content.json`이다. 각 항목은 `schemaVersion`, `contentId`, `candidateHash`, `artifactHash`, `evidenceVersion`, `approvalId`, `approvedAt`, 비개인 식별 검증 참조를 가진다. 사용자 이메일/UUID·원문 요청은 포함하지 않는다. trusted main/교사 확인의 시스템 변경으로만 발행하고 콘텐츠 PR이 목록을 바꾸면 실패한다. 02단계는 목록이 없으면 빈 목록으로 처리하며 예시 승인을 넣지 않는다.

최종 release에는 공개 URL, 배포 커밋·run ID, 아티팩트 해시, 검사 시각과 실제 관찰한 버전 표식을 남긴다. HTTP 200만으로 published를 판정하지 않고 진입점·정적 파일·하위 경로·표식·기본 조작까지 확인한다. 조회 실패는 verifying 또는 실패이며 완료로 꾸미지 않는다.

## 02 구현 연결

실제 스키마는 packages/contracts/meta.schema.json, 공통 표기는 config/catalog.json, 경로·링크·해시 검사는 automation/catalog/content.mjs에 구현했다. 미확정 교육 값은 null을 허용하지만 공개 근거를 대신하지 않는다. 신뢰된 승인 발급원은 아직 없으므로 비어 있지 않은 로컬 승인 목록은 실패시킨다. 04에서 trusted main/승인 발급과 연결해야 한다. 실제 상한·지원 링크 범위·검사용 데이터 분리는 [구현 기록](CATALOG_IMPLEMENTATION.md)에 명시했다. 위 원래 계약과 공개 승인 요건은 유지한다.

## 05 구현 연결 — 실제 연결 전

apps/studio는 schemaVersion=1 요청 봉투, 서버 소유자 결정, 요청 UUID·payload hash 중복 방지, null 미확인 값과 상태 버전 계약을 사용한다. SQL은 supabase/proposals/studio_v1.sql의 미적용 검토안이다. 실제 DB의 RLS·GRANT·원자성·저장 복원은 미검증이다.

05의 execution_mode=mock, policy_version=studio-mock-v1은 실제 제작과 별도다. 자료가 미확인인 상태에서 queued/running을 거치는 것은 모의 흐름 검사만 의미한다. 실제 자료 검토는 하지 않으며 최종 상태는 needs_input이다. 승인·published·release를 생성하지 않는다. 실제 제작용 근거 선행 조건과 공개 승인 계약은 변경하지 않았다. 상세 API·데이터 권한·실제 연결 후 검증표는 [제작실 준비](STUDIO_SETUP.md)에 기록했다.

SQL 적용 전 검토에서 명령 UUID의 재사용은 job_events.command_type과 예상 state_version에도 결합했다. 같은 UUID의 다른 명령/버전은409다. 재시도도 원본의 예상 state_version을 확인하며 해당 버전을 요청 해시에 포함한다. 초기 접수 이벤트0을 포함한 저장 이벤트 상한은20개다. 서버 RPC와 SQL 인자·GRANT 시그니처를 함께 유지한다. 이 계약의 로컬 순수/정적 검사는 실제 DB 동시성 검증을 대신하지 않는다.
