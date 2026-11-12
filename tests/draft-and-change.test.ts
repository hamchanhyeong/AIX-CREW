import { describe, expect, it } from "vitest";
import { applySuggestion, decideSuggestion, diffConditions, proposeFromPlanDoc, saveChangeSetVersion, startChangeSet } from "@/lib/change";
import { buildCompareRows } from "@/lib/compare";
import { computeIssues } from "@/lib/checks";
import { buildSampleWorkspace } from "@/lib/demo";
import { generateDraft } from "@/lib/draft";
import { addClause, editClause, moveClause, setDocText, setReviewStatus, updateChunkText, updateCondition } from "@/lib/ops";
import { articleNumbers } from "@/lib/render";
import { condId } from "@/lib/structure";
import { addPlanV2, clauseByKey, draftedSample } from "./helpers";

describe("샘플 자료와 조건 추출", () => {
  it("가상 계획안에서 조건을 추출하되 모두 미확정으로 시작한다", () => {
    const ws = buildSampleWorkspace();
    const limit = ws.conditions.find((c) => c.id === condId("package", "amount"))!;
    expect(limit.value).toBe("1억원");
    expect(limit.status).toBe("unconfirmed");
    expect(limit.sourceChunkId).toBeTruthy();
    expect(ws.conditions.every((c) => c.status === "unconfirmed")).toBe(true);
  });

  it("‘미정’이거나 없는 값은 임의로 채우지 않고 빈 값으로 둔다", () => {
    const ws = buildSampleWorkspace();
    const org = ws.conditions.find((c) => c.id === condId(null, "org"))!;
    expect(org.value).toBe("");
    const cheerAmount = ws.conditions.find((c) => c.id === condId("cheer", "amount"))!;
    expect(cheerAmount.value).toBe("");
    const cheerExclusion = ws.conditions.find((c) => c.id === condId("cheer", "exclusion"))!;
    expect(cheerExclusion.value).toBe("");
  });

  it("빈 조건은 확정할 수 없다", () => {
    const ws = buildSampleWorkspace();
    expect(() => updateCondition(ws, condId(null, "org"), { status: "confirmed" })).toThrow();
  });
});

describe("초안 생성", () => {
  it("운영규칙 8개 장·운영요령 4개 편 구조로 1부씩 만든다", () => {
    const ws = draftedSample();
    expect(ws.sections.filter((s) => s.docKind === "rule")).toHaveLength(8);
    expect(ws.sections.filter((s) => s.docKind === "manual")).toHaveLength(4);
    expect(ws.clauses.some((c) => c.docKind === "rule")).toBe(true);
    expect(ws.clauses.some((c) => c.docKind === "manual")).toBe(true);
  });

  it("미확정·빈 값은 【확인 필요】로 남는다", () => {
    const ws = draftedSample();
    expect(clauseByKey(ws, "rule.org").body).toContain("【확인 필요: 추진 주체】");
    expect(clauseByKey(ws, "manual.cheer.voucher").body).toContain("【확인 필요: 재도전응원프로젝트 지원 한도(기업당)】");
  });

  it("미확정 상태 값은 【미확정】 표시와 함께 들어간다", () => {
    const ws = buildSampleWorkspace();
    generateDraft(ws);
    expect(clauseByKey(ws, "manual.package.amount").body).toContain("1억원【미확정】");
  });

  it("원문이 없는 법령은 ‘원문 미등록’ 근거로 남고 조문 번호를 만들지 않는다", () => {
    const ws = draftedSample();
    const recovery = clauseByKey(ws, "rule.recovery");
    const lawSrc = recovery.sources.find((s) => s.role === "legal_candidate");
    expect(lawSrc?.chunkId).toBeUndefined();
    expect(recovery.body).not.toMatch(/법\s*제\s*\d+\s*조/);
    const issues = computeIssues(ws).filter((i) => i.clauseId === recovery.id);
    expect(issues.some((i) => i.kind === "source_missing")).toBe(true);
  });

  it("배경자료(보도 메모)는 어떤 조항의 근거로도 연결되지 않는다", () => {
    const ws = draftedSample();
    const bg = ws.docs.find((d) => d.type === "background")!;
    expect(ws.clauses.some((c) => c.sources.some((s) => s.docId === bg.id))).toBe(false);
  });

  it("유사사업 규정은 ‘유사사업 참고’ 역할로만 연결된다", () => {
    const ws = draftedSample();
    const sim = ws.docs.find((d) => d.type === "similar")!;
    const roles = new Set(ws.clauses.flatMap((c) => c.sources.filter((s) => s.docId === sim.id).map((s) => s.role)));
    expect([...roles]).toEqual(["similar_ref"]);
  });
});

