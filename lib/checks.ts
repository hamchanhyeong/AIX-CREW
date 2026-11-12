// 프로그램 점검: 규칙으로 확인한 문제만 낸다. AI 검토사항은 ws.aiIssues에 별도로 있다.
import { DOC_KIND_LABEL } from "./labels";
import { articleNumbers, orderedClauses } from "./render";
import { conditionTitle } from "./structure";
import type { Clause, DocKind, Workspace } from "./types";
import { normalizeSpace } from "./util";

export type IssueKind =
  | "source_missing"
  | "no_evidence"
  | "quote_mismatch"
  | "unconfirmed_condition"
  | "value_mismatch"
  | "numbering"
  | "broken_ref"
  | "unreviewed"
  | "needs_fix"
  | "rereview";

export const ISSUE_LABEL: Record<IssueKind, string> = {
  source_missing: "근거 원문 미등록",
  no_evidence: "근거 미연결",
  quote_mismatch: "인용 불일치",
  unconfirmed_condition: "운영계획 미확정 조건",
  value_mismatch: "조건 값 불일치",
  numbering: "조항 번호·제목 중복·누락",
  broken_ref: "존재하지 않는 내부 참조",
  unreviewed: "검토되지 않은 생성 조항",
  needs_fix: "수정 필요 표시",
  rereview: "재검토 필요",
};

export interface Issue {
  id: string;
  kind: IssueKind;
  severity: "high" | "medium" | "low";
  clauseId?: string;
  docKind?: DocKind;
  message: string;
}

const EXTERNAL_PREFIX = /(법|영|령|지침|기준|규정|」|』)\s*$/;

export function findInternalRefs(body: string): { n: number; target: "self" | DocKind; index: number }[] {
  const out: { n: number; target: "self" | DocKind; index: number }[] = [];
  const re = /제\s*(\d+)\s*조/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const before = body.slice(Math.max(0, m.index - 8), m.index);
    if (/요령\s*$/.test(before)) out.push({ n: Number(m[1]), target: "manual", index: m.index });
    else if (/규칙\s*$/.test(before)) out.push({ n: Number(m[1]), target: "rule", index: m.index });
    else if (EXTERNAL_PREFIX.test(before)) continue;
    else out.push({ n: Number(m[1]), target: "self", index: m.index });
  }
  return out;
}

export function computeIssues(ws: Workspace): Issue[] {
  const issues: Issue[] = [];
  const counts: Record<DocKind, number> = {
    rule: orderedClauses(ws, "rule").length,
    manual: orderedClauses(ws, "manual").length,
  };
  const push = (i: Omit<Issue, "id">) => issues.push({ ...i, id: `${i.kind}:${i.clauseId ?? ""}:${issues.length}` });

  for (const c of ws.clauses) {
    const base = { clauseId: c.id, docKind: c.docKind };
    // 근거
    const evidence = c.sources.filter((s) => s.chunkId);
    for (const s of c.sources) {
      if (!s.docId) continue;
      const doc = ws.docs.find((d) => d.id === s.docId);
      if (!doc) {
        push({ ...base, kind: "source_missing", severity: "high", message: "연결된 자료가 목록에서 삭제되었습니다." });
        continue;
      }
      if (doc.textStatus !== "registered") {
        push({ ...base, kind: "source_missing", severity: "medium", message: `‘${doc.title}’ 원문이 등록되지 않아 조문 근거를 확인할 수 없습니다.` });
        continue;
      }
      if (s.chunkId) {
        const ch = ws.chunks.find((x) => x.id === s.chunkId);
        if (!ch) push({ ...base, kind: "source_missing", severity: "high", message: `‘${doc.title}’의 연결된 원문 조각이 없습니다(원문 재등록으로 바뀜). 근거를 다시 연결하세요.` });
        else if (s.quote && !normalizeSpace(ch.text).includes(normalizeSpace(s.quote)))
          push({ ...base, kind: "quote_mismatch", severity: "high", message: `인용 문구가 ‘${doc.title}’ ${ch.locator} 원문과 다릅니다.` });
      }
    }
    if (!evidence.length) {
      push({ ...base, kind: "no_evidence", severity: "medium", message: "원문으로 확인 가능한 근거가 연결되지 않았습니다(작성 제안 문구)." });
    }
    // 조건
    for (const id of c.conditionIds) {
      const cond = ws.conditions.find((x) => x.id === id);
      if (!cond) continue;
      if (cond.status !== "confirmed" || !cond.value.trim()) {
        push({ ...base, kind: "unconfirmed_condition", severity: "medium", message: `‘${conditionTitle(ws, cond)}’ 조건이 ${cond.value.trim() ? "미확정" : "비어 있음"}입니다.` });
      }
      if (cond.value.trim() && !c.body.includes(cond.value.trim())) {
        push({ ...base, kind: "value_mismatch", severity: "high", message: `연결 조건 ‘${conditionTitle(ws, cond)}’의 현재 값(${cond.value.trim()})이 본문에 없습니다. 다른 조항·문서와 값이 다를 수 있습니다.` });
      }
    }
    // 내부 참조
    for (const r of findInternalRefs(c.body)) {
      const target: DocKind = r.target === "self" ? c.docKind : r.target;
      if (r.n < 1 || r.n > counts[target]) {
        push({ ...base, kind: "broken_ref", severity: "high", message: `본문의 ‘제${r.n}조’는 ${DOC_KIND_LABEL[target]}에 없는 조항입니다(현재 ${counts[target]}개 조).` });
      }
    }
    // 검토 상태
    if (c.reviewStatus === "needs_rereview") push({ ...base, kind: "rereview", severity: "medium", message: "검토 완료 후 조항 또는 근거가 바뀌었습니다." });
    else if (c.reviewStatus === "needs_fix") push({ ...base, kind: "needs_fix", severity: "medium", message: "검토자가 수정 필요로 표시했습니다." });
    else if (c.generated && c.reviewStatus === "pending") push({ ...base, kind: "unreviewed", severity: "low", message: "자동 작성된 조항이 아직 검토되지 않았습니다." });
  }

  // 번호·제목 중복·누락
  for (const dk of ["rule", "manual"] as DocKind[]) {
    const list = orderedClauses(ws, dk);
    const nums = articleNumbers(ws, dk);
    const seen = new Map<string, Clause>();
    list.forEach((c, i) => {
      if (nums.get(c.id) !== i + 1) push({ clauseId: c.id, docKind: dk, kind: "numbering", severity: "high", message: "조항 번호가 연속되지 않습니다." });
      const key = c.title.replace(/\s+/g, "");
      if (!key) push({ clauseId: c.id, docKind: dk, kind: "numbering", severity: "medium", message: "조항 제목이 비어 있습니다." });
      else if (seen.has(key)) {
        const sameSection = seen.get(key)!.sectionId === c.sectionId;
        if (sameSection) push({ clauseId: c.id, docKind: dk, kind: "numbering", severity: "medium", message: `같은 장·편에 ‘${c.title}’ 조항이 중복됩니다.` });
      } else seen.set(key, c);
      if (!c.body.trim()) push({ clauseId: c.id, docKind: dk, kind: "numbering", severity: "medium", message: "조항 본문이 비어 있습니다(누락)." });
    });
  }
  return issues;
}

export function issuesForClause(issues: Issue[], clauseId: string) {
  return issues.filter((i) => i.clauseId === clauseId);
}
