import type { Chunk, Workspace } from "./types";

// 작은 문서 집합용 단순 검색: 한글 2글자 묶음(bigram) 겹침 + 키워드 일치 가산점.
function bigrams(s: string): Set<string> {
  const t = s.replace(/[^\p{L}\p{N}]/gu, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

export interface Hit {
  chunk: Chunk;
  score: number;
}

export function searchChunks(
  ws: Pick<Workspace, "chunks">,
  query: string,
  opts: { docIds?: string[]; limit?: number; requireKeyword?: string[] } = {},
): Hit[] {
  const q = bigrams(query);
  const allowed = opts.docIds ? new Set(opts.docIds) : null;
  const hits: Hit[] = [];
  for (const ch of ws.chunks) {
    if (allowed && !allowed.has(ch.docId)) continue;
    const text = ch.text.replace(/\s+/g, "");
    let kw = 0;
    if (opts.requireKeyword?.length) {
      kw = opts.requireKeyword.filter((k) => text.includes(k.replace(/\s+/g, ""))).length;
      if (kw === 0) continue;
    }
    const b = bigrams(ch.text);
    let overlap = 0;
    q.forEach((g) => {
      if (b.has(g)) overlap++;
    });
    const score = overlap / Math.sqrt(b.size + 1) + kw * 2;
    if (score > 0) hits.push({ chunk: ch, score });
  }
  hits.sort((a, b) => b.score - a.score || a.chunk.seq - b.chunk.seq);
  return hits.slice(0, opts.limit ?? 8);
}
