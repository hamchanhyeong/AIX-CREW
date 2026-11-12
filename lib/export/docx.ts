import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { CompareRow } from "../change";
import { BASIS_LABEL, type CompareBasis } from "../compare";
import { textDiff } from "../diff";
import {
  DEMO_NOTICE,
  DOC_KIND_LABEL,
  DRAFT_NOTICE,
  PLAN_BASIS_NOTICE,
  REVIEW_LABEL,
  ROLE_LABEL,
  STRATEGY_LABEL,
  TEXT_STATUS_LABEL,
} from "../labels";
import { currentVersionLabel } from "../ops";
import { articleNumbers, clauseHeading, orderedClauses, sectionHeading } from "../render";
import type { DocKind, Workspace } from "../types";
import { formatDate } from "../util";

const FONT = { ascii: "Malgun Gothic", eastAsia: "맑은 고딕", hAnsi: "Malgun Gothic", cs: "Malgun Gothic" };
const NAVY = "172240";
const GRAY = "666666";

function styles() {
  return {
    default: { document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { line: 320 } } } },
  };
}

function p(text: string, opts: { bold?: boolean; size?: number; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 80, before: opts.before ?? 0 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size, color: opts.color, font: FONT })],
  });
}

function bodyParagraphs(text: string) {
  const lines = text.split("\n");
  return lines.map(
    (l) =>
      new Paragraph({
        spacing: { after: 60 },
        indent: /^\d+\./.test(l.trim()) ? { left: 400 } : undefined,
        children: highlightRuns(l),
      }),
  );
}

/** 【확인 필요】·【미확정】 표시는 노란 배경으로 강조해 파일에서도 유지한다 */
function highlightRuns(line: string): TextRun[] {
  const parts = line.split(/(【[^】]*】)/g).filter((x) => x !== "");
  if (!parts.length) return [new TextRun({ text: "", font: FONT })];
  return parts.map((t) =>
    t.startsWith("【")
      ? new TextRun({ text: t, bold: true, color: "9A3412", shading: { type: ShadingType.CLEAR, fill: "FEF3C7", color: "auto" }, font: FONT })
      : new TextRun({ text: t, font: FONT }),
  );
}

function cell(children: Paragraph[], opts: { width?: number; fill?: string } = {}) {
  return new TableCell({
    children,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

function headerCell(text: string, width: number) {
  return cell([p(text, { bold: true, color: "FFFFFF", after: 0 })], { width, fill: NAVY });
}

const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" },
};

function coverBlock(ws: Workspace, title: string): Paragraph[] {
  const out = [
    p(title, { bold: true, size: 36, color: NAVY, align: AlignmentType.CENTER, after: 200 }),
    p(`【${DRAFT_NOTICE}】`, { bold: true, color: "B91C1C", align: AlignmentType.CENTER, after: 120 }),
  ];
  if (ws.isDemo) out.push(p(`[${DEMO_NOTICE}]`, { bold: true, color: "B45309", align: AlignmentType.CENTER, after: 120 }));
  out.push(
    p(`프로젝트: ${ws.project.name}`, { color: GRAY }),
    p(`버전: ${currentVersionLabel(ws)}`, { color: GRAY }),
    p(`작성일: ${formatDate(new Date().toISOString())}`, { color: GRAY }),
    p(`${PLAN_BASIS_NOTICE} — ${ws.programs.map((x) => `${x.name}(${STRATEGY_LABEL[x.strategy]}${x.confirmedByAgency ? ", 기관 확인" : ""})`).join(", ")}`, { color: GRAY, after: 240 }),
  );
  return out;
}

function footer() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "검토용 초안 · ", size: 16, color: GRAY, font: FONT }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRAY, font: FONT }),
        ],
      }),
    ],
  });
}

export function regulationDocument(ws: Workspace, docKind: DocKind): Document {
  const title = `재기지원 사업 ${DOC_KIND_LABEL[docKind]}(안)`;
  const nums = articleNumbers(ws, docKind);
  const children: (Paragraph | Table)[] = [...coverBlock(ws, title)];
  const sections = ws.sections.filter((s) => s.docKind === docKind).sort((a, b) => a.order - b.order);
  const clauses = orderedClauses(ws, docKind);
  for (const s of sections) {
    children.push(p(sectionHeading(docKind, s.order, s.title), { bold: true, size: 26, color: NAVY, before: 240, after: 120 }));
    const inSec = clauses.filter((c) => c.sectionId === s.id);
    if (!inSec.length) children.push(p("(조항 없음)", { color: GRAY }));
    for (const c of inSec) {
      children.push(p(clauseHeading(nums.get(c.id), c.title), { bold: true, before: 120, after: 60 }));
      children.push(...bodyParagraphs(c.body || "【확인 필요: 본문 미작성】"));
      const ev = c.sources.filter((x) => x.chunkId).length;
      children.push(p(`검토 상태: ${REVIEW_LABEL[c.reviewStatus]} · 연결 근거 ${ev}건${ev ? "" : " (근거 확인 필요)"}`, { size: 16, color: GRAY, after: 120 }));
    }
  }

  // 부록: 근거 목록
  children.push(p("부록. 조항별 근거 목록", { bold: true, size: 26, color: NAVY, before: 360, after: 120 }));
  children.push(p("역할 구분: 적용 근거 후보(법령·지침, 적용 여부 확인 필요) / 유사사업 참고(의무 기준 아님) / 운영계획 반영 / 작성 제안·근거 확인 필요", { size: 16, color: GRAY }));
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [headerCell("조항", 16), headerCell("역할", 14), headerCell("자료(버전)", 22), headerCell("위치", 12), headerCell("인용·비고", 26), headerCell("원문 상태", 10)],
    }),
  ];
  for (const c of clauses) {
    for (const s of c.sources) {
      const doc = s.docId ? ws.docs.find((d) => d.id === s.docId) : undefined;
      const ch = s.chunkId ? ws.chunks.find((x) => x.id === s.chunkId) : undefined;
      rows.push(
        new TableRow({
          children: [
            cell([p(clauseHeading(nums.get(c.id), c.title), { size: 18, after: 0 })]),
            cell([p(ROLE_LABEL[s.role], { size: 18, after: 0 })]),
            cell([p(doc ? `${doc.title} (${doc.version})` : "-", { size: 18, after: 0 })]),
            cell([p(ch?.locator ?? "-", { size: 18, after: 0 })]),
            cell([p(s.quote ?? s.note ?? "-", { size: 18, after: 0 })]),
            cell([p(doc ? TEXT_STATUS_LABEL[doc.textStatus] : "-", { size: 18, after: 0 })]),
          ],
        }),
      );
    }
  }
  children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableBorders }));

  const doc = new Document({
    creator: "규정 작성 지원 도구",
    title,
    description: DRAFT_NOTICE,
    styles: styles(),
    sections: [{ properties: {}, footers: { default: footer() }, children }],
  });
  return doc;
}

