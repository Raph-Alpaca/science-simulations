# 승인 파일의 실행 인증과 암호화 전달

2026-10-14 로컬 구현·검증 단계다. 최종 교사가 승인한 자료실 파일을 지정한 GitHub 실행에 전달하는 부분이며, 학생용 게시나 게시 권한 소비는 아직 구현하지 않았다. 운영 SQL·환경값·Actions 변수/비밀값은 변경하지 않았다.

## 신뢰 경계

`/api/publication/{manifest,file}`은 제작 worker와 다른 고정 audience를 사용한다. GitHub RSA 서명, 저장소 이름/불변 ID, main, 검토한 커밋, 루트/재사용 워크플로, 첫 실행 번호, 짧은 토큰 수명을 검사한다. 브라우저 쿠키·Origin·다른 역할·재실행·fork·PR·다른 SHA는 거부한다. 별도 `STUDIO_PUBLICATION_API_ENABLED=false`가 기본값이다. report/deploy의 신원 규격만 예약돼 있으며 HTTP 읽기는 prepare만 허용한다.

서버는 검증한 신원과 요청 본문 해시를 좁은 SQL 함수에 전달한다. `studio_publication_artifact_v1.sql`은 publication dispatch 이후 적용할 검토용 proposal이다. 한 트랜잭션 안에서 작업 잠금, submitted 실행/SHA 일치, 현재 교사 승인·원문 근거, 준비/산출물 해시, 토큰 jti 미사용을 확인하고 파일을 읽는다. 철회와 읽기 중 먼저 잠금을 얻은 동작이 기준이며, 이미 전달된 파일이 승인을 되살리지는 않는다. 새로 읽을 때마다 다시 확인하고 토큰 재사용은 거절한다. 전체 receipt는 요청당256개로 제한한다.

manifest 응답은 경로/해시/바이트 합계와 승인·실행 식별자만 포함한다. 원문/소유자/내부 검토 기록은 반환하지 않는다. 각 file 응답은 최대2MiB를 base64로 전달해3,000,000bytes 이하로 제한한다. 이는 [Vercel의4.5MB 요청/응답 상한](https://vercel.com/docs/functions/limitations)을 고려한 것이다. 모든 응답은 private,no-store다.

## 실행기

`studio-publication.yml`은 DB가 발급한 publication_id 하나만 받는다. 저장소·main·첫 실행·명시한 repository variable을 확인한 뒤 고정한 reusable prepare workflow를 호출한다. Contents read/OIDC write만 있으며 Pages write·DB 키·OpenAI 키·생성 코드 실행은 없다. 기존 Pages 흐름과 concurrency group을 공유한다. 활성화하지 않은 상태에서 수동 실행해도 prepare는 skip된다.

prepare는 고정 주소로 최대101회(목록1+파일100),180초,3개 동시 다운로드,요청20초/OIDC5초,응답3MB를 적용한다. 매번 새 토큰을 사용하고 자동 재시도하지 않는다. 전부 내려받아 경로/해시/바이트 합계와 결합한 승인/실행을 확인한 뒤에만 암호화 파일을 쓴다. 부분 다운로드나 철회/응답 유실은 결과물을 만들지 않는다.

파일은 AES-256-GCM/HKDF-SHA256으로 암호화하고, 승인·준비·실행·SHA·제안/산출물 해시를 인증 데이터에 결합한다. 무작위 salt/nonce를 쓰며 전달 키는 신뢰된 래퍼만 가진다. 공개 저장소의 Actions artifact에는 암호문1개만 저장하고 보존 기간은1일이다. 워크플로 출력은 산출물 해시뿐이다. 새로운 디렉터리에만 쓰고 링크/기존 결과 교체를 거절한다. CLI210초, job5분으로 제한한다. 암호화 성공은 게시 허가가 아니다.

GitHub 신원 검증은 [OIDC](https://docs.github.com/en/actions/concepts/security/openid-connect)와 [재사용 워크플로의 job_workflow_ref](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-with-reusable-workflows)를 따른다. 실제 GitHub OIDC와 원격 파일 전달은 아직 실행하지 않았으므로 합성 검사와 구분한다.

## 검증과 한계

- 새 인증7+기존 제작 인증6=13/13, 실제 RSA→HTTP→DB API7/7, 클라이언트5/5, 암호화/파일 준비4/4 PASS. 최대2MiB 이진 바이트, 변조·다른 승인/실행·중복 JWT·철회·응답 크기/시간/횟수·연결 응답 유실·파일 링크/덮어쓰기 거부를 검사했다.
- 실제 PostgreSQL17 독립 연결5/5 PASS, 물리 Lock 대기 확인: JWT 재사용, 승인 철회 양방향, 원문 철회, 마지막 receipt 슬롯 경쟁. 합성 준비 외 실제 검사는 비관리 service_role이고 원문 변경만 합성 관리자다. `.local/release-postgres17-ab44381d-471c-410d-a2d8-7dd03c40b5ea/result.json`, stopped=true/exit0.
- Next production build/TypeScript PASS. 배포 추적8개에서 .local/.env/.git/esbuild 포함0개. 실제 로컬 HTTP의 manifest/file 모두503/PUBLICATION_SETUP_REQUIRED와 private,no-store. 검사 서버 종료 확인. `.local/studio-publication-auth-review-20261014/local-result.json`.
- actionlint1.7.12에서 새 워크플로2개 PASS(shellcheck/pyflakes는 실행하지 않음). 로컬 prepare 첫 합성 자료의 미지원 확장자/필수 catalog 누락은 자료만 수정했다. 샌드박스의 realpath 권한 오류2개는 실제 사용자 문맥에서 같은 검사4개 PASS. 초기 실패 기록은 같은 보호 폴더의 initial-failures.json에 남겼다. 공개 감사의 합성 credential URL 감지는 URL API로 같은 거부 입력을 구성해 해결했고 감사 규칙은 유지했다.

실행 도중 실패하면 submitted/uncertain을 자동 초기화하지 않는다. 공개 검사·배포 직전 승인 소비·원격 상태 조정·실제 게시 바이트 확인·release/job 완료 기록이 남았다. SQL/서비스와 원격 준비만 활성화해도 전체 게시가 완성되지 않으며, 모든 준비 결과는 published=false다. 원문·교사·DB/신원은 합성이므로 실제 교육과정 검토나 교사 승인을 대신하지 않는다.
