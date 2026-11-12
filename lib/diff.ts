import { diffWordsWithSpace } from "diff";

export interface DiffPart {
  value: string;
  type: "same" | "added" | "removed";
}

export function textDiff(before: string, after: string): DiffPart[] {
  return diffWordsWithSpace(before, after).map((p) => ({
    value: p.value,
    type: p.added ? "added" : p.removed ? "removed" : "same",
  }));
}
