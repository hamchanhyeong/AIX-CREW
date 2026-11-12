"use client";

import Link from "next/link";
import { useState } from "react";
import { ISSUE_LABEL, type Issue } from "@/lib/checks";
import { roleForType, ROLE_LABEL, SOURCE_TYPE_LABEL } from "@/lib/labels";
import { addSourceLink, removeSourceLink } from "@/lib/ops";
import { searchChunks } from "@/lib/retrieval";
import type { Clause, ClauseSource, SourceRole } from "@/lib/types";
import { Badge, Button, cx, inputCls, RoleBadge, TextStatusBadge } from "../ui";
import { useWorkspace } from "../workspace-context";

const ROLE_ORDER: SourceRole[] = ["legal_candidate", "plan_reflect", "similar_ref", "needs_check"];
const ROLE_HELP: Record<SourceRole, string> = {
  legal_candidate: "법령·지침 원문 중 키워드로 찾은 후보입니다. 실제 적용 여부는 담당자가 확인합니다.",
  similar_ref: "유사사업 규정 — 참고용이며 이번 사업의 의무 기준이 아닙니다.",
  plan_reflect: "운영계획(안) 조건이 이 조항에 반영되었습니다.",
  needs_check: "연결 가능한 근거 원문이 없는 작성 제안 문구입니다.",
};

