// 시연 시나리오 1~11단계를 실제 브라우저로 실행한다.
// 사용: 서버 실행 후 `node scripts/e2e-demo.mjs http://localhost:3000 <출력폴더>`
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "test-output/e2e";
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log("✔", ...a);
function assert(cond, msg) {
  if (!cond) throw new Error(`실패: ${msg}`);
  log(msg);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: "ko-KR" });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "초기화" : undefined));
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
const waitSaved = () => page.getByText(/^저장됨/).first().waitFor({ timeout: 10000 });

// 1. 샘플 프로젝트 시작
await page.goto(BASE);
await page.getByRole("button", { name: /샘플 프로젝트 (다시 )?시작/ }).click();
await page.waitForURL("**/sources");
assert(await page.getByText("시연용 가상 자료 — 실제 사업 조건이 아닙니다.").first().isVisible(), "1. 샘플 프로젝트 시작 — 시연용 가상 자료 표시");

// 2. 가상 운영계획과 참고 규정 확인
await page.getByRole("cell", { name: /\[가상\] 재기지원 사업 운영계획\(안\)/ }).first().click();
await page.getByText("- 지원 한도(기업당 최대): 1억원").waitFor();
await shot("02-sources-plan");
await page.getByRole("cell", { name: /\[가상\] 유사사업 운영규정/ }).click();
await page.getByText("유사사업 규정은 참고 자료입니다").waitFor();
assert(true, "2. 가상 운영계획·가상 유사사업 규정 원문 확인");

// 3. 미확정 사업 조건 확인 → 값이 있는 조건 확정
await page.goto(`${BASE}/conditions`);
await page.getByText("공통 조건").waitFor();
const beforeUnconfirmed = await page.locator("select").evaluateAll((els) => els.filter((e) => e.value === "unconfirmed").length);
await shot("03-conditions");
const selects = page.locator("tbody select");
const n = await selects.count();
for (let i = 0; i < n; i++) {
  const s = selects.nth(i);
  const can = await s.locator('option[value="confirmed"]').evaluate((o) => !o.disabled);
  if (can && (await s.inputValue()) === "unconfirmed") {
    await s.selectOption("confirmed");
    await page.waitForTimeout(80);
  }
}
const stillEmpty = await page.locator("tbody select").evaluateAll((els) => els.filter((e) => e.value === "unconfirmed").length);
assert(stillEmpty > 0 && stillEmpty < beforeUnconfirmed, `3. 미확정 조건 ${beforeUnconfirmed}개 중 값 있는 조건만 확정, 빈 값 ${stillEmpty}개는 미확정 유지`);
await page.getByRole("button", { name: "조건 확인 완료" }).click();
await page.getByText(/조건 확인 완료:/).waitFor();
await waitSaved();

// 4. 운영규칙·요령 초안 생성
await page.goto(`${BASE}/editor`);
await page.getByRole("button", { name: "운영규칙·요령 초안 작성" }).click();
await page.getByRole("tab", { name: "운영규칙" }).waitFor();
await page.getByRole("button", { name: /제6조\(지원 한도\)/ }).waitFor();
assert(true, "4. 운영규칙·운영요령 초안 생성");

// 5. 조항 선택 후 연결된 원문 확인
await page.getByRole("button", { name: /제6조\(지원 한도\)/ }).click();
await page.getByText("운영계획 반영", { exact: true }).first().waitFor();
await page.getByRole("button", { name: "원문 보기" }).first().click();
await shot("05-editor-evidence-1440");
await page.setViewportSize({ width: 1280, height: 800 });
await shot("05-editor-evidence-1280");
await page.setViewportSize({ width: 1440, height: 900 });
assert(await page.locator("blockquote", { hasText: "1억원" }).first().isVisible(), "5. 조항 선택 → 운영계획 원문 인용(1억원) 확인");

// 6. 담당자 수정 + 검토 완료
const body = page.locator("textarea").first();
await body.fill((await body.inputValue()) + "\n③ 지원 한도 적용 기준일은 협약 체결일로 한다.");
await page.getByRole("button", { name: "저장", exact: true }).click();
await waitSaved();
await page.getByRole("radio", { name: "검토 완료" }).click();
await waitSaved();
assert((await page.getByRole("radio", { name: "검토 완료" }).getAttribute("aria-checked")) === "true", "6. 조항 수정·저장 후 검토 완료 처리");

