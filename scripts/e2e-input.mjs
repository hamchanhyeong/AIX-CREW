// 실제 작업공간에서 파일로 문서 입력 → 조건 추출 → 초안 → 새 계획(안) 원문 비교 → 대비표 내려받기까지 확인한다.
// 사용: 서버 실행 후 `node scripts/e2e-input.mjs http://localhost:3000 [출력폴더]`
// 주의: 대상 서버의 '실제 작업공간'을 초기화한다. 시험용 서버(DATA_DIR 분리)에서만 실행할 것.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { Document, Packer, Paragraph } = require("docx");

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "test-output/e2e-input";
const FX = path.join(OUT, "fixtures");
mkdirSync(FX, { recursive: true });
const assert = (c, m) => {
  if (!c) throw new Error(`실패: ${m}`);
  console.log("✔", m);
};

// ── 시험 자료(가상)
const planLines = (limit, extra) => [
  "재기지원 사업 운영계획(안) 시험본(가상)",
  "1. 공통",
  "- 사업명: 재기지원 사업",
  "- 추진 주체: 미정",
  "2. 재도전성공패키지",
  "- 지원 대상: 재창업 예정자",
  `- 지원 한도(기업당 최대): ${limit}`,
  "- 선정 규모: 100개사 내외",
  ...extra,
];
const docx = (lines) => Packer.toBuffer(new Document({ sections: [{ children: lines.map((t) => new Paragraph(t)) }] }));
writeFileSync(path.join(FX, "plan-v1.docx"), await docx(planLines("1억원", [])));
writeFileSync(path.join(FX, "plan-v2.docx"), await docx(planLines("2억원", ["※ 시험용 추가 문장(가상)"])));
{
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([400, 300]).drawText("Article 1 (Purpose) test law page one.", { x: 20, y: 250, size: 10, font: f });
  pdf.addPage([400, 300]).drawText("Article 2 (Recovery) test law page two.", { x: 20, y: 250, size: 10, font: f });
  writeFileSync(path.join(FX, "law.pdf"), await pdf.save());
  const scan = await PDFDocument.create();
  scan.addPage([400, 300]).drawRectangle({ x: 10, y: 10, width: 50, height: 50 });
  writeFileSync(path.join(FX, "scan.pdf"), await scan.save());
  writeFileSync(path.join(FX, "rule.hwp"), "x");
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());

// 실제 작업공간 초기화 후 시작
await fetch(`${BASE}/api/workspace/reset?kind=main`, { method: "POST" });
await page.goto(BASE);
await page.evaluate(() => localStorage.setItem("reguflow.workspace", "main"));

// 이 환경의 Playwright는 한글 경로 파일을 넣지 못하므로 같은 이름의 File을 브라우저에서 만들어 넣는다(실제 파일 선택과 동일한 동작)
async function putFile(filePath, name) {
  const bytes = [...readFileSync(filePath)];
  await page.evaluate(({ name, bytes }) => {
    const input = document.querySelector('input[type="file"]');
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], name));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { name, bytes });
}
async function register({ file, name, title, type, version, expectError }) {
  await page.goto(`${BASE}/sources`);
  await page.getByRole("button", { name: "자료 등록" }).first().click();
  await page.getByLabel("문서명").fill(title);
  await page.getByLabel("자료 유형").selectOption(type);
  if (version) await page.getByLabel("버전").fill(version);
  await putFile(file, name);
  if (expectError) {
    const n = page.getByText(/^추출 실패:/);
    await n.waitFor({ timeout: 20000 });
    const msg = await n.innerText();
    assert(await page.getByRole("button", { name: "원문 등록" }).isDisabled(), `${name}: 등록 버튼 비활성`);
    return msg;
  }
  await page.getByText(/^추출 완료/).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "원문 등록" }).click();
  await page.getByText(/원문 조각 \d+개/).waitFor();
  return page.locator("li span.text-gray-500, li .font-semibold.text-gray-500").allInnerTexts();
}

