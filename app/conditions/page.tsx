"use client";

import Link from "next/link";
import { useState } from "react";
import { NeedWorkspace } from "@/components/app-shell";
import { Badge, Button, Card, cx, inputCls, Notice, PageHeader } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { PLAN_BASIS_NOTICE, STRATEGY_LABEL } from "@/lib/labels";
import { markConditionsReviewed, updateCondition, updateProgram } from "@/lib/ops";
import type { Condition } from "@/lib/types";
import { formatDate } from "@/lib/util";

export default function ConditionsPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="사업 조건 확인" desc="운영계획(안)에서 추출하거나 직접 입력한 조건을 담당자가 확인합니다. 확인되지 않은 값은 비워 두며, 초안에는 【확인 필요】로 남습니다." />
      <NeedWorkspace>
        <Body />
      </NeedWorkspace>
    </div>
  );
}

function Body() {
  const { ws, update } = useWorkspace();
  const w = ws!;
  const locked = w.clauses.length > 0;
  const unconfirmed = w.conditions.filter((c) => c.status !== "confirmed" || !c.value.trim()).length;
  const unchecked = w.conditions.filter((c) => !c.userChecked).length;
  const groups: { id: string | null; title: string }[] = [{ id: null, title: "공통" }, ...w.programs.map((p) => ({ id: p.id, title: p.name }))];

  return (
    <div className="space-y-4">
      {locked ? (
        <Notice tone="blue">
          초안이 작성된 뒤에는 조건 값을 여기서 바꾸지 않습니다. 값이 바뀌면 <Link className="font-semibold underline" href="/changes">계획 변경</Link>에서 이전 조건과 비교하고, 연결된 조항에만 수정 제안을 만듭니다.
        </Notice>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[13px]">
              <div>미확정·빈 조건 <b className="text-amber-700">{unconfirmed}</b>개 · 담당자 미확인 <b className="text-amber-700">{unchecked}</b>개</div>
              <div className="text-[12px] text-gray-500">
                {w.project.conditionsReviewedAt ? `조건 확인 완료: ${formatDate(w.project.conditionsReviewedAt)}` : "초안 작성 전에 모든 조건을 확인해야 합니다. 미확정 값은 초안에 【미확정】·【확인 필요】로 표시됩니다."}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  if (unconfirmed && !confirm(`미확정·빈 조건 ${unconfirmed}개가 있습니다. 이 값들은 임의로 채우지 않고 초안에 확인 필요로 남깁니다. 조건 확인을 완료할까요?`)) return;
                  update((x) => markConditionsReviewed(x), "조건 확인을 완료했습니다. 편집기에서 초안을 작성하세요.");
                }}
              >
                조건 확인 완료
              </Button>
              {w.project.conditionsReviewedAt && <Link href="/editor"><Button>초안 작성으로 이동</Button></Link>}
            </div>
          </div>
        </Card>
      )}

      <Card title="세부사업 구성" actions={<Badge tone="amber">{PLAN_BASIS_NOTICE}</Badge>}>
        <div className="grid gap-3 md:grid-cols-3">
          {w.programs.map((p) => (
            <div key={p.id} className="space-y-2 rounded-md border border-gray-200 p-3">
              <input
                className={inputCls}
                defaultValue={p.name}
                aria-label="세부사업명"
                onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && update((x) => updateProgram(x, p.id, { name: e.target.value.trim() }), "세부사업명을 바꿨습니다. 이미 작성된 조문 본문은 자동으로 바뀌지 않습니다.")}
              />
              <div className="text-[12px]"><b className="text-brand">{STRATEGY_LABEL[p.strategy]}</b> — {p.strategyNote}</div>
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={p.confirmedByAgency} onChange={(e) => update((x) => updateProgram(x, p.id, { confirmedByAgency: e.target.checked }))} />
                기관에서 사업명·구성 확인
              </label>
            </div>
          ))}
        </div>
      </Card>

      {groups.map((g) => (
        <Card key={g.id ?? "common"} title={`${g.title} 조건`}>
          <table className="rtable w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[12px] text-gray-500">
                <th className="w-40 py-2">항목</th>
                <th>값</th>
                <th className="w-28">상태</th>
                <th className="w-56">원문 위치</th>
                <th className="w-24 text-center">담당자 확인</th>
              </tr>
            </thead>
            <tbody>
              {w.conditions.filter((c) => c.programId === g.id).map((c) => <CondRow key={`${c.id}:${c.updatedAt}`} c={c} locked={locked} />)}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

function CondRow({ c, locked }: { c: Condition; locked: boolean }) {
  const { ws, update } = useWorkspace();
  const [val, setVal] = useState(c.value);
  const [showSrc, setShowSrc] = useState(false);
  const chunk = c.sourceChunkId ? ws!.chunks.find((x) => x.id === c.sourceChunkId) : undefined;
  const doc = chunk ? ws!.docs.find((d) => d.id === chunk.docId) : undefined;
  const linked = ws!.clauses.filter((x) => x.conditionIds.includes(c.id)).length;

  return (
    <tr className="border-b border-gray-100 align-top">
      <td className="py-2 pr-2 font-medium">
        {c.label}
        {locked && <div className="text-[11px] font-normal text-gray-500">연결 조항 {linked}개</div>}
      </td>
      <td className="py-2 pr-2">
        {locked ? (
          c.value ? <span>{c.value}</span> : <span className="mark-check">비어 있음 — 확인 필요</span>
        ) : (
          <input
            className={cx(inputCls, !val.trim() && "border-amber-300 bg-amber-50/50")}
            value={val}
            placeholder="확인되지 않음(비워 두기)"
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => val !== c.value && update((x) => updateCondition(x, c.id, { value: val.trim() }))}
          />
        )}
      </td>
      <td className="py-2 pr-2">
        {locked ? (
          <Badge tone={c.status === "confirmed" && c.value ? "green" : "amber"}>{c.status === "confirmed" && c.value ? "확정" : "미확정"}</Badge>
        ) : (
          <select
            className={inputCls}
            value={c.status}
            onChange={(e) => update((x) => updateCondition(x, c.id, { status: e.target.value as Condition["status"] }))}
          >
            <option value="unconfirmed">미확정</option>
            <option value="confirmed" disabled={!c.value.trim()}>확정</option>
          </select>
        )}
      </td>
      <td className="py-2 pr-2 text-[12px] text-gray-600">
        {chunk && doc ? (
          <>
            <button className="text-left text-brand underline-offset-2 hover:underline" onClick={() => setShowSrc((v) => !v)}>
              {doc.title} ({doc.version}) · {chunk.locator}
            </button>
            {showSrc && <div className="mt-1 rounded border border-gray-200 bg-gray-50 p-1.5 text-[12px] text-gray-800">{chunk.text}</div>}
          </>
        ) : (
          <span>{c.locator ?? "직접 입력 또는 원문 없음"}</span>
        )}
      </td>
      <td className="py-2 text-center">
        <input type="checkbox" aria-label={`${c.label} 담당자 확인`} checked={c.userChecked} disabled={locked} onChange={(e) => update((x) => updateCondition(x, c.id, { userChecked: e.target.checked }))} />
      </td>
    </tr>
  );
}