export function EvidencePanel({ clause, issues }: { clause: Clause; issues: Issue[] }) {
  const { ws, update } = useWorkspace();
  const w = ws!;
  const [adding, setAdding] = useState(false);
  const aiIssues = w.aiIssues.filter((a) => a.clauseId === clause.id && !a.resolved);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-navy">근거</h2>
        <Button size="sm" variant="subtle" onClick={() => setAdding((v) => !v)}>{adding ? "닫기" : "+ 근거 연결"}</Button>
      </div>
      {adding && <AddSource clause={clause} onDone={() => setAdding(false)} />}

      {ROLE_ORDER.map((role) => {
        const list = clause.sources.filter((s) => s.role === role);
        if (!list.length) return null;
        return (
          <div key={role}>
            <div className="mb-1 flex items-center gap-2">
              <RoleBadge role={role} />
              <span className="text-[11px] text-gray-500">{list.length}건</span>
            </div>
            <p className="mb-1.5 text-[11px] leading-snug text-gray-500">{ROLE_HELP[role]}</p>
            <ul className="space-y-2">
              {list.map((s) => <SourceItem key={s.id} s={s} onRemove={() => update((x) => removeSourceLink(x, clause.id, s.id), "근거 연결을 해제했습니다.")} />)}
            </ul>
          </div>
        );
      })}

      <div className="border-t border-gray-200 pt-3">
        <h2 className="mb-2 text-[15px] font-bold text-navy">검토사항</h2>
        <div className="mb-1 text-[11px] font-semibold text-gray-500">프로그램 점검 {issues.length}건</div>
        <ul className="space-y-1.5">
          {issues.length === 0 && <li className="text-[12px] text-gray-500">점검에서 발견된 문제가 없습니다.</li>}
          {issues.map((i) => (
            <li key={i.id} className={cx("rounded border px-2 py-1.5 text-[12px]", i.severity === "high" ? "border-red-200 bg-red-50" : i.severity === "medium" ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50")}>
              <b>{ISSUE_LABEL[i.kind]}</b> · {i.message}
            </li>
          ))}
        </ul>
        <div className="mb-1 mt-3 text-[11px] font-semibold text-gray-500">AI 제안 검토사항 {aiIssues.length}건</div>
        <ul className="space-y-1.5">
          {aiIssues.length === 0 && <li className="text-[12px] text-gray-500">없음{w.isDemo ? " (데모 모드는 AI를 사용하지 않습니다)" : ""}</li>}
          {aiIssues.map((a) => (
            <li key={a.id} className="flex items-start gap-2 rounded border border-violet-200 bg-violet-50 px-2 py-1.5 text-[12px]">
              <span className="flex-1">{a.text}</span>
              <button className="text-[11px] text-violet-700" onClick={() => update((x) => { const t = x.aiIssues.find((y) => y.id === a.id); if (t) t.resolved = true; })}>확인함</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SourceItem({ s, onRemove }: { s: ClauseSource; onRemove: () => void }) {
  const { ws } = useWorkspace();
  const [open, setOpen] = useState(false);
  const doc = s.docId ? ws!.docs.find((d) => d.id === s.docId) : undefined;
  const chunk = s.chunkId ? ws!.chunks.find((c) => c.id === s.chunkId) : undefined;
  return (
    <li className="rounded-md border border-gray-200 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {doc ? (
            <div className="text-[13px] font-semibold text-navy">{doc.title}</div>
          ) : s.docId ? (
            <div className="text-[13px] font-semibold text-red-700">삭제된 자료</div>
          ) : (
            <div className="text-[13px] font-semibold text-amber-800">근거 확인 필요</div>
          )}
          {doc && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
              <span>{SOURCE_TYPE_LABEL[doc.type]}</span>·<span>{doc.version || "버전 미기재"}</span>·<span>원문 v{doc.textVersion}</span>
              <TextStatusBadge status={doc.textStatus} />
            </div>
          )}
        </div>
        {s.role !== "needs_check" && <button className="text-[11px] text-gray-400 hover:text-red-600" onClick={onRemove}>해제</button>}
      </div>
      {chunk ? (
        <>
          <div className="mt-1.5 text-[11px] font-semibold text-gray-600">위치: {chunk.locator}</div>
          {s.quote && <blockquote className="mt-1 border-l-2 border-brand pl-2 text-[12.5px] leading-relaxed text-gray-800">{s.quote}</blockquote>}
          <button className="mt-1 text-[11px] text-brand" onClick={() => setOpen((v) => !v)}>{open ? "원문 닫기" : "원문 보기"}</button>
          {open && <div className="mt-1 rounded bg-gray-50 p-2 text-[12.5px] leading-relaxed">{chunk.text}</div>}
        </>
      ) : s.chunkId ? (
        <p className="mt-1 text-[12px] text-red-700">연결된 원문 조각이 없습니다(원문이 다시 등록됨). 근거를 다시 연결하세요.</p>
      ) : (
        <p className="mt-1 text-[12px] text-amber-800">{s.note ?? "원문이 등록되지 않았습니다."}{doc && doc.textStatus !== "registered" && <> <Link href="/sources" className="underline">원문 등록</Link></>}</p>
      )}
      {s.note && chunk && <p className="mt-1 text-[11px] text-gray-500">{s.note}</p>}
      <div className="mt-1 text-[10.5px] text-gray-400">{s.addedBy === "template" ? "템플릿 연결" : s.addedBy === "ai" ? "AI 인용(검증됨)" : "담당자 연결"}</div>
    </li>
  );
}

function AddSource({ clause, onDone }: { clause: Clause; onDone: () => void }) {
  const { ws, update } = useWorkspace();
  const w = ws!;
  const linkable = w.docs.filter((d) => roleForType(d.type) && d.textStatus === "registered");
  const [docId, setDocId] = useState(linkable[0]?.id ?? "");
  const [q, setQ] = useState(clause.title);
  const doc = w.docs.find((d) => d.id === docId);
  const hits = docId ? (q.trim() ? searchChunks(w, q, { docIds: [docId], limit: 12 }).map((h) => h.chunk) : w.chunks.filter((c) => c.docId === docId).slice(0, 30)) : [];

  return (
    <div className="space-y-2 rounded-md border border-brand-100 bg-brand-50/40 p-2.5">
      <select className={inputCls} value={docId} onChange={(e) => setDocId(e.target.value)}>
        {linkable.length === 0 && <option value="">원문이 등록된 자료가 없습니다</option>}
        {linkable.map((d) => <option key={d.id} value={d.id}>[{SOURCE_TYPE_LABEL[d.type]}] {d.title}</option>)}
      </select>
      <p className="text-[11px] text-gray-500">배경자료와 원문 미등록 자료는 근거로 연결할 수 없습니다.{doc && ` 역할: ${ROLE_LABEL[roleForType(doc.type)!]}`}</p>
      <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="원문 검색" />
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {hits.map((c) => (
          <li key={c.id}>
            <button className="w-full rounded border border-gray-200 bg-white p-1.5 text-left text-[12px] hover:border-brand" onClick={() => { update((x) => addSourceLink(x, clause.id, c.id), "근거를 연결했습니다."); onDone(); }}>
              <span className="mr-1 font-semibold text-gray-500">{c.locator}</span>{c.text}
            </button>
          </li>
        ))}
        {docId && hits.length === 0 && <li className="text-[12px] text-gray-500">검색 결과가 없습니다.</li>}
      </ul>
      <Badge tone="gray">선택한 원문 조각 전체가 인용으로 저장됩니다</Badge>
    </div>
  );
}
