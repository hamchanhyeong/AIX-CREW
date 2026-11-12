// 작업공간 변경 함수. 모두 전달받은 ws를 직접 수정한다(호출 측에서 복제).
import { chunkPages, chunkPlainText } from "./chunk";
import { extractConditions, type ExtractionResult } from "./extract";
import { roleForType } from "./labels";
import type {
  Clause,
  ClauseSource,
  CondStatus,
  DocKind,
  ReviewStatus,
  Section,
  SourceDoc,
  Suggestion,
  Workspace,
} from "./types";
import { clone, nowIso, uid } from "./util";

export function touch(ws: Workspace, contentChanged = true) {
  ws.project.updatedAt = nowIso();
  if (contentChanged) ws.project.modifiedSinceSnapshot = true;
}

function sysNote(c: Clause, text: string) {
  c.notes.push({ id: uid("n"), text, createdAt: nowIso(), kind: "system" });
}

function getClause(ws: Workspace, id: string): Clause {
  const c = ws.clauses.find((x) => x.id === id);
  if (!c) throw new Error("조항을 찾을 수 없습니다.");
  return c;
}

// ─────────────── 조건
export function applyExtraction(ws: Workspace, docId: string): ExtractionResult {
  if (ws.clauses.length) throw new Error("초안 작성 이후의 조건 변경은 ‘계획 변경’ 화면에서 처리합니다.");
  const chunks = ws.chunks.filter((c) => c.docId === docId);
  const res = extractConditions(chunks, ws.programs);
  const t = nowIso();
  for (const f of res.found) {
    const c = ws.conditions.find((x) => x.id === f.conditionId);
    if (!c || c.userChecked) continue; // 담당자가 확인한 값은 덮어쓰지 않음
    c.value = f.value;
    c.status = "unconfirmed";
    c.sourceChunkId = f.chunkId;
    c.locator = f.locator;
    c.updatedAt = t;
  }
  for (const e of res.emptyKeys) {
    const c = ws.conditions.find((x) => x.id === e.conditionId);
    if (!c || c.userChecked) continue;
    c.value = "";
    c.status = "unconfirmed";
    c.locator = `${e.locator} (값 비어 있음·미정)`;
    c.sourceChunkId = undefined;
    c.updatedAt = t;
  }
  touch(ws, false);
  return res;
}

export function updateCondition(
  ws: Workspace,
  id: string,
  patch: { value?: string; status?: CondStatus; userChecked?: boolean },
) {
  const c = ws.conditions.find((x) => x.id === id);
  if (!c) throw new Error("조건을 찾을 수 없습니다.");
  const changesValue = patch.value !== undefined && patch.value !== c.value;
  const changesStatus = patch.status !== undefined && patch.status !== c.status;
  if (ws.clauses.length && (changesValue || changesStatus)) {
    throw new Error("초안 작성 이후의 조건 변경은 ‘계획 변경’ 화면에서 처리합니다.");
  }
  if (patch.value !== undefined) {
    c.value = patch.value;
    if (!patch.value.trim()) c.status = "unconfirmed";
  }
  if (patch.status !== undefined) {
    if (patch.status === "confirmed" && !c.value.trim()) throw new Error("값이 비어 있는 조건은 확정할 수 없습니다.");
    c.status = patch.status;
  }
  if (patch.userChecked !== undefined) c.userChecked = patch.userChecked;
  c.updatedAt = nowIso();
  touch(ws, false);
}

export function markConditionsReviewed(ws: Workspace) {
  for (const c of ws.conditions) c.userChecked = true;
  ws.project.conditionsReviewedAt = nowIso();
  touch(ws, false);
}

