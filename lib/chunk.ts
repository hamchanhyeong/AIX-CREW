import type { Chunk } from "./types";
import { uid } from "./util";

const HEADING = /^(\d+\.\s|\[.+\]|#+\s|제\s*\d+\s*(편|장|절)\b|[IVX]+\.\s)/;
const ARTICLE = /^제\s*\d+\s*조(의\s*\d+)?\s*(\(|【|\s|$)/;

function shortLabel(line: string): string {
  const s = line.replace(/^#+\s*/, "").trim();
  return s.length > 24 ? `${s.slice(0, 24)}…` : s;
}

/**
 * 텍스트를 원문 조각으로 나눈다. 줄 단위 조각을 기본으로 하며,
 * 위치는 '절 제목 ¶n' 또는 조문 제목으로 남긴다(페이지가 없는 자료).
 */
export function chunkPlainText(docId: string, text: string, textVersion: number): Chunk[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: Chunk[] = [];
  let section = "머리말";
  let para = 0;
  let seq = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let locator: string;
    if (ARTICLE.test(line)) {
      const m = line.match(/^제\s*\d+\s*조(의\s*\d+)?(\([^)]*\))?/);
      section = m ? m[0].replace(/\s+/g, "") : shortLabel(line);
      para = 0;
      locator = section;
    } else if (HEADING.test(line)) {
      section = shortLabel(line);
      para = 0;
      locator = `${section} (제목)`;
    } else {
      para += 1;
      locator = `${section} ¶${para}`;
    }
    out.push({ id: uid("ch"), docId, seq: ++seq, locator, text: line, textVersion });
  }
  return out;
}

/** 페이지별 텍스트(PDF)를 조각으로 나눈다. 위치는 'p.N ¶M'. */
export function chunkPages(docId: string, pages: string[], textVersion: number): Chunk[] {
  const out: Chunk[] = [];
  let seq = 0;
  pages.forEach((pageText, pi) => {
    const paras = splitParagraphs(pageText);
    paras.forEach((p, i) => {
      out.push({
        id: uid("ch"),
        docId,
        seq: ++seq,
        locator: `p.${pi + 1} ¶${i + 1}`,
        text: p,
        textVersion,
      });
    });
  });
  return out;
}

function splitParagraphs(text: string): string[] {
  const norm = text.replace(/\r\n?/g, "\n");
  const blocks = norm.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: string[] = [];
  for (const b of blocks) {
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
    let cur = "";
    for (const l of lines) {
      const startsNew = HEADING.test(l) || ARTICLE.test(l) || /^[-•◦·○①-⑳\d]+[.)]?\s/.test(l);
      if (cur && (startsNew || /[.다。:]$/.test(cur) || cur.length > 400)) {
        out.push(cur);
        cur = l;
      } else {
        cur = cur ? `${cur} ${l}` : l;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}
