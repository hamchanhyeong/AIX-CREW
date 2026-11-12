"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { NeedWorkspace } from "@/components/app-shell";
import { downloadFile } from "@/components/download";
import { CompareTable } from "@/components/compare-table";
import { Badge, Button, Card, cx, DiffView, Empty, inputCls, Notice, PageHeader } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { applySuggestion, decideSuggestion, diffConditions, proposeFromPlanDoc, saveChangeSetVersion, startChangeSet, type ProposedCondition } from "@/lib/change";
import { BASIS_LABEL, buildCompareRows, type CompareBasis } from "@/lib/compare";
import { addDoc, DEMO_PLAN_V2 } from "@/lib/demo";
import { DOC_KIND_LABEL, SUGGESTION_STATUS_LABEL } from "@/lib/labels";
import { articleNumbers } from "@/lib/render";
import { conditionTitle } from "@/lib/structure";
import type { ChangeSet, CondStatus, ConditionDiff } from "@/lib/types";
import { formatDate } from "@/lib/util";

export default function ChangesPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="계획 변경·신구대비표"
        desc="① 이전·신규 계획 조건 비교 → ② 연결된 조항 찾기 → ③ 수정안 생성 → ④ 변경 전·후 비교 → ⑤ 개별 반영·보류 → ⑥ 새 버전 저장"
      />
      <NeedWorkspace>
        <Body />
      </NeedWorkspace>
    </div>
  );
}

function Body() {
  const { ws } = useWorkspace();
  const w = ws!;
  const [activeCs, setActiveCs] = useState<string | null>(w.changeSets[w.changeSets.length - 1]?.id ?? null);
  if (!w.clauses.length) {
    return (
      <Empty title="초안이 없습니다" action={<Link href="/editor"><Button variant="primary">초안 작성으로</Button></Link>}>
        계획 변경 비교는 초안이 있어야 합니다. 초안 작성 전에는 <Link className="underline" href="/conditions">사업 조건</Link>에서 값을 직접 고치세요.
      </Empty>
    );
  }
  const cs = w.changeSets.find((c) => c.id === activeCs);
  return (
    <div className="space-y-5">
      <NewChange onStarted={setActiveCs} />
      {w.changeSets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-gray-600">변경 이력</span>
          {[...w.changeSets].reverse().map((c) => (
            <button key={c.id} onClick={() => setActiveCs(c.id)} className={cx("rounded-full border px-3 py-1", activeCs === c.id ? "border-navy bg-navy text-white" : "border-gray-300 bg-white")}>
              {formatDate(c.createdAt)} · {c.label}
            </button>
          ))}
        </div>
      )}
      {cs && <ChangeSetView key={cs.id} cs={cs} />}
      {/* 새 계획 변경이 생기면 기본 비교 기준(이전 초안 ↔ 계획 반영 초안)으로 다시 시작 */}
      <CompareSection key={w.changeSets[w.changeSets.length - 1]?.id ?? "none"} />
    </div>
  );
}