const dl = async (clickFn, label) => {
  const [d] = await Promise.all([page.waitForEvent("download"), clickFn()]);
  // 헤드리스 브라우저는 blob 다운로드 이름을 'download'로 보고하므로 앱 알림의 파일명을 확인하고 라벨로 저장
  const toast = page.getByText(/^내려받았습니다: /).last();
  await toast.waitFor();
  const appName = (await toast.innerText()).replace("내려받았습니다: ", "");
  await d.saveAs(path.join(OUT, label.endsWith(".docx") || label.includes(".") ? label : `${label}.docx`));
  assert(/[가-힣]/.test(appName), `다운로드: ${appName}`);
  return appName;
};

// 7. 가상 지원 한도 1억원 → 1.5억원 (가상 계획 v2)
await page.goto(`${BASE}/changes`);
await page.getByRole("button", { name: /가상 계획 v2 등록/ }).click();
await page.getByText("① 조건 비교 결과 — 바뀐 조건 1개").waitFor();
await shot("07-changes-diff");
assert(await page.getByRole("cell", { name: "1.5억원 미확정" }).isVisible(), "7. 새 계획 비교: 재도전성공패키지 지원 한도 1억원 → 1.5억원");
// 7-1. 운영계획(안) 원문 수정사항: 줄 단위 [수정]·[추가]와 조건 인식 여부
await page.getByText(/바뀐 줄 \d+개/).waitFor();
const planDiffText = await page.getByText(/바뀐 줄 \d+개/).innerText();
assert(/바뀐 줄 4개 — 수정 2 · 추가 2 · 삭제 0/.test(planDiffText), `7-1. 운영계획 원문 수정사항 표시 (${planDiffText})`);
assert(await page.getByRole("cell", { name: /재도전성공패키지 · 지원 한도\(기업당\)/ }).first().isVisible(), "7-1. 지원 한도 줄은 사업 조건으로 인식");
assert((await page.getByText("조건 미인식 — 관련 조항 직접 확인").count()) === 3, "7-1. 조건으로 인식되지 않은 변경 3줄은 ‘직접 확인’으로 표시");
await dl(() => page.getByRole("button", { name: "수정사항 대비표.docx 다운로드" }).click(), "운영계획 수정사항 대비표.docx");
await page.getByRole("button", { name: /② 연결 조항 찾기/ }).click();
await page.getByText(/연결된 조항 3개에 수정안 생성/).waitFor();

// 8. 연관 조항만 수정 제안
const items = page.locator("li", { has: page.getByRole("button", { name: "⑤ 반영" }) });
assert((await items.count()) === 3, "8. 지원 한도와 연결된 3개 조항만 수정 제안에 나타남");
assert(await page.getByText(/조건과 연결되지 않은 \d+개 조항은 자동 검토 범위에 포함되지 않았습니다/).isVisible(), "8. 연결되지 않은 조항은 자동 검토했다고 주장하지 않음");

// 9. 일부 반영, 일부 보류
await items.nth(0).getByRole("button", { name: "⑤ 반영" }).click();
await page.waitForTimeout(200);
await page.locator("li", { has: page.getByRole("button", { name: "⑤ 반영" }) }).nth(0).getByRole("button", { name: "⑤ 반영" }).click();
await page.waitForTimeout(200);
await page.locator("li", { has: page.getByRole("button", { name: "보류" }) }).last().getByRole("button", { name: "보류" }).click();
await page.getByRole("button", { name: /⑥ 반영 결과를 새 버전으로 저장/ }).click();
await page.getByText(/반영 저장 v\d+/).waitFor();
await waitSaved();
await shot("09-changes-decided");
let statusBadges = [];
for (let i = 0; i < 25; i++) {
  statusBadges = await page.locator("table.cmp").last().locator("td:last-child").allInnerTexts();
  if (statusBadges.filter((t) => t.includes("보류")).length === 1) break;
  await page.waitForTimeout(200);
}
assert(statusBadges.filter((t) => t.includes("반영")).length === 2 && statusBadges.filter((t) => t.includes("보류")).length === 1, `9. 2건 반영·1건 보류, 새 버전 저장 (${JSON.stringify(statusBadges)})`);

