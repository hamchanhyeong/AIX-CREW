"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Workspace, WorkspaceKind } from "@/lib/types";

export type SaveState = "idle" | "saving" | "saved" | "error";
export interface AiStatus {
  configured: boolean;
  provider: string;
  model: string;
  reason?: string;
}
export interface Toast {
  id: number;
  text: string;
  tone: "ok" | "error" | "info";
}

interface Ctx {
  kind: WorkspaceKind;
  ws: Workspace | null;
  loading: boolean;
  loadError: string | null;
  saveState: SaveState;
  savedAt: string | null;
  ai: AiStatus | null;
  /** 작업공간을 복제해 변경한다. 함수가 예외를 던지면 변경하지 않고 오류를 알린다. */
  update: <T>(fn: (ws: Workspace) => T, okText?: string) => T | undefined;
  flush: () => Promise<boolean>;
  switchKind: (k: WorkspaceKind) => void;
  resetWorkspace: (k: WorkspaceKind) => Promise<void>;
  replaceWorkspace: (ws: Workspace) => Promise<boolean>;
  toasts: Toast[];
  notify: (text: string, tone?: Toast["tone"]) => void;
}

const WorkspaceCtx = createContext<Ctx | null>(null);
const KIND_KEY = "reguflow.workspace";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<WorkspaceKind>("main");
  const [ws, setWs] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const wsRef = useRef<Workspace | null>(null);
  const kindRef = useRef<WorkspaceKind>("main");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const inflight = useRef<Promise<boolean> | null>(null);

  const notify = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }].slice(-3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 2500);
  }, []);

  const load = useCallback(async (k: WorkspaceKind) => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/workspace?kind=${k}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "불러오기 실패");
      wsRef.current = j.ws;
      setWs(j.ws);
      setSaveState(j.ws ? "saved" : "idle");
      setSavedAt(j.ws ? j.ws.project.updatedAt : null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "작업공간을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let k: WorkspaceKind = "main";
    try {
      const v = localStorage.getItem(KIND_KEY);
      if (v === "sample" || v === "main") k = v;
    } catch {}
    kindRef.current = k;
    setKind(k);
    load(k);
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then(setAi)
      .catch(() => setAi({ configured: false, provider: "-", model: "-", reason: "상태 확인 실패" }));
  }, [load]);

  const save = useCallback(async (): Promise<boolean> => {
    const cur = wsRef.current;
    if (!cur) return true;
    pending.current = false;
    setSaveState("saving");
    try {
      const r = await fetch(`/api/workspace?kind=${kindRef.current}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cur),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (!pending.current) setSaveState("saved");
      setSavedAt(j.savedAt);
      return true;
    } catch {
      setSaveState("error");
      return false;
    }
  }, []);

  const scheduleSave = useCallback(() => {
    pending.current = true;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      inflight.current = save();
    }, 300);
  }, [save]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current) await inflight.current;
    if (pending.current) return save();
    return true;
  }, [save]);

  const update = useCallback(
    <T,>(fn: (w: Workspace) => T, okText?: string): T | undefined => {
      const cur = wsRef.current;
      if (!cur) return undefined;
      const next = structuredClone(cur);
      let result: T;
      try {
        result = fn(next);
      } catch (e) {
        notify(e instanceof Error ? e.message : "처리하지 못했습니다.", "error");
        return undefined;
      }
      wsRef.current = next;
      setWs(next);
      scheduleSave();
      if (okText) notify(okText, "ok");
      return result;
    },
    [notify, scheduleSave],
  );

  const switchKind = useCallback(
    async (k: WorkspaceKind) => {
      await flush();
      kindRef.current = k;
      setKind(k);
      try {
        localStorage.setItem(KIND_KEY, k);
      } catch {}
      load(k);
    },
    [flush, load],
  );

  const resetWorkspace = useCallback(
    async (k: WorkspaceKind) => {
      await flush();
      const r = await fetch(`/api/workspace/reset?kind=${k}`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        notify(j.error ?? "초기화하지 못했습니다.", "error");
        return;
      }
      kindRef.current = k;
      setKind(k);
      try {
        localStorage.setItem(KIND_KEY, k);
      } catch {}
      wsRef.current = j.ws;
      setWs(j.ws);
      setSaveState("saved");
      setSavedAt(j.ws.project.updatedAt);
    },
    [flush, notify],
  );

  const replaceWorkspace = useCallback(
    async (next: Workspace) => {
      await flush();
      const r = await fetch(`/api/workspace?kind=${kindRef.current}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const j = await r.json();
      if (!r.ok) {
        notify(j.error ?? "복원하지 못했습니다.", "error");
        return false;
      }
      await load(kindRef.current);
      return true;
    },
    [flush, load, notify],
  );

  useEffect(() => {
    // 자동 저장 대기 중에 페이지를 떠나면: 작은 작업공간은 keepalive로 즉시 전송,
    // 큰 작업공간은 브라우저의 ‘저장되지 않은 변경’ 확인창으로 이탈을 막는다.
    const h = (e: BeforeUnloadEvent) => {
      if (!pending.current || !wsRef.current) return;
      const body = JSON.stringify(wsRef.current);
      if (body.length < 60_000) {
        fetch(`/api/workspace?kind=${kindRef.current}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
        pending.current = false;
        return;
      }
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ kind, ws, loading, loadError, saveState, savedAt, ai, update, flush, switchKind, resetWorkspace, replaceWorkspace, toasts, notify }),
    [kind, ws, loading, loadError, saveState, savedAt, ai, update, flush, switchKind, resetWorkspace, replaceWorkspace, toasts, notify],
  );
  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace() {
  const v = useContext(WorkspaceCtx);
  if (!v) throw new Error("WorkspaceProvider 안에서 사용하세요.");
  return v;
}
