import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { applySuggestion, decideSuggestion, diffConditions, proposeFromPlanDoc, startChangeSet } from "@/lib/change";
import { buildCompareRows } from "@/lib/compare";
import { buildEvidenceCsv } from "@/lib/export/csv";
import { buildCompareDocx, buildRegulationDocx } from "@/lib/export/docx";
import { addPlanV2, clauseByKey, draftedSample } from "./helpers";

const OUT = path.join(process.cwd(), "test-output");

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
