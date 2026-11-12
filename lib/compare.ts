import type { CompareRow } from "./change";
import { DOC_KIND_LABEL, SUGGESTION_STATUS_LABEL } from "./labels";
import { articleNumbers, clauseHeading } from "./render";
import { conditionTitle } from "./structure";
import type { Clause, Section, Workspace } from "./types";

export type CompareBasis =
  | { kind: "changeset"; changeSetId: string }
  | { kind: "versions"; fromSnapshotId: string; toSnapshotId: string | "current" }
  | { kind: "similar" };

export const BASIS_LABEL = {
  changeset: "이전 초안 ↔ 계획 반영 초안(변경 제안)",
  versions: "저장 버전 간 비교",
  similar: "유사사업 참고 규정 ↔ 새 초안 (참고용 비교 — 이번 사업의 현행 규정 아님)",
};

function labelFor(set: { clauses: Clause[]; sections: Section[] }, c: Clause) {
  const no = articleNumbers(set, c.docKind).get(c.id);
  return `${DOC_KIND_LABEL[c.docKind]} ${clauseHeading(no, c.title)}`;
}

export function buildCompareRows(ws: Workspace, basis: CompareBasis): CompareRow[] {
  if (basis.kind === "changeset") {
    const cs = ws.changeSets.find((c) => c.id === basis.changeSetId);
    if (!cs) return [];
    const plan = cs.planDocId ? ws.docs.find((d) => d.id === cs.planDocId) : undefined;
    return ws.suggestions
      .filter((s) => s.changeSetId === cs.id)
      .map((s) => {
        const clause = ws.clauses.find((c) => c.id === s.clauseId);
        const diffs = cs.diffs.filter((d) => s.conditionIds.includes(d.conditionId));
        const related = [
          plan ? `${plan.title} (${plan.version})` : cs.label,
          ...diffs.map((d) => `조건: ${d.label}${d.afterLocator ? ` · 위치 ${d.afterLocator}` : ""}`),
        ].join("\n");
        return {
          clauseId: s.clauseId,
          docKind: clause?.docKind ?? "rule",
          clauseLabel: clause ? labelFor(ws, clause) : `삭제된 조항 (${s.beforeTitle})`,
          changeType: s.changeType,
          before: s.before,
          after: s.manualOnly ? "【자동 수정안 없음 — 담당자 직접 수정 필요】" : s.after,
          reason: s.reason,
          related,
          status: SUGGESTION_STATUS_LABEL[s.status],
          warnings: s.warnings,
        };
      });
  }
  if (basis.kind === "versions") {
    const from = ws.snapshots.find((s) => s.id === basis.fromSnapshotId);
    const to =
      basis.toSnapshotId === "current"
        ? { clauses: ws.clauses, sections: ws.sections, label: "현재 작업본" }
        : ws.snapshots.find((s) => s.id === basis.toSnapshotId);
    if (!from || !to) return [];
    const rows: CompareRow[] = [];
    const fromMap = new Map(from.clauses.map((c) => [c.id, c]));
    const toMap = new Map(to.clauses.map((c) => [c.id, c]));
    const condLabel = (c: Clause) =>
      c.conditionIds
        .map((id) => ws.conditions.find((x) => x.id === id))
        .filter(Boolean)
        .map((x) => `조건: ${conditionTitle(ws, x!)}`)
        .join("\n");
    for (const c of to.clauses) {
      const prev = fromMap.get(c.id);
      if (!prev) {
        rows.push({ clauseId: c.id, docKind: c.docKind, clauseLabel: labelFor(to, c), changeType: "add", before: "", after: c.body, reason: "조항 추가", related: condLabel(c), status: "-", warnings: [] });
      } else if (prev.body !== c.body || prev.title !== c.title) {
        rows.push({
          clauseId: c.id,
          docKind: c.docKind,
          clauseLabel: labelFor(to, c),
          changeType: "modify",
          before: prev.title !== c.title ? `[제목: ${prev.title}]\n${prev.body}` : prev.body,
          after: prev.title !== c.title ? `[제목: ${c.title}]\n${c.body}` : c.body,
          reason: "버전 간 변경",
          related: condLabel(c),
          status: "-",
          warnings: [],
        });
      }
    }
    for (const c of from.clauses) {
      if (!toMap.has(c.id)) {
        rows.push({ clauseId: c.id, docKind: c.docKind, clauseLabel: labelFor(from, c), changeType: "delete", before: c.body, after: "", reason: "조항 삭제", related: "", status: "-", warnings: [] });
      }
    }
    return rows;
  }
  // 유사사업 참고 규정과 새 초안 비교 (참고용)
  const rows: CompareRow[] = [];
  for (const c of ws.clauses) {
    for (const s of c.sources.filter((x) => x.role === "similar_ref" && x.chunkId)) {
      const ch = ws.chunks.find((x) => x.id === s.chunkId);
      const doc = ch ? ws.docs.find((d) => d.id === ch.docId) : undefined;
      if (!ch || !doc) continue;
      rows.push({
        clauseId: c.id,
        docKind: c.docKind,
        clauseLabel: labelFor(ws, c),
        changeType: "modify",
        before: ch.text,
        after: c.body,
        reason: "유사사업 규정 참고 비교(의무 기준 아님)",
        related: `${doc.title} (${doc.version}) · ${ch.locator}`,
        status: "-",
        warnings: [],
      });
    }
  }
  return rows;
}
