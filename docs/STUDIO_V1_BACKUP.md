# 운영 studio v1 범위 한정 백업 — 백업·격리 복원 완료

## 현재 결과 — 2026-10-04 20:16 KST

실제 Session pooler verify-full 읽기 전용 접속, 같은 스냅샷의 studio 백업과 새 로컬 PostgreSQL 복원에 성공했다. 8개 테이블 데이터·구조·RLS·ACL/소유자 지문 일치, 복원 후 사용자 격리·직접 쓰기 거부·서버 RPC와 검사 롤백을 확인했다. 임시 서버 정상 종료, 보호 폴더 ACL과 Git 제외 확인. Auth/Storage 전체 백업은 아니다.

백업 45,476bytes, SHA256 `a7241059d3e5628fdc4702ed05f1d2bae045b4e817f4a020258a42167357ac9f`. 비공개 위치 `.local/studio-v1-backup-20260916/run-20261004-28b03e0c9e134fd2951eb4f948849979`. 원격은 읽기 전용 스냅샷+dump 2연결, 운영 쓰기0회. 세부 상한과 실제 결과는 STATUS에 기록했다.

**이전 판정 정정:** [공식 Supabase 백업 절차](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)의 기본 경로가 Session pooler임을 확인했다. PC→pooler TLS/호스트 검증을 필수로 유지하면서 pg_stat_ssl의 DB 측 tls=false는 별도 관찰로 남긴다. 이것을 PC TLS 실패로 합쳐 차단했던 이전 기준을 수정했다. 전체 중계 경로가 암호화되었다는 뜻은 아니다. Direct DNS는 여전히 조회 불가였지만 공식 Session 경로로 백업·복원을 완료했다. 비밀번호 재입력은 필요하지 않다. 아래는 당시의 실패·준비 이력이며 현재 상태를 대신하지 않는다.

## 최신 추가 진단 — 2026-10-04

사용자 승인으로 읽기 전용 조회를 딱1회 추가했다. queryCompleted/clientVerifyFull/database_ok/read_only/studio_exists는 모두true, server_major17이다. **DB 인증·PC→Session pooler verify-full·대상 DB·읽기 전용·studio 스키마 확인은 성공했다.** DB 측 pg_stat_ssl의 tls=false/tls_version=null이 기존 전체 검사 FAIL의 원인으로 확인됐다.

PC→pooler와 DB가 관찰하는 중계 서버 쪽 연결을 구분한다. 전체 경로의 TLS 성공으로 처리하지 않으며 검사 조건을 삭제하지 않았다. 더 이상의 비밀번호 재입력은 필요하지 않다. 최초1회와 승인된 추가 진단1회 외 재접속은 없고 운영 백업/복원도 아직 없다. 후속 후보는 Direct TLS 연결의 사용 가능성 확인이며 과거 Direct DNS 문제 해소 여부는 미확인이다. 상세 실제 결과와 공식 문서 근거는 STATUS에 기록했다.

## 첫 접속 결과 — 2026-10-04

현재 비밀번호를 사용자 숨김 입력으로 받아 DPAPI 저장·왕복·ACL 확인을 완료했다. Session pooler 접속1회에서 DB 인증과 확인 SQL 실행은 성공했으나 기존 검사 조건 중 적어도 한 항목이 실패하여 REMOTE_TARGET_OR_TLS_CHECK_FAILED(exit1)로 종료됐다. PC→pooler verify-full 성공과 DB 측 pg_stat_ssl 판정은 구분한다. 기존 출력에 개별 값이 없어 실패 항목·실제 TLS 버전은 미확인이다.

개별 확인 결과만 안전하게 기록하도록 진단 출력을 보완했고 로컬 검사4/4를 통과했다. 원래 접속1회 상한을 지켜 추가 원격 조회는 하지 않았으며, 추가 읽기 전용 진단1회는 사용자 승인 대기다. 백업·복원·운영 변경은 아직 없다. 아래 인증 거절과 DNS 실패는 과거 기록이며 최신 상태를 대신하지 않는다. 상세 증거는 STATUS의 2026-10-04 기록을 따른다.

