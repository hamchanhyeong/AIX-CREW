// index.html(한 장 버전)을 file://로 열어 시연 시나리오 1~11단계를 실행한다.
// 사용: node scripts/e2e-single.mjs [출력폴더]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL = pathToFileURL(path.join(root, "index.html")).href;
const OUT = process.argv[2] ?? path.join(root, "test-output/e2e-single");
mkdirSync(OUT, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error(`실패: ${msg}`);
  console.log("✔", msg);
}
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "초기화" : undefined));
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });

// 1
await page.goto(URL);
await page.getByRole("button", { name: /샘플 프로젝트 (다시 )?시작/ }).click();
await page.getByText("자료 관리", { exact: true }).first().waitFor();
assert(await page.getByText("시연용 가상 자료 — 실제 사업 조건이 아닙니다.").first().isVisible(), "1. 샘플 프로젝트 시작(시연용 가상 자료 표시)");
// 2
await page.getByRole("cell", { name: /\[가상\] 재기지원 사업 운영계획\(안\)/ }).first().click();
await page.getByText("- 지원 한도(기업당 최대): 1억원").waitFor();
await shot("02-sources");
await page.getByRole("cell", { name: /\[가상\] 유사사업 운영규정/ }).click();
await page.getByText("이번 사업의 현행 규정·의무 기준이 아닙니다").waitFor();
assert(true, "2. 가상 운영계획·유사사업 규정 원문 확인");
// 3
await page.goto(`${URL}#/conditions`);
await page.getByText("공통 조건").waitFor();
const n = await page.locator('select[data-change="cond-status"]').count();
for (let i = 0; i < n; i++) {
  const s = page.locator('select[data-change="cond-status"]').nth(i);
  const can = await s.locator('option[value="confirmed"]').evaluate((o) => !o.disabled);
  if (can && (await s.inputValue()) === "unconfirmed") await s.selectOption("confirmed");
}
const left = await page.locator('select[data-change="cond-status"]').evaluateAll((els) => els.filter((e) => e.value === "unconfirmed").length);
await shot("03-conditions");
assert(left > 0, `3. 값 있는 조건만 확정, 빈 값 ${left}개는 미확정 유지`);
await page.getByRole("button", { name: "조건 확인 완료" }).click();
await page.getByText(/조건 확인 완료:/).waitFor();
// 4
await page.goto(`${URL}#/editor`);
await page.getByRole("button", { name: "운영규칙·요령 초안 작성" }).click();
await page.getByRole("button", { name: /제6조\(지원 한도\)/ }).waitFor();
assert(true, "4. 운영규칙·운영요령 초안 생성");
// 5
await page.getByRole("button", { name: /제6조\(지원 한도\)/ }).click();
await page.getByRole("heading", { name: "제6조(지원 한도)" }).waitFor();
await page.getByRole("button", { name: "원문 보기" }).first().click();
await shot("05-editor-1440");
await page.setViewportSize({ width: 1280, height: 800 });
await shot("05-editor-1280");
await page.setViewportSize({ width: 1440, height: 900 });
assert(await page.locator("blockquote", { hasText: "1억원" }).first().isVisible(), "5. 연결된 운영계획 원문 인용(1억원) 확인");
// 6
const body = page.locator("#cl-body");
await body.fill((await body.inputValue()) + "\n③ 지원 한도 적용 기준일은 협약 체결일로 한다.");
await page.getByRole("button", { name: "저장", exact: true }).click();
await page.getByRole("button", { name: "검토 완료" }).click();
assert(await page.locator(".seg.rv button.on", { hasText: "검토 완료" }).isVisible(), "6. 조항 수정·저장 후 검토 완료");
// 7
await page.goto(`${URL}#/changes`);
await page.getByRole("button", { name: /가상 계획 v2 등록/ }).click();
await page.getByText("① 조건 비교 결과 — 바뀐 조건 1개").waitFor();
assert(await page.locator("ins", { hasText: "1.5억원" }).first().isVisible(), "7. 지원 한도 1억원 → 1.5억원 비교");
await page.getByRole("button", { name: /② 연결 조항 찾기/ }).click();
await page.getByText(/연결된 조항 3개에 수정안 생성/).waitFor();
// 8
assert((await page.getByRole("button", { name: "⑤ 반영" }).count()) === 3, "8. 연결된 3개 조항만 수정 제안");
assert(await page.getByText(/조건과 연결되지 않은 \d+개 조항은 자동 검토 범위에 포함되지 않았습니다/).isVisible(), "8. 미연결 조항은 자동 검토 범위 밖으로 표시");
// 9
await page.getByRole("button", { name: "⑤ 반영" }).first().click();
await page.getByRole("button", { name: "⑤ 반영" }).first().click();
await page.getByRole("button", { name: "보류", exact: true }).first().click();
await page.getByRole("button", { name: /⑥ 반영 결과를 새 버전으로 저장/ }).click();
await page.getByText(/반영 저장 v\d+/).waitFor();
await shot("09-changes");
const st = await page.locator("table.cmp td:last-child").allInnerTexts();
assert(st.filter((t) => t.includes("반영")).length === 2 && st.filter((t) => t.includes("보류")).length === 1, `9. 2건 반영·1건 보류·새 버전 저장 ${JSON.stringify(st)}`);
// 10
const dl = async (click, save) => {
  const [d] = await Promise.all([page.waitForEvent("download"), click()]);
  await d.saveAs(path.join(OUT, save));
  const t = await page.locator(".toast", { hasText: "내려받았습니다" }).last().innerText();
  assert(/[가-힣]/.test(t), `10. ${t}`);
};
await dl(() => page.getByRole("button", { name: "신구대비표.docx 다운로드" }).click(), "신구대비표.docx");
await page.goto(`${URL}#/export`);
for (const [label, save] of [["운영규칙 초안.docx", "운영규칙 초안.docx"], ["운영요령 초안.docx", "운영요령 초안.docx"], ["근거 매핑표.csv", "근거 매핑표.csv"], ["작업 백업.json", "작업 백업.json"]]) {
  await dl(() => page.locator(".dl li", { hasText: label }).getByRole("button", { name: "다운로드" }).click(), save);
}
// 11
await page.reload();
await page.goto(`${URL}#/editor`);
await page.getByRole("button", { name: /제6조\(지원 한도\)/ }).click();
await page.getByRole("heading", { name: "제6조(지원 한도)" }).waitFor();
const restored = await page.locator("#cl-body").inputValue();
assert(restored.includes("1.5억원") && restored.includes("협약 체결일"), "11. 새로고침 후 반영 본문 복원");
assert(await page.getByText("재검토 필요 — 다시 확인 후").isVisible(), "11. 재검토 필요 상태 복원");
await page.goto(`${URL}#/review`);
await page.getByText("조건 값 불일치").first().waitFor();
await shot("11-review");
assert(true, "11. 보류 조항이 검토 목록에 ‘조건 값 불일치’로 표시");
await page.goto(URL);
await page.waitForTimeout(200);
await shot("00-dashboard");
assert(errors.length === 0, `브라우저 스크립트 오류 없음 ${errors.join(" | ")}`);
await browser.close();