describe("편집·검토 상태", () => {
  it("검토 완료 조항을 수정하면 재검토 필요로 바뀐다", () => {
    const ws = draftedSample();
    const c = clauseByKey(ws, "rule.purpose");
    setReviewStatus(ws, c.id, "approved");
    editClause(ws, c.id, { body: `${c.body}\n③ 담당자 추가 문장.` });
    expect(c.reviewStatus).toBe("needs_rereview");
    expect(c.userEdited).toBe(true);
  });

  it("근거 원문 버전이 바뀌면 연결 조항의 검토 완료가 재검토 필요로 바뀐다", () => {
    const ws = draftedSample();
    const c = clauseByKey(ws, "rule.evaluator");
    setReviewStatus(ws, c.id, "approved");
    const src = c.sources.find((s) => s.chunkId)!;
    updateChunkText(ws, src.chunkId!, "제8조(평가위원의 제척) 수정된 원문.");
    expect(c.reviewStatus).toBe("needs_rereview");
    const issues = computeIssues(ws).filter((i) => i.clauseId === c.id);
    expect(issues.some((i) => i.kind === "quote_mismatch")).toBe(true);
  });

  it("조항 순서를 바꿔도 조항 ID와 조건 연결은 유지되고 번호만 바뀐다", () => {
    const ws = draftedSample();
    const amount = clauseByKey(ws, "rule.amount");
    const before = articleNumbers(ws, "rule").get(amount.id)!;
    moveClause(ws, amount.id, -1);
    expect(articleNumbers(ws, "rule").get(amount.id)).toBe(before - 1);
    expect(amount.conditionIds).toContain(condId("package", "amount"));
  });

  it("존재하지 않는 내부 참조를 검출하고 외부 법령 참조는 제외한다", () => {
    const ws = draftedSample();
    const c = addClause(ws, "rule", "s-rule-8");
    editClause(ws, c.id, { body: "제99조에 따른다. 법 제5조와 「중소기업창업 지원법」 제2조를 참고한다." });
    const refs = computeIssues(ws).filter((i) => i.clauseId === c.id && i.kind === "broken_ref");
    expect(refs).toHaveLength(1);
    expect(refs[0].message).toContain("제99조");
  });
});

