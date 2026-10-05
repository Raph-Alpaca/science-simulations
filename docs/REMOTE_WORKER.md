# 원격 제작기의 API·검사 전달 연결

2026-10-04 로컬 구현과 검사 결과다. 실제 GitHub Actions·GitHub 발급 OIDC·OpenAI 유료 호출·공개 업로드·운영 DB 적용을 실행하지 않았다. 이후 워크플로 YAML과 컨테이너 연결 코드를 작성했으며 실제 Linux 격리는 아직 검증하지 않았다. 최신 연결 범위는 [WORKER_WORKFLOWS](WORKER_WORKFLOWS.md)에 있다.

## 원격 제작기

`worker-client.mjs`는 고정 제작실 API에 검증한 JSON 요청만 보낸다. GitHub Actions 환경의 OIDC 요청 주소는 HTTPS의 actions.githubusercontent.com 하위 호스트로 제한하고 제작실 전용 audience를 지정한다. 리다이렉트, 토큰 캐시, 같은 토큰 재사용, 임의 주소와 원문 오류 출력을 허용하지 않는다. [GitHub 공식 OIDC 클라이언트](https://github.com/actions/toolkit/blob/main/packages/core/src/oidc-utils.ts)의 환경 변수와 audience 전달 방식을 확인했다. 실제 발급 토큰의 수명·재발급 동작은 아직 원격에서 확인하지 않았다.

토큰 요청 5초, API 요청 20초, 응답 2.3MB, 작업 20분 한도다. 정상 요청은 최대197회, 전체200회 중 마지막3개는 정산·종료 확인을 위해 남긴다. 작업 시간이 끝난 뒤에는 최대30초·3요청 범위에서 정산과 종료만 허용한다. 토큰 요청·응답 본문 읽기 중에도 취소를 전달한다. 네트워크 오류나 응답 유실을 보고 같은 요청을 자동 재전송하지 않는다.

`remote-generation.mjs`는 서버에서 읽은 승인 입력의 정확한 해시를 확인한 뒤 점유, 현재 상태 확인, 호출 예산 예약/정산, 역할별 증거 저장, 검사 결과 대기, 최종 종료를 연결한다. 제작기는 생성 코드를 실행하지 않는다. 별도 보고자가 저장한 실행 증거를 읽고 검증하며, 그 증거를 제작 역할로 다시 쓰지 않는다. 증거의 후보/입력/기준 코드 버전과 관찰 스키마가 달라지면 중단한다.

검사 결과는 수정 시도당 최대40회, 읽기 사이10초 간격으로 기다린다. 컨테이너 준비 시간을 수용하기 위해 간격만 늘렸고 요청 횟수와 전체20분 제한은 유지했다. 각 HTTP 요청에는 별도의 시간 상한이 있으며 전체 작업 제한도 유지한다. 취소나 첫 HTTP 오류에서 대기를 끝낸다. `generate-worker.mjs`는 이 경로의 CLI 진입점이다. STUDIO_GENERATION_ENABLED=true, 지정 저장소/main/workflow_dispatch/첫 실행, OIDC와 OpenAI 키가 모두 준비되어야 사용할 수 있다. 기본 비활성 상태로 직접 실행한 결과 WORKER_SETUP_REQUIRED/exit1로 네트워크 요청 전에 거부됐다.

## 별도 검사를 위한 후보 전달

보고 역할의 `verification` API는 요청한 시도의 후보를 기다릴 때 pending, 후보가 준비됐으면 검토된 입력과 정확한 후보 패킷, 작업이 종료됐거나 이미 보고됐으면 done만 반환한다. 종료된 작업의 원문은 반환하지 않는다. 제작 역할은 이 API를 호출할 수 없다. 서버는 기존 실행/토큰 영수증·버전·교사 권한 검증을 거친다. 이 읽기 범위를 `studio_worker_auth_v1.sql` 검토안에 추가했으며 운영 미적용이다.

`verification-packet.mjs`는 첫 후보 최대90회, 수정 후보 최대45회(읽기 사이5초), 취소/오류/종료 시 중단을 적용한다. 패킷의 소스·후보·시도·기준 SHA를 다시 검사한다. 정상 경로의 제작기와 보고자 대기 횟수는 DB의 작업당512개 토큰 영수증 한도 안에 있으며 DB 한도를 완화하지 않았다.

공개 저장소의 작업 산출물에 승인 전 입력/후보 원문을 넣지 않도록 `sealed-transfer.mjs`를 추가했다. 표준 Node crypto의 HKDF-SHA256과 AES-256-GCM, 매번 새로운 salt/nonce, 작업·실행·시도·SHA·소스/후보 해시·candidate/runtime-report 용도를 결합한 인증 데이터를 사용한다. 32바이트 전용 전송 키가 필요하며 복호화 인증이 끝나기 전에는 JSON이나 부분 원문을 반환하지 않는다. 2.3MB 원문/3.1MB 봉투 크기를 제한한다. [Node HKDF](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptohkdfsyncdigest-ikm-salt-info-keylen)와 [인증 데이터 처리](https://nodejs.org/docs/latest-v24.x/api/crypto.html#ciphersetaadbuffer-options)를 확인했다.

운영 전송 키는 아직 생성·등록하지 않았다. 키는 이후 신뢰된 전달 래퍼에만 두고 생성 코드 컨테이너에는 전달하지 않아야 한다. 이번에는 메모리의 검사 전용 무작위 키만 사용했다. 암호화가 공개 권한이나 검사 통과를 부여하지 않으며, 실제 artifact 업로드·비공개 보관·컨테이너 마운트/네트워크 격리는 별도 워크플로 검증이 필요하다. 후보 본문을 평문 로그나 공개 Git에 넣는 경로는 추가하지 않았다.

## 검증 결과

`npm.cmd run test:studio` **111/111**, production build와 내장 TypeScript 검사 성공. 새14개는 API 클라이언트7개, 원격 제작 연결4개, 암호화 전달/대기3개다. HTTP/DB 검사는 실제 Request/Response 처리기, 합성 RSA 토큰의 서명 검증, PGlite의 실제 SQL을 연결했으며 전송 계층은 로컬 모의 함수다. 실제 원격 HTTP 호출이나 GitHub 서명 토큰으로 확대하지 않는다.

- 다섯 모의 모델 호출→비용 예약/정산→후보 준비 조회→암호화/복호화→별도 보고자→검토 증거→승인 대기를 연결했다. 과학·실행 관찰은 이 사례에서 합성 값이며 실제 브라우저 결과는 앞선 [WORKER_RUNTIME](WORKER_RUNTIME.md)의8사례와 구분한다.
- DB 점유 후 응답을 잃어도 요청1회만 전송했고 running 상태를 확인했다. 임의 오류 본문이나 비밀 문자열은 외부 오류로 출력하지 않았다.
- 공급사 생성 직후 취소에서 비용 정산과 종료가 실행됐고, 생성 응답 유실에서는 요청1회·COST_UNCERTAIN·예약/동시 슬롯 유지가 확인됐다. 유료 공급사 호출은0회다.
- 멈춘 토큰 발급 함수와 응답 스트림 취소, 최대 요청·대기·시간 한도, 버전/작업/용도 바꿔치기·키/암호문 변조·추가 필드·크기 초과를 거부했다. 2.2MB 합성 원문의 암호화 왕복도 성공했다.

변경된 인증 SQL을 포함한 PostgreSQL17의 기존 물리 연결 경쟁11개를 새 loopback DB에서 다시 확인했다. 23:35:37~23:35:57 KST, PASS/exit0, `.local/worker-pg17-fb497742f56f4e2bbf980c1e49d26e7a/result.json`. 5개 SQL 해시 일치, stopped=true, postmaster.pid/임시 평문 암호 없음, 사용자/SYSTEM 전용 루트 ACL을 확인했다. 새 verification 읽기의 준비/종료/역할 분리는 위 HTTP/PGlite 검사에서 확인한 것이며 이11개가 새 endpoint의 원격 실행 검사는 아니다.

## 남은 실제 작업

GitHub 워크플로와 OS 격리, 암호화 산출물의 같은 실행 내 전달·검증, GitHub App dispatch/DB 결합, 운영 전송 키·OpenAI 키, 검토 입력 발급 UI/API, 예산/worker/auth 운영 migration, 승인·게시·공개 확인이 남아 있다. 실제 자료의 교육과정/교과서 대조와 AI 처리/공개 권리 확인도 유지한다. 기존40개 파일의 공개 반영 승인은 별도로 대기 중이며 이번 파일을 그 스테이징에 추가하지 않았다.
