"use client";

import Link from "next/link";
import { useState } from "react";
import { NeedWorkspace } from "@/components/app-shell";
import { SourceInput, type SourceInputResult } from "@/components/source-input";
import { Badge, Button, Card, cx, Empty, Field, inputCls, Notice, PageHeader, TextStatusBadge } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { addDoc } from "@/lib/demo";
import { APPLICABILITY_LABEL, SOURCE_TYPE_LABEL } from "@/lib/labels";
import { applyExtraction, deleteDoc, setDocText, updateChunkText, updateDocMeta } from "@/lib/ops";
import type { Applicability, SourceDoc, SourceType } from "@/lib/types";
import { formatDate } from "@/lib/util";

const TYPES: SourceType[] = ["plan", "law", "guideline", "similar", "background"];
const TYPE_HELP: Record<SourceType, string> = {
  plan: "사업 조건 추출 대상. ‘운영계획 반영’ 근거로 연결됩니다.",
  law: "‘적용 근거 후보’로 연결됩니다. 원문이 있어야 조문 근거로 확인할 수 있습니다.",
  guideline: "‘적용 근거 후보’로 연결됩니다(통합관리지침, 세부관리기준 등).",
  similar: "‘유사사업 참고’로만 연결됩니다. 이번 사업의 의무 기준·현행 규정이 아닙니다.",
  background: "보도자료 등 배경 이해용. 조항 근거로 연결하지 않습니다.",
};

export default function SourcesPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="자료 관리" desc="운영계획(안), 법령·시행령, 지침, 유사사업 규정, 배경자료를 구분해 등록하고 원문을 확인·수정합니다." />
      <NeedWorkspace>
        <SourcesBody />
      </NeedWorkspace>
    </div>
  );
}

