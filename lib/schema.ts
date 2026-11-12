import { z } from "zod";
import type { Workspace } from "./types";

// 백업 복원 시 최소 구조 검증
const arr = z.array(z.any());
export const WorkspaceShape = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum(["sample", "main"]),
  isDemo: z.boolean(),
  project: z.object({ id: z.string(), name: z.string(), createdAt: z.string(), updatedAt: z.string() }).passthrough(),
  programs: arr,
  sections: arr,
  docs: arr,
  chunks: arr,
  conditions: arr,
  clauses: z.array(z.object({ id: z.string(), docKind: z.enum(["rule", "manual"]), sectionId: z.string(), title: z.string(), body: z.string() }).passthrough()),
  suggestions: arr,
  changeSets: arr,
  snapshots: arr,
  aiIssues: arr,
});

export function validateWorkspace(v: unknown): { ok: true; ws: Workspace } | { ok: false; error: string } {
  const r = WorkspaceShape.safeParse(v);
  if (!r.success) return { ok: false, error: "백업 파일 형식이 올바르지 않습니다." };
  return { ok: true, ws: r.data as unknown as Workspace };
}
