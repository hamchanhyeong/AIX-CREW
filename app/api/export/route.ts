import { buildCompareRows, type CompareBasis } from "@/lib/compare";
import { buildEvidenceCsv } from "@/lib/export/csv";
import { buildCompareDocx, buildPlanDiffDocx, buildRegulationDocx } from "@/lib/export/docx";
import { diffPlanDocs } from "@/lib/plandiff";
import { parseKind, readWorkspace } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function file(body: Buffer | string, name: string, type: string, asciiName: string) {
  return new Response(new Uint8Array(typeof body === "string" ? Buffer.from(body, "utf8") : body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const kind = parseKind(sp.get("kind"));
  if (!kind) return Response.json({ error: "작업공간 구분이 올바르지 않습니다." }, { status: 400 });
  const ws = await readWorkspace(kind);
  if (!ws) return Response.json({ error: "작업공간이 없습니다." }, { status: 404 });
  const type = sp.get("type");
  const prefix = ws.isDemo ? "[시연용] " : "";
  const date = new Date().toISOString().slice(0, 10);

  if (type === "rule" || type === "manual") {
    if (!ws.clauses.some((c) => c.docKind === type)) return Response.json({ error: "내보낼 조항이 없습니다. 초안을 먼저 작성하세요." }, { status: 400 });
    const buf = await buildRegulationDocx(ws, type);
    const name = `${prefix}${type === "rule" ? "운영규칙" : "운영요령"} 초안_${date}.docx`;
    return file(buf, name, DOCX, `${type}-draft.docx`);
  }
  if (type === "compare") {
    const b = sp.get("basis");
    let basis: CompareBasis;
    let detail = "";
    if (b === "versions") {
      basis = { kind: "versions", fromSnapshotId: sp.get("from") ?? "", toSnapshotId: sp.get("to") ?? "current" };
      const f = ws.snapshots.find((s) => s.id === sp.get("from"));
      const t = ws.snapshots.find((s) => s.id === sp.get("to"));
      detail = `v${f?.version ?? "?"} → ${t ? `v${t.version}` : "현재 작업본"}`;
    } else if (b === "similar") {
      basis = { kind: "similar" };
    } else {
      const csId = sp.get("changeSet") ?? ws.changeSets[ws.changeSets.length - 1]?.id;
      if (!csId) return Response.json({ error: "계획 변경 이력이 없습니다." }, { status: 400 });
      basis = { kind: "changeset", changeSetId: csId };
      const cs = ws.changeSets.find((c) => c.id === csId);
      detail = cs ? `변경: ${cs.label} · ${cs.diffs.map((d) => `${d.label} ${d.beforeValue || "(빈 값)"}→${d.afterValue || "(빈 값)"}`).join(", ")} · 조건과 연결된 조항 ${cs.affectedClauseIds.length}개만 자동 검토 대상(연결되지 않은 ${cs.unlinkedClauseCount}개 조항은 자동 검토 범위 밖)` : "";
    }
    const rows = buildCompareRows(ws, basis);
    const buf = await buildCompareDocx(ws, rows, basis, detail);
    return file(buf, `${prefix}신구대비표_${date}.docx`, DOCX, "comparison.docx");
  }
  if (type === "plandiff") {
    const before = ws.docs.find((d) => d.id === sp.get("before") && d.type === "plan");
    const after = ws.docs.find((d) => d.id === sp.get("after") && d.type === "plan");
    if (!before || !after) return Response.json({ error: "비교할 운영계획(안) 2개를 선택하세요." }, { status: 400 });
    const result = diffPlanDocs(ws, before.id, after.id);
    const buf = await buildPlanDiffDocx(ws, result, `${before.title} (${before.version || "버전 미기재"})`, `${after.title} (${after.version || "버전 미기재"})`);
    return file(buf, `${prefix}운영계획 수정사항 대비표_${date}.docx`, DOCX, "plan-diff.docx");
  }
  if (type === "csv") {
    return file(buildEvidenceCsv(ws), `${prefix}근거 매핑표_${date}.csv`, "text/csv; charset=utf-8", "evidence-map.csv");
  }
  if (type === "backup") {
    return file(JSON.stringify(ws, null, 2), `${prefix}작업 백업_${date}.json`, "application/json; charset=utf-8", "workspace-backup.json");
  }
  return Response.json({ error: "알 수 없는 내보내기 형식입니다." }, { status: 400 });
}