function SourcesBody() {
  const { ws } = useWorkspace();
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const docs = ws!.docs;
  const sel = docs.find((d) => d.id === selected);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card
        title={`등록 자료 ${docs.length}건`}
        actions={<Button variant="primary" size="sm" onClick={() => { setAdding(true); setSelected(null); }}>자료 등록</Button>}
      >
        {docs.length === 0 ? (
          <Empty title="등록된 자료가 없습니다" action={<Button variant="primary" onClick={() => setAdding(true)}>자료 등록</Button>}>
            운영계획(안)부터 등록하면 사업 조건을 추출할 수 있습니다.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[12px] text-gray-500">
                  <th className="py-2 pr-2">문서명</th>
                  <th className="pr-2">유형</th>
                  <th className="pr-2">버전·기준일</th>
                  <th className="pr-2">원문</th>
                  <th className="pr-2">적용 여부</th>
                </tr>
              </thead>
              <tbody>
                {TYPES.flatMap((t) => docs.filter((d) => d.type === t)).map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => { setSelected(d.id); setAdding(false); }}
                    className={cx("cursor-pointer border-b border-gray-100 align-top hover:bg-brand-50/50", selected === d.id && "bg-brand-50")}
                  >
                    <td className="py-2 pr-2">
                      <div className="font-medium text-navy">{d.title}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {d.isDemo && <Badge tone="amber">시연용 가상</Badge>}
                        {!d.isPublic && <Badge>비공개</Badge>}
                        {!d.allowExternal && <Badge tone="gray" title="외부 LLM 호출에서 제외">외부 전송 금지</Badge>}
                      </div>
                    </td>
                    <td className="pr-2 whitespace-nowrap">{SOURCE_TYPE_LABEL[d.type]}</td>
                    <td className="pr-2 text-[12px] text-gray-600">{d.version || "-"}{d.effectiveDate ? ` · ${d.effectiveDate}` : ""}</td>
                    <td className="pr-2"><TextStatusBadge status={d.textStatus} /></td>
                    <td className="pr-2"><Badge tone={d.applicability === "applicable" ? "green" : d.applicability === "unchecked" ? "amber" : "gray"}>{APPLICABILITY_LABEL[d.applicability]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div>
        {adding && <AddDocForm onDone={(id) => { setAdding(false); setSelected(id); }} onCancel={() => setAdding(false)} />}
        {!adding && sel && <DocDetail key={sel.id} doc={sel} onDeleted={() => setSelected(null)} />}
        {!adding && !sel && docs.length > 0 && <Empty title="자료를 선택하세요">왼쪽 목록에서 자료를 선택하면 원문 조각과 메타데이터를 확인·수정할 수 있습니다.</Empty>}
      </div>
    </div>
  );
}

interface Meta {
  title: string;
  type: SourceType;
  version: string;
  effectiveDate: string;
  url: string;
  isPublic: boolean;
  allowExternal: boolean;
  applicability: Applicability;
}

function MetaFields({ m, set, lockType }: { m: Meta; set: (p: Partial<Meta>) => void; lockType?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="문서명"><input className={inputCls} value={m.title} onChange={(e) => set({ title: e.target.value })} /></Field>
      </div>
      <Field label="자료 유형" hint={TYPE_HELP[m.type]}>
        <select className={inputCls} value={m.type} disabled={lockType} onChange={(e) => set({ type: e.target.value as SourceType })}>
          {TYPES.map((t) => <option key={t} value={t}>{SOURCE_TYPE_LABEL[t]}</option>)}
        </select>
      </Field>
      <Field label="적용 여부 확인 상태">
        <select className={inputCls} value={m.applicability} onChange={(e) => set({ applicability: e.target.value as Applicability })}>
          {(Object.keys(APPLICABILITY_LABEL) as Applicability[]).map((a) => <option key={a} value={a}>{APPLICABILITY_LABEL[a]}</option>)}
        </select>
      </Field>
      <Field label="버전"><input className={inputCls} value={m.version} onChange={(e) => set({ version: e.target.value })} placeholder="예: 2026.4.23 시행본" /></Field>
      <Field label="기준일·시행일"><input type="date" className={inputCls} value={m.effectiveDate} onChange={(e) => set({ effectiveDate: e.target.value })} /></Field>
      <div className="sm:col-span-2">
        <Field label="출처 URL(선택)"><input className={inputCls} value={m.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" /></Field>
      </div>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={m.isPublic} onChange={(e) => set({ isPublic: e.target.checked })} /> 공개 자료</label>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={m.allowExternal} onChange={(e) => set({ allowExternal: e.target.checked })} /> 외부 LLM 전송 허용</label>
    </div>
  );
}

function AddDocForm({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const { update } = useWorkspace();
  const [m, setM] = useState<Meta>({ title: "", type: "plan", version: "", effectiveDate: "", url: "", isPublic: false, allowExternal: false, applicability: "unchecked" });
  const set = (p: Partial<Meta>) => setM((x) => ({ ...x, ...p }));

  function submit(r: SourceInputResult | null) {
    if (!m.title.trim()) {
      alert("문서명을 입력하세요.");
      return;
    }
    const id = update((ws) => {
      const d = addDoc(ws, { ...m, title: m.title.trim(), isDemo: false });
      if (r) setDocText(ws, d.id, { text: r.text, pages: r.pages, format: r.format, fileName: r.fileName, parseNote: r.note });
      return d.id;
    }, r ? "자료와 원문을 등록했습니다." : "자료를 목록에 등록했습니다(원문 미등록).");
    if (id) onDone(id);
  }

  return (
    <Card title="자료 등록" actions={<Button size="sm" variant="ghost" onClick={onCancel}>닫기</Button>}>
      <div className="space-y-4">
        <MetaFields m={m} set={set} />
        <SourceInput onReady={submit} allowNone />
      </div>
    </Card>
  );
}

function DocDetail({ doc, onDeleted }: { doc: SourceDoc; onDeleted: () => void }) {
  const { ws, update, notify } = useWorkspace();
  const [m, setM] = useState<Meta>({ ...doc });
  const [replacing, setReplacing] = useState(false);
  const [editChunk, setEditChunk] = useState<string | null>(null);
  const [chunkText, setChunkText] = useState("");
  const [filter, setFilter] = useState("");
  const chunks = ws!.chunks.filter((c) => c.docId === doc.id).sort((a, b) => a.seq - b.seq);
  const linkedCount = ws!.clauses.filter((c) => c.sources.some((s) => s.docId === doc.id)).length;
  const dirty = JSON.stringify(m) !== JSON.stringify({ title: doc.title, type: doc.type, version: doc.version, effectiveDate: doc.effectiveDate, url: doc.url, isPublic: doc.isPublic, allowExternal: doc.allowExternal, applicability: doc.applicability });
  const shown = filter ? chunks.filter((c) => c.text.includes(filter)) : chunks;

  return (
    <div className="space-y-4">
      <Card
        title={doc.title}
        actions={
          <>
            <Button size="sm" variant="primary" disabled={!dirty} onClick={() => update((w) => updateDocMeta(w, doc.id, { ...m }), "자료 정보를 저장했습니다.")}>정보 저장</Button>
            <Button size="sm" variant="danger" onClick={() => {
              if (!confirm(`‘${doc.title}’을(를) 삭제할까요?${linkedCount ? ` ${linkedCount}개 조항의 근거 연결이 끊어집니다.` : ""}`)) return;
              update((w) => deleteDoc(w, doc.id), "자료를 삭제했습니다.");
              onDeleted();
            }}>삭제</Button>
          </>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-gray-600">
          <TextStatusBadge status={doc.textStatus} />
          {doc.format && <Badge>{doc.format === "paste" ? "직접 입력" : doc.format.toUpperCase()}</Badge>}
          <span>원문 버전 {doc.textVersion} · 수정 {formatDate(doc.updatedAt)} · 연결 조항 {linkedCount}개</span>
        </div>
        {doc.parseNote && <Notice tone="gray" className="mb-3">{doc.parseNote}</Notice>}
        <MetaFields m={m} set={(p) => setM((x) => ({ ...x, ...p }))} lockType={linkedCount > 0} />
        {doc.type === "similar" && <Notice tone="blue" className="mt-3">유사사업 규정은 참고 자료입니다. 이번 사업의 현행 규정이나 의무 기준으로 자동 적용되지 않습니다.</Notice>}
        {doc.type === "background" && <Notice tone="gray" className="mt-3">배경자료는 조항의 법적 근거로 연결되지 않습니다.</Notice>}
        {doc.type === "plan" && doc.textStatus === "registered" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ws!.clauses.length === 0 ? (
              <Button variant="subtle" onClick={() => {
                const r = update((w) => applyExtraction(w, doc.id));
                if (r) notify(`조건 ${r.found.length}개 추출, 빈 값 ${r.emptyKeys.length}개 (${r.method}). 사업 조건 화면에서 확인하세요.`, "ok");
              }}>이 계획안에서 사업 조건 추출</Button>
            ) : (
              <Link href="/changes"><Button variant="subtle">계획 변경 화면에서 이전 조건과 비교</Button></Link>
            )}
            <span className="text-[12px] text-gray-500">규칙 기반 추출(‘항목: 값’ 형식). 추출 값은 모두 ‘미확정’으로 들어옵니다.</span>
          </div>
        )}
      </Card>

      <Card
        title={`원문 조각 ${chunks.length}개`}
        actions={<Button size="sm" onClick={() => setReplacing((v) => !v)}>{doc.textStatus === "registered" ? "원문 다시 등록" : "원문 등록"}</Button>}
      >
        {replacing && (
          <div className="mb-4 rounded-md border border-gray-200 p-3">
            {doc.textStatus === "registered" && <Notice className="mb-3">원문을 다시 등록하면 원문 버전이 올라가고, 이 자료에 연결된 검토 완료 조항은 ‘재검토 필요’로 바뀝니다. 기존 조각 연결은 끊어질 수 있습니다.</Notice>}
            <SourceInput
              submitLabel="이 원문으로 교체"
              onReady={(r) => {
                if (!r) return;
                update((w) => setDocText(w, doc.id, { text: r.text, pages: r.pages, format: r.format, fileName: r.fileName, parseNote: r.note }), "원문을 등록했습니다.");
                setReplacing(false);
              }}
            />
          </div>
        )}
        {chunks.length === 0 ? (
          <p className="text-[13px] text-gray-500">원문이 등록되지 않았습니다. 이 자료를 근거로 하는 조항은 ‘원문 미등록’으로 표시됩니다.</p>
        ) : (
          <>
            <input className={cx(inputCls, "mb-2")} placeholder="원문 내 검색" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <ol className="max-h-[60vh] space-y-1 overflow-y-auto">
              {shown.map((c) => (
                <li key={c.id} className="rounded border border-gray-100 px-2 py-1.5 hover:border-gray-300">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-gray-500">{c.locator}</span>
                    {editChunk !== c.id && <button className="text-[11px] text-brand" onClick={() => { setEditChunk(c.id); setChunkText(c.text); }}>수정</button>}
                  </div>
                  {editChunk === c.id ? (
                    <div className="mt-1 space-y-1">
                      <textarea className={cx(inputCls, "h-20 text-[13px]")} value={chunkText} onChange={(e) => setChunkText(e.target.value)} />
                      <div className="flex gap-1">
                        <Button size="sm" variant="primary" onClick={() => { update((w) => updateChunkText(w, c.id, chunkText), "원문 조각을 수정했습니다(원문 버전 증가)."); setEditChunk(null); }}>저장</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditChunk(null)}>취소</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[13px] leading-relaxed">{c.text}</p>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>
    </div>
  );
}
