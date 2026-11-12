import { DEMO_NOTICE, DOC_KIND_LABEL, DRAFT_NOTICE, REVIEW_LABEL, ROLE_LABEL, SOURCE_TYPE_LABEL, TEXT_STATUS_LABEL } from "../labels";
import { currentVersionLabel } from "../ops";
import { articleNumbers, orderedClauses, renderConditionInWs } from "../render";
import { conditionTitle } from "../structure";
import type { Workspace } from "../types";

function esc(v: string | number | undefined): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 근거 매핑표. 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 붙인다. */
export function buildEvidenceCsv(ws: Workspace): string {
  const lines: string[] = [];
  lines.push(esc(`# ${DRAFT_NOTICE}${ws.isDemo ? ` ${DEMO_NOTICE}` : ""} 프로젝트: ${ws.project.name} / 버전: ${currentVersionLabel(ws)} / 작성: ${new Date().toISOString().slice(0, 10)}`));
  lines.push(
    ["문서", "조번호", "조항제목", "조항ID", "검토상태", "근거역할", "자료명", "자료유형", "자료버전", "원문상태", "위치", "인용·비고", "연결조건(현재값)"].join(","),
  );
  for (const dk of ["rule", "manual"] as const) {
    const nums = articleNumbers(ws, dk);
    for (const c of orderedClauses(ws, dk)) {
      const conds = c.conditionIds
        .map((id) => ws.conditions.find((x) => x.id === id))
        .filter(Boolean)
        .map((x) => `${conditionTitle(ws, x!)}=${renderConditionInWs(ws, x!)}`)
        .join(" | ");
      for (const s of c.sources) {
        const doc = s.docId ? ws.docs.find((d) => d.id === s.docId) : undefined;
        const ch = s.chunkId ? ws.chunks.find((x) => x.id === s.chunkId) : undefined;
        lines.push(
          [
            DOC_KIND_LABEL[dk],
            `제${nums.get(c.id)}조`,
            c.title,
            c.id,
            REVIEW_LABEL[c.reviewStatus],
            ROLE_LABEL[s.role],
            doc?.title ?? "",
            doc ? SOURCE_TYPE_LABEL[doc.type] : "",
            doc?.version ?? "",
            doc ? TEXT_STATUS_LABEL[doc.textStatus] : "",
            ch?.locator ?? "",
            s.quote ?? s.note ?? "",
            conds,
          ]
            .map(esc)
            .join(","),
        );
      }
    }
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