후속: 사용자가 DPAPI 암호를 새로 저장한 뒤에도 verify-full 읽기 전용 인증 1회가 DATABASE_PASSWORD_AUTHENTICATION_FAILED로 종료했다. 백업/복원은 시작하지 않았다. 동일 재시도나 암호 재설정을 하지 않았으며, 암호 자체가 원인이라고 확정하지 않는다.

## 최신 Session pooler 결과 — 2026-09-16

공식 pooler host/user/5432/postgres 조합과 호스트의 잘못된 공백·프로토콜·경로·자리표시자 부재를 확인했다. 빈 connectionMode는 검증된 조합으로 메모리에서만 session으로 판별했다. 설정·암호 파일은 변경하지 않았다.

Windows 기본 이름 조회와 Node dns.lookup은 각각 주소3개 성공했다. resolve4/6의 ECONNREFUSED는 별도 직접 DNS 경로 결과이며 OS/psql 실패를 뜻하지 않는다. 일반 사용자 도구 실행 문맥의 실제 결과이며 PC 전체 네트워크 상태로 일반화하지 않는다.

verify-full + 현재 CA로 psql을 1회 실행하여 서버의 `password authentication failed`에 도달했다. 안전한 분류 코드는 DATABASE_PASSWORD_AUTHENTICATION_FAILED, 클라이언트 exit2/래퍼 exit1. TLS 오류가 아니라 검증된 연결 경로 이후의 DB 인증 실패다. 따라서 이번 pooler 접속의 DNS/TCP/TLS 경로와 인증 실패를 구분한다. 인증 뒤 SELECT와 pg_stat_ssl은 실행하지 못했다. 비밀번호 원문/사용자/연결 문자열은 출력하지 않았다.

백업·로컬 복원은 계속 미실행이고 dump 파일 없음. 저장한 암호가 해당 프로젝트의 DB 비밀번호인지 사용자가 확인해야 하며, 비밀번호를 채팅으로 요청하거나 임의 재설정하지 않는다. 동일 실패 반복·SSL 검증 완화·DNS/hosts/VPN 변경·강제 IP·운영 SQL/설정 변경 없음. 아래 Direct DNS 실패는 앞선 다른 연결 경로의 과거 기록이다.

## 후속 실제 확인 — 2026-09-16

사용자가 connection.json/공식 CA/DPAPI 암호를 입력했다. 파일은 검사 프로그램 내부에서만 읽었다. `automation/studio/backup-preflight.mjs`를 일반 Windows 사용자 문맥에서 실행했으며 파일 내용·암호·libpq 원문 오류를 출력하지 않았다.

- projectName/projectRef/database/port/sslmode 검사 통과. connectionMode는 빈칸이었지만, 정확히 승인된 프로젝트의 Direct host+postgres 사용자 조합과 일치하여 **메모리에서만 direct로 판별**했다. connection.json은 변경하지 않았다.
- 인증서가 `server-ca.crt.crt`로 저장되어 처음에는 설정 경로 파일을 찾지 못했다. X509 형식·CA 속성·현재 유효기간 확인 후 원본을 보존하고 `server-ca.crt`로 복사했다. 인증서 설치/내용 변경 없음.
- DPAPI 암호 내부 로드 성공. 값은 출력/공개 저장하지 않았다.
- 실제 libpq 접속 설정은 verify-full 및 해당 CA 파일, 읽기 전용 세션, 10초 연결 제한이었다. **접속 결과 DNS_RESOLUTION_FAILED**. 후속 DNS 분류: Windows OS lookup **ENOTFOUND**, 별도 A와 AAAA DNS 조회 각각 **ECONNREFUSED**. DNS 조회 거부이지 PostgreSQL 포트의 거부로 해석하지 않는다.
- TLS 협상/서버 인증서 체인·호스트 검증/DB 비밀번호 인증에 도달하지 못했다. 따라서 CA 파일의 형식 통과를 실제 TLS 성공으로 기록하지 않는다. 네트워크 경로의 정확한 원인(DNS 서버·보안 프로그램·주소 계열 등)은 아직 확정하지 않았다. 이 결과만으로 IPv6 부재나 Supabase 장애를 단정하지 않는다.
- **운영 백업 미실행, 로컬 복원 미실행**, 정상/실패 dump 파일 모두 만들지 않았다. 운영 DB 연결 성립 전 실패했으므로 운영 SQL·데이터·A 세션 변경 없음. 로컬 PostgreSQL 복원 서버도 시작하지 않았다.

