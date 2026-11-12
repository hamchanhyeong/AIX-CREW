import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Document, Packer, Paragraph, TextRun } from "docx";
import mammoth from "mammoth";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { applySuggestion, decideSuggestion, diffConditions, proposeFromPlanDoc, startChangeSet } from "@/lib/change";
import { buildCompareRows } from "@/lib/compare";
import { buildEvidenceCsv } from "@/lib/export/csv";
import { buildCompareDocx, buildPlanDiffDocx, buildRegulationDocx } from "@/lib/export/docx";
import { diffPlanDocs } from "@/lib/plandiff";
import { parseUpload } from "@/lib/server/parse";
import { addPlanV2, clauseByKey, draftedSample } from "./helpers";

const OUT = path.join(process.cwd(), "test-output");

describe("파일 업로드·추출", () => {
  it("TXT(UTF-8·EUC-KR)를 읽는다", async () => {
    const r = await parseUpload("plan.txt", Buffer.from("- 지원 한도: 1억원", "utf8"));
    expect(r.ok && r.text).toContain("지원 한도");
    const euc = Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]); // '한글' (EUC-KR)
    const r2 = await parseUpload("a.txt", euc);
    expect(r2.ok && r2.text).toBe("한글");
  });

  it("HWP는 지원하지 않는다고 알린다", async () => {
    const r = await parseUpload("규정.hwp", Buffer.from("x"));
    expect(r).toMatchObject({ ok: false, code: "unsupported" });
  });

  it("텍스트 기반 PDF는 페이지별로 추출한다", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const t of ["Article 1 Purpose of this regulation text page one", "Article 2 Definitions on page two of the file"]) {
      pdf.addPage([400, 300]).drawText(t, { x: 20, y: 250, size: 10, font });
    }
    const r = await parseUpload("law.pdf", Buffer.from(await pdf.save()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pages).toHaveLength(2);
      expect(r.pages![1]).toContain("Definitions");
    }
  });

  it("텍스트가 없는(스캔) PDF는 실패로 알린다", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([400, 300]).drawRectangle({ x: 10, y: 10, width: 100, height: 100 });
    const r = await parseUpload("scan.pdf", Buffer.from(await pdf.save()));
    expect(r).toMatchObject({ ok: false, code: "scanned" });
  });

  it("DOCX를 읽고, 손상된 DOCX는 실패로 알린다", async () => {
    const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("제1조(목적) 이 규정은 시험용이다.")] })] }] });
    const r = await parseUpload("a.docx", await Packer.toBuffer(doc));
    expect(r.ok && r.text).toContain("제1조(목적)");
    const bad = await parseUpload("bad.docx", Buffer.from("not a zip"));
    expect(bad).toMatchObject({ ok: false, code: "failed" });
  });

  it("지원하지 않는 형식은 실패로 알린다", async () => {
    expect(await parseUpload("a.xlsx", Buffer.from("x"))).toMatchObject({ ok: false, code: "unsupported" });
  });
});

describe("내보내기", () => {
  it("운영규칙·요령 DOCX가 열리고 한글·표·검토용 표시가 유지된다", async () => {
    const ws = draftedSample();
    mkdirSync(OUT, { recursive: true });
    for (const dk of ["rule", "manual"] as const) {
      const buf = await buildRegulationDocx(ws, dk);
      writeFileSync(path.join(OUT, `${dk === "rule" ? "운영규칙" : "운영요령"} 초안.docx`), buf);
      const html = (await mammoth.convertToHtml({ buffer: buf })).value;
      expect(html).toContain("검토용 초안");
      expect(html).toContain("시연용 가상 자료");
      expect(html).toContain("제1조(목적)");
      expect(html).toContain("【확인 필요");
      expect(html).toContain("<table>");
      expect(html).toContain("조항별 근거 목록");
    }
  });

  it("신구대비표 DOCX에 6개 열과 반영 상태가 들어간다", async () => {
    const ws = draftedSample();
    const v2 = addPlanV2(ws);
    const cs = startChangeSet(ws, diffConditions(ws, proposeFromPlanDoc(ws, v2.id).proposed), { label: "가상 계획 v2", planDocId: v2.id });
    const sugs = ws.suggestions.filter((s) => s.changeSetId === cs.id);
    applySuggestion(ws, sugs[0].id);
    decideSuggestion(ws, sugs[1].id, "held");
    const basis = { kind: "changeset" as const, changeSetId: cs.id };
    const buf = await buildCompareDocx(ws, buildCompareRows(ws, basis), basis, "가상 계획 v2");
    writeFileSync(path.join(OUT, "신구대비표.docx"), buf);
    const html = (await mammoth.convertToHtml({ buffer: buf })).value;
    for (const h of ["문서·조항", "변경 전", "변경 제안", "변경 사유", "관련 계획·근거", "반영 상태", "[수정]", "반영", "보류", "1.5억원"]) {
      expect(html).toContain(h);
    }
    expect(clauseByKey(ws, "rule.budget").body).toContain("1억원");
  });

  it("운영계획 수정사항 대비표 DOCX에 수정·추가 줄과 조건 인식 결과가 들어간다", async () => {
    const ws = draftedSample();
    const v1 = ws.docs.find((d) => d.type === "plan")!;
    const v2 = addPlanV2(ws);
    const buf = await buildPlanDiffDocx(ws, diffPlanDocs(ws, v1.id, v2.id), "가상 v1", "가상 v2");
    writeFileSync(path.join(OUT, "운영계획 수정사항 대비표.docx"), buf);
    const html = (await mammoth.convertToHtml({ buffer: buf })).value;
    // 바뀐 글자만 강조하므로 서식을 뺀 글자로 확인
    const text = html.replace(/<[^>]+>/g, "");
    for (const h of ["운영계획(안) 수정사항 대비표", "이전 계획(안)", "새 계획(안)", "사업 조건", "[수정]", "[추가]", "1.5억원", "조건 미인식", "지원 한도(기업당)", "검토용 초안"]) {
      expect(text).toContain(h);
    }
    expect(html).toContain("<table>");
  });

  it("근거 매핑표 CSV는 BOM과 한글 헤더를 가진다", () => {
    const ws = draftedSample();
    const csv = buildEvidenceCsv(ws);
    writeFileSync(path.join(OUT, "근거 매핑표.csv"), csv);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("근거역할");
    expect(csv).toContain("유사사업 참고");
    expect(csv).toContain("원문 미등록");
  });
});
