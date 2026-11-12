// 실제 작업공간(고객 사용) 흐름 검증: 저장소 이전, 원문 파일 읽기(PDF·DOCX·TXT·실패 형식), 새로고침 유지,
// 작업 파일 저장·열기, 사용 안내. 사용: npm run build && node scripts/e2e-real.mjs [출력폴더] [한글PDF경로(선택)]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { Document, Packer, Paragraph } = require("docx");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL = pathToFileURL(path.join(root, "site", "index.html")).href;
const OUT = process.argv[2] ?? path.join(root, "test-output/e2e-real");
const KOREAN_PDF = process.argv[3];
const FX = path.join(OUT, "fixtures");
mkdirSync(FX, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error(`실패: ${msg}`);
  console.log("✔", msg);
}

// ── 시험 자료 만들기
{
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([400, 300]).drawText("Article 1 (Purpose) Test regulation page one.", { x: 20, y: 250, size: 10, font });
  pdf.addPage([400, 300]).drawText("Article 2 (Definitions) Second page sentence.", { x: 20, y: 250, size: 10, font });
  writeFileSync(path.join(FX, "law.pdf"), await pdf.save());
  const scan = await PDFDocument.create();
  scan.addPage([400, 300]).drawRectangle({ x: 10, y: 10, width: 50, height: 50 });
  writeFileSync(path.join(FX, "scan.pdf"), await scan.save());
  const doc = new Document({ sections: [{ children: ["재기지원 사업 운영계획(안) 시험본", "2. 재도전성공패키지", "- 지원 한도(기업당 최대): 2억원", "- 선정 규모: 미정"].map((t) => new Paragraph(t)) }] });
  writeFileSync(path.join(FX, "plan.docx"), await Packer.toBuffer(doc));
  writeFileSync(path.join(FX, "rule.hwp"), "x");
}

// 이 환경의 Playwright는 한글 경로 파일을 file input에 넣지 못하므로, 브라우저 안에서 같은 이름의 File을 만들어 넣는다
// (실제 브라우저에서 한글 파일명을 고르는 것과 같은 동작)
async function putFile(pg, selector, filePath, name = path.basename(filePath)) {
  const bytes = [...readFileSync(filePath)];
  await pg.evaluate(({ selector, name, bytes }) => {
    const input = document.querySelector(selector);
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], name));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { selector, name, bytes });
}

const browser = await chromium.launch();
const errors = [];
async function newPage(ctx) {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("dialog", (d) => d.accept(d.type() === "prompt" ? "초기화" : undefined));
  return p;
}

