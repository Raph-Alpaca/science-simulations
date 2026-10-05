# 폐기 가능한 실행 검사 이미지

Dockerfile은 2026-10-04 공식 MCR registry에서 읽은 Playwright 1.63.0 noble OCI index digest를 고정한다. 플랫폼은 linux/amd64다. [공식 Docker 안내](https://playwright.dev/docs/docker)에 따라 npm 패키지와 브라우저 버전을 맞추고, pwuser와 Chromium sandbox를 사용한다. root 실행이나 sandbox 해제를 통한 우회는 허용하지 않는다.

seccomp.json은 Microsoft Playwright 커밋 `1b025d7e20a026371cd5f98ba0cdce48892737c8`의 [공식 설정](https://github.com/microsoft/playwright/blob/1b025d7e20a026371cd5f98ba0cdce48892737c8/utils/docker/seccomp_profile.json) 원문이다. SHA-256은 `cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`. Apache 2.0 라이선스를 PLAYWRIGHT-LICENSE에 보존한다. 기본 거부 정책과 user namespace용 clone/setns/unshare 허용을 사용한다. Docker 기본 seccomp 프로필과 동일하다고 가정하지 않으며 버전 변경 시 다시 검토한다.

빌드 문맥은 별도 임시 폴더에 허용된 검사 코드·스키마·잠금 파일만 복사한다. 작업 폴더 전체, 환경 파일, 후보 원문, 개인 자료는 포함하지 않는다. 설치 스크립트를 실행하지 않고 잠금 파일로 의존성을 설치한다. 검사에는 고정된 로컬 이미지 ID만 사용한다.

실행은 네트워크 없음, 읽기 전용 루트, 권한 전체 제거, no-new-privileges, 개인 IPC, 1GiB 공유 메모리, 512MiB 임시 메모리 파일시스템, 메모리 2GiB/추가 swap 없음, CPU 2개, 프로세스 128개로 제한한다. 호스트 파일·소켓을 마운트하지 않고 후보는 표준 입력으로만 전달한다. 브라우저 관찰 외에 컨테이너 설정을 시작 전에 확인하고 종료 후 삭제 성공을 요구한다.

로컬 Windows에는 Docker가 없다. 작성·단위 검증은 컨테이너 격리 성공의 증거가 아니다. 실제 GitHub Linux의 무비용 rehearsal에서 격리 probe, 2D·3D 동작, 잘못된 초기화 거부가 모두 성공해야 제작 작업이 시작된다. Ubuntu의 user namespace/AppArmor와 Docker seccomp 조합이 Chromium sandbox 시작을 막으면 rehearsal이 실패하며 권한을 확대하지 않는다.
