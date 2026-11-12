"use client";

import { useState } from "react";
import { NeedWorkspace } from "@/components/app-shell";
import { downloadFile } from "@/components/download";
import { Badge, Button, Card, Notice, PageHeader } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { computeIssues } from "@/lib/checks";
import { currentVersionLabel } from "@/lib/ops";
import { validateWorkspace } from "@/lib/schema";
import { formatDate } from "@/lib/util";

export default function ExportPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="내보내기·백업" desc="모든 파일에 프로젝트명·버전·작성일·검토용 초안 표시가 들어가며, 【확인 필요】·【미확정】 표시도 그대로 유지됩니다." />
      <NeedWorkspace>
        <Body />
      </NeedWorkspace>
    </div>
  );
}

function Body() {
  const { ws, kind, flush, notify, replaceWorkspace } = useWorkspace();
  const w = ws!;
  const [busy, setBusy] = useState<string | null>(null);
  const issues = computeIssues(w);
  const hasRule = w.clauses.some((c) => c.docKind === "rule");
  const hasManual = w.clauses.some((c) => c.docKind === "manual");
  const pending = w.suggestions.filter((s) => s.status === "pending").length;

  async function download(type: string) {
    setBusy(type);
    const ok = await flush();
    if (!ok) {
      setBusy(null);
      return notify("저장에 실패해 내려받지 않았습니다. 상단의 ‘다시 저장’을 누르세요.", "error");
    }
    const r = await downloadFile(`/api/export?kind=${kind}&type=${type}`);
    setBusy(null);
    notify(r.ok ? `내려받았습니다: ${r.name}` : r.error, r.ok ? "ok" : "error");
  }

  async function restore(file: File) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return notify("JSON 파일이 아닙니다.", "error");
    }
    const v = validateWorkspace(parsed);
    if (!v.ok) return notify(v.error, "error");
    if (!confirm(`‘${v.ws.project.name}’ 백업(${formatDate(v.ws.project.updatedAt)})으로 현재 ${kind === "sample" ? "샘플" : "실제"} 작업공간을 덮어쓸까요? 현재 내용은 사라집니다. 먼저 현재 작업을 백업하는 것을 권장합니다.`)) return;
    if (await replaceWorkspace(v.ws)) notify("백업을 복원했습니다.", "ok");
  }

  const items = [
    { type: "rule", name: "운영규칙 초안.docx", desc: "8개 장 구성 운영규칙 1부 + 조항별 근거 목록 부록", enabled: hasRule },
    { type: "manual", name: "운영요령 초안.docx", desc: "공통편 + 사업별 3개 편 운영요령 1부 + 근거 목록 부록", enabled: hasManual },
    { type: "compare", name: "신구대비표.docx", desc: "가장 최근 계획 변경 기준(다른 기준은 ‘계획 변경·신구대비표’ 화면에서 선택)", enabled: w.changeSets.length > 0 },
    { type: "csv", name: "근거 매핑표.csv", desc: "조항 × 근거(역할·자료·버전·위치·인용·원문 상태·연결 조건). 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM 포함", enabled: w.clauses.length > 0 },
    { type: "backup", name: "작업 백업.json", desc: "작업공간 전체(자료 원문 포함). 비공개 자료가 들어 있을 수 있으니 보관에 주의하세요.", enabled: true },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <span>현재 버전 <b>{currentVersionLabel(w)}</b></span>
          <span>검토 목록 <b className={issues.length ? "text-amber-700" : ""}>{issues.length}</b>건</span>
          <span>결정 대기 제안 <b>{pending}</b>건</span>
          {w.isDemo && <Badge tone="amber">파일에 ‘시연용 가상 자료’ 표시</Badge>}
        </div>
        {issues.length > 0 && <Notice className="mt-2">검토 항목이 남아 있어도 내려받을 수 있지만, 파일은 ‘검토용 초안’으로 표시됩니다.</Notice>}
      </Card>

      <Card title="파일 내려받기">
        <ul className="divide-y divide-gray-100">
          {items.map((it) => (
            <li key={it.type} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-navy">{it.name}</div>
                <div className="text-[12px] text-gray-600">{it.desc}</div>
              </div>
              <Button variant={it.enabled ? "primary" : "secondary"} disabled={!it.enabled} busy={busy === it.type} onClick={() => download(it.type)}>
                {it.enabled ? "다운로드" : it.type === "compare" ? "계획 변경 이력 없음" : "초안 없음"}
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Notice tone="blue">운영계획(안) <b>수정사항 대비표.docx</b>는 ‘계획 변경·신구대비표’ 화면에서 이전·새 계획(안)을 골라 내려받습니다.</Notice>

      <Card title="백업 복원">
        <p className="mb-2 text-[13px] text-gray-600">작업 백업.json을 선택하면 형식을 확인한 뒤 현재 작업공간({kind === "sample" ? "샘플" : "실제"})을 덮어씁니다.</p>
        <input type="file" accept=".json,application/json" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} className="text-[13px] file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5" />
      </Card>
    </div>
  );
}