다음 조치는 현재 PC에서 해당 Supabase Direct 호스트의 이름 조회가 가능한지 네트워크/DNS 상태를 확인하는 것이다. DNS/프록시/방화벽/TLS 설정을 임의 변경하지 않는다. IPv4 전용 환경임이 확인되면 Dashboard Connect → Session pooler의 공식 파라미터를 로컬 파일에 입력하는 대안이 있으나, 현재 오류를 주소 계열 문제로 단정하여 임의 전환하지 않았다. 비밀번호 변경·SSL 검증 완화·유료 IPv4 사용 없음.

아래 내용은 처음 연결 입력을 준비한 시점의 기록과 이후 사용할 백업 범위다.

2026-09-16: 운영 백업과 새 격리 로컬 복원은 승인되었으나 **아직 실행하지 않았다**. 승인된 Supabase 도구의 프로젝트 목록에서 science-studio/ACTIVE_HEALTHY/PostgreSQL17을 확인했다. 이 도구의 SQL 실행 권한은 pg_dump용 PostgreSQL 인증정보가 아니다. Secret/API 키를 DB 비밀번호로 사용하지 않는다.

현재 프로세스에 PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD/PGPASSFILE/PGSERVICE/PGSERVICEFILE/DATABASE_URL/DIRECT_URL이 없고 기본 pgpass.conf/pg_service.conf/root.crt도 없다. 값이 아닌 존재 여부만 확인했다. 기존 앱 환경파일을 변경하거나 출력하지 않았다. 운영 백업 연결은 사용자 입력 후 검증해야 한다.

## 준비된 비공개 입력 위치

`C:\Users\user\Desktop\science-simulations\.local\studio-v1-backup-20260916`

새 폴더의 Windows ACL 상속을 차단하고 현재 Windows 사용자와 SYSTEM만 FullControl 허용함을 확인했다. 관리자에 의한 소유권 획득까지 차단한다는 의미는 아니다. 연결 파일/인증서/암호 파일 및 이후 백업은 .local Git 제외 규칙 적용을 확인했다. 아직 실제 비밀번호·인증서·백업 파일은 없다.

## 사용자가 직접 입력할 순서

