// 계획 변경 처리: 조건 ID ↔ 조항 ID 연결만 따라간다. 문서 전체 문자열 치환은 하지 않는다.
import { extractConditions } from "./extract";
import { createSnapshot, touch } from "./ops";
import { renderCondition } from "./render";
import { conditionTitle, programName } from "./structure";
import type { ChangeSet, CondStatus, ConditionDiff, Suggestion, Workspace } from "./types";
import { countOccurrences, nowIso, uid } from "./util";

export interface ProposedCondition {
  value: string;
  status: CondStatus;
  chunkId?: string;
  locator?: string;
}

export function diffConditions(ws: Workspace, proposed: Record<string, ProposedCondition>): ConditionDiff[] {
  const out: ConditionDiff[] = [];
  for (const [id, p] of Object.entries(proposed)) {
    const c = ws.conditions.find((x) => x.id === id);
    if (!c) continue;
    const nv = p.value.trim();
    const ns: CondStatus = nv ? p.status : "unconfirmed";
    if (nv === c.value.trim() && ns === c.status) continue;
    out.push({
      conditionId: id,
      label: conditionTitle(ws, c),
      beforeValue: c.value,
      afterValue: nv,
      beforeStatus: c.status,
      afterStatus: ns,
      afterChunkId: p.chunkId,
      afterLocator: p.locator,
    });
  }
  return out;
}

/** 새 계획(안) 자료에서 조건을 추출해 현재 조건과 비교할 제안값을 만든다. */
export function proposeFromPlanDoc(ws: Workspace, docId: string) {
  const res = extractConditions(ws.chunks.filter((c) => c.docId === docId), ws.programs);
  const proposed: Record<string, ProposedCondition> = {};
  for (const f of res.found) {
    const cur = ws.conditions.find((c) => c.id === f.conditionId);
    // 값이 같으면 현재 확정 상태를 유지, 바뀐 값은 '미확정'으로 들어온다
    const status: CondStatus = cur && cur.value.trim() === f.value ? cur.status : "unconfirmed";
    proposed[f.conditionId] = { value: f.value, status, chunkId: f.chunkId, locator: f.locator };
  }
  const notFound = ws.conditions
    .filter((c) => c.value.trim() && !proposed[c.id] && !res.emptyKeys.some((e) => e.conditionId === c.id))
    .map((c) => conditionTitle(ws, c));
  return { proposed, notFound, method: res.method };
}

function buildSuggestion(ws: Workspace, clauseId: string, diffs: ConditionDiff[], changeSetId: string, reasonSuffix: string): Suggestion {
  const clause = ws.clauses.find((c) => c.id === clauseId)!;
  let after = clause.body;
  const warnings: string[] = [];
  const reasons: string[] = [];
  for (const d of diffs) {
    const cond = ws.conditions.find((c) => c.id === d.conditionId)!;
    const pn = programName(ws, cond.programId);
    const oldR = renderCondition({ ...cond, value: d.beforeValue, status: d.beforeStatus }, pn);
    const newR = renderCondition({ ...cond, value: d.afterValue, status: d.afterStatus }, pn);
    reasons.push(`‘${d.label}’ ${d.beforeValue || "(빈 값)"} → ${d.afterValue || "(빈 값)"}`);
    let target = oldR;
    let n = countOccurrences(after, oldR);
    if (n === 0 && d.beforeValue.trim()) {
      target = d.beforeValue.trim();
      n = countOccurrences(after, target);
    }
    if (n === 0) {
      warnings.push(`‘${d.label}’의 이전 값을 이 조항 본문에서 찾지 못했습니다(담당자 수정 가능성). 직접 확인해 수정하세요.`);
      continue;
    }
    if (n > 1) warnings.push(`‘${d.label}’의 이전 값이 이 조항에 ${n}곳 있습니다. 모두 같은 의미인지 확인하세요.`);
    after = after.split(target).join(newR);
  }
  return {
    id: uid("sg"),
    clauseId,
    kind: "plan_change",
    origin: "template",
    changeType: "modify",
    beforeTitle: clause.title,
    afterTitle: clause.title,
    before: clause.body,
    after,
    reason: `${reasons.join("; ")}${reasonSuffix}`,
    conditionIds: diffs.map((d) => d.conditionId),
    changeSetId,
    status: "pending",
    createdAt: nowIso(),
    warnings,
    manualOnly: after === clause.body,
  };
}

/**
 * 1) 조건 비교 결과를 받아 2) 연결된 조항만 찾고 3) 조항별 수정안을 만든다.
 * 변경 전 상태는 스냅샷으로 남기고, 조건 값은 새 계획 기준으로 갱신한다.
 */
