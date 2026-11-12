# plan.md — 계획부터 받는다

> 작업은 T-번호 단위로 한 조각씩 진행하고, 커밋 메시지 앞에 `[T-n]`을 붙인다(예: `[T-8] Kick-off 답변 반영`).
> 각 조각은 시작 전에 바뀌는 파일을 확인하고(Claude Code Plan Mode), 끝나면 `npm test`·`npm run e2e`로 검증해 [validation/](../validation/)에 남긴다.

## 작업 환경 (VS Code + Claude Code)
1. VS Code에서 저장소 폴더를 열고, 시작 전에 `git pull`
2. Claude Code에 작업을 시킬 때는 **Plan Mode**로 계획(바뀌는 파일·규칙 번호)을 먼저 받고 승인
3. 화면은 `web/`, 로직은 `lib/`를 고친다. `site/`는 직접 고치지 않고 `npm run build`로 다시 만든다
4. 검증: `npm run typecheck` → `npm test` → `npm run build` → `npm run e2e` → `npm run e2e:real`
6. 고객 전달: `npm run package` → `release/` 압축 파일과 버전(package.json)을 함께 전달
5. 커밋 `[T-n] …` 후 `git push`. 클라우드 세션(claude.ai/code)과 번갈아 쓰면 시작 전 `git pull`을 꼭 한다

## 파일 구조
| 경로 | 역할 | 관련 규칙 |
| --- | --- | --- |
| `lib/types.ts`, `lib/structure.ts` | 데이터 구조, 기본 목차·조건 칸 | R6, R9 |
| `lib/chunk.ts`, `lib/extract.ts` | 원문 조각, 조건 추출 | R3, R4 |
| `lib/templates.ts`, `lib/draft.ts`, `lib/render.ts` | 조문 템플릿, 초안·근거 연결, 번호 계산 | R6~R9 |
| `lib/ops.ts` | 편집·검토 상태·자료 변경 | R2, R5, R10, R11 |
| `lib/checks.ts`, `lib/metrics.ts` | 검토 목록 점검, 현황 수치 | R12 |
| `lib/change.ts`, `lib/compare.ts` | 계획 변경·수정안·신구대비표 | R13~R18 |
| `lib/export/docx.ts`, `lib/export/csv.ts` | Word·CSV 내보내기 | R20 |
| `lib/demo.ts` | 시연용 가상 자료 | — |
| `web/app.ts`, `web/style.css`, `web/index.html` | 화면(프레임워크 없음, 반응형), 작업 파일 저장·열기 | R19, R21, R23, R26 |
| `web/storage.ts` | IndexedDB 저장·이전 | R22 |
| `web/importers/pdf.ts`, `docx.ts` | 원문 파일 읽기(필요할 때만 불러옴) | R24 |
| `scripts/build-web.mjs` | `site/` 생성(index.html + assets) | — |
| `scripts/package.mjs` | 고객 전달용 압축(release/) | — |
| `docs/사용자설명서.md` | 고객용 설명서 | — |
| `tests/`, `scripts/e2e-web.mjs`, `scripts/e2e-real.mjs` | 자동 검증(시연 흐름·반응형·실사용) | 전체 |

## 작업 조각
| T | 내용 | 상태 | 커밋 |
| --- | --- | --- | --- |
| T-1 | 과제 브리프 정리 | 완료 | `6673298` |
| T-2 | 도메인 로직(lib/)과 테스트 — 조건 추출, 템플릿 초안, 검토 점검, 계획 변경, 내보내기 | 완료 | `84cdc1b` |
| T-3 | 웹 앱(Next.js) 시제품과 시연 흐름 검증 | 완료 후 제거(T-5) | `84cdc1b` |
| T-4 | 제출용 `index.html` 한 장 빌드 | 완료 | `1d56170` |
| T-5 | Next.js 앱 제거, index.html과 원본 코드만 유지 | 완료 | `20ce3f1` |
| T-6 | 캠프 문서 정리(intent·spec·plan·정답·validation·ai-log·questions) | 완료 | `f9a005e` |
| T-6a | HTML 한 장 → 정적 반응형 웹(`site/`) 전환 | 완료 | `a115d8f` |
| T-6b | 실사용 보강: IndexedDB 저장·이전, 작업 파일 저장·열기와 알림, PDF·DOCX 읽기, 시작하기·사용 안내, 사용자설명서, 전달용 압축(v1.0.0) | 완료 | 이 커밋 |
| T-7 | `정답.md` 손으로 작성 → 실행 결과와 대조 → 불일치 수정 | 할 일(담당자) | |
| T-8 | Kick-off(11/16) 답변 반영: 목차·사업명·조건·템플릿 문구 수정 | 할 일 | |
| T-9 | 기관 제공 원문(법령·지침·유사사업 규정·운영계획) 붙여넣기 → 근거 연결 확인 | 할 일 | |
| T-10 | 중간 피드백 반영, 12월 초 초안 전달용 파일 내보내기 | 할 일 | |
| T-11 | 크루 대표 3분 시연 준비(README 시연 순서 기준) | 할 일 | |

## 일정 (기획안 기준)
- 11.16 Kick-off · 1주차: 확인 사항 정리, 조항 목록 확정(T-8)
- 2주차: 근거·벤치마킹 매핑(T-9)
- 3주차(~12.4): 운영규칙·요령 초안 전달(T-10)
- 4주차: 예산 확정분 변경 반영·신구대비표, 최종 피드백
