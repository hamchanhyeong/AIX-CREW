import { addDoc, buildSampleWorkspace, DEMO_PLAN_V2 } from "@/lib/demo";
import { generateDraft } from "@/lib/draft";
import { createSnapshot, markConditionsReviewed, updateCondition } from "@/lib/ops";
import type { Workspace } from "@/lib/types";

/** 시연 시나리오 1~4단계: 샘플 → 값이 있는 조건 확정 → 초안 생성 */
export function draftedSample(): Workspace {
  const ws = buildSampleWorkspace();
  for (const c of ws.conditions) if (c.value.trim()) updateCondition(ws, c.id, { status: "confirmed" });
  markConditionsReviewed(ws);
  generateDraft(ws);
  createSnapshot(ws, "초안 생성");
  return ws;
}

export function addPlanV2(ws: Workspace) {
  return addDoc(ws, {
    title: "[가상] 재기지원 사업 운영계획(안)",
    type: "plan",
    version: "가상 v2",
    effectiveDate: "",
    text: DEMO_PLAN_V2,
    applicability: "applicable",
    isPublic: false,
    isDemo: true,
  });
}

export function clauseByKey(ws: Workspace, key: string) {
  const c = ws.clauses.find((x) => x.templateKey === key);
  if (!c) throw new Error(`no clause ${key}`);
  return c;
}
