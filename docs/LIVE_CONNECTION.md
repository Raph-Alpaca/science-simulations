# 실제 실행 연결 — 기능 활성화 전 검사

**2026-10-14 20:30 최신:** 등록한 키를 사용해 제작을 켜기 전에, 실제 GitHub OIDC의 두 실행 역할을 비밀 없이 검증하는 [connection 모드](OIDC_CONNECTION_CHECK.md)를 준비했다. 관련20개와 YAML3개 PASS, 실제 원격 실행은 아직 없다. main 대비18개 공개/PR·병합/재배포와 새 검사1회가 다음 검토 범위다. 이번 키 등록 완료를 전체 실행 준비 완료로 확대하지 않는다.

**2026-10-14 20:20 최신:** Vercel Production App 설정3개 전송·등록을 사용자가 명시 승인했고 실제 등록과 원격 검증을 완료했다. 모두 Secret/Production이며 기존6개 메타데이터 보존 PASS. App 생성/한 저장소 설치·새 키 보호/이전 키 삭제·App 조회1회·Actions secret2개·Vercel App 설정3개 연결 준비가 완료됐다. 재배포/기능 활성화/OIDC 실제 왕복/유료 제작/학생 게시는 아직 없다. 아래 등록 차단/대기 문구는 과거 이력이다.

**사용량 기준 변경(2026-10-14):** 최신 사용자 응답에 따라 남은30%를 보존하고33~35%부터 정리한다. Vercel App 설정3개 전송 승인은 별도 대기 중이다. 아래50%는 이전 기준이다.

**2026-10-14 20:15 최신:** 이전 App 키 삭제·새 키 하나 유지와 Vercel CLI 인증 성공을 실제 확인했다. 기존 프로젝트/Production6개 설정 및 추가할3개 이름 부재 확인 PASS. App 설정3개를 Vercel로 전송하는 실행은 구체적 비밀값/목적지 승인이 없다는 자동 승인 검토로 차단돼 미실행이다. 정확한 대상은 기존 alpaca-t/science-simulations-studio의 Production, 세 App 항목 모두 Secret 형식이다. 검토 문서 `.local/studio-setup-20261014/vercel-app-registration-review.md`의 명시 승인 후 이어간다. 재배포/기능 활성화는 제외한다. 사용량53% 남음,50% 보존. 아래 최신 표시들은 각 시점의 이력이다.

**2026-10-14 20:06 최신:** 새 App 키의 GitHub 지문 대조·DPAPI 저장/복원·평문 제거와 실제 App 메타데이터 조회1회(GET6회) PASS. 이전 미확보 키 정리는 사용자 응답 대기다. Vercel 새 로그인 요청도 확인 대기이며 Production 설정3개 등록은 아직 없다. App 검사/OpenAI 인증/Actions secret 등록을 반복하지 않는다. 사용량54%를 남긴 상태로 정리 중이며 실행 기능은 계속 비활성이다.

**2026-10-14 19:22 최신:** CLI 로그인은 인증 파일 없이 exit1 종료됐으며 원인을 단정할 추가 로그는 없다. 기존 확인 탭을 닫았고 자동 재시작하지 않았다. 사용자 준비 응답 뒤 새 로그인 요청으로 이어간다. App 키 파일도 아직 필요해 작업은 입력 대기로 중단했다. 사용량55%를 남겼으며 아래 완료/미완료 범위는 유지한다.

**2026-10-14 19:18 최신:** 사용자가 구체적인 연결 범위를 승인해 App 생성/저장소1개 설치와 Actions secret2개 등록·이름/시각 검증을 완료했다. App 첫 개인키는 발급됐으나 브라우저 다운로드 차단으로 확보 미확인: 사용자 직접 새 키 다운로드와 기존 미확보 키 정리가 필요하다. Vercel CLI 로그인 확인도 대기다. App 개인키 DPAPI·실제 조회 검사·Vercel 설정3개 등록은 아직 미완료이며 기능은 계속 비활성이다. [재개 기록](RESUME_HANDOFF.md)의 최신 절을 우선한다.

**2026-10-14 13:22 최신:** GitHub 본인 확인과 기존 Vercel 로그인을 실제 확인했다. 새 App 접근 권한/키 등록 범위에 대한 승인 질문을 제출했고 답변 대기다. GitHub App은 아직 미생성이고 키/환경 변경도 없다. Production 프로젝트 ID prj_sneEZSgi9cWcn6Ryg7WBZDcyi4tR에서 기존6개 변수 이름만 확인했다. CLI64.0.2는 로컬 설치/도움말 확인 완료이며 인증은 별도 미완료다. 아래 로그인 대기 문구는 최초 준비 당시 이력이다.

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

1. 완료: GitHub App 생성/저장소1개 설치, 새 개인키 보호/평문 제거, 이전 키 삭제와 Vercel CLI 인증 확인. 완료 절차를 반복하지 않는다.
2. 완료: App 설치 범위 UI 확인과 실제 메타데이터 조회1회(GET6회) PASS. 시도 표식을 보존하며 다시 실행하지 않는다. Actions secret2개도 등록·이름 확인 완료다.
3. 완료: 명시 승인 후 Vercel Production App 설정3개 등록·이름/Secret 타입/대상·기존6개 보존 검증 PASS. 실행 기능은 비활성이며 재배포/실제 OIDC 왕복 확인은 다음 단계다.
4. 최신 모델·가격과 월10,000원/10건·작업당1,000원 제한을 확인한 뒤, 교사의 공개 가능한 과제·원문 근거·비용 동의가 있는 첫 제작1건의 실행 범위를 확정한다.
5. 실제 제작/독립 검토/필요한 수정과 교사 수정 요청의 왕복, 최종 버전 승인·동일 파일 게시·실제 게시 확인을 검증한다. 게시 결과가 불확실하면 기존 전송을 반복하지 않고 별도 관찰/조정 흐름을 구현한다.

이 문서와 검사 코드의 최신 변경은 로컬에만 있다. 실제 App/Actions/Vercel 설정 완료 증거와 아직 수행하지 않은 재배포·활성화·실제 실행을 구분한다.
