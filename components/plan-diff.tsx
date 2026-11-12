"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DOC_KIND_LABEL } from "@/lib/labels";
import { checkPlanAgainstDraft, DRAFT_CHECK_LABEL, type DraftCheckStatus, type PlanDiffResult } from "@/lib/plandiff";
import { articleNumbers } from "@/lib/render";
import { conditionTitle } from "@/lib/structure";
import type { Workspace } from "@/lib/types";
import { Badge, Card, cx, DiffView } from "./ui";

const TYPE = {
  modified: { label: "[수정]", tone: "blue" as const, row: "" },
  added: { label: "[추가]", tone: "green" as const, row: "bg-emerald-50/40" },
  removed: { label: "[삭제]", tone: "red" as const, row: "bg-red-50/40" },
  same: { label: "같음", tone: "gray" as const, row: "" },
};

/** 운영계획(안) 이전·이후 원문 수정사항 표 */
export function PlanDiffView({ ws, result }: { ws: Workspace; result: PlanDiffResult }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? result.rows : result.rows.filter((r) => r.type !== "same");
  const changedCount = result.added + result.removed + result.modified;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
        <span>
          바뀐 줄 <b>{changedCount}</b>개 — 수정 {result.modified} · 추가 {result.added} · 삭제 {result.removed}
        </span>
        <Badge tone="blue">사업 조건으로 인식 {result.recognized}</Badge>
        <Badge tone={result.unrecognized ? "amber" : "gray"}>조건 미인식 {result.unrecognized}</Badge>
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-gray-600">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 바뀌지 않은 줄도 보기
        </label>
      </div>
      {result.unrecognized > 0 && (
        <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          ‘조건 미인식’ 줄은 사업 조건(‘항목: 값’)으로 인식되지 않아 규정 조항 수정안이 자동으로 만들어지지 않습니다. 관련 조항이 있는지 담당자가 직접 확인하세요.
        </p>
      )}
      {changedCount === 0 && !showAll ? (
        <p className="py-4 text-center text-[13px] text-gray-500">두 계획(안)의 원문이 같습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="rtable w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-navy text-left text-[12px] text-white">
                <th className="w-20 px-2 py-2">구분</th>
                <th className="px-2">이전 계획(안)</th>
                <th className="px-2">새 계획(안)</th>
                <th className="w-56 px-2">사업 조건</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const t = TYPE[r.type];
                const b = r.before?.text ?? "";
                const a = r.after?.text ?? "";
                return (
                  <tr key={i} className={cx("border-b border-gray-200 align-top", t.row)}>
                    <td className="px-2 py-2"><Badge tone={t.tone}>{t.label}</Badge></td>
                    <td className="px-2 py-2">
                      {r.before ? (
                        <>
                          <div className="text-[11px] text-gray-500">{r.before.locator}</div>
                          {r.type === "modified" ? <DiffView before={b} after={a} side="before" /> : <div className={cx("clause-text text-[13px]", r.type === "removed" && "text-red-800 line-through")}>{b}</div>}
                        </>
                      ) : (
                        <span className="text-gray-400">(없음)</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {r.after ? (
                        <>
                          <div className="text-[11px] text-gray-500">{r.after.locator}</div>
                          {r.type === "modified" ? <DiffView before={b} after={a} side="after" /> : <div className={cx("clause-text text-[13px]", r.type === "added" && "font-semibold text-emerald-900")}>{a}</div>}
                        </>
                      ) : (
                        <span className="text-gray-400">(삭제됨)</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[12px]">
                      {r.type === "same" ? (
                        <span className="text-gray-400">-</span>
                      ) : r.conditionIds.length ? (
                        r.conditionIds.map((id) => {
                          const c = ws.conditions.find((x) => x.id === id);
                          const n = ws.clauses.filter((x) => x.conditionIds.includes(id)).length;
                          return (
                            <div key={id}>
                              <b className="text-navy">{c ? conditionTitle(ws, c) : id}</b>
                              <div className="text-gray-600">연결 조항 {n}개</div>
                            </div>
                          );
                        })
                      ) : (
                        <span className="text-amber-800">조건 미인식 — 관련 조항 직접 확인</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const STATUS_TONE: Record<DraftCheckStatus, "green" | "red" | "gray" | "amber"> = {
  reflected: "green",
  mismatch: "red",
  unlinked: "gray",
  empty: "amber",
};

/** 운영계획 조건 ↔ 규정 초안 대조표 */
export function DraftCheckCard({ ws }: { ws: Workspace }) {
  const rows = useMemo(() => checkPlanAgainstDraft(ws), [ws]);
  const [onlyIssues, setOnlyIssues] = useState(true);
  const shown = onlyIssues ? rows.filter((r) => r.status !== "reflected") : rows;
  const nums = { rule: articleNumbers(ws, "rule"), manual: articleNumbers(ws, "manual") };
  const count = (s: DraftCheckStatus) => rows.filter((r) => r.status === s).length;
  return (
    <Card title="운영계획 ↔ 규정 초안 대조 (사업 조건 기준)">
      <p className="mb-2 text-[12px] text-gray-600">
        현재 사업 조건 값이 연결된 조항 본문에 그대로 들어 있는지만 확인합니다. 문장의 의미나 법령 적합성은 판단하지 않으며, 담당자 검토가 필요합니다.
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
        {(Object.keys(DRAFT_CHECK_LABEL) as DraftCheckStatus[]).map((s) => (
          <Badge key={s} tone={STATUS_TONE[s]}>{DRAFT_CHECK_LABEL[s]} {count(s)}</Badge>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-gray-600">
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> 확인이 필요한 항목만
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-gray-500">모든 사업 조건 값이 연결 조항에 반영되어 있습니다.</p>
      ) : (
        <table className="rtable w-full text-[13px]">
          <thead>
            <tr className="border-b border-gray-200 text-left text-[12px] text-gray-500">
              <th className="py-1.5">사업 조건</th>
              <th>계획 값</th>
              <th>대조 결과</th>
              <th>연결 조항(반영 여부)</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.conditionId} className="border-b border-gray-100 align-top">
                <td className="py-1.5 font-medium">{r.label}</td>
                <td>{r.value ? <>{r.value} {!r.confirmed && <span className="text-[11px] text-amber-700">(미확정)</span>}</> : <span className="mark-check">비어 있음</span>}</td>
                <td><Badge tone={STATUS_TONE[r.status]}>{DRAFT_CHECK_LABEL[r.status]}</Badge></td>
                <td className="text-[12px]">
                  {r.clauses.length === 0 ? (
                    <span className="text-gray-400">-</span>
                  ) : (
                    r.clauses.map((c) => {
                      const cl = ws.clauses.find((x) => x.id === c.clauseId)!;
                      return (
                        <div key={c.clauseId}>
                          <Link className="hover:underline" href={`/editor?doc=${cl.docKind}&clause=${cl.id}`}>
                            {DOC_KIND_LABEL[cl.docKind]} 제{nums[cl.docKind].get(cl.id)}조({cl.title})
                          </Link>{" "}
                          {r.value ? (c.reflected ? <span className="text-emerald-700">반영</span> : <span className="font-semibold text-red-700">미반영</span>) : null}
                        </div>
                      );
                    })
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
