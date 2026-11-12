import { NextResponse } from "next/server";
import { aiStatus } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

// 키 값은 절대 반환하지 않는다. 설정 여부와 모델명만 알려준다.
export async function GET() {
  return NextResponse.json(aiStatus());
}
