# 05 로그인과 작업 기록

현재 프로젝트를 유지하고 README.md, AGENTS.md, docs/OWNER_INPUT.md, docs/SYSTEM_SPEC.md, docs/STATUS.md 및 실제 Git 상태를 먼저 확인하세요. 현재 단계만 진행하고 최신 공식 문서로 API·설정을 확인하세요. 실제 키를 읽어 출력하지 마세요. 완료 시 변경 파일, 실제 실행 명령과 결과, 미검증 사항, 다음 사용자 작업을 남기고 docs/STATUS.md를 갱신하세요. 다른 단계까지 무작정 진행하거나 구현되지 않은 기능을 완료로 보고하지 마세요.

apps/studio에 Next.js 기반 교사용 제작실을 구현하세요. Supabase Auth와 Postgres를 사용하되 초기 단계는 실제 AI 호출 없이 명확히 표시한 mock worker로 검사합니다.

Supabase 프로젝트/교사 계정/URL/publishable key/server secret key를 제가 어디에 입력할지 설명하세요. 실제 키를 채팅에 보내라고 하지 마세요. 이메일·비밀번호 로그인, 신규 가입 비활성화, ALLOWED_USER_IDS 서버 검사를 기본으로 하세요. 현재 공식 서버 인증 방법으로 세션을 검증하고 사용자 수정 가능 metadata를 권한 근거로 쓰지 마세요.

conversations, messages, jobs, job_events, reviews, approvals, releases의 최소 구조와 변경 이력을 만드세요. 학년도·콘텐츠 ID·요청 ID·대상 버전·실행 번호를 연결하세요. 원문 요청·개인 기록은 공개 Git 저장소에 두지 마세요.

공개되는 스키마의 RLS 및 Data API 접근 권한을 따로 점검하세요. 사용자 소유권, 미로그인 차단, 타 사용자 ID 접근 차단을 실제 테스트하세요. 브라우저가 job 완료/승인/배포 상태를 직접 임의 쓰기하지 못하게 하세요. secret/service_role 키는 서버 전용입니다.

대화 목록·작업 상세·상태·중단·재시도·오류 표시를 만들고 창을 닫았다 열어도 기록을 복원하세요. 중복 전송은 같은 idempotency key로 묶으세요. 유료 실행·실제 배포는 하지 마세요. 준비된 SQL을 검토한 뒤에만 적용하며 기존 데이터가 있으면 비파괴 변경을 우선합니다.
