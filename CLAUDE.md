# AIX-CREW 프로젝트

AIX-CREW 2026 부트캠프 기업 과제 수행 저장소.

- 과제 브리프: [docs/task-brief.md](docs/task-brief.md) — 작업 전 반드시 참고
- 요약: 중소벤처기업진흥공단 창업지원처의 **재기지원 사업 운영규칙 1부 + 요령 1부 초안** 작성,
  운영계획(안) 투입 시 **수정사항(변경점) 표기** 기능 포함. 공개자료(중소기업창업지원법,
  재도전성공패키지 지침 등) 기반. 2026-11-16 시작, 4주, 12월 초 초안 마감.
- 개인정보(담당자 연락처 등)는 저장소에 기록하지 않는다.

## 사용자는 실제 고객이다

- 결과물은 과제 신청 기관(창업지원처) 담당자가 **실제 업무에 받아서 쓰는 도구**다. 시연용 데모가 아니다.
- 형태: **Next.js 웹 애플리케이션**(사용자 결정, 2026-11-12). HTML 한 장·정적 웹 버전은 폐기했다(Git 기록 `40e04d8`에 남아 있음).
- 기관 PC(Windows)에서 `실행.bat` 더블클릭으로 켤 수 있어야 한다. 자료는 AI 호출(외부 전송 허용 자료만)을 빼고 PC 밖으로 나가지 않는다.
- 한글 파일명·한글 경로·PDF·DOCX 원문을 기본으로 가정하고 검증한다. 사용자 문구는 모두 한국어, 개발 용어를 노출하지 않는다.
- 샘플(가상 자료)과 실제 작업공간을 분리한다.

## 캠프 문서 (작업 전 확인)

- [intent.md](intent.md) 목적 · [docs/spec.md](docs/spec.md) 규칙 R1~R26 · [docs/plan.md](docs/plan.md) 작업 조각 T-n
- 커밋 메시지 앞에 `[T-n]`, 관련 규칙은 `R-n`으로 부른다. 작업 전 Plan Mode로 바뀌는 파일을 먼저 제시한다.
- 검증 결과는 `validation/YYYY-MM-DD.md`, AI 작업 요약은 `ai-log/YYYY-MM-DD.md`에 남긴다.
- `정답.md`는 사람이 직접 쓰는 파일이다. AI가 기대 결과를 채우지 않는다.
- 기관 확인이 필요한 사항은 `questions.md`에 추가한다.

## 웹 애플리케이션 (Next.js)

- Next.js(App Router) + TypeScript + Tailwind v4. 실행·환경변수·데이터 위치는 [README.md](README.md).
- 도메인 로직은 `lib/`의 순수 함수이며 `tests/`에서 Vitest로 검증한다. 서버 전용 코드는 `lib/server/`, AI는 `lib/ai/`.
- 반응형(R21): ≥1280px 메뉴 고정·편집기 3단, ≤1279px 서랍 메뉴(`components/app-shell.tsx`)·편집기 탭(`app/editor/page.tsx`), ≤767px 카드형 표(표에 `rtable` 클래스, `app/globals.css`). 가로 넘침이 생기면 안 된다.
- 저장: 서버 로컬 JSON(`data/`, Git 제외). 이동·보관은 작업 백업.json 내보내기·복원.
- 검증: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, 브라우저 흐름 `node scripts/e2e-demo.mjs <URL>`(시연 1~11단계 + 5개 폭 반응형).
- AI: 서버에서만 호출, 키는 `.env.local`(커밋 금지). 출처 ID·인용 검증 실패 시 결과를 버리고 데모 결과로 대체하지 않는다.
- 원칙: 원문 없는 법령 조문 번호·인용을 만들지 않는다. 미확정 값은 채우지 않고 【확인 필요】로 남긴다.
  유사사업 규정은 참고(현행 규정 아님), 배경자료는 근거로 연결하지 않는다. 계획 변경은 조건 ID↔조항 ID 연결로만 처리한다.
- `data/`(작업 데이터)와 `.env.local`(API 키)은 커밋하지 않는다.