describe("계획 변경과 신구대비표 (시연 7~10단계)", () => {
  function changed() {
    const ws = draftedSample();
    // 담당자가 지원 한도 조항을 직접 수정하고 검토 완료
    const ruleAmount = clauseByKey(ws, "rule.amount");
    editClause(ws, ruleAmount.id, { body: `${ruleAmount.body}\n③ 담당자가 추가한 문장은 보존되어야 한다.` });
    setReviewStatus(ws, ruleAmount.id, "approved");
    const v2 = addPlanV2(ws);
    const { proposed } = proposeFromPlanDoc(ws, v2.id);
    const diffs = diffConditions(ws, proposed);
    const cs = startChangeSet(ws, diffs, { label: "가상 계획 v2", planDocId: v2.id });
    return { ws, cs, diffs };
  }

  it("새 계획과 이전 조건을 비교하면 지원 한도만 바뀐다", () => {
    const { diffs } = changed();
    expect(diffs).toHaveLength(1);
    expect(diffs[0].conditionId).toBe(condId("package", "amount"));
    expect(diffs[0].beforeValue).toBe("1억원");
    expect(diffs[0].afterValue).toBe("1.5억원");
  });

  it("지원 한도 조건과 연결된 조항에만 수정 제안이 생긴다", () => {
    const { ws, cs } = changed();
    const keys = cs.affectedClauseIds.map((id) => ws.clauses.find((c) => c.id === id)!.templateKey).sort();
    expect(keys).toEqual(["manual.package.agreement", "manual.package.amount", "rule.amount"].sort());
    expect(cs.unlinkedClauseCount).toBe(ws.clauses.length - 3);
  });

  it("무관한 조항의 같은 숫자(자산 취득 기준 1억원)는 바뀌지 않는다", () => {
    const { ws, cs } = changed();
    const budget = clauseByKey(ws, "rule.budget");
    const manualBudget = clauseByKey(ws, "manual.budget");
    expect(budget.body).toContain("1억원");
    expect(manualBudget.body).toContain("1억원");
    const sugs = ws.suggestions.filter((s) => s.changeSetId === cs.id);
    expect(sugs.some((s) => s.clauseId === budget.id || s.clauseId === manualBudget.id)).toBe(false);
    for (const s of sugs) expect(s.after).not.toContain("단일 품목 1.5억원");
  });

  it("사용자 수정본을 보존한 채 값만 바꾼 제안을 만든다", () => {
    const { ws, cs } = changed();
    const ruleAmount = clauseByKey(ws, "rule.amount");
    const s = ws.suggestions.find((x) => x.changeSetId === cs.id && x.clauseId === ruleAmount.id)!;
    expect(s.after).toContain("기업당 최대 1.5억원");
    expect(s.after).toContain("담당자가 추가한 문장은 보존되어야 한다.");
    expect(s.after).not.toContain("기업당 최대 1억원");
  });

  it("일부 반영·일부 보류 후 새 버전으로 저장하고 신구대비표를 만든다", () => {
    const { ws, cs } = changed();
    const sugs = ws.suggestions.filter((s) => s.changeSetId === cs.id);
    const ruleAmount = clauseByKey(ws, "rule.amount");
    const held = sugs.find((s) => s.clauseId === clauseByKey(ws, "manual.package.agreement").id)!;
    for (const s of sugs) if (s.id !== held.id) expect(applySuggestion(ws, s.id)).toEqual({ ok: true });
    decideSuggestion(ws, held.id, "held");

    expect(ruleAmount.body).toContain("1.5억원");
    expect(ruleAmount.reviewStatus).toBe("needs_rereview"); // 검토 완료 → 재검토
    expect(clauseByKey(ws, "manual.package.agreement").body).toContain("최대 1억원");

    // 보류된 조항은 조건 값 불일치로 검토 목록에 남는다
    const mismatch = computeIssues(ws).filter((i) => i.kind === "value_mismatch");
    expect(mismatch.map((i) => i.clauseId)).toContain(held.clauseId);

    const snap = saveChangeSetVersion(ws, cs.id);
    expect(snap.version).toBeGreaterThan(1);
    const rows = buildCompareRows(ws, { kind: "changeset", changeSetId: cs.id });
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.status === "반영")).toHaveLength(2);
    expect(rows.filter((r) => r.status === "보류")).toHaveLength(1);
  });

  it("제안 생성 이후 조항이 수정되면 반영하지 않는다(사용자 수정본 보호)", () => {
    const { ws, cs } = changed();
    const target = clauseByKey(ws, "manual.package.amount");
    const s = ws.suggestions.find((x) => x.changeSetId === cs.id && x.clauseId === target.id)!;
    editClause(ws, target.id, { body: `${target.body} (추가 수정)` });
    const r = applySuggestion(ws, s.id);
    expect(r.ok).toBe(false);
    expect(target.body).toContain("(추가 수정)");
  });

  it("이전 값을 본문에서 찾지 못하면 자동 수정하지 않고 직접 수정 필요로 표시한다", () => {
    const ws = draftedSample();
    const target = clauseByKey(ws, "manual.package.amount");
    editClause(ws, target.id, { body: "사업화 자금 한도는 별도로 정한다." });
    const v2 = addPlanV2(ws);
    const { proposed } = proposeFromPlanDoc(ws, v2.id);
    const cs = startChangeSet(ws, diffConditions(ws, proposed), { label: "v2", planDocId: v2.id });
    const s = ws.suggestions.find((x) => x.changeSetId === cs.id && x.clauseId === target.id)!;
    expect(s.manualOnly).toBe(true);
    expect(s.warnings.length).toBeGreaterThan(0);
    expect(applySuggestion(ws, s.id).ok).toBe(false);
  });

  it("버전 간 비교는 추가·삭제·수정을 구분한다", () => {
    const ws = draftedSample();
    const base = ws.snapshots[0];
    const c = clauseByKey(ws, "rule.purpose");
    editClause(ws, c.id, { body: "수정 본문" });
    addClause(ws, "rule", "s-rule-8");
    const rows = buildCompareRows(ws, { kind: "versions", fromSnapshotId: base.id, toSnapshotId: "current" });
    expect(rows.map((r) => r.changeType).sort()).toEqual(["add", "modify"]);
  });

  it("원문 재등록 시 연결 조각이 사라지면 검토 목록에 표시된다", () => {
    const ws = draftedSample();
    const sim = ws.docs.find((d) => d.type === "similar")!;
    setDocText(ws, sim.id, { text: "제1조(목적) 새 원문", format: "paste" });
    expect(computeIssues(ws).some((i) => i.kind === "source_missing" && i.message.includes("원문 조각이 없습니다"))).toBe(true);
  });
});
