# 같은 파일 게시와 실제 공개 확인

2026-10-14 로컬 구현·검증 기록. 운영 SQL과 기능 스위치는 적용하지 않았다. `studio_publication_completion_v1.sql`은 authority proposal 다음의 검토안이다. 실제 Pages 전송과 운영 인증 연결은 아직 실행하지 않았다.

## 구현한 흐름

전용 `github-pages` 환경에서 최신 교사 승인을 한 번 소비한 뒤, 검사를 통과한 파일을 재빌드 없이 업로드한다. 신뢰된 호스트에서 파일 전체 해시를 다시 확인하고 같은 실행·SHA·저장소의 artifact만 Pages API에 전달한다. 생성 코드는 이 권한 있는 job에서 실행하지 않는다. 기존 빈 목록 게시 workflow는 검사 전용으로 바꿔 게시 권한과 업로드 경로를 제거했다.

새 workflow는 기존 게시 스위치와 별도의 `STUDIO_PUBLICATION_DEPLOY_ENABLED`가 모두 true이고 main의 첫 수동 실행일 때만 동작한다. DB의 `publication_deploy_enabled()`도 기본 false다. 코드 병합만으로 기능이 켜지지 않는다. 게시 job에만 contents/actions 읽기·Pages 쓰기·OIDC 권한을 주며, API 토큰은 고정 GitHub API 호출 단계에만 전달한다.

Pages 배포 요청은 최대1회다. 같은 실행의 artifact ID·이름·SHA·저장소·만료·12MiB 한도를 먼저 검사한다. 배포 상태 조회는 최대12회, 간격10초, 요청10초, OIDC5초, 전체180초다. 응답은16KiB로 제한하고 응답에 포함된 URL을 따라가지 않는다. 전송 시도 표식은 요청 전에 배타적으로 저장한다. 응답 유실·타임아웃 때 POST를 다시 보내거나 자동 취소하지 않는다.

공급사의 성공 응답 뒤 고정 공개 주소에서 파일별 바이트와 자료실 진입점을 직접 확인한다. 전체20초·요청당5초·최대101요청·10MiB 한도이며 로그인 정보는 보내지 않는다. 서버의 배포 성공만으로 게시 완료로 판정하지 않는다. 검증 결과와 승인·실행·파일 해시를 결합한 결과만 완료 API에 한 번 전송한다. 결과20KiB·요청24KiB·응답8KiB, 완료 CLI55초 취소/60초 종료, 게시 CLI220초 취소/230초 종료를 적용한다.

실제 공개 바이트 일치가 확인되면 SQL 트랜잭션 하나에서 불변 결과·release·작업 상태·자료실 기준·완료 이벤트를 기록하고 전역 게시 슬롯을 해제한다. 같은 결과의 재기록은 release나 이벤트를 중복 생성하지 않는다. 실패/불확실한 측정은 이력으로 저장하고 슬롯과 승인 소비를 유지한다. 서로 다른 측정은 최대8개, 확인 성공은1개다. 권한을 소비하기 전의 불변 실행 검사 실패는 공개 파일을 올리지 않고 접수를 종료한다.

제작실은 검사 중/검사 실패/전송 준비/공개 확인 대기/게시 확인 완료를 구분하고, 실제 확인된 버전의 주소만 완료 화면에 표시한다. 게시 후 수정 요청은 기존 게시본을 보존하면서 새 작업·새 비용 동의·새 버전 승인으로 진행한다.

## 검사와 한계

- 로컬 새 검사21개 PASS: Pages 클라이언트6, 결과 계약2, 게시 래퍼4, 완료 SQL/API6, 완료 래퍼3. 공통 회귀25개도 PASS, 합계46개다. 합성 Pages/공개 HTTP와 실제 암호화·서명·SQL을 사용했으며 실제 Pages 전송은 아니다.
- 실제 PostgreSQL17 독립 연결 경합6개 PASS, 서버 종료 확인. JWT 재사용·같은 결과 재전송·불확실 결과와 성공 순서·성공 후 오래된 결과·출처 철회 양방향을 검사했다. `.local/release-postgres17-da92d32e-d6f0-4c31-9dee-9f37973a0bfd/result.json`.
- Chrome 새1+기존3=4개 PASS. 확인 대기→게시 주소→후속 수정, 승인 소비 경계와 기존 승인 화면을 검사했다. 인증은 합성이며 운영 로그인 검사가 아니다.
- Next build/TypeScript, 배포 추적8개·금지 경로0, 비활성 HTTP5개·private,no-store, workflow3개 actionlint PASS. 앱·브라우저·DB 종료 확인.

초기 완료 SQL의 변수와 컬럼 이름 충돌(42702)로3개 검사가 실패했다. 지역 변수 이름을 `is_verified`로 고친 뒤 동일 검사를 통과했다. 실패 증거는 `.local/studio-publication-deploy-review-20261014/initial-failures.txt`에 보존했다. 검사 삭제·승인 조건 완화는 없다.

**미구현:** 나중 실행에서 불확실한 게시를 관찰·조정하는 운영 경로. DB는 후속 측정을 허용하지만 현재 OIDC는 최초 실행에 결합되므로 새 workflow를 재실행해서 해결할 수 없다. 수동으로 claim/전역 슬롯/시도 표식을 지우지 않는다. 게시 이후 내리기·복구도 별도 작업이다. DB와 외부 배포를 원자적으로 취급하지 않는다.

운영 승인/준비/게시 SQL, GitHub App/전달 키 설정, 기능 활성화, 실제 제작·원문 검토·교사 최종 승인·학생용 게시는 남아 있다. 이번 작업의 운영 SQL·환경/키·유료 AI·학생용 게시 변경은0회다. Linux 새 검사1/1·기존 제작4/4·누적8 상한을 유지하며 이번 새 workflow는 실제 Linux에서 실행하지 않았다.

## 확인한 공급사 계약

[GitHub Pages REST](https://docs.github.com/en/rest/pages/pages?apiVersion=2026-03-10), 고정 버전의 [deploy-pages API 클라이언트](https://github.com/actions/deploy-pages/blob/368f82528645a54fb793d4d04e342629a3f51346/src/internal/api-client.js)·[상태 처리](https://github.com/actions/deploy-pages/blob/368f82528645a54fb793d4d04e342629a3f51346/src/internal/deployment.js), [upload-pages-artifact 출력](https://github.com/actions/upload-pages-artifact/blob/fc324d3547104276b827a68afc52ff2a11cc49c9/action.yml)을 확인했다. 실제 계정의 Pages 설정·환경 보호·원격 토큰 계약은 활성화 전에 검증해야 한다.
