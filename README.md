# science-simulations — 과학 시뮬레이션 제작실

02단계 공개 자료실과 03단계 유전 로컬 시제품을 구현했습니다. 승인된 교육 콘텐츠가 없어 정식 공개 목록은 비어 있습니다. 04단계 빈 자료실 게시와 05단계 제작실의 실제 Supabase 연결을 확인했습니다. 현재 06단계 Vercel 배포 전 준비만 진행했으며 제작실은 아직 배포하지 않았습니다.

VS Code로 이 폴더를 열고 Codex에 입력하세요.
> setup/00_environment.md를 읽고 현재 단계만 진행해 주세요.

00→01→02→03→04→05→06→07→08→09→10 순서입니다. 11은 운영, 12는 재개, 13은 실시간 음성 확장입니다. 한 번에 전부 실행하지 마세요.

먼저 docs/OWNER_INPUT.md, references/source_index.json, docs/DESIGN_BRIEF.md를 확인합니다.
비공개 원문은 .local/reference에만 두고 Git 제외 여부를 검사하세요. 실제 키는 .env.local 또는 공급사 Secret에 넣으며 채팅·커밋·로그에 넣지 않습니다.

GitHub의 기존 저장소를 origin으로 연결했습니다. 초기 AI_EXECUTION_ENABLED=false, AUTO_PUBLISH=false입니다. 유료 호출과 학생용 사이트 공개는 별도 확인 후 진행합니다.

## 현재 상태 — 2026-09-15

공개 자료실 주소는 https://raph-alpaca.github.io/science-simulations/ 입니다. 사용자가 04 build·deploy 성공을 보고했고, 실제 게시 화면·빈 목록·검색 복원·유전 초안 주소404를 직접 확인했습니다. 기존 Public 저장소의 이력을 유지하며 05 제작실 변경은 아직 로컬 미커밋 상태입니다. 실제 결과와 미검증 항목은 [docs/STATUS.md](docs/STATUS.md)에 기록합니다.

로컬은 Windows PowerShell입니다. npm 명령은 `npm.cmd`로 실행하고 PowerShell 실행 정책은 변경하지 않습니다. WSL 명령과 혼용하지 않습니다.

- [시스템 구조](docs/ARCHITECTURE.md)와 [파일·데이터 계약](docs/DATA_CONTRACTS.md)
- [단계별 구현 계획](docs/IMPLEMENTATION_PLAN.md)과 [검증 매핑](docs/VERIFICATION_MATRIX.md)
- [운영 규칙](docs/OPERATIONS.md), [결정 기록](docs/DECISIONS.md), [도구 확인](docs/TOOLS.md)
- [사용자 입력·학년별 검증표](docs/OWNER_INPUT.md)와 [역할 지침](automation/roles/README.md)

학년도·교육과정·교과서·비용은 미확인으로 유지합니다. 유전 초안은 공개 Git 소스에 포함되지만 정식 사이트 배포에서는 제외합니다. 05·06 변경은 미커밋이며 커밋·push·Vercel 연결·배포는 별도 승인 후 진행합니다. [Vercel 배포 준비](docs/VERCEL_PREPARATION.md)와 [업로드 후보](docs/STUDIO_UPLOAD_REVIEW.md)를 확인하세요.

## 05 교사용 제작실 — 실제 연결된 로컬 모의 실행

주소: http://127.0.0.1:3000/

프로젝트 루트의 PowerShell에서 `npm.cmd run dev:studio`로 실행합니다. 이 PC에서는 기존 프로세스 한정 시스템 CA 설정이 필요하며 [연결 안내](docs/STUDIO_SETUP.md)를 따릅니다. 실제 A 로그인·저장·갱신·로그아웃과 주요 테이블의 A/B 격리를 확인했습니다. A만 이용 가능하고 B는 비활성·허용 목록 제외·잔여 세션0개입니다. 실제 AI 호출·승인·공개는 없는 모의 제작실입니다. B 앱 버튼 로그아웃, 자연 만료, reviews/approvals/releases 실재 행의 실제 사용자 토큰 조회는 미검증으로 유지합니다.

