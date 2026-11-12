import { NextResponse } from "next/server";
import { parseUpload } from "@/lib/server/parse";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, code: "failed", error: "업로드 요청을 읽지 못했습니다." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, code: "failed", error: "파일이 없습니다." }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const r = await parseUpload(file.name, buf);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
