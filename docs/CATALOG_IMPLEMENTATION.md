# 02 자료실 구현 기록

2026-09-13. 01의 구조·데이터 계약을 유지한 로컬 구현이다. 학교 운영 전체 시스템의 완료나 실제 콘텐츠의 승인·게시를 뜻하지 않는다.

## 구현과 파일

| 위치 | 역할 |
|---|---|
| apps/catalog/index.html, src/main.ts, src/styles.css | 한국어 화면, 메타데이터 카드, 학년·단원·검색, 상태 안내, 반응형 스타일 |
| packages/contracts/meta.schema.json, index.js | 엄격한 메타데이터 스키마·학년/단원/출처 일관성·승인 근거 검사 |
| packages/contracts/catalog.js | DOM과 분리한 필터 계산·URL 상태 해석 |
| config/catalog.json | 공통 학년 표기, 기존 주제 단원, /science-simulations/ 경로 |
| automation/catalog/content.mjs | 콘텐츠 파일 목록·해시·경로·링크·승인 입력 검사 |
| automation/catalog/build.mjs, validate.mjs, serve.mjs | 검사·정적 빌드·루프백 서버 |
| tests/unit, tests/e2e, tests/fixtures | 단위·Chrome·별도 가상 자료 검사 |
| package.json, package-lock.json, 각 workspace package.json, tsconfig.json, playwright.config.mjs | 실행 명령·고정 의존성·타입·브라우저 검사 설정 |

공개 데이터의 입력 위치는 `content/simulations/<stable-id>/meta.json`이다. 현재 실제 콘텐츠는 0개이며 유전 폴더를 생성하지 않았다. 검사를 통과한 입력만 카드 변환 대상으로 삼고, 공개 승인되지 않은 파일은 빌드에 복사하지 않는다. 제목과 ID는 독립적이며 실행 주소는 ID와 entry로 만든다. 화면은 메타데이터를 HTML 삽입 없이 텍스트로 표시한다.

학년 전체/중1/중2/중3, 학년에 맞는 단원, 여러 검색어의 AND 검색, 조건 초기화, URL 검색 조건 복원, 결과 수 안내를 구현했다. 공개 자료 없음·검색 결과 없음·데이터 읽기 실패를 구분한다. 키보드 포커스·건너뛰기·동작 줄이기·모바일/태블릿 너비를 지원한다. 외부 폰트·CDN·분석 호출은 없다.

`생식과 유전`은 기존에 정해진 중3 첫 주제를 공통 설정에 반영한 것이다. 전체 학년별 교육과정 단원표나 적용 교육과정 검토 완료를 뜻하지 않는다. 학년도·교육과정·교과서·권리·비용 상한은 미확인이다.

## 공개 경계와 검사 한계

메타데이터 stage의 자기 선언은 승인이 아니다. 순수 승인 검사에서는 콘텐츠 SHA-256, 산출물 SHA-256, 정책·근거 해시, 교육과정/교과서/권리/과학/학습/동작 판정을 결합하며 잘못된 해시를 거절한다. 테스트용 승인 값은 합성 데이터다.

**현재 신뢰된 승인 발급원은 연결하지 않았다.** 실제 빌드는 기본적으로 승인 목록을 비워 두며, 로컬 `automation/publish/approved-content.json`에 비어 있지 않은 값을 넣어도 `TRUSTED_APPROVAL_SOURCE_NOT_CONFIGURED`로 실패한다. 따라서 로컬 파일을 스스로 승인으로 삼아 공개할 수 없다. 04에서 신뢰된 Git/승인 입력과 실제 게시 버전을 연결·검증해야 한다. 실제 승인 발급·게시 통합이 완료됐다고 보고하지 않는다.

메타데이터 필수값·타입·추가 속성, ID/폴더/단원/출처, 경로 이탈, 누락 entry, 정적 링크, 링크된 파일과 fragment를 검사한다. symlink/junction/하드링크를 거절한다. 패키지 최대 200개, 패키지당 파일 100개·10MiB, 파일당 2MiB, 깊이 6을 코드로 제한한다. 허용 확장자만 복사하고 출력 정리도 지정된 빌드/검사 경로로 제한한다.

정적 링크 검사는 HTML/SVG 속성, CSS url/import, JS 리터럴 import를 대상으로 한다. 임의 JS의 동적 네트워크 호출·악성 동작을 완전히 판정하는 보안 격리기는 아니다. 생성 코드 격리·권한·비용/작업 상한은 07 등의 별도 검증 대상이다.

현재 공개 산출물은 index.html, catalog.json, assets/app.js, assets/styles.css 네 파일이고 cards는 0개다. 원본 문서·테스트·미승인 실행 파일은 들어가지 않는다. 로컬 서버는 dist/catalog만 제공하며 잘못된 경로는 404다. 실제 Git 제외/과거 이력 검사와 GitHub Pages 배포는 미실행이다.

## 실행과 검증

정확한 실행 폴더와 PowerShell 명령은 [README](../README.md#로컬-실행)에 있다. 서버는 127.0.0.1에만 바인딩한다. 자동 갱신 서버가 아니므로 수정 후 재시작한다.

- 공개 확인: http://127.0.0.1:4173/science-simulations/
- 분리된 가상 자료 확인: http://127.0.0.1:4175/science-simulations/ — 화면에 검사용임을 표시한다.
- 자동 브라우저 검사는 4174/4175를 사용한다. 수동 검사용 서버를 먼저 종료한다.
- 결과: validate·typecheck·build 성공, 단위 16/16, Chrome E2E 9/9. 상세 실패 이력·미검증은 [STATUS](STATUS.md).
- `.local/catalog-tests`에 화면 캡처와 최초 브라우저 실패 증거, `playwright-report`에 최종 HTML 결과가 있다. 로컬 검사 자료는 공개 빌드에 포함되지 않는다.
- Chrome에서 하위 경로·직접 주소·새로고침·검색/복합 필터·빈 상태·오류/재시도·텍스트 XSS 방어·키보드·axe 자동 접근성 검사를 수행했다. 390×844, 768×1024, 1024×768에서 가로 넘침과 필터를 검사했다.
- 실제 태블릿·Firefox/WebKit·스크린리더·수동 브라우저 확대·실제 Pages 호스팅은 미검증이다. 자동 접근성 성공만으로 모든 접근성이 검증되었다고 간주하지 않는다.

Node 24.15.0 / npm 11.12.1에서 프로젝트 설치를 수행했다. esbuild 0.28.2, TypeScript 7.0.2, Ajv 8.20.0, Playwright 1.63.0, axe Playwright 4.13.0, parse5 8.0.1을 잠금 파일로 고정했다. 전역 설치·실행 정책 변경·관리자 시스템 설정 변경은 하지 않았다.

공식 문서 확인 범위: [esbuild 빌드](https://esbuild.github.io/getting-started/), [Playwright 설정](https://playwright.dev/docs/test-configuration), [접근성 검사](https://playwright.dev/docs/accessibility-testing), [Ajv 검증](https://ajv.js.org/guide/getting-started.html). 패키지 버전·엔진 요구사항은 npm 공식 레지스트리에서 조회했다. 교육 원문 검토를 대신하지 않는다.
