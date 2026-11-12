"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { NeedWorkspace } from "@/components/app-shell";
import { Badge, Card, cx, Empty, PageHeader, ReviewBadge } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { computeIssues, ISSUE_LABEL, type IssueKind } from "@/lib/checks";
import { DOC_KIND_LABEL } from "@/lib/labels";
import { articleNumbers } from "@/lib/render";
import type { DocKind } from "@/lib/types";
import { formatDate } from "@/lib/util";

const GROUPS: { key: string; label: string; kinds: IssueKind[] }[] = [
  { key: "evidence", label: "근거", kinds: ["source_missing", "no_evidence", "quote_mismatch"] },
  { key: "condition", label: "운영계획 조건", kinds: ["unconfirmed_condition", "value_mismatch"] },
  { key: "structure", label: "조항 번호·참조", kinds: ["numbering", "broken_ref"] },
  { key: "review", label: "검토 상태", kinds: ["unreviewed", "needs_fix", "rereview"] },
];

export default function ReviewPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="검토 목록" desc="프로그램으로 확인한 문제와 AI가 제안한 검토사항을 구분해 보여줍니다. 항목을 누르면 해당 조항으로 이동합니다." />
      <Suspense>
        <NeedWorkspace>
          <Body />
        </NeedWorkspace>
      </Suspense>
    </div>
  );
}

function Body() {
  const { ws, update } = useWorkspace();
  const sp = useSearchParams();
  const w = ws!;
  const [group, setGroup] = useState<string>(sp.get("kind") ?? "all");
  const [doc, setDoc] = useState<"all" | DocKind>("all");
  const issues = computeIssues(w);
  const nums = { rule: articleNumbers(w, "rule"), manual: articleNumbers(w, "manual") };
  const label = (clauseId?: string) => {
    const c = w.clauses.find((x) => x.id === clauseId);
    return c ? `${DOC_KIND_LABEL[c.docKind]} 제${nums[c.docKind].get(c.id)}조(${c.title})` : "-";
  };
  const g = GROUPS.find((x) => x.key === group);
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const shown = issues
    .filter((i) => (!g || g.kinds.includes(i.kind)) && (doc === "all" || i.docKind === doc))
    .sort((a, b) => rank[a.severity] - rank[b.severity]);
  const aiIssues = w.aiIssues.filter((a) => !a.resolved && (doc === "all" || w.clauses.find((c) => c.id === a.clauseId)?.docKind === doc));
  const pending = w.suggestions.filter((s) => s.status === "pending" || s.status === "held");

  if (!w.clauses.length) return <Empty title="아직 초안이 없습니다">초안을 작성하면 조항별 점검 결과가 여기에 표시됩니다.</Empty>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[{ key: "all", label: "전체" }, ...GROUPS].map((x) => {
          const n = x.key === "all" ? issues.length : issues.filter((i) => GROUPS.find((y) => y.key === x.key)!.kinds.includes(i.kind)).length;
          return (
            <button key={x.key} onClick={() => setGroup(x.key)} className={cx("rounded-full border px-3 py-1 text-[13px]", group === x.key ? "border-navy bg-navy text-white" : "border-gray-300 bg-white text-gray-700")}>
              {x.label} <b>{n}</b>
            </button>
          );
        })}
        <span className="flex-1" />
        <select className="rounded-md border border-gray-300 px-2 py-1 text-[13px]" value={doc} onChange={(e) => setDoc(e.target.value as typeof doc)}>
          <option value="all">운영규칙·요령 전체</option>
          <option value="rule">운영규칙</option>
          <option value="manual">운영요령</option>
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title={<span>프로그램 점검 결과 <Badge tone="navy">규칙으로 확인</Badge></span>}>
          {shown.length === 0 ? (
            <p className="text-[13px] text-gray-500">해당하는 문제가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {shown.map((i) => {
                const c = w.clauses.find((x) => x.id === i.clauseId);
                return (
                  <li key={i.id}>
                    <Link href={c ? `/editor?doc=${c.docKind}&clause=${c.id}` : "/editor"} className="flex items-start gap-3 px-1 py-2 hover:bg-brand-50/50">
                      <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", i.severity === "high" ? "bg-red-500" : i.severity === "medium" ? "bg-amber-500" : "bg-gray-400")} aria-label={`중요도 ${i.severity}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={i.severity === "high" ? "red" : i.severity === "medium" ? "amber" : "gray"}>{ISSUE_LABEL[i.kind]}</Badge>
                          <span className="text-[13px] font-semibold text-navy">{label(i.clauseId)}</span>
                          {c && <ReviewBadge status={c.reviewStatus} />}
                        </div>
                        <p className="mt-0.5 text-[13px] text-gray-700">{i.message}</p>
                      </div>
                      <span className="text-[12px] text-brand">이동 →</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card title={<span>AI 제안 검토사항 <Badge tone="purple">AI 제안</Badge></span>}>
            {aiIssues.length === 0 ? (
              <p className="text-[13px] text-gray-500">{w.isDemo ? "데모 모드에서는 AI를 사용하지 않습니다." : "AI 작성 제안을 받으면 확인할 사항이 여기에 모입니다."}</p>
            ) : (
              <ul className="space-y-2">
                {aiIssues.map((a) => {
                  const c = w.clauses.find((x) => x.id === a.clauseId);
                  return (
                    <li key={a.id} className="rounded border border-violet-200 bg-violet-50 p-2 text-[13px]">
                      <Link href={c ? `/editor?doc=${c.docKind}&clause=${c.id}` : "/editor"} className="font-semibold text-navy hover:underline">{label(a.clauseId)}</Link>
                      <p className="mt-0.5">{a.text}</p>
                      <div className="mt-1 flex justify-between text-[11px] text-gray-500">
                        <span>{formatDate(a.createdAt)}</span>
                        <button className="text-violet-700" onClick={() => update((x) => { const t = x.aiIssues.find((y) => y.id === a.id); if (t) t.resolved = true; })}>확인함</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title={`결정 대기·보류 제안 ${pending.length}건`}>
            {pending.length === 0 ? (
              <p className="text-[13px] text-gray-500">없음</p>
            ) : (
              <ul className="space-y-1.5 text-[13px]">
                {pending.map((s) => {
                  const c = w.clauses.find((x) => x.id === s.clauseId);
                  return (
                    <li key={s.id}>
                      <Link href={c ? `/editor?doc=${c.docKind}&clause=${c.id}` : "/changes"} className="hover:underline">
                        <Badge tone={s.status === "held" ? "gray" : "blue"}>{s.status === "held" ? "보류" : "대기"}</Badge> {label(s.clauseId)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
