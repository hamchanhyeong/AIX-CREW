# plan.md — 계획부터 받는다

> 작업은 T-번호 단위로 한 조각씩 진행하고, 커밋 메시지 앞에 `[T-n]`을 붙인다(예: `[T-8] Kick-off 답변 반영`).
> 각 조각은 시작 전에 바뀌는 파일을 확인하고(Claude Code Plan Mode), 끝나면 `npm test`·`npm run e2e`로 검증해 [validation/](../validation/)에 남긴다.

## 작업 환경 (VS Code + Claude Code)
1. VS Code에서 저장소 폴더를 열고, 시작 전에 `git pull`
2. Claude Code에 작업을 시킬 때는 **Plan Mode**로 계획(바뀌는 파일·규칙 번호)을 먼저 받고 승인
3. 화면은 `app/`·`components/`, 로직은 `lib/`, 서버 전용은 `lib/server/`·`lib/ai/`를 고친다
4. 검증: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build` → 서버 실행 후 `node scripts/e2e-demo.mjs <URL>`
5. 실행 확인: Windows에서 `실행.bat` 더블클릭
6. 커밋 `[T-n] …` 후 `git push`. 클라우드 세션(claude.ai/code)과 번갈아 쓰면 시작 전 `git pull`을 꼭 한다

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
| `app/`, `components/` | 화면 8개(현황·자료·조건·편집기·검토·변경·내보내기·설정), 자동 저장 | R19, R21, R26 |
| `app/api/` | 작업공간 저장·초기화, 파일 파싱, 내보내기, AI 상태·제안 | R22~R25 |
| `lib/server/store.ts`, `lib/server/parse.ts` | 로컬 JSON 저장, PDF·DOCX·TXT 읽기 | R22, R24 |
| `lib/ai/` | AI 제공자, 프롬프트, 출처·인용 검증 | R25 |
| `tests/`, `scripts/e2e-demo.mjs` | 자동 검증(로직·파일·AI 검증·시연 흐름) | 전체 |
| `실행.bat` | Windows 더블클릭 실행(최초 설치 포함) | — |

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
| T-6b | (정적 웹) 실사용 보강 — 이후 폐기 | 폐기 | `40e04d8` |
| T-6c | 사용자 결정으로 Next.js 웹앱 복원, HTML·정적 웹 제거, `실행.bat` 추가 | 완료 | `79a464b` |
| T-6d | Next.js 웹앱 반응형: 서랍 메뉴, 편집기 3탭, 휴대폰 카드형 표, 5개 폭 자동 점검 | 완료 | 이 커밋 |
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
