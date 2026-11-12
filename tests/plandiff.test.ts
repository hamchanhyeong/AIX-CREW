import { describe, expect, it } from "vitest";
import { diffConditions, proposeFromPlanDoc, startChangeSet, applySuggestion } from "@/lib/change";
import { addDoc } from "@/lib/demo";
import { checkPlanAgainstDraft, defaultBeforePlan, diffPlanDocs } from "@/lib/plandiff";
import { condId } from "@/lib/structure";
import { addPlanV2, clauseByKey, draftedSample } from "./helpers";

describe("운영계획(안) 이전·이후 원문 비교", () => {
  it("수정·추가된 줄을 찾고, 조건으로 인식된 줄과 인식되지 않은 줄을 구분한다", () => {
    const ws = draftedSample();
    const v1 = ws.docs.find((d) => d.type === "plan")!;
    const v2 = addPlanV2(ws);
    const r = diffPlanDocs(ws, v1.id, v2.id);
    const changed = r.rows.filter((x) => x.type !== "same");
    // 제목(v1→v2), 지원 한도(1억→1.5억) 수정 + 조건 미인식 문장 2줄 추가
    expect(r.modified).toBe(2);
    expect(r.added).toBe(2);
    expect(r.removed).toBe(0);
    const limit = changed.find((x) => x.after?.text.includes("1.5억원"))!;
    expect(limit.type).toBe("modified");
    expect(limit.before?.text).toContain("1억원");
    expect(limit.conditionIds).toEqual([condId("package", "amount")]);
    const notes = changed.filter((x) => x.type === "added");
    expect(notes.every((x) => x.conditionIds.length === 0)).toBe(true);
    expect(r.unrecognized).toBe(3); // 제목 줄 + 추가 문장 2줄
    expect(r.recognized).toBe(1);
  });

  it("바뀌지 않은 줄은 그대로 ‘같음’으로 둔다", () => {
    const ws = draftedSample();
    const v1 = ws.docs.find((d) => d.type === "plan")!;
    const v2 = addPlanV2(ws);
    const same = diffPlanDocs(ws, v1.id, v2.id).rows.filter((x) => x.type === "same");
    expect(same.some((x) => x.before?.text.includes("자산 취득 사전승인 기준: 1억원"))).toBe(true);
  });

  it("줄이 삭제되면 삭제로, 같은 자리의 줄이 바뀌면 수정으로 표시한다", () => {
    const ws = draftedSample();
    const a = addDoc(ws, { title: "A", type: "plan", version: "a", effectiveDate: "", text: "1. 공통\n- 사업명: 재기지원 사업\n- 추진 주체: 공단\n삭제될 문장", applicability: "applicable", isPublic: false });
    const b = addDoc(ws, { title: "B", type: "plan", version: "b", effectiveDate: "", text: "1. 공통\n- 사업명: 재기지원 사업\n- 추진 주체: 미정", applicability: "applicable", isPublic: false });
    const r = diffPlanDocs(ws, a.id, b.id);
    const org = r.rows.find((x) => x.before?.text.includes("추진 주체"))!;
    expect(org.type).toBe("modified");
    expect(org.conditionIds).toEqual([condId(null, "org")]); // '미정'(빈 값)으로 바뀐 것도 조건 변경으로 인식
    expect(r.rows.some((x) => x.type === "removed" && x.before?.text === "삭제될 문장")).toBe(true);
  });

  it("이전 계획(안) 기본값은 현재 사업 조건의 출처가 된 계획(안)이다", () => {
    const ws = draftedSample();
    const v1 = ws.docs.find((d) => d.type === "plan")!;
    const v2 = addPlanV2(ws);
    expect(defaultBeforePlan(ws, v2.id)).toBe(v1.id);
  });
});

describe("운영계획 ↔ 규정 초안 대조(조건 기준)", () => {
  it("계획 값이 연결 조항 본문에 있으면 ‘반영됨’, 빈 값은 ‘확인 필요’로 둔다", () => {
    const ws = draftedSample();
    const rows = checkPlanAgainstDraft(ws);
    expect(rows.find((r) => r.conditionId === condId("package", "amount"))!.status).toBe("reflected");
    expect(rows.find((r) => r.conditionId === condId(null, "org"))!.status).toBe("empty");
  });

  it("계획 변경 후 일부 조항만 반영하면 ‘값 불일치’로 드러난다", () => {
    const ws = draftedSample();
    const v2 = addPlanV2(ws);
    const cs = startChangeSet(ws, diffConditions(ws, proposeFromPlanDoc(ws, v2.id).proposed), { label: "v2", planDocId: v2.id });
    const sugs = ws.suggestions.filter((s) => s.changeSetId === cs.id);
    applySuggestion(ws, sugs[0].id); // 3개 중 1개만 반영
    const row = checkPlanAgainstDraft(ws).find((r) => r.conditionId === condId("package", "amount"))!;
    expect(row.status).toBe("mismatch");
    expect(row.clauses.filter((c) => c.reflected)).toHaveLength(1);
    expect(clauseByKey(ws, "rule.budget").body).toContain("1억원"); // 무관한 같은 숫자는 그대로
  });
});