export function updateProgram(ws: Workspace, id: string, patch: { name?: string; confirmedByAgency?: boolean; strategyNote?: string }) {
  const p = ws.programs.find((x) => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  if (patch.name) {
    const sec = ws.sections.find((s) => s.programId === id);
    if (sec) sec.title = patch.name;
  }
  touch(ws);
}

// ─────────────── 조항
export function editClause(ws: Workspace, id: string, patch: { title?: string; body?: string }) {
  const c = getClause(ws, id);
  const changed =
    (patch.title !== undefined && patch.title !== c.title) || (patch.body !== undefined && patch.body !== c.body);
  if (!changed) return false;
  if (patch.title !== undefined) c.title = patch.title;
  if (patch.body !== undefined) c.body = patch.body;
  c.userEdited = true;
  c.updatedAt = nowIso();
  if (c.reviewStatus === "approved") {
    c.reviewStatus = "needs_rereview";
    sysNote(c, "검토 완료 후 조항이 수정되어 재검토가 필요합니다.");
  }
  touch(ws);
  return true;
}

export function setReviewStatus(ws: Workspace, id: string, status: ReviewStatus) {
  const c = getClause(ws, id);
  c.reviewStatus = status;
  c.reviewedAt = status === "approved" ? nowIso() : c.reviewedAt;
  touch(ws, false);
}

export function addNote(ws: Workspace, id: string, text: string) {
  const c = getClause(ws, id);
  if (!text.trim()) return;
  c.notes.push({ id: uid("n"), text: text.trim(), createdAt: nowIso(), kind: "memo" });
  touch(ws, false);
}

function renumber(ws: Workspace, sectionId: string) {
  ws.clauses
    .filter((c) => c.sectionId === sectionId)
    .sort((a, b) => a.order - b.order)
    .forEach((c, i) => (c.order = i + 1));
}

export function addClause(ws: Workspace, docKind: DocKind, sectionId: string, afterId?: string): Clause {
  const inSec = ws.clauses.filter((c) => c.sectionId === sectionId).sort((a, b) => a.order - b.order);
  const after = afterId ? inSec.find((c) => c.id === afterId) : inSec[inSec.length - 1];
  const order = after ? after.order + 0.5 : 1;
  const c: Clause = {
    id: uid("cl"),
    docKind,
    sectionId,
    order,
    title: "새 조항",
    body: "",
    origin: "user",
    generated: false,
    userEdited: true,
    reviewStatus: "pending",
    conditionIds: [],
    sources: [{ id: uid("src"), role: "needs_check", addedBy: "user", note: "근거가 아직 연결되지 않았습니다." }],
    notes: [],
    updatedAt: nowIso(),
  };
  ws.clauses.push(c);
  renumber(ws, sectionId);
  touch(ws);
  return c;
}

export function deleteClause(ws: Workspace, id: string) {
  const c = getClause(ws, id);
  ws.clauses = ws.clauses.filter((x) => x.id !== id);
  for (const s of ws.suggestions) if (s.clauseId === id && s.status === "pending") s.status = "rejected";
  ws.aiIssues = ws.aiIssues.filter((a) => a.clauseId !== id);
  renumber(ws, c.sectionId);
  touch(ws);
}

export function moveClause(ws: Workspace, id: string, dir: -1 | 1) {
  const c = getClause(ws, id);
  const inSec = ws.clauses.filter((x) => x.sectionId === c.sectionId).sort((a, b) => a.order - b.order);
  const i = inSec.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= inSec.length) return false;
  const tmp = inSec[i].order;
  inSec[i].order = inSec[j].order;
  inSec[j].order = tmp;
  touch(ws);
  return true;
}

export function moveClauseToSection(ws: Workspace, id: string, sectionId: string) {
  const c = getClause(ws, id);
  const sec = ws.sections.find((s) => s.id === sectionId);
  if (!sec || sec.docKind !== c.docKind) throw new Error("같은 문서의 장·편으로만 옮길 수 있습니다.");
  const from = c.sectionId;
  c.sectionId = sectionId;
  c.order = Math.max(0, ...ws.clauses.filter((x) => x.sectionId === sectionId && x.id !== id).map((x) => x.order)) + 1;
  renumber(ws, from);
  renumber(ws, sectionId);
  touch(ws);
}