function NewChange({ onStarted }: { onStarted: (id: string) => void }) {
  const { ws, update } = useWorkspace();
  const w = ws!;
  const [mode, setMode] = useState<"plan" | "direct">("plan");
  const plans = w.docs.filter((d) => d.type === "plan" && d.textStatus === "registered");
  const [planId, setPlanId] = useState<string>(plans[plans.length - 1]?.id ?? "");
  const [direct, setDirect] = useState<Record<string, ProposedCondition>>({});
  const [label, setLabel] = useState("");

  const planProposal = useMemo(() => (mode === "plan" && planId ? proposeFromPlanDoc(w, planId) : null), [mode, planId, w]);
  const diffs: ConditionDiff[] = useMemo(() => {
    if (mode === "plan") return planProposal ? diffConditions(w, planProposal.proposed) : [];
    return diffConditions(w, direct);
  }, [mode, planProposal, direct, w]);
  const planDoc = w.docs.find((d) => d.id === planId);
  const affectedPreview = w.clauses.filter((c) => c.conditionIds.some((id) => diffs.some((d) => d.conditionId === id))).length;

  function start() {
    const lbl = label.trim() || (mode === "plan" && planDoc ? `${planDoc.title} ${planDoc.version}` : "조건 직접 변경");
    const id = update((x) => startChangeSet(x, diffs, { label: lbl, planDocId: mode === "plan" ? planId : undefined }).id, "변경을 적용하고 연결된 조항의 수정안을 만들었습니다.");
    if (id) {
      onStarted(id);
      setDirect({});
      setLabel("");
    }
  }

  return (
    <Card title="새 계획 반영 · 조건 비교">
      <div className="mb-3 flex gap-1 rounded-md bg-gray-100 p-1 text-[13px]">
        <button className={cx("flex-1 rounded px-3 py-1.5", mode === "plan" ? "bg-white font-semibold text-navy shadow-sm" : "text-gray-600")} onClick={() => setMode("plan")}>새 운영계획(안)과 비교</button>
        <button className={cx("flex-1 rounded px-3 py-1.5", mode === "direct" ? "bg-white font-semibold text-navy shadow-sm" : "text-gray-600")} onClick={() => setMode("direct")}>주요 조건 직접 변경</button>
      </div>

      {mode === "plan" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-72 flex-1">
              <span className="mb-1 block text-[12px] font-semibold text-gray-700">비교할 운영계획(안)</span>
              <select className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                {plans.map((d) => <option key={d.id} value={d.id}>{d.title} ({d.version || "버전 미기재"}) · 등록 {formatDate(d.createdAt)}</option>)}
              </select>
            </label>
            {w.isDemo && !w.docs.some((d) => d.version === "가상 v2") && (
              <Button variant="subtle" onClick={() => {
                const id = update((x) => addDoc(x, { title: "[가상] 재기지원 사업 운영계획(안)", type: "plan", version: "가상 v2", effectiveDate: "", text: DEMO_PLAN_V2, applicability: "applicable", isPublic: false, isDemo: true, allowExternal: false }).id, "가상 운영계획(안) v2를 등록했습니다(지원 한도 1억원 → 1.5억원, 시연용).");
                if (id) setPlanId(id);
              }}>가상 계획 v2 등록(시연용: 한도 1억→1.5억원)</Button>
            )}
            <Link href="/sources"><Button variant="ghost">새 계획(안) 파일 등록</Button></Link>
          </div>
          {planProposal && (
            <p className="text-[12px] text-gray-500">
              {planProposal.method}. 새 계획에서 찾지 못한 기존 조건 {planProposal.notFound.length}개는 바꾸지 않습니다{planProposal.notFound.length ? `: ${planProposal.notFound.join(", ")}` : ""}.
            </p>
          )}
        </div>
      ) : (
        <DirectEditor value={direct} onChange={setDirect} />
      )}

      <div className="mt-4">
        <h3 className="mb-2 text-[13px] font-semibold text-navy">① 조건 비교 결과 — 바뀐 조건 {diffs.length}개</h3>
        {diffs.length === 0 ? (
          <p className="text-[13px] text-gray-500">현재 조건과 달라진 값이 없습니다.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[12px] text-gray-500"><th className="py-1.5">조건</th><th>이전</th><th>신규</th><th>원문 위치</th><th>연결 조항</th></tr>
            </thead>
            <tbody>
              {diffs.map((d) => (
                <tr key={d.conditionId} className="border-b border-gray-100">
                  <td className="py-1.5 font-medium">{d.label}</td>
                  <td><del className="text-red-700">{d.beforeValue || "(빈 값)"}</del> <span className="text-[11px] text-gray-500">{d.beforeStatus === "confirmed" ? "확정" : "미확정"}</span></td>
                  <td><b className="text-emerald-800">{d.afterValue || "(빈 값)"}</b> <span className="text-[11px] text-gray-500">{d.afterStatus === "confirmed" ? "확정" : "미확정"}</span></td>
                  <td className="text-[12px] text-gray-600">{d.afterLocator ?? "-"}</td>
                  <td>{w.clauses.filter((c) => c.conditionIds.includes(d.conditionId)).length}개</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {diffs.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input className={cx(inputCls, "max-w-xs")} placeholder="변경 이름(선택)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Button variant="primary" onClick={start}>② 연결 조항 찾기 · ③ 수정안 생성</Button>
            <span className="text-[12px] text-gray-500">조건과 연결된 조항 {affectedPreview}개만 대상입니다. 변경 전 상태는 자동으로 버전 저장됩니다. 신규 값은 현재 조건에 반영되며 ‘미확정’ 상태로 들어옵니다.</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function DirectEditor({ value, onChange }: { value: Record<string, ProposedCondition>; onChange: (v: Record<string, ProposedCondition>) => void }) {
  const { ws } = useWorkspace();
  const w = ws!;
  const linked = w.conditions.filter((c) => w.clauses.some((x) => x.conditionIds.includes(c.id)));
  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[12px] text-gray-500"><th className="py-1.5">조건</th><th>현재 값</th><th>새 값</th><th className="w-28">새 상태</th></tr>
        </thead>
        <tbody>
          {linked.map((c) => {
            const cur = value[c.id];
            return (
              <tr key={c.id} className="border-b border-gray-100">
                <td className="py-1.5 pr-2 font-medium">{conditionTitle(w, c)}</td>
                <td className="pr-2 text-gray-600">{c.value || <span className="mark-check">비어 있음</span>}</td>
                <td className="pr-2">
                  <input
                    className={inputCls}
                    aria-label={`${conditionTitle(w, c)} 새 값`}
                    value={cur?.value ?? c.value}
                    onChange={(e) => onChange({ ...value, [c.id]: { value: e.target.value, status: cur?.status ?? c.status } })}
                  />
                </td>
                <td>
                  <select className={inputCls} value={cur?.status ?? c.status} onChange={(e) => onChange({ ...value, [c.id]: { value: cur?.value ?? c.value, status: e.target.value as CondStatus } })}>
                    <option value="unconfirmed">미확정</option>
                    <option value="confirmed">확정</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChangeSetView({ cs }: { cs: ChangeSet }) {
  const { ws, update, notify } = useWorkspace();
  const w = ws!;
  const sugs = w.suggestions.filter((s) => s.changeSetId === cs.id);
  const decided = sugs.filter((s) => s.status !== "pending").length;
  const result = cs.resultSnapshotId ? w.snapshots.find((s) => s.id === cs.resultSnapshotId) : undefined;
  const base = w.snapshots.find((s) => s.id === cs.baseSnapshotId);
  const nums = { rule: articleNumbers(w, "rule"), manual: articleNumbers(w, "manual") };

  return (
    <Card
      title={`변경: ${cs.label}`}
      actions={
        <Button
          variant="primary"
          size="sm"
          disabled={decided === 0}
          onClick={() => update((x) => saveChangeSetVersion(x, cs.id), "반영 결과를 새 버전으로 저장했습니다.")}
        >
          ⑥ 반영 결과를 새 버전으로 저장
        </Button>
      }
    >
      <div className="mb-3 grid gap-2 text-[13px] md:grid-cols-3">
        <div className="rounded border border-gray-200 p-2">변경된 조건 <b>{cs.diffs.length}</b>개: {cs.diffs.map((d) => `${d.label} ${d.beforeValue || "(빈 값)"}→${d.afterValue || "(빈 값)"}`).join(", ")}</div>
        <div className="rounded border border-gray-200 p-2">② 연결된 조항 <b>{cs.affectedClauseIds.length}</b>개에 수정안 생성 · 결정 {decided}/{sugs.length}</div>
        <div className="rounded border border-gray-200 p-2">비교 기준: 변경 전 자동 저장 v{base?.version ?? "?"}{result ? ` → 반영 저장 v${result.version}` : " → (아직 새 버전 저장 전)"}</div>
      </div>
      <Notice tone="gray" className="mb-3">
        조건과 연결되지 않은 {cs.unlinkedClauseCount}개 조항은 자동 검토 범위에 포함되지 않았습니다. 같은 숫자가 들어 있어도 바꾸지 않았으니 필요하면 직접 확인하세요.
      </Notice>
      <ul className="space-y-3">
        {sugs.map((s) => {
          const c = w.clauses.find((x) => x.id === s.clauseId);
          const stale = c ? c.body !== s.before || c.title !== s.beforeTitle : true;
          return (
            <li key={s.id} className={cx("rounded-md border p-3", s.status === "applied" ? "border-emerald-200 bg-emerald-50/30" : s.status === "held" ? "border-amber-200 bg-amber-50/30" : "border-gray-200")}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="blue">[수정]</Badge>
                {c ? (
                  <Link href={`/editor?doc=${c.docKind}&clause=${c.id}`} className="font-semibold text-navy hover:underline">
                    {DOC_KIND_LABEL[c.docKind]} 제{nums[c.docKind].get(c.id)}조({c.title})
                  </Link>
                ) : <span className="text-red-700">삭제된 조항</span>}
                <Badge tone={s.status === "applied" ? "green" : s.status === "held" ? "amber" : s.status === "rejected" ? "gray" : "blue"}>{SUGGESTION_STATUS_LABEL[s.status]}</Badge>
                <span className="text-[12px] text-gray-600">{s.reason}</span>
              </div>
              {s.warnings.map((x, i) => <Notice key={i} className="mb-2">{x}</Notice>)}
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded border border-gray-200 bg-white p-2"><div className="mb-1 text-[11px] font-semibold text-gray-500">④ 변경 전</div><DiffView before={s.before} after={s.after} side="before" /></div>
                <div className="rounded border border-emerald-200 bg-white p-2"><div className="mb-1 text-[11px] font-semibold text-emerald-700">변경 제안</div>{s.manualOnly ? <p className="text-[13px] text-amber-800">자동 수정안 없음 — 편집기에서 직접 수정하세요.</p> : <DiffView before={s.before} after={s.after} side="after" />}</div>
              </div>
              {s.status !== "applied" && s.status !== "rejected" && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="primary" disabled={stale || s.manualOnly} onClick={() => {
                    const r = update((x) => applySuggestion(x, s.id));
                    if (r && !r.ok) notify(r.reason, "error");
                    else if (r?.ok) notify("반영했습니다. 검토 완료였던 조항은 재검토 필요로 바뀝니다.", "ok");
                  }}>⑤ 반영</Button>
                  {s.status !== "held" && <Button size="sm" onClick={() => update((x) => decideSuggestion(x, s.id, "held"), "보류했습니다.")}>보류</Button>}
                  <Button size="sm" variant="ghost" onClick={() => update((x) => decideSuggestion(x, s.id, "rejected"), "반영하지 않기로 했습니다.")}>반영 안 함</Button>
                  {stale && <span className="text-[12px] text-red-700">제안 생성 후 조항이 수정되어 반영할 수 없습니다(담당자 수정본 보존).</span>}
                </div>
              )}
              {s.status === "held" && <p className="mt-1 text-[12px] text-amber-800">보류 중인 조항은 현재 조건 값과 달라 검토 목록에 ‘조건 값 불일치’로 표시됩니다.</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function CompareSection() {
  const { ws, flush, kind, notify } = useWorkspace();
  const w = ws!;
  const lastCs = w.changeSets[w.changeSets.length - 1];
  const [basisKind, setBasisKind] = useState<CompareBasis["kind"]>(lastCs ? "changeset" : "versions");
  const [csId, setCsId] = useState(lastCs?.id ?? "");
  const [from, setFrom] = useState(w.snapshots[0]?.id ?? "");
  const [to, setTo] = useState<string>("current");
  const basis: CompareBasis | null =
    basisKind === "changeset" ? (csId || lastCs?.id ? { kind: "changeset", changeSetId: csId || lastCs!.id } : null) : basisKind === "versions" ? (from ? { kind: "versions", fromSnapshotId: from, toSnapshotId: to } : null) : { kind: "similar" };
  const rows = basis ? buildCompareRows(w, basis) : [];

  async function download() {
    const ok = await flush();
    if (!ok) return notify("저장에 실패해 내려받지 않았습니다.", "error");
    const q = new URLSearchParams({ kind, type: "compare", basis: basisKind });
    if (basis?.kind === "changeset") q.set("changeSet", basis.changeSetId);
    if (basis?.kind === "versions") {
      q.set("from", basis.fromSnapshotId);
      q.set("to", basis.toSnapshotId);
    }
    const r = await downloadFile(`/api/export?${q}`);
    notify(r.ok ? `내려받았습니다: ${r.name}` : r.error, r.ok ? "ok" : "error");
  }

  return (
    <Card title="신구대비표" actions={<Button variant="primary" size="sm" disabled={!basis || !rows.length} onClick={download}>신구대비표.docx 다운로드</Button>}>
      <div className="mb-3 flex flex-wrap items-end gap-3 text-[13px]">
        <label>
          <span className="mb-1 block text-[12px] font-semibold text-gray-700">비교 기준</span>
          <select className={inputCls} value={basisKind} onChange={(e) => setBasisKind(e.target.value as CompareBasis["kind"])}>
            <option value="changeset" disabled={!lastCs}>기본: 이전 초안 ↔ 계획 반영 초안</option>
            <option value="versions">저장 버전 간 비교</option>
            <option value="similar">선택: 유사사업 참고 규정 ↔ 새 초안</option>
          </select>
        </label>
        {basisKind === "changeset" && (
          <label>
            <span className="mb-1 block text-[12px] font-semibold text-gray-700">계획 변경</span>
            <select className={inputCls} value={csId} onChange={(e) => setCsId(e.target.value)}>
              {[...w.changeSets].reverse().map((c) => <option key={c.id} value={c.id}>{formatDate(c.createdAt)} · {c.label}</option>)}
            </select>
          </label>
        )}
        {basisKind === "versions" && (
          <>
            <label>
              <span className="mb-1 block text-[12px] font-semibold text-gray-700">이전</span>
              <select className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)}>
                {w.snapshots.map((s) => <option key={s.id} value={s.id}>v{s.version} · {s.label}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[12px] font-semibold text-gray-700">이후</span>
              <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="current">현재 작업본</option>
                {w.snapshots.map((s) => <option key={s.id} value={s.id}>v{s.version} · {s.label}</option>)}
              </select>
            </label>
          </>
        )}
      </div>
      <p className="mb-2 text-[12px] text-gray-600">비교 기준: <b>{BASIS_LABEL[basisKind]}</b> · 추가·삭제·수정은 색과 [배지]로 함께 표시합니다.</p>
      {basisKind === "similar" && <Notice tone="blue" className="mb-2">유사사업 규정은 이번 사업의 현행 규정이 아닙니다. 참고 비교용입니다.</Notice>}
      <CompareTable rows={rows} beforeLabel={basisKind === "similar" ? "유사사업 참고 규정" : "변경 전"} afterLabel={basisKind === "similar" ? "새 초안" : basisKind === "versions" ? "변경 후" : "변경 제안"} />
    </Card>
  );
}
