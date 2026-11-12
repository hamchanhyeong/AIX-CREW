import { roleForType } from "./labels";
import { articleNumbers, renderConditionInWs } from "./render";
import { searchChunks } from "./retrieval";
import type { RefSpec, TemplateCtx, TemplateDef } from "./templates";
import { TEMPLATES, templateByKey } from "./templates";
import type { Clause, ClauseSource, Workspace } from "./types";
import { nowIso, uid } from "./util";

function normTitle(s: string) {
  return s.replace(/\s+/g, "");
}

export function makeCtx(ws: Workspace, docKind: "rule" | "manual"): TemplateCtx {
  const tpls = TEMPLATES.filter((t) => t.docKind === docKind);
  return {
    v: (id) => {
      const c = ws.conditions.find((x) => x.id === id);
      return c ? renderConditionInWs(ws, c) : `【확인 필요: 조건 ${id}】`;
    },
    p: (pid) => ws.programs.find((p) => p.id === pid)?.name ?? pid,
    no: (key) => {
      // 생성 시점의 문서 내 순서 기준. 이후 순서가 바뀌면 검토 목록의 내부 참조 점검으로 확인한다.
      const existing = ws.clauses.filter((c) => c.docKind === docKind);
      if (existing.length) {
        const target = existing.find((c) => c.templateKey === key);
        if (target) return String(articleNumbers(ws, docKind).get(target.id) ?? "?");
      }
      const idx = tpls.findIndex((t) => t.key === key);
      return idx >= 0 ? String(idx + 1) : "【확인 필요: 참조 조항 없음】";
    },
  };
}

/** 템플릿의 근거 명세를 실제 등록 자료에 연결한다. 원문이 없으면 '원문 미등록'으로 남긴다. */
export function resolveRefs(ws: Workspace, refs: RefSpec[]): ClauseSource[] {
  const out: ClauseSource[] = [];
  for (const r of refs) {
    let docs = ws.docs.filter((d) => d.type === r.type && d.applicability !== "not_applicable");
    if (r.titleHint) docs = docs.filter((d) => normTitle(d.title).includes(normTitle(r.titleHint!)));
    const role = roleForType(r.type)!;
    const registered = docs.filter((d) => d.textStatus === "registered");
    const hits = searchChunks(ws, r.keywords.join(" "), {
      docIds: registered.map((d) => d.id),
      limit: 1,
      requireKeyword: r.keywords,
    });
    if (hits.length) {
      const ch = hits[0].chunk;
      out.push({
        id: uid("src"),
        role,
        docId: ch.docId,
        chunkId: ch.id,
        quote: ch.text.length > 220 ? ch.text.slice(0, 220) : ch.text,
        addedBy: "template",
        note: role === "legal_candidate" ? "키워드 일치로 찾은 후보 — 적용 여부 확인 필요" : undefined,
      });
    } else {
      const missing = docs.find((d) => d.textStatus !== "registered");
      if (missing && r.type !== "similar") {
        out.push({
          id: uid("src"),
          role,
          docId: missing.id,
          addedBy: "template",
          note: "자료는 목록에 있으나 원문이 등록되지 않아 조문을 확인할 수 없음",
        });
      }
    }
  }
  return out;
}

function planSources(ws: Workspace, conditionIds: string[]): ClauseSource[] {
  const out: ClauseSource[] = [];
  for (const id of conditionIds) {
    const c = ws.conditions.find((x) => x.id === id);
    if (!c?.sourceChunkId) continue;
    const ch = ws.chunks.find((x) => x.id === c.sourceChunkId);
    if (!ch || out.some((s) => s.chunkId === ch.id)) continue;
    out.push({ id: uid("src"), role: "plan_reflect", docId: ch.docId, chunkId: ch.id, quote: ch.text, addedBy: "template" });
  }
  return out;
}

export function buildClauseFromTemplate(ws: Workspace, t: TemplateDef, order: number): Clause {
  const sources = [...planSources(ws, t.conds), ...resolveRefs(ws, t.refs)];
  const hasEvidence = sources.some((s) => s.chunkId);
  if (!hasEvidence) {
    sources.push({
      id: uid("src"),
      role: "needs_check",
      addedBy: "template",
      note: "연결 가능한 근거 원문이 없습니다. 작성 제안 문구이므로 근거 확인이 필요합니다.",
    });
  }
  return {
    id: uid("cl"),
    docKind: t.docKind,
    sectionId: t.sectionId,
    order,
    title: t.title,
    body: t.body(makeCtx(ws, t.docKind)),
    origin: "template",
    templateKey: t.key,
    generated: true,
    userEdited: false,
    reviewStatus: "pending",
    conditionIds: [...t.conds],
    sources,
    notes: [],
    updatedAt: nowIso(),
  };
}

/** 템플릿으로 운영규칙·요령 초안을 만든다(데모·템플릿 모드). */
export function generateDraft(ws: Workspace): Workspace {
  if (ws.clauses.length) throw new Error("이미 초안이 있습니다. 조항별 ‘다시 작성 제안’을 사용하세요.");
  const orderBySection = new Map<string, number>();
  for (const t of TEMPLATES) {
    if (!ws.sections.some((s) => s.id === t.sectionId)) continue;
    const o = (orderBySection.get(t.sectionId) ?? 0) + 1;
    orderBySection.set(t.sectionId, o);
    ws.clauses.push(buildClauseFromTemplate(ws, t, o));
  }
  ws.project.draftGeneratedAt = nowIso();
  return ws;
}

/** 특정 조항의 템플릿 재작성안(현재 조건 값 반영). 템플릿이 없으면 null. */
export function templateRewrite(ws: Workspace, clause: Clause): { title: string; body: string; sources: ClauseSource[] } | null {
  const t = templateByKey(clause.templateKey);
  if (!t) return null;
  const built = buildClauseFromTemplate(ws, t, clause.order);
  return { title: built.title, body: built.body, sources: built.sources };
}
