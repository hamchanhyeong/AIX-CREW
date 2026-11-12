import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Workspace, WorkspaceKind } from "../types";

// 단일 사용자 로컬 MVP: 작업공간별 JSON 파일. 기본 위치는 ./data (Git 제외)
export function dataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

function fileFor(kind: WorkspaceKind) {
  return path.join(dataDir(), `workspace-${kind}.json`);
}

export async function readWorkspace(kind: WorkspaceKind): Promise<Workspace | null> {
  try {
    const raw = await fs.readFile(fileFor(kind), "utf8");
    return JSON.parse(raw) as Workspace;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function writeWorkspace(kind: WorkspaceKind, ws: Workspace) {
  await fs.mkdir(dataDir(), { recursive: true });
  const target = fileFor(kind);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(ws), "utf8");
  await fs.rename(tmp, target);
}

export async function deleteWorkspace(kind: WorkspaceKind) {
  await fs.rm(fileFor(kind), { force: true });
}

export function parseKind(v: string | null): WorkspaceKind | null {
  return v === "sample" || v === "main" ? v : null;
}
