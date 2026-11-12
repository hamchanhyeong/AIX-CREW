# AIX-CREW 프로젝트

AIX-CREW 2026 부트캠프 기업 과제 수행 저장소.

- 과제 브리프: [docs/task-brief.md](docs/task-brief.md) — 작업 전 반드시 참고
- 요약: 중소벤처기업진흥공단 창업지원처의 **재기지원 사업 운영규칙 1부 + 요령 1부 초안** 작성,
  운영계획(안) 투입 시 **수정사항(변경점) 표기** 기능 포함. 공개자료(중소기업창업지원법,
  재도전성공패키지 지침 등) 기반. 2026-11-16 시작, 4주, 12월 초 초안 마감.
- 개인정보(담당자 연락처 등)는 저장소에 기록하지 않는다.

## 웹 애플리케이션

- Next.js(App Router) + TypeScript + Tailwind v4. 실행·환경변수·데이터 위치는 [README.md](README.md).
- 도메인 로직은 `lib/`의 순수 함수(작업공간을 직접 수정)이며 `tests/`에서 Vitest로 검증한다.
- 검증: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, 브라우저 흐름 `node scripts/e2e-demo.mjs <URL>`.
- 원칙: 원문 없는 법령 조문 번호·인용을 만들지 않는다. 미확정 값은 채우지 않고 【확인 필요】로 남긴다.
  유사사업 규정은 참고(현행 규정 아님), 배경자료는 근거로 연결하지 않는다. 계획 변경은 조건 ID↔조항 ID 연결로만 처리한다.
- 제출용 HTML 한 장: `single/` 수정 후 `npm run build:html`로 루트 `index.html` 재생성, 검증 `node scripts/e2e-single.mjs`.
- `data/`(작업 데이터)와 `.env.local`(API 키)은 커밋하지 않는다.
