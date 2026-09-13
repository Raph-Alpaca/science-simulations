# 제작 역할 지침 — 문서 규격

2026-09-13 / 01단계. 이 폴더는 역할의 지침·입력·출력을 정의한 Markdown이다. 실제 에이전트 설정·실행기·권한 통제가 아니다. 공식 설정 형식과 적용 시점은 [TOOLS](../../docs/TOOLS.md)를 따른다.

| 역할 | 지침 | 실행 순서·권한 |
|---|---|---|
| curriculum_reviewer | [교육과정 검토](curriculum_reviewer.md) | 근거 읽기·검토 결과 반환 |
| subject_reviewer | [교과 검토](subject_reviewer.md) | 교육과정 검토와 별개 문맥, 근거 읽기 |
| learning_designer | [학습 설계](learning_designer.md) | 두 검토 결과 기반 설계 문서 반환 |
| developer | [개발](developer.md) | 허용된 단일 콘텐츠 폴더만 수정 |
| independent_reviewer | [독립 검토](independent_reviewer.md) | 후보·근거·검사 증거 읽기, 후보 수정·게시 불가 |

## 공통 입력·출력

입력에는 jobId, role, request snapshot, 대상 ID·기준 버전, 공개 허용 근거 목록/검토 범위, policyVersion, 역할 지침 버전, 허용 경로, 시간·호출·토큰·수정 제한을 명시한다. 미정 제한이나 필수 근거가 있으면 실행기가 보류한다. 원격 입력에는 교사 이메일·키·비공개 원문·개인 요청 원문을 넣지 않는다. 로컬 검토라도 접근 허용을 확인한 자료만 읽는다.

출력에는 role, status(pass/fail/needs_evidence), inputHash, outputHash, sourceChecks, findings, checksExecuted, checksNotExecuted, blockingIssues, nextAction을 포함한다. 후보를 검토했다면 candidateHash를 필수로 연결한다. 실제 실행 방식(native_subagent/separate_context), 실행 ID, 시각·사용량은 신뢰된 제어기가 기록한다. 역할 이름을 적은 JSON만으로 실행을 증명하지 않는다.

검토는 [DATA_CONTRACTS](../../docs/DATA_CONTRACTS.md)와 [VERIFICATION_MATRIX](../../docs/VERIFICATION_MATRIX.md)에 매핑한다. 실패를 삭제하거나 검사를 실행했다고 꾸미지 않는다. 여러 모델의 동의는 과학적 정확성의 증명이 아니다. 최종 상태 전이·공개 판정·배포는 일반 프로그램과 교사 승인으로 처리한다.

같은 파일을 여러 에이전트가 동시에 수정하지 않는다. 검토 역할은 읽기 전용이며 개발자도 공통 코드·검사·워크플로·다른 ID·지침·설정을 바꿀 수 없다. 권한 통제는 후속 단계의 코드·격리 환경에서 강제한다. 실제 하위 에이전트를 사용할 수 없으면 별도 문맥으로 순차 실행하고 미지원 사실을 남긴다. 무제한 재위임을 금지한다.
