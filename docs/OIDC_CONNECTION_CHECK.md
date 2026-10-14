# 실제 실행 인증 확인 — 제작 활성화 전

2026-10-14 로컬 준비. App/Actions/Vercel의 승인된 키 등록은 완료했고, GitHub가 실제 발급한 제작/보고 역할 토큰은 아직 확인하지 않았다. 이 검사는 실제 토큰을 **운영 서버와 동일한 검증 코드로 Actions 내부에서 검증**한다. 운영 HTTP/DB 왕복이나 유료 제작 완료를 뜻하지 않는다.

## 새 연결 모드

기존 `studio-worker.yml`에 수동 `connection` 모드를 추가했다. main·첫 실행·빈 job_id·제작 비활성 상태에서만 동작하며, 기존 `studio-generate.yml`과 `studio-report.yml`을 순서대로 재사용한다. 같은 caller/reusable 경로를 유지해야 실제 제작의 `workflow_ref`/`job_workflow_ref` 조합을 확인할 수 있다. 원래 `rehearsal` 기본값과 생성 모드의 설정 검사/컨테이너 검사는 유지한다.

새 connection job은 contents 읽기와 일시적 OIDC 발급 권한만 사용한다. OpenAI/전달/App/DB 키는 넘기지 않고 후보 소스·Docker·제작실 API를 실행하지 않는다. 두 reusable workflow의 secret 선언은 이 비밀 없는 호출을 위해 optional로 바뀌지만, 실제 제작은 기존 configuration job의 키 형식 검사·generate 모드·제작 활성화와 별도 API/DB/예산 조건을 모두 요구한다. connection_only와 실제 제작/보고 경로는 서로 배타적이다.

각 job은 최대3분, 검증 코드 전체15초·HTTP GET 최대2회(토큰 발급1회+공식 공개키1회)다. 자동 재시도하지 않는다. 첫 역할이 실패하면 두 번째 역할은 시작하지 않는다. 출력은 고정 상태/코드/역할·요청 수·성공한 실행번호/SHA뿐이며 토큰·원문 응답·키는 로그/파일에 저장하지 않는다.

`oidc-connection.mjs`는 기존 token provider와 `createWorkerTokenVerifier`를 재사용한다. issuer/audience/불변 subject·저장소/소유자 ID·main·caller/reusable SHA·GitHub runner·첫 실행·RS256/시각 제한을 그대로 검사하고 현재 역할/실행번호까지 대조한다. Production 환경의 trusted SHA나 API 스위치를 변경하지 않는다. 성공해도 `executionReady=false`다.

## 확인한 결과와 실행 경계

- 새7개와 기존 인증/클라이언트13개, 총20개 로컬 검사 PASS. 실제 RSA 서명/공개키 검증을 사용하되 토큰 발급 서버는 합성이다.
- 잘못된 역할/실행번호/서명/만료/버전, 키가 들어간 환경, PR/재실행, 공격자 URL, 과대/오류 응답, 전체 시간 제한·중단을 확인했다.
- 변경한 YAML3개 actionlint PASS. shellcheck/pyflakes 및 실제 GitHub 실행은 미실행이다.

기존 제작 Linux4/4·누적8, 게시 합성 검사1/1의 실행 한도는 모두 사용됐다. 새 connection 실행은 **별도1회 승인이 필요**하다. 그 전에 공개할 파일/해시와 PR 검사/병합·제작실 재배포 범위를 고정한다. 재배포 시 이미 승인·등록한 App 설정3개가 새 배포에 들어가지만 제작/게시 스위치와 운영 DB는 계속 비활성이다.

승인 후에는 정확한 main SHA와 workflow, 저장소 변수의 제작 비활성을 읽기 전용으로 확인한다. 전송 전 로컬 단일 시도 표식을 저장하고 `mode=connection,job_id=''` 한 번만 보낸다. 실행번호·SHA·attempt1·두 역할의 성공/실제 로그를 확인한다. 실패/응답 유실은 그대로 보존하고 표식을 지우거나 같은 검사를 자동 재전송하지 않는다.

## 다음 단계와 미검증

이 검사 통과 후에도 서버의 실제 App dispatch/실행번호 결합, OIDC→운영 API→DB 영수증 왕복, 최초 과제·원문/권리 확인과 비용 동의, 실제 제작/검토/수정, 버전별 교사 승인·동일 파일 게시/확인이 남는다. 불확실한 실행/게시의 후속 관찰·조정도 별도 작업이다. 이 연결 검사를 통과했다는 이유로 제작을 켜지 않는다.

근거: [GitHub 재사용 워크플로의 OIDC claim 관계](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-with-reusable-workflows), [OIDC claim·발급 권한 문서](https://docs.github.com/en/actions/reference/security/oidc). 2026-10-14 확인. 문서와 합성 검사는 실제 발급 토큰의 성공 증거를 대신하지 않는다.
