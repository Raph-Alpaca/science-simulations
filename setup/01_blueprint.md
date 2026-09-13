# 01 구조와 규칙 확정

현재 프로젝트를 유지하고 README.md, AGENTS.md, docs/OWNER_INPUT.md, docs/SYSTEM_SPEC.md, docs/STATUS.md 및 실제 Git 상태를 먼저 확인하세요. 현재 단계만 진행하고 최신 공식 문서로 API·설정을 확인하세요. 실제 키를 읽어 출력하지 마세요. 완료 시 변경 파일, 실제 실행 명령과 결과, 미검증 사항, 다음 사용자 작업을 남기고 docs/STATUS.md를 갱신하세요. 다른 단계까지 무작정 진행하거나 구현되지 않은 기능을 완료로 보고하지 마세요.

공개 사이트는 GitHub Pages, 관리 채팅·음성 앱은 Vercel의 Next.js, 로그인·작업 기록은 Supabase, 긴 제작은 GitHub Actions, AI는 OpenAI API/Codex로 통일합니다. 저장소는 하나입니다.

apps/catalog, apps/studio, packages/contracts, content/simulations, automation, tests, docs, references를 구분하는 최소 npm workspace 구조를 설계하세요. 파일 규격과 실제 구현 계획을 만들되 아직 모든 서비스를 한꺼번에 구현하지 마세요.

OWNER_INPUT의 학년도·교육과정·교과서·비용 상한이 미확인이면 그렇게 유지하세요. 예시 성취기준을 지어내지 마세요. 학년별 적용 연도와 출처를 검증하는 표를 설계하세요. 디자인은 DESIGN_BRIEF 기본안으로 시작합니다.

문장/음성→인증된 서버→작업 저장→지정 Actions 실행→자료 검토/설계/개발/검사/수정→PR/승인→배포→게시 확인의 상태와 데이터 계약을 정의하세요. 채팅창이 닫혀도 이어지고, 같은 요청이 중복 실행되지 않아야 합니다.

각 역할의 지침·입력·출력을 automation/roles에 둡니다. 현재 Codex의 공식 하위 에이전트 형식은 확인 후 설정하고, 파일 존재를 실제 실행과 혼동하지 마세요. 자동 공개는 기본 false, 공통 시스템 수정은 별도 승인입니다.

공개 저장소에서 .local, .env, 비공개 교과서·개인 메모가 빠지는지 확인하세요. 현재 도구를 docs/TOOLS.md에 실행 환경별로 기록하세요. 웹 검색/디자인 플러그인을 전제하지 말고 없을 때도 기본 자료실을 만들 수 있게 하세요.

docs/DECISIONS.md, ARCHITECTURE.md, STATUS.md, OPERATIONS.md를 작성하고, 어떤 검사로 요구사항을 증명할지 매핑하세요. 계획과 실제 구현 상태를 구분해 이번 단계 결과만 보고하세요.
