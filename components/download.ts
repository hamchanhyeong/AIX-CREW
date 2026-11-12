"use client";

/** 서버 파일을 받아 한글 파일명 그대로 저장한다. 실패하면 오류 메시지를 돌려준다. */
export async function downloadFile(url: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  let r: Response;
  try {
    r = await fetch(url, { cache: "no-store" });
  } catch {
    return { ok: false, error: "파일을 내려받지 못했습니다(네트워크 오류)." };
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return { ok: false, error: (j as { error?: string }).error ?? `파일 생성 실패(${r.status})` };
  }
  const cd = r.headers.get("content-disposition") ?? "";
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const plain = cd.match(/filename="([^"]+)"/i);
  const name = star ? decodeURIComponent(star[1]) : plain ? plain[1] : "download";
  const blob = await r.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 5000);
  return { ok: true, name };
}
