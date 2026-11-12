import { computeIssues } from "./checks";
import type { DocKind, Workspace } from "./types";

export interface DocProgress {
  total: number;
  written: number;
  approved: number;
  writtenPct: number;
  approvedPct: number;
}

export const STAGES = ["자료 등록", "조건 확인", "초안 작성", "검토", "변경 반영·내보내기"] as const;

export function computeStage(ws: Workspace): number {
  if (!ws.docs.some((d) => d.textStatus === "registered")) return 0;
  if (!ws.project.conditionsReviewedAt) return 1;
  if (!ws.clauses.length) return 2;
  if (ws.clauses.some((c) => c.reviewStatus !== "approved")) return 3;
  return 4;
}

function progress(ws: Workspace, dk: DocKind): DocProgress {
  const list = ws.clauses.filter((c) => c.docKind === dk);
  const total = list.length;
  const written = list.filter((c) => c.body.trim().length > 0).length;
  const approved = list.filter((c) => c.reviewStatus === "approved").length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return { total, written, approved, writtenPct: pct(written), approvedPct: pct(approved) };
}

export function computeMetrics(ws: Workspace) {
  const issues = computeIssues(ws);
  const noEvidenceClauses = new Set(
    issues.filter((i) => i.kind === "no_evidence" || i.kind === "source_missing").map((i) => i.clauseId),
  ).size;
  return {
    stage: computeStage(ws),
    docCount: ws.docs.length,
    registeredDocCount: ws.docs.filter((d) => d.textStatus === "registered").length,
    rule: progress(ws, "rule"),
    manual: progress(ws, "manual"),
    unverifiedClauses: noEvidenceClauses,
    unconfirmedConditions: ws.conditions.filter((c) => c.status !== "confirmed" || !c.value.trim()).length,
    totalConditions: ws.conditions.length,
    issueCount: issues.length,
    pendingSuggestions: ws.suggestions.filter((s) => s.status === "pending").length,
    issues,
  };
}
