# 실제 실행 연결 — 기능 활성화 전 검사

2026-10-14: PR #18과 운영 DB 증분은 적용·검증 완료다. 운영 실행 스위치는 모두 꺼져 있으며 실제 제작·학생용 게시는 아직 없다. GitHub 본인 확인과 Vercel 기존 계정 로그인을 기다리는 동안 아래 검사 도구를 로컬에 준비했다. 상세 실측은 [STATUS](STATUS.md)와 [재개 기록](RESUME_HANDOFF.md)을 따른다.

## 키와 설정의 위치

| 설정 | 등록 위치 | 범위 |
| --- | --- | --- |
| `STUDIO_GITHUB_APP_CLIENT_ID`, `STUDIO_GITHUB_INSTALLATION_ID`, `STUDIO_GITHUB_APP_PRIVATE_KEY` | Vercel 기존 제작실 프로젝트의 Production 서버 환경만 | App은 Raph-Alpaca 소유, science-simulations 저장소 한 개 선택, Actions write / Contents read / Metadata read. Webhook·사용자 OAuth 불필요. Preview와 생성 코드에는 제공하지 않는다. |
| `OPENAI_API_KEY` | 해당 GitHub 저장소의 Actions secret | 기존 DPAPI 저장·GET 인증 완료 키. configuration 형식 확인과 신뢰된 generate job에서만 사용한다. 검사 컨테이너에는 제공하지 않는다. |
| `STUDIO_TRANSFER_KEY` | 해당 GitHub 저장소의 Actions secret | 기존 DPAPI 저장·왕복 확인한 32바이트 키. 신뢰된 파일 봉인/해제 래퍼에서만 사용한다. Vercel·생성 모델·검사 컨테이너에는 필요 없다. |
| `STUDIO_WORKER_TRUSTED_SHAS`, `STUDIO_PUBLICATION_TRUSTED_SHAS` | Vercel Production 서버 환경 | 실제 검토한 main 40자리 SHA. 문서 커밋을 포함해 main이 바뀌면 별도로 검토한다. 자동으로 최신 main을 신뢰하지 않는다. |

기존 Supabase·교사·origin 환경값은 유지한다. 키 등록은 활성화와 다른 단계다. App 권한/키 등록의 정확한 범위를 확인한 뒤 진행하며, 로그인 자체를 환경 변경 승인으로 간주하지 않는다. 로컬 OpenAI 인증과 제한된 Linux 검사를 반복하지 않는다.

## App 메타데이터 검사

`automation/studio/app-connection.mjs`의 `probeAppConnection`은 기능 스위치를 바꾸지 않고 GET 최대6회만 보낸다. App JWT로 `/app`과 고정 저장소의 `/installation`을 확인하고, 인증 없는 공개 조회로 저장소 ID·소유자 ID·main SHA·제작/게시 workflow를 검사한다. App Client ID/설치 ID/권한·중지 여부·선택 저장소 방식·불필요한 event 구독을 대조한다. JWT는 앞의 두 고정 App 주소에만 전송한다.

설치 토큰 발급, workflow dispatch, DB 쓰기, 모델 호출, 게시 요청은 하지 않는다. 응답에 들어 있는 URL은 따라가지 않는다. 총20초, 요청마다5초, 응답마다128KiB로 제한하며 재시도하지 않는다. TLS/호스트 검증과 리다이렉트 금지를 유지한다. 실패 결과에는 고정 단계·코드만 남기며 키·JWT·응답 본문·공급사 오류 원문을 출력하지 않는다.

PowerShell의 보호된 로컬 래퍼가 DPAPI를 메모리에서 복호화한 뒤 `node --use-system-ca automation/studio/app-connection-cli.mjs --stdin`의 표준 입력으로 네 문자열 `appClientId`, `installationId`, `privateKey`, `expectedSha`를 전달한다. 명령 인수나 평문 파일에는 넣지 않는다. CLI 입력은32KiB/5초, 프로세스 전체25초다. 실행 전 단일 시도 표식을 생성하고 응답 유실 시 표식을 지우지 않는다.

공식 계약: [인증된 App 조회 및 저장소 설치 조회](https://docs.github.com/en/rest/apps/apps?apiVersion=2026-03-10#get-a-repository-installation-for-the-authenticated-app). 해당 조회는 JWT를 사용하며 설치의 계정·권한·선택 방식 정보를 제공한다. 이 도구는 **설치에 선택된 저장소의 전체 개수**를 검증하지 못하므로 실제 설치 화면에서 한 개만 선택됐는지 별도로 확인한다.

`metadata_verified`는 연결 메타데이터 검증일 뿐 전체 준비 완료가 아니다. 반환값의 `executionReady`는 항상 false다. 실제 secret 등록, 설치의 저장소 개수, Actions/OIDC 왕복, 유료 제작, 원문 검토/교사 최종 승인과 게시 확인은 별도 증거가 필요하다. 이 도구 때문에 제작·게시 스위치를 켜지 않는다.

## 다음 실제 순서

1. 사용자 GitHub 본인 확인·기존 Vercel 로그인 후 App 생성/설치의 정확한 권한·대상을 검토한다. App private key는 서버 전용으로 보호한다.
2. App의 설치 화면을 확인하고, 보호된 래퍼로 위 메타데이터 검사를 한 번 수행한다. 현재는 실제 App이 없어 원격 검사 미실행이다.
3. 등록 범위를 확인한 키를 정확한 서비스/Production에 등록하고 이름·환경 범위를 확인한다. 값은 출력하지 않는다. 실행 기능은 비활성으로 유지한다.
4. 최신 모델·가격과 월10,000원/10건·작업당1,000원 제한을 확인한 뒤, 교사의 공개 가능한 과제·원문 근거·비용 동의가 있는 첫 제작1건의 실행 범위를 확정한다.
5. 실제 제작/독립 검토/필요한 수정과 교사 수정 요청의 왕복, 최종 버전 승인·동일 파일 게시·실제 게시 확인을 검증한다. 게시 결과가 불확실하면 기존 전송을 반복하지 않고 별도 관찰/조정 흐름을 구현한다.

이 문서와 검사 코드는 로컬 준비 상태이며 새 공개 업로드·재배포·운영 환경 변경을 수행한 증거가 아니다.