export function startChangeSet(
  ws: Workspace,
  diffs: ConditionDiff[],
  meta: { label: string; planDocId?: string },
): ChangeSet {
  if (!diffs.length) throw new Error("바뀐 조건이 없습니다.");
  if (!ws.clauses.length) throw new Error("초안이 없습니다. 초안 작성 전에는 사업 조건 화면에서 값을 직접 수정하세요.");
  const base = createSnapshot(ws, `계획 변경 전 자동 저장 (${meta.label})`);
  const changed = new Set(diffs.map((d) => d.conditionId));
  const affected = ws.clauses.filter((c) => c.conditionIds.some((id) => changed.has(id)));
  const csId = uid("cs");
  const planDoc = meta.planDocId ? ws.docs.find((d) => d.id === meta.planDocId) : undefined;
  const suffix = planDoc ? ` (근거: ${planDoc.title} ${planDoc.version})` : ` (${meta.label})`;
  for (const c of affected) {
    const rel = diffs.filter((d) => c.conditionIds.includes(d.conditionId));
    ws.suggestions.push(buildSuggestion(ws, c.id, rel, csId, suffix));
  }
  // 조건 갱신
  const t = nowIso();
  for (const d of diffs) {
    const cond = ws.conditions.find((c) => c.id === d.conditionId)!;
    cond.value = d.afterValue;
    cond.status = d.afterStatus;
    if (d.afterChunkId) {
      cond.sourceChunkId = d.afterChunkId;
      cond.locator = d.afterLocator;
    }
    cond.updatedAt = t;
  }
  const cs: ChangeSet = {
    id: csId,
    createdAt: t,
    label: meta.label,
    planDocId: meta.planDocId,
    diffs,
    affectedClauseIds: affected.map((c) => c.id),
    unlinkedClauseCount: ws.clauses.length - affected.length,
    baseSnapshotId: base.id,
  };
  ws.changeSets.push(cs);
  touch(ws, false);
  return cs;
}

export type DecideResult = { ok: true } | { ok: false; reason: string };

export function applySuggestion(ws: Workspace, suggestionId: string): DecideResult {
  const s = ws.suggestions.find((x) => x.id === suggestionId);
  if (!s) return { ok: false, reason: "제안을 찾을 수 없습니다." };
  const c = ws.clauses.find((x) => x.id === s.clauseId);
  if (!c) return { ok: false, reason: "대상 조항이 삭제되었습니다." };
  if (s.manualOnly) return { ok: false, reason: "자동 수정안이 없는 항목입니다. 편집기에서 직접 수정하세요." };
  if (c.body !== s.before || c.title !== s.beforeTitle) {
    return { ok: false, reason: "제안 생성 이후 조항이 수정되었습니다. 담당자 수정본을 보존하기 위해 반영하지 않습니다. 제안을 다시 만드세요." };
  }
  c.title = s.afterTitle;
  c.body = s.after;
  if (s.newSources?.length) c.sources = s.newSources;
  if (s.origin === "ai") c.origin = "ai";
  c.updatedAt = nowIso();
  if (c.reviewStatus === "approved") c.reviewStatus = "needs_rereview";
  c.notes.push({ id: uid("n"), text: `제안 반영: ${s.reason}`, createdAt: nowIso(), kind: "system" });
  s.status = "applied";
  s.decidedAt = nowIso();
  touch(ws);
  return { ok: true };
}

export function decideSuggestion(ws: Workspace, suggestionId: string, status: "held" | "rejected" | "pending") {
  const s = ws.suggestions.find((x) => x.id === suggestionId);
  if (!s || s.status === "applied") return;
  s.status = status;
  s.decidedAt = nowIso();
  touch(ws, false);
}

/** 반영 결과를 새 버전으로 저장 */
export function saveChangeSetVersion(ws: Workspace, changeSetId: string) {
  const cs = ws.changeSets.find((c) => c.id === changeSetId);
  if (!cs) throw new Error("변경 이력을 찾을 수 없습니다.");
  const snap = createSnapshot(ws, `계획 변경 반영: ${cs.label}`);
  cs.resultSnapshotId = snap.id;
  return snap;
}

// ─────────────── 신구대비표
export interface CompareRow {
  clauseId: string;
  docKind: "rule" | "manual";
  clauseLabel: string;
  changeType: "modify" | "add" | "delete";
  before: string;
  after: string;
  reason: string;
  related: string;
  status: string;
  warnings: string[];
}
