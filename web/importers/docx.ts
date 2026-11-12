// DOCX → 텍스트 (브라우저 안에서 처리, 외부 전송 없음). 필요할 때만 assets/import-docx.js로 불러온다.
import mammoth from "mammoth";

(globalThis as unknown as { reguflowDocx: (b: ArrayBuffer) => Promise<string> }).reguflowDocx = async (buf: ArrayBuffer) => {
  const r = await mammoth.extractRawText({ arrayBuffer: buf });
  return r.value.replace(/\n{3,}/g, "\n\n");
};
