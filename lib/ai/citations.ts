import { normalizeSpace } from "../util";

export interface CitationInput {
  sourceId: string;
  quote: string;
}

export interface CitationCheck {
  ok: boolean;
  errors: string[];
}

/**
 * AI가 낸 인용을 검증한다.
 * - 제공하지 않은 출처 ID → 실패
 * - 원문 조각에 그대로 없는 인용 문구 → 실패 (공백 차이만 허용)
 */
export function validateCitations(citations: CitationInput[], allowed: Map<string, string>): CitationCheck {
  const errors: string[] = [];
  for (const c of citations) {
    const text = allowed.get(c.sourceId);
    if (text === undefined) {
      errors.push(`존재하지 않는 출처 ID: ${c.sourceId}`);
      continue;
    }
    const q = normalizeSpace(c.quote);
    if (!q) {
      errors.push(`출처 ${c.sourceId}의 인용 문구가 비어 있습니다.`);
      continue;
    }
    if (!normalizeSpace(text).includes(q)) errors.push(`출처 ${c.sourceId}의 인용 문구가 원문과 다릅니다: “${c.quote.slice(0, 60)}”`);
  }
  return { ok: errors.length === 0, errors };
}

/** 본문에 원문에 없는 법령 조문 번호(예: ‘법 제12조’)가 새로 생겼는지 확인 */
export function findUnsupportedLawRefs(body: string, beforeBody: string, sourceTexts: string[]): string[] {
  const re = /(「[^」]+」|법|시행령|영|지침|기준)\s*제\s*\d+\s*조(의\s*\d+)?/g;
  const pool = normalizeSpace([beforeBody, ...sourceTexts].join(" ")).replace(/\s+/g, "");
  const out: string[] = [];
  for (const m of body.matchAll(re)) {
    const ref = m[0].replace(/\s+/g, "");
    if (!pool.includes(ref)) out.push(m[0]);
  }
  return out;
}
