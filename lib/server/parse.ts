// 업로드 파일 원문 추출. 실패를 성공으로 처리하지 않는다.
export type ParseResult =
  | { ok: true; format: "txt" | "pdf" | "docx"; text?: string; pages?: string[]; note?: string }
  | { ok: false; code: "unsupported" | "scanned" | "empty" | "failed" | "too_large"; error: string };

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function ext(name: string) {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function decodeText(buf: Buffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (!utf8.includes("�")) return utf8.replace(/^﻿/, "");
  try {
    return new TextDecoder("euc-kr").decode(buf);
  } catch {
    return utf8;
  }
}

export async function parseUpload(name: string, buf: Buffer): Promise<ParseResult> {
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, code: "too_large", error: "파일이 15MB를 넘습니다." };
  const e = ext(name);
  if (e === "hwp" || e === "hwpx") {
    return { ok: false, code: "unsupported", error: "HWP·HWPX는 초기 범위에서 지원하지 않습니다. 한글에서 DOCX 또는 PDF로 저장하거나 원문을 직접 붙여넣으세요." };
  }
  if (e === "txt" || e === "md") {
    const text = decodeText(buf);
    if (!text.trim()) return { ok: false, code: "empty", error: "파일에 텍스트가 없습니다." };
    return { ok: true, format: "txt", text };
  }
  if (e === "docx") {
    try {
      const mammoth = await import("mammoth");
      const r = await mammoth.extractRawText({ buffer: buf });
      const text = r.value.replace(/\n{3,}/g, "\n\n");
      if (!text.trim()) return { ok: false, code: "empty", error: "DOCX에서 추출된 텍스트가 없습니다." };
      return { ok: true, format: "docx", text, note: "DOCX는 페이지 정보가 없어 절·문단 식별자로 위치를 표시합니다." };
    } catch {
      return { ok: false, code: "failed", error: "DOCX 파일을 읽지 못했습니다. 손상되었거나 DOCX 형식이 아닐 수 있습니다." };
    }
  }
  if (e === "pdf") {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      const pages = (Array.isArray(text) ? text : [text]).map((t) => t ?? "");
      const chars = pages.join("").replace(/\s+/g, "").length;
      if (chars < Math.max(20, totalPages * 10)) {
        return {
          ok: false,
          code: "scanned",
          error: "PDF에서 텍스트를 추출할 수 없습니다(스캔 이미지 PDF로 보입니다). OCR은 초기 범위에서 지원하지 않으므로 텍스트 기반 PDF·DOCX를 올리거나 원문을 직접 붙여넣으세요.",
        };
      }
      return { ok: true, format: "pdf", pages, note: `PDF ${totalPages}쪽 — 페이지 번호를 위치로 보존합니다.` };
    } catch {
      return { ok: false, code: "failed", error: "PDF 파일을 읽지 못했습니다. 암호가 걸렸거나 손상된 파일일 수 있습니다." };
    }
  }
  return { ok: false, code: "unsupported", error: `지원하지 않는 형식입니다(.${e || "?"}). TXT, 텍스트 기반 PDF, DOCX만 지원합니다.` };
}
