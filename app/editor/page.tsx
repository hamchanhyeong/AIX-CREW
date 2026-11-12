"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { NeedWorkspace } from "@/components/app-shell";
import { Badge, Button, cx, Empty, Notice, PageHeader, ReviewBadge } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { ClausePanel } from "@/components/editor/clause-panel";
import { EvidencePanel } from "@/components/editor/evidence-panel";
import { computeIssues } from "@/lib/checks";
import { generateDraft } from "@/lib/draft";
import { DOC_KIND_LABEL, STRATEGY_LABEL } from "@/lib/labels";
import { addClause, addSection, createSnapshot, deleteSection, moveSection, renameSection } from "@/lib/ops";
import { articleNumbers, orderedClauses, sectionHeading } from "@/lib/render";
import type { DocKind } from "@/lib/types";

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-gray-500">편집기를 여는 중…</div>}>
      <NeedWorkspace>
        <Editor />
      </NeedWorkspace>
    </Suspense>
  );
}

function Editor() {
  const { ws, update } = useWorkspace();
  const sp = useSearchParams();
  const router = useRouter();
  const w = ws!;
  const docKind: DocKind = sp.get("doc") === "manual" ? "manual" : "rule";
  const clauseParam = sp.get("clause");
  const [dirty, setDirty] = useState(false);
  const [mobileTab, setMobileTab] = useState<"edit" | "evidence">("edit");
  const [showEvidence, setShowEvidence] = useState(true);

  const clauses = useMemo(() => orderedClauses(w, docKind), [w, docKind]);
  const selected = w.clauses.find((c) => c.id === clauseParam) ?? clauses[0];
  // 다른 문서의 조항을 선택한 경우 문서 전환
  const effectiveDoc: DocKind = selected?.docKind ?? docKind;

  useEffect(() => {
    if (selected && selected.docKind !== docKind) router.replace(`/editor?doc=${selected.docKind}&clause=${selected.id}`);
  }, [selected, docKind, router]);

  const go = (doc: DocKind, clauseId?: string) => {
    if (dirty && !confirm("저장하지 않은 수정 내용이 있습니다. 이동하면 버려집니다. 계속할까요?")) return;
    setDirty(false);
    router.push(`/editor?doc=${doc}${clauseId ? `&clause=${clauseId}` : ""}`);
  };

  if (!w.clauses.length) return <GeneratePanel />;

  const issues = computeIssues(w);
  const nums = articleNumbers(w, effectiveDoc);
  const sections = w.sections.filter((s) => s.docKind === effectiveDoc).sort((a, b) => a.order - b.order);

  return (
    <div className="-mx-5 -my-5 flex h-[calc(100vh-var(--hdr,57px))] min-h-[600px]">
      {/* 목차 */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex gap-1 border-b border-gray-200 p-2" role="tablist" aria-label="문서 전환">
          {(["rule", "manual"] as DocKind[]).map((d) => (
            <button key={d} role="tab" aria-selected={effectiveDoc === d} onClick={() => go(d)} className={cx("flex-1 rounded-md px-2 py-1.5 text-[13px]", effectiveDoc === d ? "bg-navy font-semibold text-white" : "text-gray-600 hover:bg-gray-100")}>
              {DOC_KIND_LABEL[d]}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {sections.map((s, si) => {
            const prog = s.programId ? w.programs.find((p) => p.id === s.programId) : undefined;
            const inSec = clauses.filter((c) => c.sectionId === s.id);
            return (
              <div key={s.id} className="mb-3">
                <div className="group flex items-center gap-1 px-1">
                  <span className="flex-1 text-[12px] font-bold text-navy">{sectionHeading(effectiveDoc, s.order, s.title)}</span>
                  <span className="hidden gap-0.5 group-hover:flex">
                    <button className="px-1 text-[11px] text-gray-500 hover:text-navy" title="이름 바꾸기" onClick={() => { const t = prompt("장·편 이름", s.title); if (t) update((x) => renameSection(x, s.id, t)); }}>✎</button>
                    <button className="px-1 text-[11px] text-gray-500 hover:text-navy disabled:opacity-30" disabled={si === 0} title="위로" onClick={() => update((x) => moveSection(x, s.id, -1))}>↑</button>
                    <button className="px-1 text-[11px] text-gray-500 hover:text-navy disabled:opacity-30" disabled={si === sections.length - 1} title="아래로" onClick={() => update((x) => moveSection(x, s.id, 1))}>↓</button>
                    {inSec.length === 0 && <button className="px-1 text-[11px] text-red-500" title="빈 장·편 삭제" onClick={() => confirm("이 장·편을 삭제할까요?") && update((x) => deleteSection(x, s.id))}>×</button>}
                  </span>
                </div>
                {prog && <div className="px-1 text-[11px] text-brand">{STRATEGY_LABEL[prog.strategy]}</div>}
                {s.planNote && <div className="px-1 text-[10.5px] leading-snug text-gray-400" title="기획안에 적힌 참고 근거 — 원문 미등록·미검증">{s.planNote}</div>}
                <ul className="mt-1">
                  {inSec.map((c) => {
                    const n = issues.filter((i) => i.clauseId === c.id && i.kind !== "unreviewed").length;
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => go(effectiveDoc, c.id)}
                          className={cx("flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[13px]", selected?.id === c.id ? "bg-brand-50 font-semibold text-navy ring-1 ring-brand-100" : "text-gray-700 hover:bg-gray-50")}
                        >
                          <span className={cx("h-2 w-2 shrink-0 rounded-full", { approved: "bg-emerald-500", needs_fix: "bg-red-500", needs_rereview: "bg-amber-500", pending: "bg-gray-300" }[c.reviewStatus])} aria-hidden />
                          <span className="truncate">제{nums.get(c.id)}조({c.title})</span>
                          {n > 0 && <span className="ml-auto rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800" title="검토 항목">{n}</span>}
                        </button>
                      </li>
                    );
                  })}
                  <li>
                    <button className="w-full rounded px-2 py-1 text-left text-[12px] text-brand hover:bg-brand-50" onClick={() => {
                      const id = update((x) => addClause(x, effectiveDoc, s.id).id, "조항을 추가했습니다.");
                      if (id) go(effectiveDoc, id);
                    }}>+ 조항 추가</button>
                  </li>
                </ul>
              </div>
            );
          })}
          <button className="w-full rounded border border-dashed border-gray-300 px-2 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50" onClick={() => { const t = prompt(`새 ${effectiveDoc === "rule" ? "장" : "편"} 이름`); if (t) update((x) => addSection(x, effectiveDoc, t)); }}>
            + {effectiveDoc === "rule" ? "장" : "편"} 추가
          </button>
        </div>
        <div className="border-t border-gray-200 px-3 py-2 text-[11px] text-gray-500">
          조문 번호는 순서로 자동 계산되며, 조항 ID는 순서가 바뀌어도 유지됩니다. 목차는 기획안 기준 초기 구성입니다.
        </div>
      </aside>

      {/* 중앙 + 근거 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-1.5 xl:hidden">
          <button className={cx("rounded px-2 py-1 text-[13px]", mobileTab === "edit" ? "bg-navy text-white" : "text-gray-700")} onClick={() => setMobileTab("edit")}>조항 편집</button>
          <button className={cx("rounded px-2 py-1 text-[13px]", mobileTab === "evidence" ? "bg-navy text-white" : "text-gray-700")} onClick={() => setMobileTab("evidence")}>근거·검토사항</button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className={cx("min-w-0 flex-1 overflow-y-auto px-5 py-4", mobileTab !== "edit" && "hidden xl:block")}>
            {selected ? (
              <ClausePanel key={selected.id} clause={selected} number={nums.get(selected.id)} onDirty={setDirty} onSelect={(id) => go(effectiveDoc, id)} />
            ) : (
              <Empty title="조항이 없습니다">왼쪽 목차에서 ‘+ 조항 추가’를 누르세요.</Empty>
            )}
          </div>
          {selected && (
            <aside className={cx("w-full shrink-0 overflow-y-auto border-l border-gray-200 bg-white xl:w-[380px]", mobileTab !== "evidence" && "hidden xl:block", !showEvidence && "xl:hidden")}>
              <EvidencePanel key={selected.id} clause={selected} issues={issues.filter((i) => i.clauseId === selected.id)} />
            </aside>
          )}
          <button
            className="hidden w-5 shrink-0 border-l border-gray-200 bg-gray-50 text-[11px] text-gray-500 hover:bg-gray-100 xl:block"
            title={showEvidence ? "근거 패널 접기" : "근거 패널 펼치기"}
            onClick={() => setShowEvidence((v) => !v)}
          >
            {showEvidence ? "›" : "‹"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GeneratePanel() {
  const { ws, update, kind } = useWorkspace();
  const router = useRouter();
  const w = ws!;
  const reviewed = !!w.project.conditionsReviewedAt;
  const unconfirmed = w.conditions.filter((c) => c.status !== "confirmed" || !c.value.trim()).length;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="규정 편집기" desc="운영규칙 1부(8개 장)와 운영요령 1부(공통편 + 사업별 3개 편)의 초안을 만들고 조항별로 검수합니다." />
      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-navy">초안 작성</h2>
        {!reviewed ? (
          <Notice>
            초안 작성 전에 <Link href="/conditions" className="font-semibold underline">사업 조건 확인</Link>을 먼저 완료하세요. 추출된 조건은 담당자가 확인해야 초안에 쓸 수 있습니다.
          </Notice>
        ) : (
          <Notice tone="blue">조건 확인 완료 · 미확정·빈 조건 {unconfirmed}개는 임의로 채우지 않고 【미확정】·【확인 필요】로 표시합니다.</Notice>
        )}
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-gray-700">
          <li>{kind === "sample" || w.isDemo ? "데모 모드: " : ""}조문 템플릿과 확인된 사업 조건으로 작성합니다. <b>AI 분석 결과가 아닙니다.</b></li>
          <li>등록된 원문에서 키워드로 찾은 조각만 근거로 연결하고, 원문이 없으면 ‘원문 미등록’·‘근거 확인 필요’로 남깁니다.</li>
          <li>법령 조문 번호는 원문 없이 만들지 않습니다. 실제 AI 작성 제안은 실제 작업공간에서 조항별로 요청할 수 있습니다.</li>
        </ul>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            disabled={!reviewed}
            onClick={() => {
              const ok = update((x) => {
                generateDraft(x);
                createSnapshot(x, "초안 작성(템플릿)");
                return true;
              }, "운영규칙·운영요령 초안을 작성했습니다(v1 저장).");
              if (ok) router.push("/editor?doc=rule");
            }}
          >
            운영규칙·요령 초안 작성
          </Button>
          {!reviewed && <span className="text-[12px] text-gray-500">조건 확인 완료 후 사용할 수 있습니다.</span>}
        </div>
        <div className="flex flex-wrap gap-2 pt-1 text-[12px]">
          {w.programs.map((p) => <Badge key={p.id} tone="blue">{p.name} · {STRATEGY_LABEL[p.strategy]}</Badge>)}
        </div>
      </div>
      <div className="mt-3 flex gap-2 text-[12px] text-gray-500"><ReviewBadge status="pending" /> 생성된 조항은 모두 ‘검토 대기’로 시작합니다.</div>
    </div>
  );
}
