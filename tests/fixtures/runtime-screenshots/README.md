# 실행 화면 검사 이미지

`390.jpg`, `1440.jpg`는 저장소의 `tests/studio/runtime-fixture.mjs`에 직접 작성한 2D 합성 검사 화면을 로컬 Chromium으로 촬영한 JPEG다. 실제 사용자 과제, 외부 원문, 운영 데이터, AI 생성 결과가 아니다. 높이는 900px다.

`WRITE_SCREENSHOT_FIXTURES=true`로 `node tests/studio/runtime-screenshot-check.mjs`를 실행한 경우에만 갱신한다. 기본 실행은 비공개 `.local/evidence/screenshots`에 검사 결과만 남긴다. 폰트·브라우저에 따라 픽셀은 달라질 수 있으며 테스트는 고정 픽셀 비교를 하지 않는다.

결과 서비스와 화면 검사는 이 이미지를 합성 작업의 서명된 검사 기록에 넣어 버전 연결·권한·표시를 확인한다. 해당 합성 작업의 HTML을 실제로 실행하거나 과학적 정확성을 검토했다는 의미는 아니다.
