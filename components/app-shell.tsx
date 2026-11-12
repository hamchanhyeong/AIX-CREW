"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { computeIssues } from "@/lib/checks";
import { DEMO_NOTICE } from "@/lib/labels";
import { currentVersionLabel } from "@/lib/ops";
import { formatDate } from "@/lib/util";
import { Badge, Button, cx, Empty, Notice } from "./ui";
import { useWorkspace } from "./workspace-context";

const NAV = [
  { href: "/", label: "프로젝트 현황", step: "" },
  { href: "/sources", label: "자료 관리", step: "1" },
  { href: "/conditions", label: "사업 조건 확인", step: "2" },
  { href: "/editor", label: "규정 편집기", step: "3" },
  { href: "/review", label: "검토 목록", step: "4" },
  { href: "/changes", label: "계획 변경·신구대비표", step: "5" },
  { href: "/export", label: "내보내기·백업", step: "6" },
  { href: "/settings", label: "설정", step: "" },
];

function SaveIndicator() {
  const { saveState, savedAt, flush } = useWorkspace();
  if (saveState === "saving") return <span className="text-[12px] text-gray-500">저장 중…</span>;
  if (saveState === "error")
    return (
      <span className="flex items-center gap-2 text-[12px] font-semibold text-red-700">
        저장 실패
        <Button size="sm" variant="danger" onClick={() => flush()}>다시 저장</Button>
      </span>
    );
  if (saveState === "saved") return <span className="text-[12px] text-emerald-700">저장됨 · {formatDate(savedAt ?? undefined)}</span>;
  return null;
}

function ModeBadge() {
  const { kind, ai, ws } = useWorkspace();
  if (kind === "sample" || ws?.isDemo) return <Badge tone="amber" title="템플릿과 구조화된 조건으로 작성합니다. AI 분석이 아닙니다.">데모 모드 · 템플릿 작성</Badge>;
  if (ai?.configured) return <Badge tone="green" title={`조항별 ‘AI 작성 제안’에서 ${ai.model} 사용`}>실제 AI 연결됨 · {ai.model}</Badge>;
  return <Badge tone="gray" title={ai?.reason}>AI 미설정 · 템플릿 작성</Badge>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { ws, kind, switchKind, loading, loadError, toasts } = useWorkspace();
  const issueCount = ws ? computeIssues(ws).length : 0;
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--hdr", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-navy text-white md:flex">
        <div className="border-b border-white/10 px-4 py-4">
          <div className="text-[11px] font-semibold tracking-wide text-white/60">재기지원 사업</div>
          <div className="text-[15px] font-bold">규정 작성 지원</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="업무 메뉴">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  "mb-0.5 flex items-center gap-2 rounded-md px-3 py-2 text-[13px]",
                  active ? "bg-white/15 font-semibold text-white" : "text-white/75 hover:bg-white/10 hover:text-white",
                )}
              >
                <span className="w-4 text-[11px] text-white/50">{n.step}</span>
                <span className="flex-1">{n.label}</span>
                {n.href === "/review" && issueCount > 0 && <span className="rounded bg-amber-400 px-1.5 text-[11px] font-bold text-navy">{issueCount}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-white/55">
          모든 결과는 검토용 초안입니다. 기관 승인·법적 적합성을 보장하지 않습니다.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header ref={headerRef} className="sticky top-0 z-20 border-b border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold text-navy">{ws?.project.name ?? (loading ? "불러오는 중…" : "작업공간 없음")}</div>
              {ws && <div className="text-[11px] text-gray-500">버전 {currentVersionLabel(ws)}</div>}
            </div>
            <label className="flex items-center gap-2 text-[12px] text-gray-600">
              작업공간
              <select
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[13px]"
                value={kind}
                onChange={(e) => switchKind(e.target.value as "main" | "sample")}
              >
                <option value="main">실제 작업공간</option>
                <option value="sample">샘플(시연용 가상 자료)</option>
              </select>
            </label>
            <ModeBadge />
            <SaveIndicator />
          </div>
          {ws?.isDemo && <div className="bg-amber-100 px-5 py-1 text-[12px] font-semibold text-amber-900">{DEMO_NOTICE} 화면과 내보낸 파일에 같은 표시가 유지됩니다.</div>}
          <nav className="flex gap-1 overflow-x-auto border-t border-gray-100 px-3 py-1.5 md:hidden" aria-label="업무 메뉴(모바일)">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={cx("whitespace-nowrap rounded px-2 py-1 text-[12px]", path === n.href ? "bg-navy text-white" : "text-gray-700")}>
                {n.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="min-w-0 flex-1 px-5 py-5">
          {loadError ? (
            <Notice tone="red">작업공간을 불러오지 못했습니다: {loadError}</Notice>
          ) : loading && !ws ? (
            <div className="py-20 text-center text-gray-500">작업공간을 불러오는 중…</div>
          ) : (
            children
          )}
        </main>
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-md border px-3 py-2 text-[13px] shadow-sm",
              t.tone === "error" ? "border-red-300 bg-red-50 text-red-800" : t.tone === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-gray-300 bg-white text-gray-800",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 작업공간이 없을 때(샘플 미생성) 안내 */
export function NeedWorkspace({ children }: { children: ReactNode }) {
  const { ws, kind, resetWorkspace } = useWorkspace();
  if (ws) return <>{children}</>;
  return (
    <Empty
      title={kind === "sample" ? "샘플 프로젝트가 아직 없습니다" : "작업공간이 없습니다"}
      action={<Button variant="primary" onClick={() => resetWorkspace(kind)}>{kind === "sample" ? "샘플 프로젝트 시작" : "새 작업공간 만들기"}</Button>}
    >
      {kind === "sample" ? "가상 운영계획과 가상 참고 규정으로 전체 흐름을 시연합니다." : ""}
    </Empty>
  );
}
