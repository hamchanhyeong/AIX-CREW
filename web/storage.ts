// 작업공간 저장소: IndexedDB(대용량) 우선, 사용할 수 없으면 localStorage로 대체.
// 데이터는 이 PC의 이 브라우저 안에만 있고 외부로 전송되지 않는다.
import type { Workspace } from "../lib/types";

export type Kind = "sample" | "main";
export type Backend = "indexeddb" | "localstorage" | "memory";

const DB = "reguflow";
const STORE = "workspaces";
const META = "meta";
const LS_WS = (k: Kind) => `reguflow-html.ws.${k}`;
const LS_KIND = "reguflow-html.kind";

let db: IDBDatabase | null = null;
export let backend: Backend = "memory";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((res) => {
    let r: IDBOpenDBRequest;
    try {
      r = indexedDB.open(DB, 1);
    } catch {
      return res(null);
    }
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      if (!d.objectStoreNames.contains(META)) d.createObjectStore(META);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
    r.onblocked = () => res(null);
  });
}

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

/** 시작 시 1회: 저장소를 열고, 예전 localStorage 데이터가 있으면 IndexedDB로 옮긴다. */
export async function initStorage(): Promise<{ main: unknown; sample: unknown; kind: Kind | null; migrated: boolean }> {
  db = await openDb();
  if (db) {
    backend = "indexeddb";
    let migrated = false;
    const tx = (mode: IDBTransactionMode) => db!.transaction(STORE, mode).objectStore(STORE);
    for (const k of ["main", "sample"] as Kind[]) {
      const has = await req(tx("readonly").get(k));
      const old = lsGet(LS_WS(k));
      if (!has && old) {
        try {
          await req(tx("readwrite").put(JSON.parse(old), k));
          localStorage.removeItem(LS_WS(k));
          migrated = true;
        } catch {
          /* 옮기지 못하면 기존 데이터를 그대로 둔다 */
        }
      }
    }
    const main = await req(tx("readonly").get("main"));
    const sample = await req(tx("readonly").get("sample"));
    const kind = (await getMeta("kind")) as Kind | null;
    // 브라우저가 공간 부족 시 데이터를 지우지 않도록 영구 보관 요청(지원 브라우저만)
    try {
      await navigator.storage?.persist?.();
    } catch {}
    return { main, sample, kind, migrated };
  }
  // 대체: localStorage
  const ok = (() => {
    try {
      localStorage.setItem("reguflow-test", "1");
      localStorage.removeItem("reguflow-test");
      return true;
    } catch {
      return false;
    }
  })();
  backend = ok ? "localstorage" : "memory";
  const parse = (s: string | null) => {
    try {
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  };
  return { main: parse(lsGet(LS_WS("main"))), sample: parse(lsGet(LS_WS("sample"))), kind: lsGet(LS_KIND) as Kind | null, migrated: false };
}

// 저장 요청을 순서대로 처리(마지막 상태가 항상 마지막에 쓰이도록)
let chain: Promise<unknown> = Promise.resolve();
export function saveWorkspace(k: Kind, ws: Workspace): Promise<void> {
  const snapshot = ws; // 호출 측은 매 변경마다 새 객체를 넘긴다(불변 갱신)
  const p = chain.then(async () => {
    if (backend === "indexeddb" && db) {
      await req(db.transaction(STORE, "readwrite").objectStore(STORE).put(snapshot, k));
    } else if (backend === "localstorage") {
      localStorage.setItem(LS_WS(k), JSON.stringify(snapshot));
    } else {
      throw new Error("이 브라우저에서는 저장할 수 없습니다(사생활 보호 모드 등).");
    }
  });
  chain = p.catch(() => {});
  return p;
}

export async function deleteWorkspace(k: Kind): Promise<void> {
  if (backend === "indexeddb" && db) await req(db.transaction(STORE, "readwrite").objectStore(STORE).delete(k));
  else if (backend === "localstorage") localStorage.removeItem(LS_WS(k));
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  if (backend === "indexeddb" && db) await req(db.transaction(META, "readwrite").objectStore(META).put(value, key));
  else
    try {
      localStorage.setItem(`reguflow-html.${key}`, typeof value === "string" ? value : JSON.stringify(value));
    } catch {}
}

export async function getMeta(key: string): Promise<unknown> {
  if (backend === "indexeddb" && db) return (await req(db.transaction(META, "readonly").objectStore(META).get(key))) ?? null;
  return lsGet(`reguflow-html.${key}`);
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}

export const BACKEND_LABEL: Record<Backend, string> = {
  indexeddb: "이 브라우저 내부 저장소(IndexedDB)",
  localstorage: "이 브라우저 저장공간(localStorage, 약 5MB)",
  memory: "저장 불가 — 창을 닫으면 사라짐",
};
