import { condId } from "./structure";
import type { Chunk, CondKey, Program } from "./types";

export interface ExtractedCondition {
  conditionId: string;
  programId: string | null;
  key: CondKey;
  value: string;
  chunkId: string;
  locator: string;
  rawLine: string;
}

export interface ExtractionResult {
  found: ExtractedCondition[];
  /** 항목은 있었지만 값이 비어 있거나 '미정'인 경우 */
  emptyKeys: { conditionId: string; locator: string }[];
  method: string;
}

// '항목: 값' 형식의 줄에서 조건을 찾는다. AI 분석이 아닌 규칙 기반 추출이다.
const SYNONYMS: [RegExp, CondKey][] = [
  [/자산\s*취득/, "asset"],
  [/사업비\s*(관리|집행)/, "budget"],
  [/추진\s*주체|운영\s*기관|수행\s*기관|주관\s*기관/, "org"],
  [/사업\s*목적|^목적/, "purpose"],
  [/사업\s*명/, "name"],
  [/제외\s*대상|지원\s*제외/, "exclusion"],
  [/지원\s*대상|신청\s*대상/, "target"],
  [/지원\s*한도|지원\s*금액|지원\s*규모\(금액\)/, "amount"],
  [/지원\s*기간|입주\s*기간|협약\s*기간/, "period"],
  [/선정\s*규모|지원\s*규모|선정\s*수/, "scale"],
  [/선정\s*방식|선정\s*절차|평가\s*방식/, "selection"],
];

const COMMON_KEYS: CondKey[] = ["name", "purpose", "org", "budget", "asset"];
const EMPTY_VALUE = /^(미정|추후\s*확정|추후|tbd|-|—|해당\s*없음)?$/i;

function detectKey(label: string): CondKey | null {
  for (const [re, key] of SYNONYMS) if (re.test(label)) return key;
  return null;
}

export function extractConditions(chunks: Chunk[], programs: Program[]): ExtractionResult {
  const found: ExtractedCondition[] = [];
  const emptyKeys: ExtractionResult["emptyKeys"] = [];
  let currentProgram: string | null = null;
  const sorted = [...chunks].sort((a, b) => a.seq - b.seq);

  for (const ch of sorted) {
    const line = ch.text.trim();
    const isHeading = !/[:：]/.test(line) || /^(\d+\.|\[|#|제\s*\d+\s*(편|장))/.test(line);
    if (isHeading && !/^[-•◦·○]/.test(line)) {
      const prog = programs.find((p) => line.includes(p.name));
      if (prog) currentProgram = prog.id;
      else if (/공통/.test(line)) currentProgram = null;
      if (!/[:：]/.test(line)) continue;
    }
    const m = line.match(/^[-•◦·○*]?\s*([^:：]{1,30})[:：]\s*(.*)$/);
    if (!m) continue;
    const label = m[1].trim();
    const key = detectKey(label);
    if (!key) continue;
    const programId = COMMON_KEYS.includes(key) ? null : currentProgram;
    if (!COMMON_KEYS.includes(key) && programId === null) continue; // 사업 구분 없이 나온 사업별 항목은 건너뜀
    const id = condId(programId, key);
    const value = m[2].trim();
    if (EMPTY_VALUE.test(value)) {
      emptyKeys.push({ conditionId: id, locator: ch.locator });
      continue;
    }
    if (found.some((f) => f.conditionId === id)) continue; // 첫 번째 값만 사용
    found.push({ conditionId: id, programId, key, value, chunkId: ch.id, locator: ch.locator, rawLine: line });
  }
  return { found, emptyKeys, method: "규칙 기반 추출(‘항목: 값’ 형식의 줄)" };
}
