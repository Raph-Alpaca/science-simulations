# 공식 문서와 근거

2026-09-12 확인. 기능 근거와 이 안내서의 제안 설계는 구분했습니다. 메뉴·API·요금제는 구현 시 다시 확인하세요. 전체 URL은 ZIP의 project_seed/docs/SOURCES.md에도 있습니다.

1. [OpenAI — Codex IDE 시작](https://developers.openai.com/codex/ide/)
2. [OpenAI — MCP 연결·실행 환경](https://developers.openai.com/codex/mcp/)
3. [GitHub — Pages의 역할·지원 범위](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
4. [GitHub — Pages 사용자 정의 배포](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
5. [GitHub — 워크플로 실행·토큰 제한](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
6. [GitHub — 워크플로 dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)
7. [Vercel — 함수 실행 한도](https://vercel.com/docs/functions/limitations)
8. [Vercel — 모노레포 배포](https://vercel.com/docs/monorepos)
9. [Supabase — 가입·인증 설정](https://supabase.com/docs/guides/auth/general-configuration)
10. [Supabase — publishable·secret 키](https://supabase.com/docs/guides/api/api-keys)
11. [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
12. [GitHub — App 인증과 Client ID](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)
13. [OpenAI — Codex GitHub Action](https://developers.openai.com/codex/github-action/)
14. [OpenAI — 하위 에이전트](https://developers.openai.com/codex/multi-agent/)
15. [OpenAI — AGENTS.md 지침](https://developers.openai.com/codex/guides/agents-md/)
16. [OpenStax — Laws of Inheritance](https://openstax.org/books/biology-2e/pages/12-3-laws-of-inheritance)
17. [OpenAI — Function calling](https://developers.openai.com/api/docs/guides/function-calling)
18. [OpenAI — API 키 안전 관리](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)
19. [OpenAI — 웹 검색 도구](https://developers.openai.com/api/docs/guides/tools-web-search)
20. [Node.js — 공식 다운로드](https://nodejs.org/en/download)
21. [OpenAI — ChatGPT/API 별도 결제](https://help.openai.com/en/articles/8156019-is-api-usage-included-in-chatgpt-subscriptions-even-if-i-have-a-paid-chatgpt-account)
22. [GitHub — App 등록](https://docs.github.com/developers/apps/creating-a-github-app)
23. [Supabase — 변경 이력·호환성](https://supabase.com/changelog)
24. [GitHub — OIDC 신원 검증](https://docs.github.com/actions/reference/security/oidc)
25. [OpenAI — 음성 전사](https://developers.openai.com/api/docs/guides/speech-to-text)
26. [OpenAI — Realtime API](https://developers.openai.com/api/docs/guides/realtime)
27. [Playwright — 접근성 검사와 한계](https://playwright.dev/docs/accessibility-testing)
28. [Git — gitignore의 적용 범위](https://git-scm.com/docs/gitignore)
29. [GitHub — Actions 보안 원칙](https://docs.github.com/en/actions/reference/security/secure-use)
30. [Supabase — 서버 인증 클라이언트](https://supabase.com/docs/guides/auth/server-side/nextjs)
31. [VS Code — 저장소 게시·원격 연결](https://code.visualstudio.com/docs/sourcecontrol/repos-remotes)

## 2026-09-13 / 01단계 실제 확인 범위

위 2026-09-12 표시는 시작 문서의 기록을 보존한 것이다. 이번 단계에서 위 목록 전체를 다시 검증한 것은 아니다. 아래는 실제 열어 본 공식 문서의 해당 부분만 기록한다. 공급사 계정 연결·API 호출·DB 적용·배포 성공을 의미하지 않는다.

| 공식 자료 | 이번에 확인한 범위 | 남은 확인 |
|---|---|---|
| [OpenAI 하위 에이전트](https://learn.chatgpt.com/docs/agent-configuration/subagents) | 기존 Codex multi-agent URL의 이동, standalone .codex/agents/*.toml, 필수 name/description/developer_instructions, 동시 하위 스레드 설정 | 설치된 실행기의 형식·권한·실제 역할 실행 시험은 03/07 |
| [OpenAI 비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode) | Codex 비대화형 실행 방식의 공식 문서 확인 | CLI 버전·모델·인증·정확 옵션·격리 강제 시험은 07 |
| [OpenAI GitHub Action](https://learn.chatgpt.com/docs/github-action) | Linux 실행·API 프록시·권한 설정·실행자 제한 확인. 원격 실행 방식으로 채택 | Action SHA/CLI 고정·bot 허용·권한/격리 실증은 07 |
| [GitHub workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) | 지정 workflow/ref/inputs, App 설치 토큰·Actions 쓰기 권한, 현재 문서의 실행 ID/URL 응답 | 실제 App·workflow 연결·중복/응답 유실 시험은 07 |
| [GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc) | 실행·저장소·workflow·run_attempt 등 클레임, job_id 서버 매핑 필요 | 서명/재사용/다른 작업 차단은 07 |
| [Pages 사용자 정의 workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) | 아티팩트 기반 빌드·배포 분리 | workflow SHA·권한·실제 게시 시험은 04 |
| [Vercel 모노레포](https://vercel.com/docs/monorepos) | 단일 저장소의 프로젝트별 루트 구성 | 실제 apps/studio 빌드·공유 패키지·환경 설정은 06 |
| [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs) | 브라우저/서버 클라이언트 구분, getClaims/getUser/getSession의 역할 | 설치 버전·로그인·세션·실제 권한 검사는 05 |
| [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [키](https://supabase.com/docs/guides/getting-started/api-keys) | 행 소유권과 공개/서버 키 구분 | 프로젝트 정책·컬럼 권한·번들 노출 시험은 05/06 |
| [Data API 노출 변경 공지](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) | 새 테이블의 API 노출이 RLS와 별도인 변경 | 실제 프로젝트 설정과 최소 GRANT는 05에서 확인 |
| [Node 20 지원 종료 공지](https://supabase.com/changelog/45715-deprecation-notice-dropping-support-for-node-js-20) | Supabase 클라이언트의 Node 22 이상 지원 요구 | 정확 패키지 버전 고정·Node 24 조합 시험은 05 |
| [Git ignore](https://git-scm.com/docs/gitignore) | 이미 추적한 파일에는 ignore 규칙이 적용되지 않는 범위 | 저장소 초기화 후 후보/추적/이력 검사는 04 |

Supabase changelog.md 조회는 오류였으며 일반 changelog와 위 관련 개별 공지를 열어 확인했다. 전체 변경 이력의 모든 항목을 감사한 것은 아니다. 공개 문서 검색 도구도 조회했지만 사용자의 프로젝트는 연결하지 않았다.

00에서 확인한 [Node 다운로드](https://nodejs.org/en/download)의 LTS 24.21.0과 [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation)의 Node 최소 20.9/Windows 지원은 환경 확인 결과로 반영한다. 실제 로컬 버전은 24.15.0이며 업데이트하지 않았다.

교육과정 원문·교과서 원문·OpenStax 교과 내용은 이번 설계 단계에서 대조하지 않았다. `references/source_index.json`의 missing/candidate_not_project_reviewed/권리 미확인 상태를 유지한다. 링크 목록이 있다는 이유로 과학·교육과정 검토 완료로 처리하지 않는다.
