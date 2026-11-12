import { NextResponse } from "next/server";
import { buildSampleWorkspace } from "@/lib/demo";
import { deleteWorkspace, parseKind, writeWorkspace } from "@/lib/server/store";
import { emptyWorkspace } from "@/lib/structure";

export const dynamic = "force-dynamic";

/** 샘플 시작(재설정) 또는 실제 작업공간 초기화 */
export async function POST(req: Request) {
  const kind = parseKind(new URL(req.url).searchParams.get("kind"));
  if (!kind) return NextResponse.json({ error: "작업공간 구분이 올바르지 않습니다." }, { status: 400 });
  await deleteWorkspace(kind);
  const ws = kind === "sample" ? buildSampleWorkspace() : emptyWorkspace("main");
  await writeWorkspace(kind, ws);
  return NextResponse.json({ ws });
}
