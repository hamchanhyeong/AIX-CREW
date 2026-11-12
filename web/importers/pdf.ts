// 텍스트 기반 PDF → 페이지별 텍스트 (브라우저 안에서 처리, 외부 전송 없음). 필요할 때만 assets/import-pdf.js로 불러온다.
// file://에서도 동작하도록 별도 워커 파일 없이 같은 스레드에서 처리한다.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import * as worker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = worker;

(globalThis as unknown as { reguflowPdf: (b: ArrayBuffer) => Promise<string[]> }).reguflowPdf = async (buf: ArrayBuffer) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = "";
    let out = "";
    for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof it.str !== "string") continue;
      line += it.str;
      if (it.hasEOL) {
        out += line + "\n";
        line = "";
      }
    }
    pages.push((out + line).trim());
  }
  await doc.destroy();
  return pages;
};