// 1. 문서 입력
await register({ file: path.join(FX, "plan-v1.docx"), name: "재기지원 운영계획(안)_v1.docx", title: "운영계획(안) 시험본", type: "plan", version: "v1" });
assert(true, "DOCX 운영계획(안) v1 업로드·원문 등록(한글 파일명)");
await page.getByRole("button", { name: "이 계획안에서 사업 조건 추출" }).click();
await page.getByText(/조건 \d+개 추출/).waitFor();
assert(true, "운영계획(안)에서 사업 조건 추출");
const locs = await register({ file: path.join(FX, "law.pdf"), name: "중소기업창업 지원법(시험).pdf", title: "시험 법령", type: "law", version: "시험" });
assert(locs.some((l) => l.startsWith("p.1")) && locs.some((l) => l.startsWith("p.2")), `PDF 법령: 페이지 번호 위치 보존 (${locs.slice(0, 3).join(", ")})`);
const scanMsg = await register({ file: path.join(FX, "scan.pdf"), name: "스캔본.pdf", title: "스캔", type: "law", expectError: true });
assert(/스캔/.test(scanMsg), "스캔 PDF: 추출 실패로 알림(등록하지 않음)");
const hwpMsg = await register({ file: path.join(FX, "rule.hwp"), name: "규정(안).hwp", title: "HWP", type: "law", expectError: true });
assert(/HWP/.test(hwpMsg), "HWP: 지원하지 않음과 대안 안내");

// 2. 조건 확인 → 초안
await page.goto(`${BASE}/conditions`);
await page.getByText("공통 조건").waitFor();
const limitInput = page.locator("tr", { hasText: "지원 한도(기업당)" }).locator('input[placeholder="확인되지 않음(비워 두기)"]');
const values = await limitInput.evaluateAll((els) => els.map((e) => e.value));
assert(values.includes("1억원"), `사업 조건: 지원 한도 1억원 추출 (${values.join("/")})`);
await page.getByRole("button", { name: "조건 확인 완료" }).click();
await page.getByText(/조건 확인 완료:/).waitFor();
await page.goto(`${BASE}/editor`);
await page.getByRole("button", { name: "운영규칙·요령 초안 작성" }).click();
await page.getByRole("button", { name: /제6조\(지원 한도\)/ }).waitFor();
assert(true, "업로드한 계획(안)으로 운영규칙·요령 초안 작성");

// 3. 새 계획(안) 입력 → 원문 수정사항
await register({ file: path.join(FX, "plan-v2.docx"), name: "재기지원 운영계획(안)_v2.docx", title: "운영계획(안) 시험본", type: "plan", version: "v2" });
await page.goto(`${BASE}/changes`);
await page.getByRole("heading", { name: "운영계획(안) 원문 수정사항" }).waitFor();
const summary = await page.getByText(/바뀐 줄 \d+개/).innerText();
assert(/수정 1 · 추가 1 · 삭제 0/.test(summary), `업로드한 v1·v2 원문 비교: ${summary}`);
assert(await page.getByText("① 조건 비교 결과 — 바뀐 조건 1개").isVisible(), "사업 조건 비교: 지원 한도 1억원 → 2억원 1건");
const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "수정사항 대비표.docx 다운로드" }).click()]);
await d.saveAs(path.join(OUT, "운영계획 수정사항 대비표.docx"));
assert(true, "수정사항 대비표.docx 내려받기");
await page.getByRole("button", { name: /② 연결 조항 찾기/ }).click();
await page.getByText(/연결된 조항 \d+개에 수정안 생성/).waitFor();
assert((await page.getByRole("button", { name: "⑤ 반영" }).count()) >= 1, "연결 조항 수정안 생성");
await page.screenshot({ path: path.join(OUT, "input-changes.png"), fullPage: true });

assert(errors.length === 0, `브라우저 스크립트 오류 없음 ${errors.join(" | ")}`);
await browser.close();
