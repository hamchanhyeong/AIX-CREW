import { NextResponse } from "next/server";
import { suggestClause } from "@/lib/ai/clauseSuggest";
import { AiError } from "@/lib/ai/errors";
import { getProvider } from "@/lib/ai/provider";
import { parseKind, readWorkspace } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: Request) {
  const { kind: k, clauseId, instruction } = (await req.json().catch(() => ({}))) as {
    kind?: string;
    clauseId?: string;
    instruction?: string;
  };
  const kind = parseKind(k ?? null);
  if (!kind || !clauseId) return NextResponse.json({ ok: false, code: "validation", error: "요청 값이 올바르지 않습니다." }, { status: 400 });
  if (kind === "sample") {
    return NextResponse.json({ ok: false, code: "config", error: "샘플 작업공간은 데모 모드 전용입니다. 실제 AI 작성은 실제 작업공간에서만 사용할 수 있습니다." }, { status: 400 });
  }
  const ws = await readWorkspace(kind);
  if (!ws) return NextResponse.json({ ok: false, code: "validation", error: "작업공간이 없습니다." }, { status: 404 });
  try {
    const provider = await getProvider();
    const result = await suggestClause(ws, clauseId, provider, instruction ?? "");
    return NextResponse.json({ ok: true, result, model: provider.model });
  } catch (e) {
    if (e instanceof AiError) {
      // 실패를 데모 결과로 대체하지 않고 그대로 알린다
      return NextResponse.json({ ok: false, code: e.code, error: e.message, details: e.details }, { status: 502 });
    }
    console.error("AI 제안 처리 중 알 수 없는 오류");
    return NextResponse.json({ ok: false, code: "api", error: "알 수 없는 오류로 AI 제안을 만들지 못했습니다." }, { status: 500 });
  }
}
