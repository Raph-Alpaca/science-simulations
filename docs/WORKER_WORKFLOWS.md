# 제작·검사·보고 워크플로 연결

2026-10-04 로컬 구현이다. 원격 업로드·실제 Actions 실행·운영 활성화·공개 게시·유료 모델 호출은 실행하지 않았다.

## 실행 순서

`studio-worker.yml`은 지정 저장소의 main과 첫 수동 실행만 허용한다. 기본 모드는 rehearsal이다. 전역 동시 실행1개, 이전 실행을 취소하지 않는 대기 방식이다. 생성 모드는 별도 저장소 변수 `STUDIO_WORKER_ENABLED=true`와 서버의 승인 작업 UUID를 요구한다. 기존 서버 dispatch 계약에 고정 `mode=generate`를 추가해 기본 rehearsal만 실행하는 불일치를 수정했다. 이 dispatcher는 아직 운영 API에 연결하지 않았다.

실제 생성 전에는 별도 설정 검사와 Linux 컨테이너 rehearsal이 모두 성공해야 한다. rehearsal은 비밀이나 OIDC 없이 격리 probe, 2D 조작/초기화, 3D 카메라/WebGL/대체 설명, 고장 난 초기화의 실패 감지를 검사한다. 로컬 단위 검사로 이 조건을 대신하지 않는다.

- `studio-generate.yml`: OpenAI 키와 제작 역할 OIDC를 가진 신뢰된 제작기. 후보 소스 실행·검사 결과 작성·게시 권한 없음.
- `studio-report.yml`의 fetch: 보고 역할 OIDC로 승인 입력과 후보를 읽고 메모리에서 암호화한 뒤 파일을 기록한다.
- 같은 워크플로의 verify: 별도 VM, contents 읽기만 허용하고 OIDC/API 키 없음. 신뢰된 래퍼만 전송 키를 사용한다. 생성 코드는 키·호스트 마운트·네트워크 없는 컨테이너에서 실행한다.
- 같은 워크플로의 report: 별도 VM의 보고 역할 OIDC로 최신 후보 버전을 다시 대조한 뒤 검사 보고를1회 저장한다. 후보 소스 실행 없음.

첫 시도와 최대2번 수정에 대해 위 보고 워크플로를 순차 호출한다. 제작기는 병렬로 진행하며 시도당 최대40회·10초 간격으로 별도 보고를 기다린다. 전체 제작20분, 호출9회, 비용·횟수 제한은 유지한다. GitHub 작업 대기/이미지 준비가 오래 걸려도 시간 제한을 늘려 자동 재시도하지 않는다. 프로세스 강제 중단이나 응답 유실로 비용을 확정할 수 없으면 기존 보수적 보류/정산 경로를 적용한다.

## 전달·실행 경계

Actions 산출물은 고정 이름의 `candidate.sealed.json`, `report.sealed.json`만 사용한다. 같은 run의 정확한 이름으로 다운로드하고1일 보존한다. 작업 UUID·run·attempt·기준 SHA·후보/입력 해시·용도를 인증 데이터로 결합한다. 복호화 후에도 현재 DB 버전과 대조한다. 평문 소스·보고·비밀을 파일/로그에 넣지 않고 ready 여부와 고정 상태만 출력한다. 전송 키는 아직 운영 등록하지 않았다.

Docker 빌드는 별도 임시 폴더의 허용 목록만 사용한다. [컨테이너 설명](../automation/runner/container/README.md)에 공식 이미지 digest, seccomp 원문·라이선스, 권한과 자원 한도를 기록했다. 실행은 생성→설정 확인→표준 입력 전달→최대65초 실행→강제 삭제 확인 순서다. 설정/후보 해시가 다르거나 정리를 확인하지 못하면 통과 결과를 반환하지 않는다. 생성 코드를 Node 모듈·npm 스크립트·shell 명령으로 실행하지 않는다.

공식 태그를 GitHub API에서 읽어 Actions를 커밋으로 고정했다. checkout7.0.1, setup-node7.0.0은 기존 검증한 핀을 유지했고 [upload-artifact7.0.1](https://github.com/actions/upload-artifact/tree/043fb46d1a93c77aae656e7c1c64a875d1fc6a0a), [download-artifact8.0.1](https://github.com/actions/download-artifact/tree/3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c)를 확인했다. 고정 SHA 검토는 도구/의존성의 무결점 보증이 아니다.

## 실제 검증과 미검증

- 전체 제작실 검사117/117 PASS. 새6개는 격리 설정 변경, 키 상속, 잘못된 후보, 생성/실행 실패와 정리 실패, 전용 빌드 문맥, 암호문 파일·다른 실행 거부다. 기존 원격 통합 사례도 실제 파일 래퍼의 fetch→verify→report를 거쳐 서명 HTTP 처리기와 PGlite SQL에 연결했다. 모델과 Docker/측정 보고는 이 검사에서 모의 값이다.
- 공식 actionlint1.7.12의 공개 릴리스 SHA-256을 확인하고 `.local`에서 실행했다. 새 YAML3개의 문법·재사용 호출·표현식 검사 PASS/exit0. shellcheck·pyflakes는 설치하지 않았고 해당 검사는 실행하지 않았다. 실제 GitHub 실행 성공의 증거는 아니다.
- 실제 로컬 Chrome8사례 PASS/exit0, 23:55:45 KST. `.local/evidence/worker/runtime-browser-57651b87-ea5f-410c-b177-ffb25192d5a5.json`. 정상2D·3D, 고장5종, 별도 프로세스 실패→모의 수정→실제 재검사 통과. 모든 브라우저 종료 확인. 검사 예제 메타데이터를 자체 합성 값으로 바꾸어 비공개 콘텐츠 파일에 의존하지 않는다.
- Windows에 Docker가 없어 이미지 빌드·실제 Linux 격리·Chromium sandbox 호환·원격 정리·실제 Actions OIDC 토큰은 미검증이다. 격리 실패 시 권한 확대나 sandbox 해제로 통과시키지 않는다.
- 기존 공개 승인 요청40개 스테이징은 그대로 보존했다. 새 구현과 dispatch 보완은 미스테이징이다. 운영 예산/worker/auth SQL·앱·Git 원격은 변경하지 않았다.

## 다음 연결

검토된 입력 발급 UI/API, GitHub App dispatch와 DB 실행번호 결합, 실제 OIDC/컨테이너 rehearsal, 승인된 버전의 게시·게시 확인이 남아 있다. OpenAI 키 준비 여부와 기존 공개 업로드 대상/범위 동의도 답변 대기다. 워크플로 파일이 있다는 이유로 자동 제작·게시 완료로 표시하지 않는다.