const TYPE_BADGE: Record<CompareRow["changeType"], { text: string; fill: string }> = {
  modify: { text: "[수정]", fill: "DBEAFE" },
  add: { text: "[추가]", fill: "DCFCE7" },
  delete: { text: "[삭제]", fill: "FEE2E2" },
};

function diffParagraphs(before: string, after: string, side: "before" | "after"): Paragraph[] {
  const parts = textDiff(before, after);
  const runs: TextRun[] = [];
  for (const part of parts) {
    if (side === "before" && part.type === "added") continue;
    if (side === "after" && part.type === "removed") continue;
    const changed = part.type !== "same";
    const segs = part.value.split("\n");
    segs.forEach((seg, i) => {
      if (i > 0) runs.push(new TextRun({ text: "", break: 1, font: FONT }));
      if (!seg) return;
      runs.push(
        new TextRun({
          text: seg,
          size: 18,
          font: FONT,
          bold: changed,
          strike: changed && side === "before",
          underline: changed && side === "after" ? {} : undefined,
          color: changed ? (side === "before" ? "B91C1C" : "1D4ED8") : undefined,
        }),
      );
    });
  }
  return [new Paragraph({ children: runs.length ? runs : [new TextRun({ text: "-", size: 18, font: FONT })] })];
}

export function compareDocument(ws: Workspace, rows: CompareRow[], basis: CompareBasis, basisDetail: string): Document {
  const title = "재기지원 사업 운영규칙·요령(안) 신구대비표";
  const children: (Paragraph | Table)[] = [...coverBlock(ws, title)];
  children.push(p(`비교 기준: ${BASIS_LABEL[basis.kind]}`, { bold: true }));
  if (basisDetail) children.push(p(basisDetail, { color: GRAY }));
  if (basis.kind === "similar") children.push(p("※ 유사사업 규정은 이번 사업의 현행 규정이 아니며 의무 기준이 아닙니다. 참고 비교용입니다.", { color: "B45309" }));
  children.push(p("표기: [수정]·[추가]·[삭제] 배지, 변경 전 삭제 부분은 취소선(빨강), 변경 제안 추가 부분은 밑줄(파랑)", { size: 16, color: GRAY, after: 160 }));
  const header = new TableRow({
    tableHeader: true,
    children: [
      headerCell("문서·조항", 14),
      headerCell(basis.kind === "similar" ? "유사사업 참고 규정" : "변경 전", 24),
      headerCell(basis.kind === "similar" ? "새 초안" : "변경 제안", 24),
      headerCell("변경 사유", 14),
      headerCell("관련 계획·근거", 14),
      headerCell("반영 상태", 10),
    ],
  });
  const body = rows.map((r) => {
    const badge = TYPE_BADGE[r.changeType];
    return new TableRow({
      children: [
        cell([p(badge.text, { bold: true, size: 18, after: 40 }), p(r.clauseLabel, { size: 18, after: 0 })], { fill: badge.fill }),
        cell(diffParagraphs(r.before, r.after, "before")),
        cell(diffParagraphs(r.before, r.after, "after")),
        cell([p(r.reason, { size: 18, after: 0 }), ...r.warnings.map((w) => p(`⚠ ${w}`, { size: 16, color: "B45309", after: 0 }))]),
        cell(r.related.split("\n").map((l) => p(l, { size: 16, after: 0 }))),
        cell([p(r.status, { bold: true, size: 18, after: 0 })]),
      ],
    });
  });
  if (!rows.length) children.push(p("비교할 변경 사항이 없습니다.", { color: GRAY }));
  else children.push(new Table({ rows: [header, ...body], width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableBorders }));

  const doc = new Document({
    creator: "규정 작성 지원 도구",
    title,
    description: DRAFT_NOTICE,
    styles: styles(),
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        footers: { default: footer() },
        children,
      },
    ],
  });
  return doc;
}

// 서버(Node): Buffer / 브라우저(index.html): Blob
export async function buildRegulationDocx(ws: Workspace, docKind: DocKind): Promise<Buffer> {
  return Packer.toBuffer(regulationDocument(ws, docKind));
}

export async function buildCompareDocx(ws: Workspace, rows: CompareRow[], basis: CompareBasis, basisDetail: string): Promise<Buffer> {
  return Packer.toBuffer(compareDocument(ws, rows, basis, basisDetail));
}