1. Supabase Dashboard에서 **science-studio → 상단 Connect → Direct connection → 연결 파라미터**를 확인한다. PC에서 IPv6 직접 연결이 불가능하면 **Session pooler**의 파라미터를 사용한다. Transaction pooler는 사용하지 않고 유료 IPv4 옵션도 켜지 않는다. [공식 연결 안내](https://supabase.com/docs/guides/database/connecting-to-postgres), [PSQL 연결 안내](https://supabase.com/docs/guides/database/psql).
2. VS Code 탐색기에서 위 폴더의 `connection.json`을 연다. `connectionMode`에 `direct` 또는 `session`을 넣고, `host`, `port`, `user`의 빈칸에 해당 화면의 값을 입력한다. database도 화면과 대조한다. 비밀번호를 포함한 URI 전체를 붙여 넣지 않는다. projectName/projectRef는 도구로 확인한 대상이며, `sslmode=verify-full`은 유지한다. 입력값을 채팅으로 보낼 필요가 없다.
3. Dashboard의 **Database → Settings → SSL Configuration → Download certificate**에서 해당 프로젝트의 CA 인증서를 받아 비공개 폴더의 `server-ca.crt`로 저장한다. 메뉴가 이동된 경우 Database Settings의 SSL 인증서 항목을 찾는다. [공식 SSL 안내](https://supabase.com/docs/guides/platform/ssl-enforcement). TLS/호스트 검증은 실제 연결 때 확인하며 다운로드만으로 검증 완료가 아니다.
4. VS Code **터미널 → 새 터미널 → PowerShell**에서 아래를 실행하고, 프롬프트에 프로젝트 생성 시 정한 **DB 비밀번호**를 직접 입력한다. 교사 로그인 비밀번호나 API Secret key가 아니다. 입력 내용은 표시하지 않고 현재 Windows 사용자 DPAPI로 암호화한다. 비밀번호를 잊었으면 이번 승인으로 재설정하지 않는다.

```powershell
Set-Location -LiteralPath 'C:\Users\user\Desktop\science-simulations'
$passwordFile = Join-Path (Get-Location) '.local\studio-v1-backup-20260916\db-password.dpapi'
if (Test-Path -LiteralPath $passwordFile) { throw '기존 암호 파일을 덮어쓰지 않습니다.' }
$dbSecret = Read-Host 'science-studio DB 비밀번호' -AsSecureString
try {
    $encrypted = ConvertFrom-SecureString $dbSecret -ErrorAction Stop
    [IO.File]::WriteAllText($passwordFile, $encrypted)
} finally {
    $dbSecret = $null
    $encrypted = $null
}
```

이 절차는 연결 입력만 준비하며 SQL·계정·권한을 변경하지 않는다. 입력 완료 후 알려주면 기존 승인 범위에서 이어서 검사한다. 암호/연결 파일 내용은 보내지 않는다.

## 도구 재확인

[POSTGRES17_REHEARSAL.md](POSTGRES17_REHEARSAL.md)의 공식 PostgreSQL→EDB 경로와 버전을 다시 읽고 보관 ZIP 해시가 기존 기록 `4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf`와 같음을 확인했다. pg_dump 실행 버전17.11. 공식 ZIP 체크섬·서명 대조 미확인은 그대로이며 자체 계산 해시를 배포처 검증이라고 표현하지 않는다.

## 입력 완료 후 실행할 범위 — 아직 미실행

- 공식 host/project/user 대응, CA와 sslmode=verify-full, 실제 TLS 연결과 PostgreSQL 대상 확인. 실패하면 검증을 끄거나 유료 옵션을 켜지 않는다.
- pg_dump로 **studio 구조+데이터만** 일관된 스냅샷으로 custom 백업. 함수·테이블·제약·인덱스·시퀀스·RLS·ACL과 필요한 의존 목록을 확인한다. auth/Storage 등 다른 스키마의 데이터는 내보내지 않는다. 운영 트랜잭션은 읽기 전용으로 제한한다.
- 사용자 내용/인증값을 출력하지 않고 백업 시각·도구 버전·크기·SHA256·성공 상태를 기록한다. 실패한 파일은 정상 백업으로 기록하지 않는다. 백업 원문과 세부 운영 식별자는 비공개 폴더에만 보존한다.
- 새 로컬 클러스터/빈 DB의 host=127.0.0.1, 전용 포트/DB를 검사한 뒤에만 복원한다. studio 외부 역할과 auth.uid()/auth.users FK 등은 복원에 필요한 최소 대체물로 준비한다. 실제 Auth 데이터는 복사하지 않으며, 필요한 FK UUID는 studio 백업 내 참조에서만 얻는 로컬 대체 식별자다. 현재 의존성의 정확한 목록은 실제 백업 대상 구조 확인 후 확정한다.
- 운영 스냅샷과 복원 결과의 데이터·구조·RLS·권한을 건수/해시/일치 여부로 비교한다. 권한을 제거하거나 운영 주소에 복원하지 않는다. 로컬 복원 DB를 앱이나3002에 연결하지 않는다. 종료 후 해당 로컬 서버만 정상 종료한다.

이는 전체 Supabase 프로젝트 백업이 아니라 **studio 변경에 대비한 범위 한정 백업**이다. 실제 Auth/Storage·역할 전역 설정의 복구를 포함하지 않는다. 백업 뒤 새 데이터가 생기면 실제 v2 적용 직전에 백업을 갱신해야 한다.

현재 결과: 운영 백업 미실행, 복원 미실행, 실제 TLS/호스트 검증 미실행. 운영 원본·A 세션 변경 없음. v2/runner/삭제 활성화/원격 이력/커밋/push/배포 미실행.