export function addSourceLink(ws: Workspace, clauseId: string, chunkId: string, quote?: string) {
  const c = getClause(ws, clauseId);
  const ch = ws.chunks.find((x) => x.id === chunkId);
  if (!ch) throw new Error("원문 조각을 찾을 수 없습니다.");
  const doc = ws.docs.find((d) => d.id === ch.docId)!;
  const role = roleForType(doc.type);
  if (!role) throw new Error("배경자료는 조항 근거로 연결할 수 없습니다.");
  if (quote && !ch.text.includes(quote)) throw new Error("인용 문구가 원문 조각에 없습니다.");
  if (c.sources.some((s) => s.chunkId === chunkId)) return;
  c.sources = c.sources.filter((s) => s.role !== "needs_check");
  c.sources.push({ id: uid("src"), role, docId: doc.id, chunkId, quote: quote || ch.text, addedBy: "user" });
  if (c.reviewStatus === "approved") {
    c.reviewStatus = "needs_rereview";
    sysNote(c, "근거 연결이 바뀌어 재검토가 필요합니다.");
  }
  touch(ws);
}

export function removeSourceLink(ws: Workspace, clauseId: string, sourceId: string) {
  const c = getClause(ws, clauseId);
  c.sources = c.sources.filter((s) => s.id !== sourceId);
  if (!c.sources.length) {
    c.sources.push({ id: uid("src"), role: "needs_check", addedBy: "user", note: "근거가 연결되지 않았습니다." });
  }
  if (c.reviewStatus === "approved") {
    c.reviewStatus = "needs_rereview";
    sysNote(c, "근거 연결이 바뀌어 재검토가 필요합니다.");
  }
  touch(ws);
}

export function toggleConditionLink(ws: Workspace, clauseId: string, conditionId: string) {
  const c = getClause(ws, clauseId);
  c.conditionIds = c.conditionIds.includes(conditionId)
    ? c.conditionIds.filter((x) => x !== conditionId)
    : [...c.conditionIds, conditionId];
  touch(ws);
}

// ─────────────── 장·편
export function renameSection(ws: Workspace, id: string, title: string) {
  const s = ws.sections.find((x) => x.id === id);
  if (s && title.trim()) s.title = title.trim();
  touch(ws);
}

export function addSection(ws: Workspace, docKind: DocKind, title: string): Section {
  const order = Math.max(0, ...ws.sections.filter((s) => s.docKind === docKind).map((s) => s.order)) + 1;
  const s: Section = { id: uid(`s-${docKind}`), docKind, order, title: title.trim() || "새 장" };
  ws.sections.push(s);
  touch(ws);
  return s;
}

export function moveSection(ws: Workspace, id: string, dir: -1 | 1) {
  const s = ws.sections.find((x) => x.id === id);
  if (!s) return;
  const list = ws.sections.filter((x) => x.docKind === s.docKind).sort((a, b) => a.order - b.order);
  const i = list.indexOf(s);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i].order, list[j].order] = [list[j].order, list[i].order];
  touch(ws);
}

export function deleteSection(ws: Workspace, id: string) {
  if (ws.clauses.some((c) => c.sectionId === id)) throw new Error("조항이 있는 장·편은 삭제할 수 없습니다. 조항을 먼저 옮기거나 삭제하세요.");
  const s = ws.sections.find((x) => x.id === id);
  ws.sections = ws.sections.filter((x) => x.id !== id);
  if (s) ws.sections.filter((x) => x.docKind === s.docKind).sort((a, b) => a.order - b.order).forEach((x, i) => (x.order = i + 1));
  touch(ws);
}

// ─────────────── 자료
export function markRereviewForDoc(ws: Workspace, docId: string) {
  for (const c of ws.clauses) {
    if (c.reviewStatus !== "approved") continue;
    if (c.sources.some((s) => s.docId === docId)) {
      c.reviewStatus = "needs_rereview";
      sysNote(c, "연결된 근거 원문의 버전이 바뀌어 재검토가 필요합니다.");
    }
  }
}

