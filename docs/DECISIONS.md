# 결정 기록

- v3.0: Actions 화면은 시험/비상용. 일상 입력은 관리 채팅·음성.
- 저장소 하나, 공개/관리 배포 분리.
- Supabase는 교사 인증과 작업 기록에 사용. 학생 정보 수집 아님.
- Figma/Canva는 선택. 기본 디자인 명세부터 시작.
- 첫 클라우드 자동화는 공개 근거만 사용.
- 이후 변경에는 날짜·이유·영향·실제 검증을 함께 기록.

## 2026-09-13 / 01 구조와 규칙

아래는 설계 결정이며 앱·외부 설정 구현 완료가 아니다. 기존 v3.0 요구사항을 변경하지 않고 실행 가능한 계약으로 구체화했다.

| 결정 | 이유·영향 | 확인·검증 범위 |
|---|---|---|
| 하나의 npm workspace, apps/catalog와 apps/studio 분리, packages/contracts 공유 | 공개 정적 자료와 교사 서버의 책임·배포 분리 | 기존 명세 및 공식 Pages/Vercel 문서 대조. 설치/배포 안 함 |
| Windows PowerShell + npm.cmd, 실행 정책 유지 | 00에서 npm.ps1이 정책에 막히고 npm.cmd는 정상 동작 | 00 Git 2.54.0.windows.1 / Node 24.15.0 / npm 11.12.1 기록 반영 |
| 현재 Git 없음, 초기화·연결은 04에서 대상 확인 후 | 존재하지 않는 브랜치/main/이력을 가정하지 않음 | 01 git status도 not a git repository. ignore 실효성 미검증 |
| 제목과 영구 ID 분리, 첫 ID mendel-inheritance 유지 | 기존 주소·콘텐츠 보존 | 템플릿과 03 요청문 대조 |
| 학년도·교육과정·교과서·권리·비용은 미확인 | 근거를 지어내지 않고 단계별 차단 조건으로 사용 | OWNER_INPUT/참고 목록 확인. 교육 원문 내용 검토 안 함 |
| 서버 저장 작업·append-only 이벤트·원자적 중복 키·dispatch outbox | 창 닫힘/재전송/응답 유실에 대응 | 데이터 계약만 정의. 동시성 시험은 05·07 |
| 검사·승인은 candidate/artifact/근거·정책 버전에 결합 | 승인 후 다른 파일 게시 방지 | 실패 사례를 검증표에 연결. 미구현 |
| 초기 AI_EXECUTION_ENABLED=false, AUTO_PUBLISH=false | 기존 사람 승인 흐름 유지 | config 제안값 확인. 실제 서버/환경 변수는 미구현 |
| 동시 제작 1, 수정 최대 2; 나머지 미정 상한은 실행 차단 | 미정값을 무제한으로 해석하지 않음 | 운영 계약만 정의. 프로그램 강제는 07 |
| 콘텐츠 작업은 단일 ID 내부만 변경 | 공통 검사·권한·역할 지침·워크플로 변경을 시스템 작업으로 분리 | 경로 검사·격리·권한 시험은 07·10 |
| 역할 지침은 automation/roles의 Markdown; 실제 Codex 설정은 후속 단계 | 문서 존재와 독립 실행을 구분 | 최신 공식 standalone TOML 형식 확인. 이번에 활성 설정 안 만듦 |
| 초기 원격 실행은 Linux의 공식 Codex GitHub Action으로 통일 | 공식 Action의 인증 프록시와 권한 설정을 사용하고 역할별 실행·검사를 분리 | 공식 Action/비대화형 문서 확인. 정확 SHA·CLI·모델·격리 시험은 07, 유료 실행 없음 |
| 디자인은 기존 DESIGN_BRIEF | 선택 플러그인 부재에도 기본 자료실 구현 가능 | 디자인 도구 연결/생성 안 함 |

구체 계약은 [ARCHITECTURE](ARCHITECTURE.md), [DATA_CONTRACTS](DATA_CONTRACTS.md), [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md), [VERIFICATION_MATRIX](VERIFICATION_MATRIX.md)에 둔다. 이번 설계 확정은 공개·비용·계정·자동화 활성화의 승인이 아니다.

## 2026-09-13 / 02 자료실

- npm workspace의 공개 앱을 TypeScript·정적 HTML/CSS·esbuild ESM으로 구현했다. 관리자 서버 의존성은 추가하지 않았다.
- Ajv 스키마·Node 단위 검사·설치된 Chrome의 Playwright/axe 검사를 사용하고 의존성을 잠금 파일에 고정했다.
- 승인된 콘텐츠가 없으므로 실제 목록은 0개다. 가상 데이터는 별도 검사 서버와 tests에만 두며 공개 빌드에 포함하지 않는다.
- 승인 발급원 미연결 상태에서 로컬 파일을 신뢰하지 않고 공개 선택을 차단한다. 실제 연결은 04의 시스템 작업이다.
- 학년도·교육과정 등 미확정 입력과 기존 단원/ID·참고 목록을 유지했다. 상세 구현·제한은 [CATALOG_IMPLEMENTATION](CATALOG_IMPLEMENTATION.md), 실행 증거는 [STATUS](STATUS.md)에 둔다.
