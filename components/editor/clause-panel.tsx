"use client";

import { useEffect, useState } from "react";
import { applySuggestion, decideSuggestion } from "@/lib/change";
import { templateRewrite } from "@/lib/draft";
import { DOC_KIND_LABEL, REVIEW_LABEL, SUGGESTION_STATUS_LABEL } from "@/lib/labels";
import { addNote, addRewriteSuggestion, deleteClause, editClause, moveClause, moveClauseToSection, setReviewStatus, toggleConditionLink } from "@/lib/ops";
import { renderConditionInWs, sectionHeading } from "@/lib/render";
import { conditionTitle } from "@/lib/structure";
import type { Clause, ReviewStatus, Suggestion } from "@/lib/types";
import { formatDate, uid } from "@/lib/util";
import { Badge, Button, cx, DiffView, inputCls, MarkedText, Notice } from "../ui";
import { useWorkspace } from "../workspace-context";

const STATUSES: ReviewStatus[] = ["pending", "needs_fix", "approved"];

export function ClausePanel({ clause, number, onDirty, onSelect }: { clause: Clause; number?: number; onDirty: (d: boolean) => void; onSelect: (id: string) => void }) {
  const { ws, update, kind, ai, flush, notify } = useWorkspace();
  const w = ws!;
  const [title, setTitle] = useState(clause.title);
  const [body, setBody] = useState(clause.body);
  const [memo, setMemo] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<{ message: string; details?: string[]; code?: string } | null>(null);
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState(false);
  const dirty = title !== clause.title || body !== clause.body;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  // 외부(제안 반영 등)에서 조항이 바뀌면 편집 중이 아닐 때만 동기화
  useEffect(() => {
    if (!dirty) {
      setTitle(clause.title);
      setBody(clause.body);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clause.title, clause.body]);

  const section = w.sections.find((s) => s.id === clause.sectionId);
  const sameDocSections = w.sections.filter((s) => s.docKind === clause.docKind).sort((a, b) => a.order - b.order);
  const suggestions = w.suggestions.filter((s) => s.clauseId === clause.id && (s.status === "pending" || s.status === "held"));
  const history = w.suggestions.filter((s) => s.clauseId === clause.id && (s.status === "applied" || s.status === "rejected"));
  const aiAllowed = kind === "main" && !w.isDemo && ai?.configured;
  const markCount = (body.match(/【[^】]*】/g) ?? []).length;

  function save() {
    update((x) => editClause(x, clause.id, { title, body }), clause.reviewStatus === "approved" ? "저장했습니다. 검토 완료 조항이 수정되어 ‘재검토 필요’로 바뀌었습니다." : "조항을 저장했습니다.");
  }

  function templateSuggest() {
    update((x) => {
      const c = x.clauses.find((y) => y.id === clause.id)!;
      const r = templateRewrite(x, c);
      if (!r) throw new Error("템플릿이 없는 조항입니다(담당자가 추가한 조항). 직접 작성하거나 실제 AI 모드에서 제안을 받으세요.");
      if (r.body === c.body && r.title === c.title) throw new Error("현재 조건 기준 템플릿 결과가 지금 본문과 같습니다.");
      addRewriteSuggestion(x, c.id, { title: r.title, body: r.body, origin: "template", reason: "현재 사업 조건 값으로 템플릿 재작성(AI 분석 아님)", sources: r.sources });
    }, "템플릿 재작성 제안을 만들었습니다. 적용 여부를 선택하세요.");
  }

  async function aiSuggest() {
    setAiBusy(true);
    setAiError(null);
    const saved = await flush();
    if (!saved) {
      setAiBusy(false);
      setAiError({ message: "작업 내용을 먼저 저장하지 못해 AI 요청을 보내지 않았습니다." });
      return;
    }
    try {
      const r = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, clauseId: clause.id, instruction }),
      });
      const j = await r.json();
      if (!j.ok) {
        setAiError({ message: j.error, details: j.details, code: j.code });
        return;
      }
      const res = j.result;
      if (res.kind === "insufficient") {
        update((x) => {
          for (const t of res.checkItems as string[]) x.aiIssues.push({ id: uid("ai"), clauseId: clause.id, text: `[자료 부족] ${t}`, createdAt: new Date().toISOString(), resolved: false });
        });
        notify("AI가 근거 자료 부족으로 수정안을 만들지 않았습니다. 확인 필요 항목을 검토 목록에 추가했습니다.", "info");
        return;
      }
      update((x) => {
        addRewriteSuggestion(x, clause.id, {
          title: res.title,
          body: res.body,
          origin: "ai",
          reason: `AI 작성 제안(${j.model})${res.rationale ? ` — ${res.rationale}` : ""}`,
          sources: res.sources,
          warnings: res.excludedDocs?.length ? [`외부 전송 금지로 제외된 자료: ${res.excludedDocs.join(", ")}`] : [],
        });
        for (const t of res.checkItems as string[]) x.aiIssues.push({ id: uid("ai"), clauseId: clause.id, text: t, createdAt: new Date().toISOString(), resolved: false });
      }, "AI 작성 제안을 받았습니다(출처·인용 검증 통과). 적용 여부를 선택하세요.");
    } catch {
      setAiError({ message: "AI 요청 중 네트워크 오류가 발생했습니다." });
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[12px] text-gray-500">
            {DOC_KIND_LABEL[clause.docKind]} · {section ? sectionHeading(clause.docKind, section.order, section.title) : ""}
          </div>
          <h1 className="text-lg font-bold text-navy">제{number ?? "?"}조({clause.title || "제목 없음"})</h1>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge tone={clause.origin === "ai" ? "purple" : clause.origin === "user" ? "gray" : "blue"}>
              {clause.origin === "template" ? (w.isDemo ? "템플릿 작성(데모)" : "템플릿 작성") : clause.origin === "ai" ? "AI 제안 반영" : "담당자 작성"}
            </Badge>
            {clause.userEdited && clause.origin !== "user" && <Badge>담당자 수정</Badge>}
            <span className="text-[11px] text-gray-400">ID {clause.id} · 수정 {formatDate(clause.updatedAt)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex overflow-hidden rounded-md border border-gray-300" role="radiogroup" aria-label="검토 상태">
            {STATUSES.map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={clause.reviewStatus === s}
                disabled={dirty && s === "approved"}
                title={dirty && s === "approved" ? "저장 후 검토 완료 처리할 수 있습니다" : undefined}
                onClick={() => update((x) => setReviewStatus(x, clause.id, s), `검토 상태: ${REVIEW_LABEL[s]}`)}
                className={cx(
                  "px-2.5 py-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-40",
                  clause.reviewStatus === s ? (s === "approved" ? "bg-emerald-600 text-white" : s === "needs_fix" ? "bg-red-600 text-white" : "bg-gray-700 text-white") : "bg-white text-gray-700 hover:bg-gray-50",
                )}
              >
                {REVIEW_LABEL[s]}
              </button>
            ))}
          </div>
          {clause.reviewStatus === "needs_rereview" && <Badge tone="amber">재검토 필요 — 다시 확인 후 ‘검토 완료’를 누르세요</Badge>}
        </div>
      </div>

      {/* 편집 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <label className="mb-1 block text-[12px] font-semibold text-gray-600">조 제목</label>
        <input className={cx(inputCls, "mb-3 font-semibold")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[12px] font-semibold text-gray-600">본문</label>
          <div className="flex items-center gap-2 text-[11px]">
            {markCount > 0 && <span className="mark-check">확인 필요·미확정 표시 {markCount}곳</span>}
            <button className="text-brand" onClick={() => setPreview((v) => !v)}>{preview ? "편집으로" : "표시 강조 보기"}</button>
          </div>
        </div>
        {preview ? (
          <div className="min-h-48 rounded-md border border-gray-200 bg-gray-50 p-3 text-[14px]"><MarkedText text={body} /></div>
        ) : (
          <textarea className={cx(inputCls, "min-h-56 text-[14px] leading-[1.85]")} value={body} onChange={(e) => setBody(e.target.value)} rows={Math.max(8, body.split("\n").length + 2)} />
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={!dirty} onClick={save}>저장</Button>
          <Button variant="ghost" disabled={!dirty} onClick={() => { setTitle(clause.title); setBody(clause.body); }}>되돌리기</Button>
          {dirty && <span className="text-[12px] font-semibold text-amber-700">저장하지 않은 수정 내용이 있습니다</span>}
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => update((x) => moveClause(x, clause.id, -1))}>↑ 위로</Button>
          <Button size="sm" variant="ghost" onClick={() => update((x) => moveClause(x, clause.id, 1))}>↓ 아래로</Button>
          <select className="rounded-md border border-gray-300 px-2 py-1 text-[12px]" value="" aria-label="다른 장·편으로 이동" onChange={(e) => e.target.value && update((x) => moveClauseToSection(x, clause.id, e.target.value), "조항을 옮겼습니다.")}>
            <option value="">다른 {clause.docKind === "rule" ? "장" : "편"}으로 이동…</option>
            {sameDocSections.filter((s) => s.id !== clause.sectionId).map((s) => <option key={s.id} value={s.id}>{sectionHeading(clause.docKind, s.order, s.title)}</option>)}
          </select>
          <Button size="sm" variant="danger" onClick={() => {
            if (!confirm(`제${number}조(${clause.title})를 삭제할까요? 이후 조문 번호가 당겨집니다.`)) return;
            const next = w.clauses.find((c) => c.docKind === clause.docKind && c.id !== clause.id);
            update((x) => deleteClause(x, clause.id), "조항을 삭제했습니다.");
            if (next) onSelect(next.id);
          }}>삭제</Button>
        </div>
      </div>

      {/* 다시 작성 제안 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-navy">이 조항만 다시 작성 제안</h2>
          <span className="text-[11px] text-gray-500">제안은 바로 적용되지 않으며, 현재 본문(담당자 수정본)은 선택 전까지 그대로 유지됩니다.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="subtle" disabled={!clause.templateKey} onClick={templateSuggest} title={clause.templateKey ? "" : "템플릿이 없는 조항"}>템플릿 재작성 제안</Button>
          <Button variant="subtle" disabled={!aiAllowed} busy={aiBusy} onClick={aiSuggest}>AI 작성 제안</Button>
          {!aiAllowed && (
            <span className="text-[11px] text-gray-500">
              {kind === "sample" || w.isDemo ? "샘플(데모)에서는 AI를 호출하지 않습니다." : ai?.reason ?? "AI가 설정되지 않았습니다."}
            </span>
          )}
        </div>
        {aiAllowed && <input className={cx(inputCls, "mt-2 text-[13px]")} placeholder="(선택) AI에 전달할 요청 — 예: 위원회 구성 기준을 보완" value={instruction} onChange={(e) => setInstruction(e.target.value)} />}
        {aiBusy && <p className="mt-2 text-[12px] text-gray-500">관련 원문 조각을 찾아 AI에 보내고 응답을 검증하는 중입니다…</p>}
        {aiError && (
          <Notice tone="red" className="mt-2">
            <b>AI 제안 실패{aiError.code ? ` (${aiError.code})` : ""}:</b> {aiError.message}
            {aiError.details?.length ? <ul className="mt-1 list-disc pl-5">{aiError.details.map((d, i) => <li key={i}>{d}</li>)}</ul> : null}
            <div className="mt-1 text-[12px]">실패한 요청은 데모 결과로 대체하지 않습니다. 본문은 바뀌지 않았습니다.</div>
          </Notice>
        )}
      </div>

      {suggestions.map((s) => <SuggestionCard key={s.id} s={s} clause={clause} />)}

      {/* 연결 조건 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-[14px] font-semibold text-navy">연결된 운영계획 조건</h2>
        <p className="mb-2 text-[12px] text-gray-500">계획 변경 시 이 연결이 있는 조항만 수정 제안 대상이 됩니다(같은 숫자가 있어도 연결이 없으면 바꾸지 않음).</p>
        <div className="flex flex-wrap gap-1.5">
          {clause.conditionIds.length === 0 && <span className="text-[12px] text-gray-500">연결된 조건 없음</span>}
          {clause.conditionIds.map((id) => {
            const c = w.conditions.find((x) => x.id === id);
            if (!c) return null;
            const ok = c.status === "confirmed" && c.value.trim();
            return (
              <span key={id} className={cx("inline-flex items-center gap-1 rounded border px-2 py-1 text-[12px]", ok ? "border-brand-100 bg-brand-50" : "border-amber-200 bg-amber-50")}>
                <b>{conditionTitle(w, c)}</b>: {renderConditionInWs(w, c)}
                <button className="ml-1 text-gray-400 hover:text-red-600" aria-label="연결 해제" onClick={() => update((x) => toggleConditionLink(x, clause.id, id))}>×</button>
              </span>
            );
          })}
        </div>
        <select className="mt-2 rounded-md border border-gray-300 px-2 py-1 text-[12px]" value="" aria-label="조건 연결 추가" onChange={(e) => e.target.value && update((x) => toggleConditionLink(x, clause.id, e.target.value), "조건을 연결했습니다.")}>
          <option value="">+ 조건 연결…</option>
          {w.conditions.filter((c) => !clause.conditionIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{conditionTitle(w, c)}</option>)}
        </select>
      </div>

      {/* 메모 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-[14px] font-semibold text-navy">검토 메모</h2>
        <ul className="mb-2 space-y-1.5">
          {clause.notes.length === 0 && <li className="text-[12px] text-gray-500">메모가 없습니다.</li>}
          {clause.notes.map((n) => (
            <li key={n.id} className={cx("rounded px-2 py-1.5 text-[13px]", n.kind === "system" ? "bg-gray-50 text-gray-600" : "bg-brand-50 text-navy")}>
              <span className="mr-2 text-[11px] text-gray-500">{formatDate(n.createdAt)} {n.kind === "system" ? "· 시스템" : "· 담당자"}</span>
              {n.text}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input className={inputCls} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="검토 의견을 남기세요" onKeyDown={(e) => { if (e.key === "Enter" && memo.trim()) { update((x) => addNote(x, clause.id, memo)); setMemo(""); } }} />
          <Button disabled={!memo.trim()} onClick={() => { update((x) => addNote(x, clause.id, memo)); setMemo(""); }}>메모 추가</Button>
        </div>
      </div>

      {history.length > 0 && (
        <details className="rounded-lg border border-gray-200 bg-white p-4 text-[13px]">
          <summary className="cursor-pointer font-semibold text-navy">제안 처리 이력 {history.length}건</summary>
          <ul className="mt-2 space-y-1">
            {history.map((s) => <li key={s.id} className="text-gray-600">{formatDate(s.decidedAt)} · {SUGGESTION_STATUS_LABEL[s.status]} · {s.reason}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function SuggestionCard({ s, clause }: { s: Suggestion; clause: Clause }) {
  const { update, notify } = useWorkspace();
  const stale = s.before !== clause.body || s.beforeTitle !== clause.title;
  return (
    <div className={cx("rounded-lg border-2 bg-white p-4", s.status === "held" ? "border-gray-300" : "border-brand-100")}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone={s.origin === "ai" ? "purple" : "blue"}>{s.kind === "plan_change" ? "계획 변경 수정안" : s.origin === "ai" ? "AI 작성 제안" : "템플릿 재작성 제안"}</Badge>
        <Badge tone="blue">[수정]</Badge>
        {s.status === "held" && <Badge>보류 중</Badge>}
        <span className="text-[12px] text-gray-600">{s.reason}</span>
      </div>
      {s.warnings.map((x, i) => <Notice key={i} className="mb-2">{x}</Notice>)}
      {stale && <Notice tone="red" className="mb-2">제안 생성 이후 조항이 수정되었습니다. 담당자 수정본을 보존하기 위해 이 제안은 적용할 수 없습니다.</Notice>}
      {s.afterTitle !== s.beforeTitle && <div className="mb-2 text-[12px]">제목: <del className="text-red-700">{s.beforeTitle}</del> → <b className="text-emerald-800">{s.afterTitle}</b></div>}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-gray-200 bg-gray-50 p-2">
          <div className="mb-1 text-[11px] font-semibold text-gray-500">현재 본문</div>
          <DiffView before={s.before} after={s.after} side="before" />
        </div>
        <div className="rounded border border-emerald-200 bg-emerald-50/40 p-2">
          <div className="mb-1 text-[11px] font-semibold text-emerald-700">제안</div>
          {s.manualOnly ? <p className="text-[13px] text-amber-800">자동 수정안 없음 — 담당자가 직접 수정해야 합니다.</p> : <DiffView before={s.before} after={s.after} side="after" />}
        </div>
      </div>
      {s.newSources && s.newSources.length > 0 && <div className="mt-2 text-[12px] text-gray-600">적용 시 근거 {s.newSources.filter((x) => x.chunkId).length}건으로 교체됩니다.</div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={stale || s.manualOnly} onClick={() => {
          const r = update((x) => applySuggestion(x, s.id));
          if (r && !r.ok) notify(r.reason, "error");
          else if (r?.ok) notify("제안을 반영했습니다.", "ok");
        }}>반영</Button>
        {s.status !== "held" && <Button size="sm" onClick={() => update((x) => decideSuggestion(x, s.id, "held"), "보류했습니다.")}>보류</Button>}
        <Button size="sm" variant="ghost" onClick={() => update((x) => decideSuggestion(x, s.id, "rejected"), "반영하지 않기로 했습니다.")}>반영 안 함</Button>
      </div>
    </div>
  );
}