환경파일은 `apps/studio/.env.example`을 참고하며 기존 **apps/studio/.env.local**은 덮어쓰지 않습니다. 비밀값은 공개 파일에 넣지 않습니다. [Supabase 메뉴·환경변수·SQL 안내](docs/STUDIO_SETUP.md)의 과거 SQL 준비 절을 따라 이미 완료한 적용·계정 생성을 반복하지 마세요.

## 로컬 실행

VS Code 상단 **터미널 → 새 터미널**에서 PowerShell을 열고 실행합니다.

```powershell
Set-Location -LiteralPath 'C:\Users\user\Desktop\science-simulations'
npm.cmd run dev:catalog
```

브라우저 주소: http://127.0.0.1:4173/science-simulations/

서버는 시작할 때 빌드합니다. 파일 변경 후에는 터미널에서 Ctrl+C로 종료하고 같은 명령을 다시 실행합니다. 이미 서버가 실행 중이면 주소만 여세요.

카드가 있는 화면은 별도 검사용입니다. **터미널 → 새 터미널**에서 같은 폴더로 이동한 뒤 `npm.cmd run test:fixtures`를 실행하고 http://127.0.0.1:4175/science-simulations/ 을 엽니다. 이 화면의 가상 자료는 공개 빌드에 포함되지 않습니다.

| 명령 (프로젝트 루트에서 실행) | 목적 |
|---|---|
| `npm.cmd ci` | 잠금 파일 기준 프로젝트 의존성 재설치; 현재 설치 완료 |
| `npm.cmd run validate` | 메타데이터·경로·링크·공개 입력 검사 |
| `npm.cmd run typecheck` | 자료실 타입 검사 |
| `npm.cmd run test` | 계약·필터·빌드 단위 검사 |
| `npm.cmd run build:catalog` | dist/catalog 정적 빌드 |
| `npm.cmd run preview:catalog` | 기존 빌드를 4173에서 열기 |
| `npm.cmd run test:e2e` | 설치된 Chrome으로 브라우저·접근성 검사; 4174/4175 포트 사용 |

브라우저 검사 전에 직접 실행한 검사용 4175 서버를 Ctrl+C로 종료하세요. [구현·검증 상세](docs/CATALOG_IMPLEMENTATION.md)에 파일 구조와 제한 사항을 기록했습니다.

## 03 유전 로컬 시제품

유전 콘텐츠는 **교육과정·교과서 대조 미완료인 개발 초안**이며 정식 배포 대상이 아닙니다. 소스 코드가 저장소에 포함되더라도 정식 공개 목록과 dist/catalog에서는 계속 제외합니다.

- 시제품: http://127.0.0.1:4176/science-simulations/simulations/mendel-inheritance/index.html
- 초안 카드가 있는 로컬 자료실: http://127.0.0.1:4176/science-simulations/

서버가 꺼져 있으면 VS Code **터미널 → 새 터미널**의 PowerShell에서 실행하세요.

```powershell
Set-Location -LiteralPath 'C:\Users\user\Desktop\science-simulations'
npm.cmd run dev:genetics
```

시작할 때 미리보기를 생성합니다. 직접 실행한 서버는 Ctrl+C로 종료하며 수정 후 같은 명령으로 재시작합니다. 이미 서버가 있으면 주소만 열면 됩니다. 이번 작업에서 숨김 서버 PID 55068을 시작했습니다. 필요할 때 PowerShell에서 `Get-Process -Id 55068`로 Node 프로세스임을 확인한 뒤 `Stop-Process -Id 55068`로 종료할 수 있습니다. 컴퓨터 재시작 후에는 이 PID를 재사용하지 말고 위 실행 명령을 사용하세요.

검사: `npm.cmd run test:genetics` (4177 포트), `npm.cmd run test` (계산·계약), `npm.cmd run test:e2e` (기존 자료실). [역할·학습 활동·미확인 자료](docs/GENETICS_PILOT.md)를 확인하세요.
