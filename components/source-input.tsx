"use client";

import { useState } from "react";
import { Button, cx, inputCls, Notice } from "./ui";

export type SourceInputResult = { text?: string; pages?: string[]; format: "txt" | "pdf" | "docx" | "paste"; fileName?: string; note?: string };

/** 파일 업로드(TXT·텍스트 PDF·DOCX) 또는 직접 붙여넣기. 실패한 추출은 성공으로 처리하지 않는다. */
export function SourceInput({ onReady, allowNone, submitLabel = "원문 등록" }: { onReady: (r: SourceInputResult | null) => void; allowNone?: boolean; submitLabel?: string }) {
  const [mode, setMode] = useState<"file" | "paste" | "none">("file");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<SourceInputResult | null>(null);

  async function upload(f: File) {
    setBusy(true);
    setError(null);
    setParsed(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/parse", { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) setError(j.error ?? "원문을 추출하지 못했습니다.");
      else setParsed({ text: j.text, pages: j.pages, format: j.format, fileName: f.name, note: j.note });
    } catch {
      setError("업로드 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const preview = parsed ? (parsed.pages ? parsed.pages.map((p, i) => `[p.${i + 1}]\n${p}`).join("\n\n") : parsed.text ?? "") : "";

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-md bg-gray-100 p-1 text-[13px]" role="tablist">
        {(["file", "paste", ...(allowNone ? ["none"] : [])] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m as typeof mode);
              setError(null);
            }}
            className={cx("flex-1 rounded px-3 py-1.5", mode === m ? "bg-white font-semibold text-navy shadow-sm" : "text-gray-600")}
          >
            {m === "file" ? "파일 업로드" : m === "paste" ? "원문 직접 붙여넣기" : "목록만 등록(원문 미등록)"}
          </button>
        ))}
      </div>

      {mode === "file" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-600">
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">지원: TXT · 텍스트 기반 PDF · DOCX</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500 line-through decoration-gray-400">HWP</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500 line-through decoration-gray-400">스캔 PDF(OCR)</span>
            <span className="text-gray-500">— 미지원 형식은 DOCX·PDF로 저장하거나 붙여넣으세요.</span>
          </div>
          <input
            type="file"
            accept=".txt,.md,.pdf,.docx,.hwp,.hwpx"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            className="block w-full text-[13px] file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-[13px]"
          />
          {busy && <p className="text-[12px] text-gray-500">원문을 추출하는 중…</p>}
          {error && <Notice tone="red">추출 실패: {error}</Notice>}
          {parsed && (
            <div>
              <div className="mb-1 text-[12px] text-emerald-700">추출 완료 — {parsed.note ?? "내용을 확인한 뒤 등록하세요."}</div>
              <pre className="max-h-48 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-[12px] whitespace-pre-wrap">{preview.slice(0, 3000)}{preview.length > 3000 ? "\n…" : ""}</pre>
            </div>
          )}
          <Button variant="primary" disabled={!parsed} onClick={() => onReady(parsed)}>{submitLabel}</Button>
        </div>
      )}
      {mode === "paste" && (
        <div className="space-y-2">
          <textarea className={cx(inputCls, "h-48 font-mono text-[12px]")} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"원문을 붙여넣으세요. 줄 단위로 원문 조각이 만들어집니다.\n운영계획(안)은 ‘- 지원 한도: 1억원’처럼 ‘항목: 값’ 형식이면 조건을 추출할 수 있습니다."} />
          <Button variant="primary" disabled={!paste.trim()} onClick={() => onReady({ text: paste, format: "paste" })}>{submitLabel}</Button>
        </div>
      )}
      {mode === "none" && (
        <div className="space-y-2">
          <Notice tone="gray">원문 없이 자료 목록에만 올립니다. ‘원문 미등록’ 상태로 표시되며, 이 자료를 근거로 한 조항은 검토 목록에서 확인 필요로 나옵니다.</Notice>
          <Button variant="primary" onClick={() => onReady(null)}>목록에 등록</Button>
        </div>
      )}
    </div>
  );
}
