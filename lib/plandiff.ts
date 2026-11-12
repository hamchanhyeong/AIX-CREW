// 운영계획(안) 이전·이후 원문 비교: 두 계획(안)의 원문 조각을 줄 단위로 맞춰 추가·삭제·수정을 찾는다.
// 바뀐 줄이 사업 조건('항목: 값')으로 인식되면 조건 ID를 붙이고, 그렇지 않으면 '조건으로 인식되지 않은 변경'으로 남긴다.
// 자동으로 규정 조항을 고치지 않는다(조항 수정안은 조건 ID↔조항 ID 연결로만 만든다: lib/change.ts).
import { diffArrays } from "diff";
import { extractConditions } from "./extract";
import { conditionTitle } from "./structure";
import type { Chunk, Workspace } from "./types";
import { normalizeSpace } from "./util";

export type PlanDiffType = "same" | "added" | "removed" | "modified";

export interface PlanDiffRow {
  type: PlanDiffType;
  before?: { text: string; locator: string };
  after?: { text: string; locator: string };
  /** 이 줄에서 인식된 사업 조건 ID(이전·이후 합집합) */
  conditionIds: string[];
}

export interface PlanDiffResult {
  rows: PlanDiffRow[];
  added: number;
  removed: number;
  modified: number;
  /** 바뀐 줄 중 사업 조건으로 인식된 줄 수 */
  recognized: number;
  /** 바뀐 줄 중 조건으로 인식되지 않아 담당자가 직접 확인해야 하는 줄 수 */
  unrecognized: number;
}

function docChunks(ws: Workspace, docId: string): Chunk[] {
  return ws.chunks.filter((c) => c.docId === docId).sort((a, b) => a.seq - b.seq);
}

function conditionMap(ws: Workspace, chunks: Chunk[]): Map<string, string> {
  const m = new Map<string, string>();
  const r = extractConditions(chunks, ws.programs);
  for (const f of r.found) m.set(f.chunkId, f.conditionId);
  // 값이 '미정'·빈 값인 줄도 조건 줄로 본다(값이 생기거나 사라지는 변경을 놓치지 않도록)
  for (const e of r.emptyKeys) {
    const ch = chunks.find((c) => c.locator === e.locator);
    if (ch && !m.has(ch.id)) m.set(ch.id, e.conditionId);
  }
  return m;
}

export function diffPlanDocs(ws: Workspace, beforeDocId: string, afterDocId: string): PlanDiffResult {
  const before = docChunks(ws, beforeDocId);
  const after = docChunks(ws, afterDocId);
  const bc = conditionMap(ws, before);
  const ac = conditionMap(ws, after);
  const key = (c: Chunk) => normalizeSpace(c.text);
  const parts = diffArrays(before.map(key), after.map(key));

  const rows: PlanDiffRow[] = [];
  let bi = 0;
  let ai = 0;
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    const n = part.count ?? part.value.length;
    if (!part.added && !part.removed) {
      for (let k = 0; k < n; k++) {
        const b = before[bi++];
        const a = after[ai++];
        rows.push({ type: "same", before: { text: b.text, locator: b.locator }, after: { text: a.text, locator: a.locator }, conditionIds: [] });
      }
      continue;
    }
    // 삭제 바로 뒤에 추가가 오면 짝지어 '수정'으로 본다(같은 위치의 줄이 바뀐 경우)
    if (part.removed && parts[p + 1]?.added) {
      const next = parts[p + 1];
      const m = next.count ?? next.value.length;
      const pairs = Math.max(n, m);
      for (let k = 0; k < pairs; k++) {
        const b = k < n ? before[bi + k] : undefined;
        const a = k < m ? after[ai + k] : undefined;
        const ids = [...new Set([b && bc.get(b.id), a && ac.get(a.id)].filter(Boolean) as string[])];
        rows.push({
          type: b && a ? "modified" : b ? "removed" : "added",
          before: b ? { text: b.text, locator: b.locator } : undefined,
          after: a ? { text: a.text, locator: a.locator } : undefined,
          conditionIds: ids,
        });
      }
      bi += n;
      ai += m;
      p++;
      continue;
    }
    for (let k = 0; k < n; k++) {
      if (part.removed) {
        const b = before[bi++];
        rows.push({ type: "removed", before: { text: b.text, locator: b.locator }, conditionIds: bc.get(b.id) ? [bc.get(b.id)!] : [] });
      } else {
        const a = after[ai++];
        rows.push({ type: "added", after: { text: a.text, locator: a.locator }, conditionIds: ac.get(a.id) ? [ac.get(a.id)!] : [] });
      }
    }
  }
  const changed = rows.filter((r) => r.type !== "same");
  return {
    rows,
    added: changed.filter((r) => r.type === "added").length,
    removed: changed.filter((r) => r.type === "removed").length,
    modified: changed.filter((r) => r.type === "modified").length,
    recognized: changed.filter((r) => r.conditionIds.length).length,
    unrecognized: changed.filter((r) => !r.conditionIds.length).length,
  };
}

/** 이전 계획(안) 기본값: 현재 사업 조건의 출처가 된 계획(안). 없으면 새 계획 바로 앞에 등록된 계획(안). */
export function defaultBeforePlan(ws: Workspace, afterDocId: string): string | undefined {
  const plans = ws.docs.filter((d) => d.type === "plan" && d.textStatus === "registered");
  const used = new Map<string, number>();
  for (const c of ws.conditions) {
    const ch = c.sourceChunkId ? ws.chunks.find((x) => x.id === c.sourceChunkId) : undefined;
    if (ch && ch.docId !== afterDocId) used.set(ch.docId, (used.get(ch.docId) ?? 0) + 1);
  }
  const best = [...used.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (best) return best;
  const idx = plans.findIndex((d) => d.id === afterDocId);
  return (idx > 0 ? plans[idx - 1] : plans.find((d) => d.id !== afterDocId))?.id;
}

// ───────────── 운영계획 ↔ 규정 초안 대조(조건 기준)
export type DraftCheckStatus = "reflected" | "mismatch" | "unlinked" | "empty";

export interface DraftCheckRow {
  conditionId: string;
  label: string;
  value: string;
  confirmed: boolean;
  status: DraftCheckStatus;
  clauses: { clauseId: string; reflected: boolean }[];
}

export const DRAFT_CHECK_LABEL: Record<DraftCheckStatus, string> = {
  reflected: "초안에 반영됨",
  mismatch: "값 불일치",
  unlinked: "연결된 조항 없음",
  empty: "계획 값 없음(확인 필요)",
};

/**
 * 운영계획 조건 값이 연결된 규정 조항 본문에 그대로 들어 있는지 대조한다.
 * 문장 의미나 법령 적합성을 판단하지 않는다 — 값의 포함 여부만 확인한다.
 */
export function checkPlanAgainstDraft(ws: Workspace): DraftCheckRow[] {
  return ws.conditions.map((c) => {
    const linked = ws.clauses.filter((x) => x.conditionIds.includes(c.id));
    const v = c.value.trim();
    const clauses = linked.map((x) => ({ clauseId: x.id, reflected: v ? x.body.includes(v) : false }));
    const status: DraftCheckStatus = !v ? "empty" : !linked.length ? "unlinked" : clauses.every((x) => x.reflected) ? "reflected" : "mismatch";
    return { conditionId: c.id, label: conditionTitle(ws, c), value: v, confirmed: c.status === "confirmed", status, clauses };
  });
}
