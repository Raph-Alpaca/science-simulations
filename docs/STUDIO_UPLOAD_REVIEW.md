# 05·06 업로드 후보 검토

2026-09-15. **선별 검토용 목록이며 아직 stage/commit/push하지 않았다.** main HEAD는 `34280e883ea94570daf9b6f0659c6898f5a2fae9`, origin은 기존 `Raph-Alpaca/science-simulations`이다. 05부터 쌓인 미커밋 구현과 문서를 보존했다. 다음 업로드 승인 시 변경 내용을 다시 확인하고 이 범위만 선별한다. `git add .`로 로컬 자료까지 일괄 추가하지 않는다.

## 수정된 기존 파일 후보

```text
.env.example
.gitignore
README.md
docs/DATA_CONTRACTS.md
docs/OWNER_INPUT.md
docs/STATUS.md
package.json
package-lock.json
```

루트 패키지/잠금 파일과 DATA_CONTRACTS의 제작실 구현 변경은 05에서 이어진 것이다. 이번06은 런타임 코드를 수정하지 않았다. `.gitignore`에는 앞으로 생길 `.vercel/` 설정·환경 캐시 제외만 보완했다. 환경 예시는 실제 값 없이 현재 앱의6개 변수와 후속 단계 템플릿을 구분한다.

## 새 파일 후보

```text
apps/studio/.env.example
apps/studio/AGENTS.md
apps/studio/CLAUDE.md
apps/studio/app/api/studio/[...path]/route.ts
apps/studio/app/layout.tsx
apps/studio/app/page.tsx
apps/studio/app/studio.css
apps/studio/app/studio.tsx
apps/studio/lib/config.ts
apps/studio/lib/domain.mjs
apps/studio/lib/login-error.mjs
apps/studio/lib/logout.mjs
apps/studio/lib/service.ts
apps/studio/lib/supabase.ts
apps/studio/next-env.d.ts
apps/studio/next.config.mjs
apps/studio/package.json
apps/studio/tsconfig.json
automation/studio/preflight.mjs
docs/STUDIO_SETUP.md
docs/STUDIO_SQL_REVIEW.md
docs/STUDIO_UPLOAD_REVIEW.md
docs/VERCEL_PREPARATION.md
playwright.studio.config.mjs
supabase/proposals/README.md
supabase/proposals/studio_v1.sql
tests/studio/browser/studio.spec.mjs
tests/studio/domain.test.mjs
tests/studio/login-error.test.mjs
tests/studio/logout.test.mjs
tests/studio/preflight.test.mjs
tests/studio/sql-contract.test.mjs
```

Next가 생성한 AGENTS/CLAUDE/next-env 선언 파일은 코드용 안내·타입 참조이며 인증 데이터가 아니다. tests의 fixture는 가상 사용자/모의 작업이며 실제 A/B 토큰이나 대화 사본이 아니다. SQL 변경안은 정의만 포함하며 실제 교사 UUID, 계정·대화 덤프가 없다. 이미 적용된 SQL을 업로드/배포 시 자동 실행하는 스크립트는 없다.

## 업로드에서 제외

- `apps/studio/.env.local`, 실제 값이 있는 모든 `.env*`(빈 예시 제외).
- `.local/` 전체: 브라우저 검사 도구, 세션 정리 도구, 읽기 전용 검사 결과, 로그, 후보 목록과 감사 결과. 이 폴더에 있는 모든 파일을 공개 대상에서 제외한다.
- `.vercel/`, `apps/studio/.vercel/`: 향후 연결 설정/환경 캐시.
- `references/2022 개정 과학과 교육과정.pdf`와 원문 파일, 개인 메모, 원본 녹음, 인증 파일.
- `node_modules/`, `apps/studio/.next/`, `dist/`, `playwright-report/`, `test-results/`, coverage와 `*.log`.

기존 tracked 파일과 현재 untracked 후보를 모두 감사했다. 금지 경로·키 패턴 및 실제 로컬 키/허용 교사 식별값의 비출력 대조에서 문제를 발견하지 않았다. 환경파일은 검사 프로그램 내부에서만 읽었으며 값은 보고서/로그에 남기지 않았다. 이것은 현재 스냅샷 검사다. 최종 스테이징에 새 파일이 생기면 재검토한다.

## 저장소 공개와 사이트 배포의 구분

기존 `content/simulations/mendel-inheritance/`의5개 유전 초안 소스는 이미 Public 저장소에 있는 파일이며 이번에 삭제하거나 비공개로 바꾸지 않는다. 정식 Pages 빌드에서는 제외된다. 제작실 원본 코드·보안 설계·검사·SQL 정의도 위 후보를 Public 저장소에 업로드하면 공개된다. 비밀값과 실제 데이터는 포함하지 않는다.

Vercel은 Root Directory=apps/studio의 Next 빌드만 제공한다. 루트 잠금 파일/공유 도구를 빌드에서 읽는 것과 저장소를 통째로 정적 제공하는 것은 다르다. 후보 시뮬레이션 코드를 제작실 인증 origin으로 복사/실행하지 않는다. Pages는 현재와 같이 검증된 `dist/catalog`의4파일·0카드만 배포한다.

[배포 설정·환경변수·남은 검증](VERCEL_PREPARATION.md)을 확인한 뒤 기존 저장소의 선별 커밋·push를 별도 승인받는다. 이번에는 원격 연결 변경·새 저장소/프로젝트 생성·업로드·배포를 수행하지 않았다.