export function setDocText(
  ws: Workspace,
  docId: string,
  input: { text?: string; pages?: string[]; format: SourceDoc["format"]; fileName?: string; parseNote?: string },
) {
  const d = ws.docs.find((x) => x.id === docId);
  if (!d) throw new Error("자료를 찾을 수 없습니다.");
  const v = d.textVersion + 1;
  ws.chunks = ws.chunks.filter((c) => c.docId !== docId);
  const chunks = input.pages ? chunkPages(docId, input.pages, v) : chunkPlainText(docId, input.text ?? "", v);
  if (!chunks.length) throw new Error("추출된 원문이 비어 있습니다.");
  ws.chunks.push(...chunks);
  d.textVersion = v;
  d.textStatus = "registered";
  d.format = input.format;
  d.fileName = input.fileName;
  d.parseNote = input.parseNote;
  d.updatedAt = nowIso();
  markRereviewForDoc(ws, docId);
  touch(ws);
}

export function updateChunkText(ws: Workspace, chunkId: string, text: string) {
  const ch = ws.chunks.find((x) => x.id === chunkId);
  if (!ch || ch.text === text) return;
  const d = ws.docs.find((x) => x.id === ch.docId)!;
  d.textVersion += 1;
  d.updatedAt = nowIso();
  ch.text = text;
  ch.textVersion = d.textVersion;
  markRereviewForDoc(ws, d.id);
  touch(ws);
}

export function updateDocMeta(ws: Workspace, docId: string, patch: Partial<Pick<SourceDoc, "title" | "type" | "version" | "effectiveDate" | "url" | "isPublic" | "allowExternal" | "applicability">>) {
  const d = ws.docs.find((x) => x.id === docId);
  if (!d) return;
  if (patch.type && patch.type !== d.type && ws.clauses.some((c) => c.sources.some((s) => s.docId === docId))) {
    throw new Error("조항에 연결된 자료는 유형을 바꿀 수 없습니다. 연결을 먼저 해제하세요.");
  }
  Object.assign(d, patch);
  d.updatedAt = nowIso();
  touch(ws, false);
}

export function deleteDoc(ws: Workspace, docId: string) {
  ws.docs = ws.docs.filter((d) => d.id !== docId);
  ws.chunks = ws.chunks.filter((c) => c.docId !== docId);
  markRereviewForDoc(ws, docId);
  touch(ws);
}

// ─────────────── 버전·제안
export function createSnapshot(ws: Workspace, label: string) {
  const version = Math.max(0, ...ws.snapshots.map((s) => s.version)) + 1;
  const snap = {
    id: uid("snap"),
    version,
    label,
    createdAt: nowIso(),
    clauses: clone(ws.clauses),
    sections: clone(ws.sections),
    conditions: clone(ws.conditions),
    programs: clone(ws.programs),
  };
  ws.snapshots.push(snap);
  ws.project.modifiedSinceSnapshot = false;
  ws.project.updatedAt = nowIso();
  return snap;
}

export function currentVersionLabel(ws: Workspace): string {
  const last = ws.snapshots[ws.snapshots.length - 1];
  if (!last) return "저장된 버전 없음(작업본)";
  return ws.project.modifiedSinceSnapshot ? `v${last.version} 이후 작업본` : `v${last.version}`;
}

export function addRewriteSuggestion(
  ws: Workspace,
  clauseId: string,
  s: { title: string; body: string; origin: "template" | "ai"; reason: string; sources?: ClauseSource[]; warnings?: string[] },
): Suggestion {
  const c = getClause(ws, clauseId);
  // 같은 조항에 대기 중인 재작성 제안은 하나만 유지
  for (const x of ws.suggestions) {
    if (x.clauseId === clauseId && x.kind === "rewrite" && x.status === "pending") x.status = "rejected";
  }
  const sug: Suggestion = {
    id: uid("sg"),
    clauseId,
    kind: "rewrite",
    origin: s.origin,
    changeType: "modify",
    beforeTitle: c.title,
    afterTitle: s.title,
    before: c.body,
    after: s.body,
    reason: s.reason,
    conditionIds: [...c.conditionIds],
    status: "pending",
    createdAt: nowIso(),
    newSources: s.sources,
    warnings: s.warnings ?? [],
    manualOnly: false,
  };
  ws.suggestions.push(sug);
  touch(ws, false);
  return sug;
}