// ── 1. 이전 버전(localStorage) 데이터 자동 이전
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await newPage(ctx);
  await page.goto(URL);
  await page.getByText("프로젝트 현황").first().waitFor();
  const old = { schemaVersion: 1, kind: "main", isDemo: false, project: { id: "p-old", name: "이전 버전 작업", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", generationMode: "template", modifiedSinceSnapshot: false }, programs: [], sections: [], docs: [], chunks: [], conditions: [], clauses: [], suggestions: [], changeSets: [], snapshots: [], aiIssues: [] };
  await page.evaluate(async (o) => {
    await new Promise((r) => { const q = indexedDB.deleteDatabase("reguflow"); q.onsuccess = q.onerror = q.onblocked = () => r(); });
    localStorage.setItem("reguflow-html.ws.main", JSON.stringify(o));
  }, old);
  await page.reload();
  await page.getByText("이전 버전 작업").first().waitFor();
  const left = await page.evaluate(() => localStorage.getItem("reguflow-html.ws.main"));
  assert(left === null, "이전 버전(localStorage) 작업을 새 저장소(IndexedDB)로 자동 이전");
  await page.reload();
  await page.getByText("이전 버전 작업").first().waitFor();
  assert(true, "이전 후 새로고침해도 유지");
  await ctx.close();
}

// ── 2. 실제 작업공간 첫 화면
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await newPage(ctx);
await page.goto(URL);
await page.getByText("프로젝트 현황").first().waitFor();
await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase("reguflow"); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
await page.reload();
await page.getByText("시작하기").first().waitFor();
assert(await page.getByText("템플릿 작성 · AI 미사용").isVisible(), "실제 작업공간: ‘데모’ 대신 ‘템플릿 작성 · AI 미사용’ 표시");
assert(!(await page.getByText("시연용 가상 자료 — 실제 사업 조건이 아닙니다").count()), "실제 작업공간: 시연용 표시 없음");
await page.screenshot({ path: path.join(OUT, "r-01-onboarding.png") });

// ── 3. 원문 파일 읽기
async function register(file, title, type, expectOk, name) {
  await page.goto(`${URL}#/sources`);
  await page.getByRole("button", { name: "자료 등록" }).first().click();
  await page.locator("#n-title").fill(title);
  await page.locator("#n-type").selectOption(type);
  await putFile(page, 'input[data-change="src-file"]', file, name);
  if (expectOk === true) {
    await page.getByText(/읽기 완료/).waitFor({ timeout: 20000 });
    assert((await page.locator("#n-title").inputValue()) === title && (await page.locator("#n-type").inputValue()) === type, `파일을 읽어도 입력한 문서명·유형 유지(${title})`);
  }
  if (expectOk !== true) {
    const t = page.locator(".toast", { hasText: expectOk }).last();
    await t.waitFor();
    return t.innerText();
  }
  const text = await page.locator("#n-text").inputValue();
  await page.getByRole("button", { name: "원문과 함께 등록" }).click();
  await page.getByText(/원문 조각 \d+개/).waitFor();
  const locs = await page.locator(".chunks .loc").allInnerTexts();
  return { text, locs };
}
{
  const r = await register(path.join(FX, "law.pdf"), "시험 법령(PDF)", "law", true, "중소기업창업 지원법(시험).pdf");
  assert(r.locs.some((l) => l.startsWith("p.1")) && r.locs.some((l) => l.startsWith("p.2")), `PDF: 페이지 번호 위치 보존 (${r.locs.join(", ")})`);
}
if (KOREAN_PDF) {
  const r = await register(KOREAN_PDF, "한글 법령(PDF)", "law", true, "한글 법령 발췌.pdf");
  assert(/중소기업창업 지원법/.test(r.text) && /둘째 쪽/.test(r.text), "한글 PDF: 한글 본문을 읽음");
  assert(r.locs.some((l) => l.startsWith("p.2")), "한글 PDF: 2쪽 위치 보존");
}
{
  const r = await register(path.join(FX, "plan.docx"), "운영계획(안) 시험본(DOCX)", "plan", true, "재기지원 운영계획(안).docx");
  assert(r.text.includes("지원 한도(기업당 최대): 2억원"), "DOCX: 본문을 읽음");
  await page.getByRole("button", { name: "이 계획안에서 사업 조건 추출" }).click();
  await page.locator(".toast", { hasText: /조건 \d+개 추출/ }).last().waitFor();
  await page.goto(`${URL}#/conditions`);
  const v = await page.locator('input[data-change="cond-val"][data-id="c-package-amount"]').inputValue();
  assert(v === "2억원", "DOCX 운영계획에서 사업 조건(지원 한도 2억원) 추출");
}
{
  const msg = await register(path.join(FX, "scan.pdf"), "스캔 문서", "law", /원문을 읽지 못했습니다.*스캔/, "스캔본.pdf");
  assert(/스캔/.test(msg), "스캔 PDF: 실패로 알림(성공 처리하지 않음)");
  const msg2 = await register(path.join(FX, "rule.hwp"), "HWP 문서", "law", /원문을 읽지 못했습니다.*HWP/, "재기지원 규정(안).hwp");
  assert(/HWP/.test(msg2), "HWP: 지원하지 않음과 대안 안내");
}
await page.screenshot({ path: path.join(OUT, "r-02-sources.png") });

// ── 4. 새로고침 후 유지(IndexedDB)
await page.reload();
await page.goto(`${URL}#/sources`);
await page.getByText("운영계획(안) 시험본(DOCX)").first().waitFor();
const n = await page.locator(".tbl tbody tr").count();
assert(n === (KOREAN_PDF ? 3 : 2), `새로고침 후 등록 자료 ${n}건 유지(실패한 파일은 등록되지 않음)`);

// ── 5. 작업 파일 저장 알림 → 저장 → 다른 PC(새 브라우저)에서 열기
await page.goto(URL);
await page.getByText("아직 작업 파일로 저장한 적이 없습니다.").waitFor();
assert(true, "작업 파일로 저장한 적이 없으면 현황 화면에서 알림");
const [d] = await Promise.all([page.waitForEvent("download"), page.locator(".file-note").getByRole("button", { name: "작업 파일 저장" }).click()]);
const saved = path.join(OUT, "작업파일.json");
await d.saveAs(saved);
const json = JSON.parse(readFileSync(saved, "utf8"));
assert(json.project.lastFileSavedAt && json.docs.length === (KOREAN_PDF ? 3 : 2), "작업 파일(.json) 내려받기: 자료 전체·저장 시각 포함");
await page.waitForTimeout(300);
assert(!(await page.locator(".file-note").count()), "저장 후 알림 사라짐");

const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p2 = await newPage(ctx2);
await p2.goto(`${URL}#/export`);
await p2.getByText("작업 파일 열기").first().waitFor();
await putFile(p2, 'input[data-change="restore"]', saved, "재기지원 규정_작업파일.json");
await p2.locator(".toast", { hasText: "작업 파일을 열었습니다" }).waitFor();
await p2.goto(`${URL}#/sources`);
await p2.getByText("운영계획(안) 시험본(DOCX)").first().waitFor();
assert(true, "다른 브라우저에서 작업 파일 열기 → 자료 복원");
await ctx2.close();

// ── 6. 사용 안내
await page.goto(`${URL}#/help`);
await page.getByRole("heading", { name: "사용 안내" }).waitFor();
assert(await page.getByText("데이터 보관과 이동").isVisible(), "사용 안내 화면 표시");
await page.screenshot({ path: path.join(OUT, "r-03-help.png"), fullPage: true });

// ── 7. 외부 네트워크 요청 없음
const external = [];
const ctx3 = await browser.newContext();
const p3 = await ctx3.newPage();
p3.on("request", (r) => { if (!r.url().startsWith("file:") && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) external.push(r.url()); });
await p3.goto(URL);
await p3.getByText("프로젝트 현황").first().waitFor();
await p3.goto(`${URL}#/help`);
await p3.waitForTimeout(300);
assert(external.length === 0, `외부 서버 요청 없음(자료가 PC 밖으로 나가지 않음) ${external.join(" ")}`);
await ctx3.close();

assert(errors.length === 0, `브라우저 스크립트 오류 없음 ${errors.join(" | ")}`);
await browser.close();
