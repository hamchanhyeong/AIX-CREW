import { programName } from "./structure";
import type { Clause, Condition, DocKind, Workspace } from "./types";

/** 조건 값을 조문에 넣을 문자열로 바꾼다. 빈 값은 채우지 않고 【확인 필요】로 남긴다. */
export function renderCondition(
  c: Pick<Condition, "value" | "status" | "label" | "programId">,
  progName?: string,
): string {
  const v = c.value.trim();
  if (!v) return `【확인 필요: ${progName && c.programId ? `${progName} ` : ""}${c.label}】`;
  if (c.status === "unconfirmed") return `${v}【미확정】`;
  return v;
}

export function renderConditionInWs(ws: Workspace, c: Condition): string {
  return renderCondition(c, programName(ws, c.programId));
}

/** 문서별 조문 번호 계산. 번호는 조항 ID와 분리되어 순서에서만 결정된다. */
export function orderedClauses(ws: Pick<Workspace, "clauses" | "sections">, docKind: DocKind): Clause[] {
  const secOrder = new Map(
    ws.sections.filter((s) => s.docKind === docKind).map((s) => [s.id, s.order] as const),
  );
  return ws.clauses
    .filter((c) => c.docKind === docKind && secOrder.has(c.sectionId))
    .sort((a, b) => {
      const sa = secOrder.get(a.sectionId)! - secOrder.get(b.sectionId)!;
      return sa !== 0 ? sa : a.order - b.order;
    });
}

export function articleNumbers(ws: Pick<Workspace, "clauses" | "sections">, docKind: DocKind): Map<string, number> {
  const m = new Map<string, number>();
  orderedClauses(ws, docKind).forEach((c, i) => m.set(c.id, i + 1));
  return m;
}

export function clauseHeading(no: number | undefined, title: string): string {
  return `제${no ?? "?"}조(${title || "제목 없음"})`;
}

const SECTION_UNIT: Record<DocKind, string> = { rule: "장", manual: "편" };
export function sectionHeading(docKind: DocKind, order: number, title: string): string {
  return `제${order}${SECTION_UNIT[docKind]} ${title}`;
}