// 10. 다운로드
await dl(() => page.getByRole("button", { name: "신구대비표.docx 다운로드" }).click(), "신구대비표.docx");
// 9-1. 운영계획 ↔ 규정 초안 대조: 보류한 조항이 ‘값 불일치’로 드러남
await page.getByText("운영계획 ↔ 규정 초안 대조 (사업 조건 기준)").scrollIntoViewIfNeeded();
const mismatchRow = page.locator("tr", { hasText: "재도전성공패키지 · 지원 한도(기업당)" }).filter({ hasText: "값 불일치" });
assert((await mismatchRow.count()) >= 1 && (await mismatchRow.first().getByText("미반영").count()) === 1, "9-1. 계획↔초안 대조: 보류한 1개 조항이 ‘값 불일치·미반영’으로 표시");
await shot("09-draft-check");
await page.goto(`${BASE}/export`);
for (const nm of ["운영규칙 초안.docx", "운영요령 초안.docx", "근거 매핑표.csv", "작업 백업.json"]) {
  await dl(() => page.locator("li", { hasText: nm }).getByRole("button", { name: "다운로드" }).click(), nm);
}

// 11. 새로고침 후 상태 복원
await page.goto(`${BASE}/editor?doc=rule`);
await page.reload();
await page.getByRole("button", { name: /제6조\(지원 한도\)/ }).click();
await page.getByRole("heading", { name: "제6조(지원 한도)" }).waitFor();
await page.waitForTimeout(300);
const restoredBody = await page.locator("textarea").first().inputValue();
assert(restoredBody.includes("1.5억원") && restoredBody.includes("협약 체결일"), "11. 새로고침 후 반영된 본문(1.5억원 + 담당자 문장) 복원");
assert(await page.getByText("재검토 필요 — 다시 확인 후").isVisible(), "11. 검토 완료 조항이 반영 후 ‘재검토 필요’ 상태로 복원");
await page.goto(`${BASE}/review`);
await page.getByText("조건 값 불일치").first().waitFor();
await shot("11-review");
assert(true, "11. 보류된 조항이 검토 목록에 ‘조건 값 불일치’로 표시");
await page.goto(BASE);
await shot("00-dashboard");

// ── 반응형 점검: 5개 폭 × 8개 화면 가로 넘침 없음 (R21)
const ROUTES = ["/", "/sources", "/conditions", "/editor", "/review", "/changes", "/export", "/settings"];
const overflow = [];
for (const [w, h] of [[390, 844], [768, 1024], [1024, 768], [1280, 800], [1440, 900]]) {
  await page.setViewportSize({ width: w, height: h });
  for (const r of ROUTES) {
    await page.goto(`${BASE}${r}`);
    await page.waitForTimeout(500);
    const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 1) overflow.push(`${w}px ${r} +${o}px`);
  }
}
assert(overflow.length === 0, `반응형: 390·768·1024·1280·1440px × 8개 화면 가로 넘침 없음 ${overflow.join(", ")}`);

// ── 휴대폰(390px) 조작
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE);
await page.waitForTimeout(500);
assert((await page.locator('aside[aria-label="업무 메뉴"]').evaluate((e) => e.getBoundingClientRect().right)) <= 0, "휴대폰: 메뉴는 기본으로 숨김");
await page.getByRole("button", { name: "메뉴 열기" }).click();
await page.waitForTimeout(400);
assert((await page.locator('aside[aria-label="업무 메뉴"]').evaluate((e) => e.getBoundingClientRect().left)) >= 0, "휴대폰: ☰ 버튼으로 서랍 메뉴 열림");
await page.locator('aside[aria-label="업무 메뉴"] nav a', { hasText: "규정 편집기" }).click();
await page.waitForURL("**/editor**");
await page.waitForTimeout(400);
assert((await page.locator('aside[aria-label="업무 메뉴"]').evaluate((e) => e.getBoundingClientRect().right)) <= 0, "휴대폰: 메뉴 선택 시 서랍 닫힘");
await page.getByRole("tab", { name: "목차" }).click();
await page.getByRole("button", { name: /제6조\(지원 한도\)/ }).click();
await page.getByRole("heading", { name: "제6조(지원 한도)" }).waitFor();
assert(await page.locator("textarea").first().isVisible(), "휴대폰: 목차에서 조항 선택 → 조항 편집 탭으로 이동");
await shot("m-editor");
await page.getByRole("tab", { name: /근거·검토/ }).click();
assert(await page.getByRole("heading", { name: "근거" }).isVisible(), "휴대폰: 근거·검토 탭 표시");
await page.goto(`${BASE}/conditions`);
await page.waitForTimeout(600);
assert((await page.locator("table.rtable tbody td").first().getAttribute("data-label")) === "항목", "휴대폰: 표가 카드형으로 바뀌고 칸마다 열 이름 표시");
await shot("m-conditions");

assert(errors.length === 0, `브라우저 스크립트 오류 없음${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
