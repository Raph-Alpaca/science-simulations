# 도구 점검표

| 기능 | 로컬 Codex | Actions | 관리 서버 |
|---|---|---|---|
| 파일 읽기 | 00·01 Get-Content/rg 실행 확인 | 미구현 | 미구현 |
| 공개 검색 | 00·01 web 검색·공식 페이지 조회 확인 | 미구현 | 미구현 |
| 코드 실행 | PowerShell 명령 실행 확인. 앱 실행은 미검증 | 미구현 | 임의 실행 금지 |
| 브라우저 검사 | 00 Chrome 공식 Node.js 페이지 읽기 확인. 앱 검사는 미실행 | 미구현 | 후보 코드 실행 금지 |
| 하위 에이전트 | 00 environment_readonly 실행·보고 확인. 01에서는 실행 안 함 | 미구현 | 실행기로 위임 |
| 디자인 연결 | 선택 도구 노출과 실제 연결은 별개. 실제 파일 연결 미검증 | 기본 불필요 | 기본 불필요 |
| 음성 | 실제 녹음·전사·양방향 대화 미검증 | 불필요 | 미구현 |

ChatGPT 플러그인이 다른 실행 환경에 자동 복제되었다고 가정하지 않습니다.

## 환경 증거와 경계

2026-09-13, 00 결과를 01에서 반영했다. Windows x64 빌드 26200, Windows PowerShell 5.1.26100.9168 Desktop이다. WSL은 사용하지 않았다. 상세 Windows 제품명 조회(Get-CimInstance)는 액세스 거부였으므로 미검증이다. 확인 가능한 OS/셸 증거만 기록하며 조회 권한을 바꾸지 않았다.

작업 경로는 `C:\Users\user\Desktop\science-simulations`이다. Git 2.54.0.windows.1, Node.js 24.15.0, npm.cmd 11.12.1이 실행됐다. `npm --version`은 npm.ps1 실행 정책 오류였고 `npm.cmd --version`으로 확인했다. 실행 정책은 변경하지 않았다. Git status는 00·01 모두 저장소가 아니라는 오류였으며 브랜치/미커밋 변경/원격은 존재한다고 가정하지 않는다.

00에서 Node.js 공식 페이지의 최신 LTS 24.21.0과 Next.js의 Node 20.9 이상·Windows 지원을 확인했다. 01에서 Supabase의 Node 20 지원 종료·22 이상 요구 공지를 확인했다. 로컬 24 계열은 이 문서상 조건을 만족하지만 최신 패치 설치나 프로젝트 라이브러리 조합 시험은 안 했다. 실제 의존성 버전은 02/05/07에 고정·검증한다. [Node 다운로드](https://nodejs.org/en/download), [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation), [Supabase Node 지원](https://supabase.com/changelog/45715-deprecation-notice-dropping-support-for-node-js-20)

01 Supabase 문서 검색 도구는 첫 호출에서 인자 이름 오류가 났고, `graphql_query`로 수정한 읽기 전용 조회가 성공했다. 이는 공개 문서 접근 확인이며 사용자의 Supabase 프로젝트/DB 연결 성공이 아니다. 공식 changelog의 `.md` 조회는 실패했고 일반 changelog 및 관련 개별 변경 공지는 확인했다.

쓰기 권한은 01 Markdown 문서 변경으로만 사용한다. 앱·패키지·SQL·workflow·에이전트 TOML·환경 변수는 생성하지 않는다. 로컬의 브라우저·검색·하위 에이전트 도구가 미래 Actions에도 있다고 가정하지 않는다. 해당 환경에서 별도 설치/접근/실행 증거가 필요하다.

## 공식 하위 에이전트 형식과 적용 시점

현재 공식 문서는 프로젝트별 `.codex/agents/*.toml`의 standalone 파일 하나에 역할 하나를 정의하며 `name`, `description`, `developer_instructions`를 요구한다. 모델/추론 설정은 선택 항목이다. 전역 `[agents]`의 `max_concurrent_threads_per_session`은 주 에이전트를 제외한 동시 하위 스레드 수다. 이것은 제작 작업 동시 실행 1이나 수정 횟수 2와 다른 제한이다. [OpenAI 하위 에이전트 공식 문서](https://learn.chatgpt.com/docs/agent-configuration/subagents)

01에는 [automation/roles](../automation/roles/README.md)의 역할 문서만 작성한다. 이 문서들은 자동 로딩되는 Codex 설정이 아니다. 03 또는 07에서 당시 설치된 Codex의 지원 형식·권한을 다시 확인한 뒤 해당 문서를 TOML의 지침에 반영하고 실제 입력/출력·실행 ID를 확인한다. 이전 형식이나 모델 이름을 추측해 활성 설정을 만들지 않는다.

원격 제작은 Linux의 공식 Codex GitHub Action으로 통일한다. 이 Action은 인증 프록시와 지정 권한 아래 `codex exec`를 실행한다. Action 전체 SHA·CLI/모델 버전·출력 규격·권한 축소·역할 분리는 07에서 고정하고 시험한다. Windows용 unsafe 설정을 가져오지 않는다. 신뢰된 제작 job과 생성 코드 검사/게시 job을 분리하고, App bot 허용 조건도 실제 시험한다. 프록시가 있다는 이유로 후보 코드의 안전을 보장하지 않는다. [OpenAI Action](https://learn.chatgpt.com/docs/github-action), [비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode)

역할별 작업은 교육과정 검토, 교과 검토, 학습 설계, 개발, 독립 검토다. 독립 검토에 앞선 제작자의 결론만 넘기지 않고 근거·후보·실제 검사 자료를 준다. 실제 하위 에이전트가 없으면 별도 실행 문맥으로 순차 진행하고 방식을 명시한다. 한 에이전트가 여러 역할의 대화문을 썼다는 이유로 독립 실행을 인정하지 않는다.

검색이 없을 때는 확보한 출처만 검토하고 필요한 원문이 없으면 보류한다. 디자인 도구 없이도 기존 DESIGN_BRIEF로 기본 자료실을 만들 수 있다. 브라우저 검사가 없을 때는 정적 검사 결과만 기록하고 실동작을 완료로 표시하지 않는다.

## 02 실제 도구 사용

Node 24.15.0·npm.cmd 11.12.1과 프로젝트에 고정한 의존성으로 실행·검사·빌드했다. agent-browser-verify 스킬의 검사 항목을 참고했고 agent-browser CLI는 발견되지 않아 Playwright의 설치된 Chrome 채널과 실제 Chrome 탭 열기로 검증했다. 브라우저 바이너리를 새로 다운로드하지 않았다. 데스크톱/모바일 캡처를 이미지 도구로 읽었다. 추가 하위 에이전트는 실행하지 않았다.

공식 웹 문서·npm 레지스트리는 실제 읽었지만 외부 서비스 계정은 연결하지 않았다. npm 캐시/상위 경로 realpath 검사에 대한 샌드박스 EPERM은 권한 검토 후 재실행했다. 시스템 전체 설정이나 PowerShell 정책을 변경하지 않았다. 사용한 버전·공식 출처 범위는 [구현 기록](CATALOG_IMPLEMENTATION.md), 실제 실패와 최종 결과는 [STATUS](STATUS.md)에 있다.
