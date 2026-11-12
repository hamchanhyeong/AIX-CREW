import { NextResponse } from "next/server";
import { validateWorkspace } from "@/lib/schema";
import { parseKind, readWorkspace, writeWorkspace } from "@/lib/server/store";
import { emptyWorkspace } from "@/lib/structure";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const kind = parseKind(new URL(req.url).searchParams.get("kind"));
  if (!kind) return NextResponse.json({ error: "작업공간 구분이 올바르지 않습니다." }, { status: 400 });
  let ws = await readWorkspace(kind);
  if (!ws && kind === "main") {
    ws = emptyWorkspace("main");
    await writeWorkspace("main", ws);
  }
  return NextResponse.json({ ws });
}

export async function PUT(req: Request) {
  const kind = parseKind(new URL(req.url).searchParams.get("kind"));
  if (!kind) return NextResponse.json({ error: "작업공간 구분이 올바르지 않습니다." }, { status: 400 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 형식이 아닙니다." }, { status: 400 });
  }
  const v = validateWorkspace(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (v.ws.kind !== kind) {
    // 복원 시 다른 작업공간 백업이면 현재 작업공간 구분으로 맞춘다(샘플 표시는 유지)
    v.ws.kind = kind;
  }
  await writeWorkspace(kind, v.ws);
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
