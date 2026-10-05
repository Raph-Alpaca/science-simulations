# PostgreSQL 17 실제 격리 검사 — 2026-09-16

결과: **독립 2연결 경쟁 8/8, 빈 DB v1→v2, pg_dump/pg_restore 복원 성공**. 운영 Supabase 접속 없음. 기존 PGlite 시험과 별도 결과다.

## 도구와 공급 경로

- [PostgreSQL 공식 Windows 페이지](https://www.postgresql.org/download/windows/) → [EDB 바이너리 페이지](https://www.enterprisedb.com/download-postgresql-binaries) → `https://sbp.enterprisedb.com/getfile.jsp?fileid=1260491` → `https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip`. 실제 HTTP 최종 주소와 Windows x64 링크를 확인했다.
- 배포 버전 17.11-3, 실행 결과 postgres/pg_dump/pg_restore **17.11**. ZIP 341325378 bytes, SHA256 `4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf`.
- EDB 페이지에서 공식 ZIP 체크섬을 찾지 못했고 `.sha256`, `.sha256sum`, `.asc`도 확인되지 않았다. postgres/psql/pg_dump/pg_restore/initdb/pg_ctl의 Authenticode 결과는 모두 NotSigned. **로컬 SHA256은 재현 식별용이며 공식 해시 대조나 서명 검증 성공이 아니다.** 비공식 재배포본을 쓰지 않았고 HTTPS 검증도 끄지 않았다.
- 추가 패키지·런타임 설치 없음. 서비스 등록·자동 시작·PATH·방화벽·인증서 저장소 변경 없음. 관리자 권한 상승 없이 일반 사용자 프로세스로 실행했다.

프로젝트 루트: `C:\Users\user\Desktop\science-simulations`

도구 루트(이하 T): `.local/pg17-ad1839ec7ba749b4b13fbecf799f1e55`

최종 검사 루트(이하 R): `T/run-7fe0052a53f64d91ad068e90206cc13f`

| 대상 | 위치 |
|---|---|
| 공식 ZIP | T/downloads/postgresql-17.11-3-windows-x64-binaries.zip |
| 실행 파일 | T/tools-native/pgsql/bin |
| 검사 클러스터 | R/db/cluster |
| 백업 | R/backups/studio-v2.dump |
| 서버 로그·결과 | R/logs/postgres.log, R/logs/rehearsal-result.json |
| 검사 전용 암호 | R/db/test-password.dpapi (Windows 사용자별 암호화, 공개/출력 금지) |

모두 Git ignore 실제 확인. 기존 실패 폴더와 부분 압축 해제 폴더도 보존했다. 운영 환경파일을 읽지 않았다.

## 격리와 실제 명령

`tests/studio/postgres17-rehearsal.mjs`가 Node 기본 모듈과 위 네이티브 도구만 사용한다. 새 폴더만 허용하며 기존 cluster가 있으면 실패한다. `initdb -D <R/db/cluster> -U rehearsal_admin --pwfile=<임시 파일> --auth=scram-sha-256 --encoding=UTF8 --locale=C --data-checksums` 실행 후 임시 평문 암호 파일은 제거했다. 암호는 출력 없이 프로세스 환경으로만 전달했고 보존본은 DPAPI 암호화했다.

서버는 `listen_addresses=127.0.0.1`, 사용 중이지 않음을 확인한 포트 **55432**. HBA는 이 IPv4 /32에서 검사 관리자 및 두 검사 DB의 service_role/authenticated만 SCRAM-SHA-256 인증 허용한다. trust·외부 listen·무제한 호스트 허용 없음. SQL 본문/파라미터 로깅은 껐으며 가상 데이터만 사용했다.

실행 명령: `node tests/studio/postgres17-rehearsal.mjs <R의 절대 경로> <T의 절대 경로>` (신규 폴더, 검사 전용 `PG_REHEARSAL_PASSWORD`를 현재 프로세스에만 제공). 최종 exit0. 기존 R에 같은 명령을 재실행하면 초기화를 거부한다. 재실행할 때 새 R을 만들고 암호를 다시 준비해야 한다.

각 psql 연결은 `-X -qAt -w -h 127.0.0.1 -p 55432 -U <검사 역할> -d <검사 DB>`를 사용한다. 변경 전마다 서버 host/port/current_database/current_user를 확인한다. SQL guard와 고정 도구 인자 모두 로컬 대상만 허용한다. 실제 앱과 대응되는 service_role(비슈퍼유저, BYPASSRLS)의 별도 비밀번호 로그인으로 RPC를 호출한다. authenticated는 별도 비슈퍼유저 역할이며 RLS를 적용한다. 관리자는 스키마·검사 데이터 준비, 백업/복원과 읽기 전용 관찰에만 사용했다.

Supabase 대응 차이: auth.users는 UUID만 있는 검사 테이블이고 auth.uid()는 시험용 세션 GUC를 읽는다. 실제 Supabase Auth/JWT/PostgREST/Data API 환경을 재현한 것은 아니다.

## 실제 경쟁 증거

빈 DB `studio_v2_test`에서 v1→v2 적용, runner 부재와 삭제 gate=false를 먼저 확인했다. 경쟁 시험 동안만 로컬 함수 gate를 true로 바꾸고, 끝난 뒤 false로 되돌려 백업했다. SQL 원본과 운영 gate는 변경하지 않았다.

각 행마다 두 물리 연결에서 BEGIN → 선행 RPC 완료하되 COMMIT 보류 → 후행 RPC 전송 → 관찰 연결에서 후행 `wait_event_type=Lock`, `wait_event=transactionid`, `pg_blocking_pids=선행 PID` 확인 → 선행 COMMIT → 후행 결과 확인 순서다. 단순 순차 호출이나 Promise 큐 검사가 아니다. statement_timeout15초, lock_timeout10초, 래퍼 타임아웃25초로 제한했다.

| 선행 → 후행 | 선행/후행 PID | 후행 결과 | 최종 결과 |
|---|---|---|---|
| 삭제 → 접수 | 45844 / 39232 | PT404 | 삭제 유지, 새 작업 없음 |
| 접수 → 삭제 | 47836 / 28992 | PT423 | 진행 작업 보존, 삭제 거부 |
| 삭제 → 재시도 | 47236 / 22572 | PT404 | 삭제 유지, 재시도 생성 없음 |
| 재시도 → 삭제 | 13100 / 32760 | PT423 | retry_of/attempt2 연결 보존, 삭제 거부 |
| 삭제 → 중복 삭제 | 14308 / 39164 | PT404 | 삭제 한 번만 반영 |
| 중복 삭제 역순 연결 | 30056 / 12940 | PT404 | 삭제 한 번만 반영 |
| 이름 수정 → 삭제 | 19756 / 25584 | 00000 | 최종 삭제 표식, 메시지 제거 |
| 삭제 → 이름 수정 | 12504 / 20192 | PT404 | 삭제 유지, 대화 부활 없음 |

모든 선행은 00000, 후행 잠금 관찰 시각은 2026-09-16 13:29:12~15 KST. 각각의 transaction_started/query_started/observed_at/COMMIT 전송 시각은 R/logs/rehearsal-result.json에 있다. 매 사례에 가상 제작 명세·events·reviews·approvals·releases를 준비하고 기존 행 전체를 전후 비교해 동일함을 확인했다. 잘못된 owner 연결 0, 삭제된 대화의 새 작업 0, 삭제 시 messages0과 title=[deleted]를 확인했다. 웹앱/자료실/GitHub 파일에 접근하는 작업은 없다.

## pg_dump/pg_restore

실제 명령(인증값은 현재 자식 프로세스 환경에만 전달):

```text
pg_dump.exe -h 127.0.0.1 -p 55432 -U rehearsal_admin -d studio_v2_test -w -Fc -f <R/backups/studio-v2.dump>
pg_restore.exe -h 127.0.0.1 -p 55432 -U rehearsal_admin -d studio_v2_restore -w --exit-on-error --single-transaction <R/backups/studio-v2.dump>
```

별도 DB `studio_v2_restore`는 template0로 생성하고 studio 스키마가 없는 상태를 확인한 뒤 복원했다. 역할은 클러스터 공통이며 pg_dump에 포함되지 않으므로 이 로컬 클러스터에 이미 준비된 역할들을 사용했다. 다른 클러스터 복원 시 동일 역할·소유자 의존 항목을 별도 준비해야 하며 운영 역할 암호를 복제해서는 안 된다.

복원 전후 auth.users 및 studio 8테이블의 전체 데이터, 열/default/nullability, 함수 정의·ACL, 제약조건, 인덱스, RLS/policy, 테이블 소유자·ACL, 열별 권한 지문이 일치했다.

- 데이터 SHA256: `b45085dc320b744c5092c581d1d4cc32804bee428b336cd28ff5b8acc577c6bd`
- 메타데이터 SHA256: `8b2eb70f293480eb28a548141565a72e54e57e679335b5f0f2846a187ba4af99`
- 백업 SHA256: `a3d404338ba9b63329cd13558228ae25afc978df551c315c3ef5db92dd317607`
- 복원 후 service_role 새 대화/이름 수정 성공, gate=false 삭제 PT412, authenticated 본인 조회·타인 제외·직접 UPDATE 및 서버 RPC 호출 42501 확인.
- 별도 읽기 전용 보완 검사에서도 원본/복원 DB의 auth·studio 스키마 ACL/소유자가 일치했다. 실제 서버 listen=127.0.0.1, HBA 두 규칙 모두 scram-sha-256, authenticated는 superuser=false/BYPASSRLS=false, service_role은 superuser=false/BYPASSRLS=true 확인. 증거는 R/logs/supplement.json. PowerShell 시작 래퍼의 자식 대기 문제로 별도 읽기 프로세스에서 확인 후 같은 서버를 정상 종료했다.

이는 **로컬 PostgreSQL 복원**이다. 운영 Supabase 백업 확보·PITR·복원 검증을 완료한 것이 아니다.

## SQL 버전·실패와 보완

검사 전후 아래 해시가 동일하며 SQL은 수정하지 않았다.

- studio_v1.sql: `6f55bd60c3af35a25564929623e585bc2e026d217de0848aa892cceab8273c67`
- studio_v2.sql: `9b79f5824dc8c3de3a8b4f2902175b8cffc997c68372646fb5160e880df0fcdb`

준비 중 sandbox의 curl 인증 문맥/DPAPI/restricted-token 오류, Expand-Archive 부분 해제, 검사 래퍼의 pg_ctl 출력 파이프 대기 및 inet `/32` 표기 비교 오류가 있었다. 공식 HTTPS 다운로드를 일반 사용자 문맥에서 수행하고 Windows 내장 tar로 **새 위치**에 필요한 디렉터리를 해제했다. 래퍼는 pg_ctl exit 이벤트와 host(inet_server_addr())를 사용하도록 보완했다. 실패 자료를 삭제하거나 SQL·인증 기준을 완화하지 않았다. 이들 준비 실패는 성공한 SQL 검사와 구분한다.

## 정확한 시작·종료 명령

아래는 보존한 검사 서버만 수동 시작/종료하는 명령이다. 지금은 이미 종료되어 있다. PowerShell 실행 정책·전역 설정을 바꾸지 않는다.

```powershell
Set-Location -LiteralPath 'C:\Users\user\Desktop\science-simulations'
$pgTools = Join-Path (Get-Location) '.local\pg17-ad1839ec7ba749b4b13fbecf799f1e55\tools-native\pgsql\bin'
$pgRun = Join-Path (Get-Location) '.local\pg17-ad1839ec7ba749b4b13fbecf799f1e55\run-7fe0052a53f64d91ad068e90206cc13f'
# 포트가 사용 중이면 시작하지 말고 점유 대상을 먼저 확인합니다.
Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue
$pgStart = Start-Process -FilePath "$pgTools\pg_ctl.exe" -ArgumentList @('-D',"$pgRun\db\cluster",'-l',"$pgRun\logs\postgres.log",'-w','-t','20','start') -WindowStyle Hidden -PassThru
$pgStart.WaitForExit() # Start-Process -Wait의 전체 자식 트리 대기는 사용하지 않습니다.
if ($pgStart.ExitCode -ne 0) { throw '검사 서버 시작 실패: postgres.log 확인' }
# 검사 서버만 정상 종료:
& "$pgTools\pg_ctl.exe" -D "$pgRun\db\cluster" -m fast -w -t 20 stop
& "$pgTools\pg_ctl.exe" -D "$pgRun\db\cluster" status
```

최종 `pg_ctl stop` 성공, 로그 `database system is shut down`, status exit3/no server running, 127.0.0.1:55432 연결 ECONNREFUSED를 확인했다. 이전 래퍼 중단 때 만든 서버도 정상 종료했다. 기존 제작실/3002 서버를 종료하지 않았다.

남은 운영 적용 준비: 실제 Supabase 백업·복원 가능 범위 확인, 수동 v1 기준선의 원격 이력 관리 방식 승인, 적용 시간 승인, 호환 앱 및 복구 버전 확보. 운영 SQL·삭제 활성화·원격 이력 변경·커밋·push·배포는 별도 승인 전 보류한다.
