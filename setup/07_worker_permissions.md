# 07 실제 제작·권한 연결

현재 프로젝트를 유지하고 README.md, AGENTS.md, docs/OWNER_INPUT.md, docs/SYSTEM_SPEC.md, docs/STATUS.md 및 실제 Git 상태를 먼저 확인하세요. 현재 단계만 진행하고 최신 공식 문서로 API·설정을 확인하세요. 실제 키를 읽어 출력하지 마세요. 완료 시 변경 파일, 실제 실행 명령과 결과, 미검증 사항, 다음 사용자 작업을 남기고 docs/STATUS.md를 갱신하세요. 다른 단계까지 무작정 진행하거나 구현되지 않은 기능을 완료로 보고하지 마세요.

관리 앱과 GitHub Actions의 실제 제작 실행기를 연결하세요. 공식 Codex Action 또는 현재 공식 비대화형 실행 방식 중 프로젝트가 유지할 한 방식을 문서화하고, Linux 격리 환경과 안전 설정을 사용하세요. 키 노출 위험을 이유로 무조건 unsafe로 바꾸지 마세요.

관리 서버는 DB에 작업을 저장하고 지정 repository/main/workflow에 job_id만 전달합니다. 요청/교육 자료는 공개 가능한 근거 묶음으로 제한합니다. 첫 버전에서 .local 비공개 원문을 public Actions 로그/PR/아티팩트로 옮기지 마세요. 누락 자료는 보류합니다.

GitHub App 등록·Client ID·Private key·해당 저장소만 설치하는 절차를 안내하세요. 서버가 GH_APP_CLIENT_ID/GH_APP_PRIVATE_KEY를 사용해 최소 권한의 짧은 설치 토큰으로 dispatch·PR·승인된 반영을 수행합니다. App 키·쓰기 토큰·DB secret은 제작 AI와 생성 코드 검사에 전달하지 않습니다. Actions:write, Contents:write, Pull requests:write가 필요한 단계만 사용하고 Administration/Workflows 쓰기는 주지 않습니다. 기본 GITHUB_TOKEN 이벤트 제한과 Codex Action의 bot 실행 허용 조건을 실제 시험하세요.

신뢰된 제어 작업→역할별 제작→별도 깨끗한 생성 코드 검사→신뢰된 검증/게시로 나누세요. OIDC 호출은 서명, issuer, audience, 만료, repository_id, workflow_ref, ref, run_id, run_attempt 등 실제 지원되는 클레임을 검증하세요. 재사용 워크플로를 쓰는 경우 job_workflow_ref도 검증하세요. 애플리케이션의 job_id는 GitHub OIDC 기본 클레임이라고 가정하지 말고, DB에 등록한 job_id와 검증된 run_id/run_attempt를 서버에서 결합하세요. 토큰 재사용과 다른 작업 ID로의 상태 변경을 차단하세요. 제작/테스트 작업에는 상태 위조·게시 권한을 주지 마세요. 외부 PR·댓글이 유료 실행을 시작할 수 없게 하세요.

교육과정 검토/교과 검토/설계/개발/독립 검토는 실제 실행 단위로 나누고, 입력·출력·근거를 남깁니다. 같은 파일을 동시 수정하지 않게 하세요. 검사 코드·공통 설정·배포 규칙·AGENTS.md는 콘텐츠 작업의 허용 변경 범위 밖입니다. 기준 main의 검사와 경로/파일종류/용량/심볼릭 링크 검사를 적용하세요.

초기 동시 실행 1, 수정 최대2, 명시적 timeout·호출·일일 작업 상한, idempotency, 취소, 실패 원인 기록을 구현하세요. 상한은 프로그램에서 강제하고 실제 비용 상한과 알림을 구분하세요. 모든 콘텐츠가 익명의 실행 코드를 포함한다는 전제로 시험 환경의 네트워크·파일·권한을 제한하세요.

실제 키는 제가 Secret에 넣습니다. 키 없이 가능한 검사와 실제 유료 시험을 구분하고, 첫 유료 실행 전에 승인받으세요. Actions에서 시험 작업 하나를 PR까지 완료하고, 실패 시 기존 공개 사이트가 유지되는지 검증하세요. 운영 자동 공개는 아직 켜지 않습니다.
