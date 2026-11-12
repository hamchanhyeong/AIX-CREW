"use client";

import Link from "next/link";
import type { CompareRow } from "@/lib/change";
import { Badge, cx, DiffView } from "./ui";

const TYPE: Record<CompareRow["changeType"], { label: string; tone: "blue" | "green" | "red"; row: string }> = {
  modify: { label: "[수정]", tone: "blue", row: "" },
  add: { label: "[추가]", tone: "green", row: "bg-emerald-50/40" },
  delete: { label: "[삭제]", tone: "red", row: "bg-red-50/40" },
};

export function CompareTable({ rows, beforeLabel = "변경 전", afterLabel = "변경 제안" }: { rows: CompareRow[]; beforeLabel?: string; afterLabel?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-gray-500">비교할 변경 사항이 없습니다.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-navy text-left text-[12px] text-white">
            <th className="w-44 px-2 py-2">문서 종류와 조항</th>
            <th className="px-2">{beforeLabel}</th>
            <th className="px-2">{afterLabel}</th>
            <th className="w-48 px-2">변경 사유</th>
            <th className="w-44 px-2">관련 계획·근거</th>
            <th className="w-20 px-2">반영 상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const t = TYPE[r.changeType];
            return (
              <tr key={`${r.clauseId}-${i}`} className={cx("border-b border-gray-200 align-top", t.row)}>
                <td className="px-2 py-2">
                  <Badge tone={t.tone}>{t.label}</Badge>
                  <div className="mt-1 font-semibold text-navy">
                    {r.changeType === "delete" ? r.clauseLabel : <Link className="hover:underline" href={`/editor?doc=${r.docKind}&clause=${r.clauseId}`}>{r.clauseLabel}</Link>}
                  </div>
                </td>
                <td className="px-2 py-2">{r.before ? <DiffView before={r.before} after={r.after} side="before" /> : <span className="text-gray-400">(없음)</span>}</td>
                <td className="px-2 py-2">{r.after ? <DiffView before={r.before} after={r.after} side="after" /> : <span className="text-gray-400">(삭제)</span>}</td>
                <td className="px-2 py-2 text-[12px]">
                  {r.reason}
                  {r.warnings.map((w, j) => <div key={j} className="mt-1 text-amber-800">⚠ {w}</div>)}
                </td>
                <td className="whitespace-pre-line px-2 py-2 text-[12px] text-gray-600">{r.related || "-"}</td>
                <td className="px-2 py-2">
                  <Badge tone={r.status === "반영" ? "green" : r.status === "보류" ? "amber" : r.status === "결정 대기" ? "blue" : "gray"}>{r.status}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
