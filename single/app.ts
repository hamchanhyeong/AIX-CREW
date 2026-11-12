// 제출용 HTML 한 장(index.html) 버전. 화면은 프레임워크 없이 그리고,
// 조문 템플릿·점검·계획 변경·내보내기 로직은 lib/(테스트로 검증된 코드)를 그대로 사용한다.
// 저장: 브라우저 localStorage. AI 호출 없음(데모·템플릿 모드 전용 — API 키를 브라우저에 둘 수 없음).
import { Packer } from "docx";
import { applySuggestion, decideSuggestion, diffConditions, proposeFromPlanDoc, saveChangeSetVersion, startChangeSet, type ProposedCondition } from "../lib/change";
import { computeIssues, ISSUE_LABEL, type Issue, type IssueKind } from "../lib/checks";
import { BASIS_LABEL, buildCompareRows, type CompareBasis } from "../lib/compare";
import { addDoc, buildSampleWorkspace, DEMO_PLAN_V2 } from "../lib/demo";
import { textDiff } from "../lib/diff";
import { generateDraft, templateRewrite } from "../lib/draft";
import { buildEvidenceCsv } from "../lib/export/csv";
import { compareDocument, regulationDocument } from "../lib/export/docx";
import {
  APPLICABILITY_LABEL,
  DEMO_NOTICE,
  DOC_KIND_LABEL,
  PLAN_BASIS_NOTICE,
  REVIEW_LABEL,
  ROLE_LABEL,
  roleForType,
  SOURCE_TYPE_LABEL,
  STRATEGY_LABEL,
  SUGGESTION_STATUS_LABEL,
  TEXT_STATUS_LABEL,
} from "../lib/labels";
import { computeMetrics, STAGES } from "../lib/metrics";
import {
  addClause,
  addNote,
  addRewriteSuggestion,
  addSourceLink,
  applyExtraction,
  createSnapshot,
  currentVersionLabel,
  deleteClause,
  deleteDoc,
  editClause,
  markConditionsReviewed,
  moveClause,
  removeSourceLink,
  renameSection,
  setDocText,
  setReviewStatus,
  updateChunkText,
  updateCondition,
  updateDocMeta,
  updateProgram,
} from "../lib/ops";
import { articleNumbers, orderedClauses, renderConditionInWs, sectionHeading } from "../lib/render";
import { searchChunks } from "../lib/retrieval";
import { validateWorkspace } from "../lib/schema";
import { conditionTitle, emptyWorkspace } from "../lib/structure";
import type { Applicability, ChangeSet, CondStatus, DocKind, ReviewStatus, SourceRole, SourceType, Workspace } from "../lib/types";
import { formatDate } from "../lib/util";

type Kind = "sample" | "main";
const KIND_KEY = "reguflow-html.kind";
const wsKey = (k: Kind) => `reguflow-html.ws.${k}`;

// ───────────────────────── 상태
let kind: Kind = (safeGet(KIND_KEY) as Kind) === "sample" ? "sample" : "main";
let ws: Workspace | null = loadWs(kind);
let saveMsg = ws ? "저장됨" : "";
const ui = {
  selectedDoc: null as string | null,
  addingDoc: false,
  addText: "",
  editDoc: "rule" as DocKind,
  clauseId: null as string | null,
  draft: null as null | { id: string; title: string; body: string },
  showSource: new Set<string>(),
  linking: false,
  linkDoc: "",
  linkQuery: "",
  reviewGroup: "all",
  changeMode: "plan" as "plan" | "direct",
  planId: "",
  direct: {} as Record<string, ProposedCondition>,
  activeCs: "" as string,
  basis: "changeset" as CompareBasis["kind"],
  basisCs: "",
  fromSnap: "",
  toSnap: "current",
  editChunk: null as string | null,
};
let toasts: { id: number; text: string; tone: "ok" | "error" | "info" }[] = [];

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function loadWs(k: Kind): Workspace | null {
  const raw = safeGet(wsKey(k));
  if (!raw) return k === "main" ? emptyWorkspace("main") : null;
  try {
    const v = validateWorkspace(JSON.parse(raw));
    return v.ok ? v.ws : null;
  } catch {
    return null;
  }
}
function persist() {
  if (!ws) return;
  try {
    localStorage.setItem(wsKey(kind), JSON.stringify(ws));
    saveMsg = `저장됨 · ${formatDate(new Date().toISOString())}`;
  } catch {
    saveMsg = "저장 실패(브라우저 저장공간 부족 또는 차단) — 백업 JSON을 내려받아 두세요";
  }
}
function notify(text: string, tone: "ok" | "error" | "info" = "info") {
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, text, tone }].slice(-3);
  renderToasts();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    renderToasts();
  }, tone === "error" ? 6000 : 2500);
}
/** 작업공간 복제 후 변경. 예외가 나면 변경하지 않고 알린다. */
function update<T>(fn: (w: Workspace) => T, ok?: string): T | undefined {
  if (!ws) return undefined;
  const next = structuredClone(ws);
  let r: T;
  try {
    r = fn(next);
  } catch (e) {
    notify(e instanceof Error ? e.message : "처리하지 못했습니다.", "error");
    return undefined;
  }
  ws = next;
  persist();
  render();
  if (ok) notify(ok, "ok");
  return r;
}

// ───────────────────────── 유틸
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const marked = (s: string) =>
  esc(s).replace(/【[^】]*】/g, (m) => `<span class="mark">${m}</span>`);
const badge = (text: string, tone = "gray", title = "") => `<span class="badge b-${tone}"${title ? ` title="${esc(title)}"` : ""}>${esc(text)}</span>`;
const REVIEW_TONE: Record<ReviewStatus, string> = { pending: "gray", needs_fix: "red", approved: "green", needs_rereview: "amber" };
const ROLE_TONE: Record<SourceRole, string> = { legal_candidate: "navy", similar_ref: "purple", plan_reflect: "blue", needs_check: "amber" };
const reviewBadge = (s: ReviewStatus) => badge(REVIEW_LABEL[s], REVIEW_TONE[s]);
const btn = (label: string, act: string, opts: { v?: string; data?: string; disabled?: boolean; title?: string; sm?: boolean } = {}) =>
  `<button class="btn ${opts.v ?? "sec"}${opts.sm ? " sm" : ""}" data-act="${act}" ${opts.data ?? ""} ${opts.disabled ? "disabled" : ""} ${opts.title ? `title="${esc(opts.title)}"` : ""}>${label}</button>`;
function diffHtml(before: string, after: string, side: "before" | "after") {
  return textDiff(before, after)
    .map((p) => {
      if (p.type === "same") return esc(p.value);
      if (side === "before" && p.type === "removed") return `<del>${esc(p.value)}</del>`;
      if (side === "after" && p.type === "added") return `<ins>${esc(p.value)}</ins>`;
      return "";
    })
    .join("");
}
function download(data: Blob | string, name: string, type = "application/octet-stream") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  notify(`내려받았습니다: ${name}`, "ok");
}
const today = () => new Date().toISOString().slice(0, 10);
const prefix = () => (ws?.isDemo ? "[시연용] " : "");

// ───────────────────────── 레이아웃
const NAV: [string, string, string][] = [
  ["", "프로젝트 현황", ""],
  ["sources", "자료 관리", "1"],
  ["conditions", "사업 조건 확인", "2"],
  ["editor", "규정 편집기", "3"],
  ["review", "검토 목록", "4"],
  ["changes", "계획 변경·신구대비표", "5"],
  ["export", "내보내기·백업", "6"],
];
const route = () => location.hash.replace(/^#\/?/, "").split("?")[0];

function render() {
  const r = route();
  const issues = ws ? computeIssues(ws) : [];
  const page =
    !ws ? pageNoWs() :
    r === "sources" ? pageSources() :
    r === "conditions" ? pageConditions() :
    r === "editor" ? pageEditor(issues) :
    r === "review" ? pageReview(issues) :
    r === "changes" ? pageChanges() :
    r === "export" ? pageExport(issues) :
    pageDashboard();
  document.getElementById("app")!.innerHTML = `
  <aside class="side">
    <div class="brand"><small>재기지원 사업</small><b>규정 작성 지원</b><span>HTML 한 장 버전</span></div>
    <nav>${NAV.map(([h, label, step]) => `<a href="#/${h}" class="${route() === h ? "on" : ""}"><i>${step}</i>${label}${h === "review" && issues.length ? `<em>${issues.length}</em>` : ""}</a>`).join("")}</nav>
    <p class="side-foot">모든 결과는 검토용 초안입니다. 기관 승인·법적 적합성을 보장하지 않습니다.</p>
  </aside>
  <div class="main">
    <header class="top">
      <div class="title"><b>${esc(ws?.project.name ?? "작업공간 없음")}</b>${ws ? `<small>버전 ${esc(currentVersionLabel(ws))}</small>` : ""}</div>
      <label class="ws-sel">작업공간 <select data-change="kind"><option value="main" ${kind === "main" ? "selected" : ""}>실제 작업공간</option><option value="sample" ${kind === "sample" ? "selected" : ""}>샘플(시연용 가상 자료)</option></select></label>
      ${badge("데모 모드 · 템플릿 작성", "amber", "AI 분석이 아닌 조문 템플릿과 구조화된 조건으로 작성합니다.")}
      <span class="save ${saveMsg.startsWith("저장 실패") ? "err" : ""}">${esc(saveMsg)}</span>
    </header>
    ${ws?.isDemo ? `<div class="demo-bar">${DEMO_NOTICE} 화면과 내보낸 파일에 같은 표시가 유지됩니다.</div>` : ""}
    <main class="content ${r === "editor" ? "full" : ""}">${page}</main>
  </div>`;
  renderToasts();
}
function renderToasts() {
  const el = document.getElementById("toasts");
  if (el) el.innerHTML = toasts.map((t) => `<div class="toast t-${t.tone}">${esc(t.text)}</div>`).join("");
}
const header = (title: string, desc = "", actions = "") =>
  `<div class="ph"><div><h1>${title}</h1>${desc ? `<p>${desc}</p>` : ""}</div><div class="row">${actions}</div></div>`;
const card = (title: string, body: string, actions = "") =>
  `<section class="card">${title || actions ? `<header><h2>${title}</h2><div class="row">${actions}</div></header>` : ""}<div class="cb">${body}</div></section>`;

function pageNoWs() {
  return `${header("프로젝트 현황")}<div class="empty"><b>샘플 프로젝트가 아직 없습니다</b><p>가상 운영계획과 가상 참고 규정으로 전체 흐름을 시연합니다.</p>${btn("샘플 프로젝트 시작", "start-sample", { v: "pri" })}</div>`;
}

// ───────────────────────── 현황
function pageDashboard() {
  const w = ws!;
  const m = computeMetrics(w);
  const next = [["sources", "자료 등록"], ["conditions", "사업 조건 확인"], ["editor", "초안 작성"], ["review", "검토 계속하기"], ["export", "내보내기"]][m.stage];
  const stat = (label: string, v: number, sub: string, href: string, warn = false) =>
    `<a class="stat ${warn && v > 0 ? "warn" : ""}" href="#/${href}"><small>${label}</small><b>${v}</b><span>${sub}</span></a>`;
  const prog = (dk: DocKind) => {
    const p = m[dk];
    return card(`${DOC_KIND_LABEL[dk]} 초안 1부`, p.total === 0 ? `<p class="muted">아직 조항이 없습니다. 조건 확인 후 편집기에서 초안을 작성하세요.</p>` :
      `<div class="pl"><span>작성</span><span>${p.written}/${p.total}조 · ${p.writtenPct}%</span></div><div class="bar"><i style="width:${p.writtenPct}%"></i></div>
       <div class="pl"><span>검토 완료</span><span>${p.approved}/${p.total}조 · ${p.approvedPct}%</span></div><div class="bar g"><i style="width:${p.approvedPct}%"></i></div>`,
      `<a class="link" href="#/editor" data-act="open-doc" data-doc="${dk}">편집기 열기 →</a>`);
  };
  return `${header("프로젝트 현황", "자료 입력 → 조건 확인 → 근거 연결 → 조문 초안 작성 → 검수 → 변경 반영 → 다운로드",
    `${btn(kind === "sample" ? "샘플 프로젝트 다시 시작" : "샘플 프로젝트 시작", "start-sample", { v: "sub" })}${kind === "sample" ? btn("실제 작업공간으로", "to-main", { v: "ghost" }) : ""}`)}
  ${card("", `<div class="split"><div><small class="muted">현재 작업 단계</small><ol class="stages">${STAGES.map((s, i) => `<li class="${i < m.stage ? "done" : i === m.stage ? "now" : ""}">${i + 1}. ${s}</li>`).join("")}</ol><small class="muted">최근 수정 ${formatDate(w.project.updatedAt)}</small></div>
    <div class="row"><a class="btn sec" href="#/sources">자료 등록</a><a class="btn sec" href="#/editor">초안 작성</a><a class="btn sec" href="#/review">검토 계속하기</a><a class="btn pri" href="#/${next[0]}">다음 단계: ${next[1]}</a></div></div>`)}
  <div class="stats">${stat("등록 자료", m.docCount, `원문 등록 ${m.registeredDocCount}건 · 미등록 ${m.docCount - m.registeredDocCount}건`, "sources")}${stat("근거 미확인 조항", m.unverifiedClauses, "원문 미등록·근거 미연결", "review", true)}${stat("미확정 사업 조건", m.unconfirmedConditions, `전체 ${m.totalConditions}개 조건 중`, "conditions", true)}${stat("검토 목록", m.issueCount, `결정 대기 제안 ${m.pendingSuggestions}건`, "review", true)}</div>
  <div class="g2">${prog("rule")}${prog("manual")}</div>
  ${card("세부사업 구성과 작성 전략", `<div class="g3">${w.programs.map((p) => `<div class="box"><div class="split"><b>${esc(p.name)}</b>${p.confirmedByAgency ? badge("기관 확인", "green") : badge("기관 확인 전", "amber")}</div><div class="strat">${STRATEGY_LABEL[p.strategy]}</div><small class="muted">${esc(p.strategyNote)}</small></div>`).join("")}</div><p class="muted sm">운영규칙은 3개 세부사업 공통 1부, 운영요령은 공통편과 사업별 3개 편으로 구성된 1부입니다(기획안 기준 초기 목차, 편집 가능).</p>`, badge(PLAN_BASIS_NOTICE, "amber"))}
  <div class="notice gray">HTML 한 장 버전: 데이터는 이 브라우저(localStorage)에만 저장됩니다. 다른 PC로 옮기거나 브라우저 데이터를 지우기 전에 ‘작업 백업.json’을 받아 두세요. AI 작성 제안과 PDF·DOCX 원문 추출은 이 버전의 범위 밖입니다.</div>`;
}

// ───────────────────────── 자료
const TYPES: SourceType[] = ["plan", "law", "guideline", "similar", "background"];
function pageSources() {
  const w = ws!;
  const docs = TYPES.flatMap((t) => w.docs.filter((d) => d.type === t));
  const list = docs.length
    ? `<table class="tbl"><thead><tr><th>문서명</th><th>유형</th><th>버전</th><th>원문</th><th>적용 여부</th></tr></thead><tbody>${docs.map((d) => `<tr class="click ${ui.selectedDoc === d.id ? "sel" : ""}" data-act="sel-doc" data-id="${d.id}"><td><b class="navy">${esc(d.title)}</b><div class="row tight">${d.isDemo ? badge("시연용 가상", "amber") : ""}${!d.isPublic ? badge("비공개") : ""}</div></td><td>${SOURCE_TYPE_LABEL[d.type]}</td><td class="muted">${esc(d.version || "-")}</td><td>${badge(TEXT_STATUS_LABEL[d.textStatus], d.textStatus === "registered" ? "green" : "amber")}</td><td>${badge(APPLICABILITY_LABEL[d.applicability], d.applicability === "applicable" ? "green" : d.applicability === "unchecked" ? "amber" : "gray")}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty"><b>등록된 자료가 없습니다</b><p>운영계획(안)부터 등록하면 사업 조건을 추출할 수 있습니다.</p></div>`;
  const sel = w.docs.find((d) => d.id === ui.selectedDoc);
  return `${header("자료 관리", "운영계획(안), 법령·시행령, 지침, 유사사업 규정, 배경자료를 구분해 등록하고 원문을 확인·수정합니다.")}
  <div class="g-side">${card(`등록 자료 ${docs.length}건`, list, btn("자료 등록", "add-doc", { v: "pri", sm: true }))}<div>${ui.addingDoc ? addDocForm() : sel ? docDetail(sel.id) : `<div class="empty"><b>자료를 선택하세요</b><p>목록에서 자료를 선택하면 원문 조각과 정보를 확인·수정할 수 있습니다.</p></div>`}</div></div>`;
}
function metaFields(prefix: string, v: { title: string; type: SourceType; version: string; effectiveDate: string; url: string; isPublic: boolean; applicability: Applicability }) {
  return `<div class="form">
  <label class="span2">문서명<input id="${prefix}title" value="${esc(v.title)}"></label>
  <label>자료 유형<select id="${prefix}type">${TYPES.map((t) => `<option value="${t}" ${v.type === t ? "selected" : ""}>${SOURCE_TYPE_LABEL[t]}</option>`).join("")}</select></label>
  <label>적용 여부<select id="${prefix}app">${(Object.keys(APPLICABILITY_LABEL) as Applicability[]).map((a) => `<option value="${a}" ${v.applicability === a ? "selected" : ""}>${APPLICABILITY_LABEL[a]}</option>`).join("")}</select></label>
  <label>버전<input id="${prefix}version" value="${esc(v.version)}" placeholder="예: 2026.4.23 시행본"></label>
  <label>기준일·시행일<input id="${prefix}date" type="date" value="${esc(v.effectiveDate)}"></label>
  <label class="span2">출처 URL(선택)<input id="${prefix}url" value="${esc(v.url)}" placeholder="https://"></label>
  <label class="chk"><input id="${prefix}public" type="checkbox" ${v.isPublic ? "checked" : ""}> 공개 자료</label></div>
  <p class="muted sm">유사사업 규정은 ‘유사사업 참고’로만, 배경자료는 근거로 연결하지 않습니다.</p>`;
}
const readMeta = (p: string) => ({
  title: (document.getElementById(`${p}title`) as HTMLInputElement).value.trim(),
  type: (document.getElementById(`${p}type`) as HTMLSelectElement).value as SourceType,
  applicability: (document.getElementById(`${p}app`) as HTMLSelectElement).value as Applicability,
  version: (document.getElementById(`${p}version`) as HTMLInputElement).value,
  effectiveDate: (document.getElementById(`${p}date`) as HTMLInputElement).value,
  url: (document.getElementById(`${p}url`) as HTMLInputElement).value,
  isPublic: (document.getElementById(`${p}public`) as HTMLInputElement).checked,
});
function addDocForm() {
  return card("자료 등록", `${metaFields("n-", { title: "", type: "plan", version: "", effectiveDate: "", url: "", isPublic: false, applicability: "unchecked" })}
  <div class="supp">${badge("지원: TXT 파일 · 원문 붙여넣기", "green")} ${badge("PDF·DOCX는 텍스트를 복사해 붙여넣기", "gray")} ${badge("HWP·OCR 미지원", "gray")}</div>
  <label class="blk">TXT 파일 불러오기 <input type="file" accept=".txt,.md" data-change="txt-file"></label>
  <label class="blk">원문(줄 단위로 원문 조각이 만들어집니다. 운영계획은 ‘- 지원 한도: 1억원’ 형식이면 조건을 추출합니다)<textarea id="n-text" rows="10">${esc(ui.addText)}</textarea></label>
  <div class="row">${btn("원문과 함께 등록", "save-doc", { v: "pri" })}${btn("목록만 등록(원문 미등록)", "save-doc-empty")}</div>`, btn("닫기", "close-add", { v: "ghost", sm: true }));
}
function docDetail(id: string) {
  const w = ws!;
  const d = w.docs.find((x) => x.id === id)!;
  const chunks = w.chunks.filter((c) => c.docId === id).sort((a, b) => a.seq - b.seq);
  const linked = w.clauses.filter((c) => c.sources.some((s) => s.docId === id)).length;
  const extract = d.type === "plan" && d.textStatus === "registered"
    ? w.clauses.length === 0 ? `<div class="row">${btn("이 계획안에서 사업 조건 추출", "extract", { v: "sub", data: `data-id="${id}"` })}<small class="muted">규칙 기반 추출(‘항목: 값’ 형식), 추출 값은 모두 ‘미확정’</small></div>` : `<a class="btn sub" href="#/changes">계획 변경 화면에서 이전 조건과 비교</a>`
    : "";
  return `${card(esc(d.title), `<div class="row tight muted sm">${badge(TEXT_STATUS_LABEL[d.textStatus], d.textStatus === "registered" ? "green" : "amber")} 원문 버전 ${d.textVersion} · 연결 조항 ${linked}개</div>
    ${metaFields("e-", d)}
    ${d.type === "similar" ? `<div class="notice blue">유사사업 규정은 참고 자료이며 이번 사업의 현행 규정·의무 기준이 아닙니다.</div>` : ""}
    ${d.type === "background" ? `<div class="notice gray">배경자료는 조항의 법적 근거로 연결되지 않습니다.</div>` : ""}${extract}`,
    `${btn("정보 저장", "save-meta", { v: "pri", sm: true, data: `data-id="${id}"` })}${btn("삭제", "del-doc", { v: "danger", sm: true, data: `data-id="${id}"` })}`)}
  ${card(`원문 조각 ${chunks.length}개`, chunks.length ? `<ol class="chunks">${chunks.map((c) => `<li><div class="split"><small class="loc">${esc(c.locator)}</small>${ui.editChunk === c.id ? "" : `<button class="lnk" data-act="edit-chunk" data-id="${c.id}">수정</button>`}</div>${ui.editChunk === c.id ? `<textarea id="chunk-text" rows="3">${esc(c.text)}</textarea><div class="row">${btn("저장", "save-chunk", { v: "pri", sm: true, data: `data-id="${c.id}"` })}${btn("취소", "cancel-chunk", { v: "ghost", sm: true })}</div>` : `<p>${esc(c.text)}</p>`}</li>`).join("")}</ol>` :
    `<p class="muted">원문이 등록되지 않았습니다. 아래에 붙여넣어 등록하면 이 자료를 근거로 확인할 수 있습니다.</p><textarea id="reg-text" rows="6"></textarea>${btn("원문 등록", "reg-text", { v: "pri", data: `data-id="${id}"` })}`)}`;
}

// ───────────────────────── 조건
function pageConditions() {
  const w = ws!;
  const locked = w.clauses.length > 0;
  const unconfirmed = w.conditions.filter((c) => c.status !== "confirmed" || !c.value.trim()).length;
  const groups: [string | null, string][] = [[null, "공통"], ...w.programs.map((p) => [p.id, p.name] as [string, string])];
  const top = locked
    ? `<div class="notice blue">초안이 작성된 뒤에는 조건 값을 여기서 바꾸지 않습니다. <a href="#/changes">계획 변경</a>에서 이전 조건과 비교하고 연결된 조항에만 수정 제안을 만듭니다.</div>`
    : card("", `<div class="split"><div>미확정·빈 조건 <b class="warn-t">${unconfirmed}</b>개<br><small class="muted">${w.project.conditionsReviewedAt ? `조건 확인 완료: ${formatDate(w.project.conditionsReviewedAt)}` : "초안 작성 전에 조건을 확인해야 합니다. 미확정 값은 초안에 【미확정】·【확인 필요】로 표시됩니다."}</small></div><div class="row">${btn("조건 확인 완료", "conds-done", { v: "pri" })}${w.project.conditionsReviewedAt ? `<a class="btn sec" href="#/editor">초안 작성으로 이동</a>` : ""}</div></div>`);
  return `${header("사업 조건 확인", "운영계획(안)에서 추출하거나 직접 입력한 조건을 확인합니다. 확인되지 않은 값은 비워 두며 초안에 【확인 필요】로 남습니다.")}${top}
  ${card("세부사업 구성", `<div class="g3">${w.programs.map((p) => `<div class="box"><input data-change="prog-name" data-id="${p.id}" value="${esc(p.name)}"><div class="strat">${STRATEGY_LABEL[p.strategy]}</div><label class="chk sm"><input type="checkbox" data-change="prog-ok" data-id="${p.id}" ${p.confirmedByAgency ? "checked" : ""}> 기관에서 사업명·구성 확인</label></div>`).join("")}</div>`, badge(PLAN_BASIS_NOTICE, "amber"))}
  ${groups.map(([gid, name]) => card(`${esc(name)} 조건`, `<table class="tbl"><thead><tr><th style="width:160px">항목</th><th>값</th><th style="width:110px">상태</th><th style="width:240px">원문 위치</th><th style="width:70px">확인</th></tr></thead><tbody>${w.conditions.filter((c) => c.programId === gid).map((c) => {
    const ch = c.sourceChunkId ? w.chunks.find((x) => x.id === c.sourceChunkId) : undefined;
    const doc = ch ? w.docs.find((d) => d.id === ch.docId) : undefined;
    return `<tr><td><b>${esc(c.label)}</b>${locked ? `<br><small class="muted">연결 조항 ${w.clauses.filter((x) => x.conditionIds.includes(c.id)).length}개</small>` : ""}</td>
      <td>${locked ? (c.value ? esc(c.value) : `<span class="mark">비어 있음 — 확인 필요</span>`) : `<input class="${c.value ? "" : "empty-in"}" data-change="cond-val" data-id="${c.id}" value="${esc(c.value)}" placeholder="확인되지 않음(비워 두기)">`}</td>
      <td>${locked ? badge(c.status === "confirmed" && c.value ? "확정" : "미확정", c.status === "confirmed" && c.value ? "green" : "amber") : `<select data-change="cond-status" data-id="${c.id}"><option value="unconfirmed" ${c.status === "unconfirmed" ? "selected" : ""}>미확정</option><option value="confirmed" ${c.status === "confirmed" ? "selected" : ""} ${c.value.trim() ? "" : "disabled"}>확정</option></select>`}</td>
      <td class="muted sm">${ch && doc ? `${esc(doc.title)} (${esc(doc.version)}) · ${esc(ch.locator)}<br><span class="quote">${esc(ch.text)}</span>` : esc(c.locator ?? "직접 입력 또는 원문 없음")}</td>
      <td class="c"><input type="checkbox" data-change="cond-check" data-id="${c.id}" ${c.userChecked ? "checked" : ""} ${locked ? "disabled" : ""}></td></tr>`;
  }).join("")}</tbody></table>`)).join("")}`;
}

// ───────────────────────── 편집기
function pageEditor(issues: Issue[]) {
  const w = ws!;
  if (!w.clauses.length) {
    const reviewed = !!w.project.conditionsReviewedAt;
    return `<div class="narrow">${header("규정 편집기", "운영규칙 1부(8개 장)와 운영요령 1부(공통편 + 사업별 3개 편)의 초안을 만들고 조항별로 검수합니다.")}
    ${card("초안 작성", `${reviewed ? `<div class="notice blue">조건 확인 완료 · 미확정·빈 조건은 임의로 채우지 않고 【미확정】·【확인 필요】로 표시합니다.</div>` : `<div class="notice">초안 작성 전에 <a href="#/conditions">사업 조건 확인</a>을 먼저 완료하세요.</div>`}
    <ul class="ul"><li>조문 템플릿과 확인된 사업 조건으로 작성합니다. <b>AI 분석 결과가 아닙니다.</b></li><li>등록된 원문에서 키워드로 찾은 조각만 근거로 연결하고, 원문이 없으면 ‘원문 미등록’·‘근거 확인 필요’로 남깁니다.</li><li>법령 조문 번호는 원문 없이 만들지 않습니다.</li></ul>
    ${btn("운영규칙·요령 초안 작성", "gen-draft", { v: "pri", disabled: !reviewed })}`)}</div>`;
  }
  const dk = ui.editDoc;
  const clauses = orderedClauses(w, dk);
  if (!ui.clauseId || !clauses.some((c) => c.id === ui.clauseId)) ui.clauseId = clauses[0]?.id ?? null;
  const nums = articleNumbers(w, dk);
  const sections = w.sections.filter((s) => s.docKind === dk).sort((a, b) => a.order - b.order);
  const toc = sections.map((s) => {
    const prog = s.programId ? w.programs.find((p) => p.id === s.programId) : undefined;
    return `<div class="sec"><div class="sec-h"><b>${esc(sectionHeading(dk, s.order, s.title))}</b><button class="lnk" data-act="rename-sec" data-id="${s.id}" title="이름 바꾸기">✎</button></div>${prog ? `<small class="strat">${STRATEGY_LABEL[prog.strategy]}</small>` : ""}${s.planNote ? `<small class="plan-note">${esc(s.planNote)}</small>` : ""}
    <ul>${clauses.filter((c) => c.sectionId === s.id).map((c) => {
      const n = issues.filter((i) => i.clauseId === c.id && i.kind !== "unreviewed").length;
      return `<li><button class="toc ${ui.clauseId === c.id ? "on" : ""}" data-act="sel-clause" data-id="${c.id}"><i class="dot d-${c.reviewStatus}"></i><span>제${nums.get(c.id)}조(${esc(c.title)})</span>${n ? `<em>${n}</em>` : ""}</button></li>`;
    }).join("")}<li><button class="lnk add" data-act="add-clause" data-sec="${s.id}">+ 조항 추가</button></li></ul></div>`;
  }).join("");
  const c = w.clauses.find((x) => x.id === ui.clauseId);
  return `<div class="editor">
    <aside class="ed-toc"><div class="seg">${(["rule", "manual"] as DocKind[]).map((d) => `<button class="${dk === d ? "on" : ""}" data-act="ed-doc" data-doc="${d}">${DOC_KIND_LABEL[d]}</button>`).join("")}</div><div class="toc-list">${toc}</div><small class="muted toc-foot">조문 번호는 순서로 자동 계산되며 조항 ID는 순서가 바뀌어도 유지됩니다. 목차는 기획안 기준 초기 구성입니다.</small></aside>
    <div class="ed-main">${c ? clausePanel(c.id, nums.get(c.id)) : `<div class="empty"><b>조항이 없습니다</b></div>`}</div>
    <aside class="ed-ev">${c ? evidencePanel(c.id, issues.filter((i) => i.clauseId === c.id)) : ""}</aside>
  </div>`;
}
function clausePanel(id: string, no?: number) {
  const w = ws!;
  const c = w.clauses.find((x) => x.id === id)!;
  if (!ui.draft || ui.draft.id !== id) ui.draft = { id, title: c.title, body: c.body };
  const d = ui.draft;
  const dirty = d.title !== c.title || d.body !== c.body;
  const sec = w.sections.find((s) => s.id === c.sectionId);
  const sugs = w.suggestions.filter((s) => s.clauseId === id && (s.status === "pending" || s.status === "held"));
  return `<div class="split top-al"><div><small class="muted">${DOC_KIND_LABEL[c.docKind]} · ${sec ? esc(sectionHeading(c.docKind, sec.order, sec.title)) : ""}</small><h1 class="ct">제${no ?? "?"}조(${esc(c.title)})</h1>
    <div class="row tight">${badge(c.origin === "template" ? "템플릿 작성(데모)" : c.origin === "ai" ? "AI 제안 반영" : "담당자 작성", c.origin === "user" ? "gray" : "blue")}${c.userEdited && c.origin !== "user" ? badge("담당자 수정") : ""}<small class="muted">ID ${c.id}</small></div></div>
    <div><div class="seg rv">${(["pending", "needs_fix", "approved"] as ReviewStatus[]).map((s) => `<button class="${c.reviewStatus === s ? `on r-${s}` : ""}" data-act="review" data-s="${s}" ${dirty && s === "approved" ? "disabled title=\"저장 후 검토 완료 처리할 수 있습니다\"" : ""}>${REVIEW_LABEL[s]}</button>`).join("")}</div>${c.reviewStatus === "needs_rereview" ? badge("재검토 필요 — 다시 확인 후 ‘검토 완료’", "amber") : ""}</div></div>
  <section class="card"><div class="cb">
    <label class="blk">조 제목<input id="cl-title" value="${esc(d.title)}"></label>
    <label class="blk">본문 <small class="muted">【확인 필요】·【미확정】 표시는 값이 확정될 때까지 그대로 둡니다</small><textarea id="cl-body" rows="${Math.max(8, d.body.split("\n").length + 2)}">${esc(d.body)}</textarea></label>
    <div class="preview">${marked(d.body)}</div>
    <div class="row">${btn("저장", "save-clause", { v: "pri", disabled: !dirty })}${btn("되돌리기", "revert-clause", { v: "ghost", disabled: !dirty })}<span id="dirty" class="warn-t sm">${dirty ? "저장하지 않은 수정 내용이 있습니다" : ""}</span><span class="grow"></span>${btn("↑ 위로", "move-up", { v: "ghost", sm: true })}${btn("↓ 아래로", "move-down", { v: "ghost", sm: true })}${btn("삭제", "del-clause", { v: "danger", sm: true })}</div>
  </div></section>
  ${card("이 조항만 다시 작성 제안", `<div class="row">${btn("템플릿 재작성 제안", "tpl-suggest", { v: "sub", disabled: !c.templateKey })}${btn("AI 작성 제안", "noop", { v: "sub", disabled: true })}<small class="muted">HTML 한 장 버전은 AI를 호출하지 않습니다(API 키를 브라우저에 둘 수 없음). 제안은 바로 적용되지 않습니다.</small></div>`)}
  ${sugs.map((s) => {
    const stale = s.before !== c.body || s.beforeTitle !== c.title;
    return `<section class="card sug ${s.status}"><div class="cb"><div class="row tight">${badge(s.kind === "plan_change" ? "계획 변경 수정안" : "템플릿 재작성 제안", "blue")}${badge("[수정]", "blue")}${s.status === "held" ? badge("보류 중") : ""}<small class="muted">${esc(s.reason)}</small></div>
    ${s.warnings.map((x) => `<div class="notice">${esc(x)}</div>`).join("")}${stale ? `<div class="notice red">제안 생성 이후 조항이 수정되어 적용할 수 없습니다(담당자 수정본 보존).</div>` : ""}
    <div class="g2"><div class="dbox"><small>현재 본문</small><div class="pre">${diffHtml(s.before, s.after, "before")}</div></div><div class="dbox add"><small>제안</small><div class="pre">${s.manualOnly ? "자동 수정안 없음 — 직접 수정하세요." : diffHtml(s.before, s.after, "after")}</div></div></div>
    <div class="row">${btn("반영", "sug-apply", { v: "pri", sm: true, data: `data-id="${s.id}"`, disabled: stale || s.manualOnly })}${s.status !== "held" ? btn("보류", "sug-hold", { sm: true, data: `data-id="${s.id}"` }) : ""}${btn("반영 안 함", "sug-reject", { v: "ghost", sm: true, data: `data-id="${s.id}"` })}</div></div></section>`;
  }).join("")}
  ${card("연결된 운영계획 조건", `<p class="muted sm">계획 변경 시 이 연결이 있는 조항만 수정 제안 대상이 됩니다(같은 숫자가 있어도 연결이 없으면 바꾸지 않음).</p><div class="row tight">${c.conditionIds.length ? c.conditionIds.map((cid) => {
    const x = w.conditions.find((y) => y.id === cid);
    return x ? `<span class="chip ${x.status === "confirmed" && x.value ? "" : "chip-w"}"><b>${esc(conditionTitle(w, x))}</b>: ${esc(renderConditionInWs(w, x))}</span>` : "";
  }).join("") : `<small class="muted">연결된 조건 없음</small>`}</div>`)}
  ${card("검토 메모", `<ul class="notes">${c.notes.length ? c.notes.map((n) => `<li class="${n.kind}"><small>${formatDate(n.createdAt)} · ${n.kind === "system" ? "시스템" : "담당자"}</small> ${esc(n.text)}</li>`).join("") : `<li class="muted">메모가 없습니다.</li>`}</ul><div class="row"><input id="memo" placeholder="검토 의견을 남기세요">${btn("메모 추가", "add-memo")}</div>`)}`;
}
const ROLE_ORDER: SourceRole[] = ["legal_candidate", "plan_reflect", "similar_ref", "needs_check"];
const ROLE_HELP: Record<SourceRole, string> = {
  legal_candidate: "법령·지침 원문 중 키워드로 찾은 후보입니다. 적용 여부는 담당자가 확인합니다.",
  similar_ref: "유사사업 규정 — 참고용이며 이번 사업의 의무 기준이 아닙니다.",
  plan_reflect: "운영계획(안) 조건이 이 조항에 반영되었습니다.",
  needs_check: "연결 가능한 근거 원문이 없는 작성 제안 문구입니다.",
};
function evidencePanel(id: string, issues: Issue[]) {
  const w = ws!;
  const c = w.clauses.find((x) => x.id === id)!;
  const linkable = w.docs.filter((d) => roleForType(d.type) && d.textStatus === "registered");
  if (!ui.linkDoc || !linkable.some((d) => d.id === ui.linkDoc)) ui.linkDoc = linkable[0]?.id ?? "";
  const hits = ui.linking && ui.linkDoc ? (ui.linkQuery.trim() ? searchChunks(w, ui.linkQuery, { docIds: [ui.linkDoc], limit: 10 }).map((h) => h.chunk) : w.chunks.filter((x) => x.docId === ui.linkDoc).slice(0, 20)) : [];
  return `<div class="split"><h2>근거</h2>${btn(ui.linking ? "닫기" : "+ 근거 연결", "toggle-link", { v: "sub", sm: true })}</div>
  ${ui.linking ? `<div class="linkbox"><select data-change="link-doc">${linkable.map((d) => `<option value="${d.id}" ${ui.linkDoc === d.id ? "selected" : ""}>[${SOURCE_TYPE_LABEL[d.type]}] ${esc(d.title)}</option>`).join("")}</select><input id="link-q" placeholder="원문 검색 후 Enter" value="${esc(ui.linkQuery)}"><small class="muted">배경자료와 원문 미등록 자료는 연결할 수 없습니다.</small><ul>${hits.map((h) => `<li><button class="hit" data-act="link-chunk" data-id="${h.id}"><b>${esc(h.locator)}</b> ${esc(h.text)}</button></li>`).join("") || `<li class="muted sm">검색 결과가 없습니다.</li>`}</ul></div>` : ""}
  ${ROLE_ORDER.map((role) => {
    const list = c.sources.filter((s) => s.role === role);
    if (!list.length) return "";
    return `<div class="role">${badge(ROLE_LABEL[role], ROLE_TONE[role])} <small class="muted">${list.length}건</small><p class="muted xs">${ROLE_HELP[role]}</p>${list.map((s) => {
      const doc = s.docId ? w.docs.find((d) => d.id === s.docId) : undefined;
      const ch = s.chunkId ? w.chunks.find((x) => x.id === s.chunkId) : undefined;
      const open = ui.showSource.has(s.id);
      return `<div class="src"><div class="split"><b class="navy">${doc ? esc(doc.title) : s.docId ? "삭제된 자료" : "근거 확인 필요"}</b>${s.role !== "needs_check" ? `<button class="lnk" data-act="unlink" data-id="${s.id}">해제</button>` : ""}</div>
      ${doc ? `<small class="muted">${SOURCE_TYPE_LABEL[doc.type]} · ${esc(doc.version || "버전 미기재")} · 원문 v${doc.textVersion} ${badge(TEXT_STATUS_LABEL[doc.textStatus], doc.textStatus === "registered" ? "green" : "amber")}</small>` : ""}
      ${ch ? `<div class="loc">위치: ${esc(ch.locator)}</div>${s.quote ? `<blockquote>${esc(s.quote)}</blockquote>` : ""}<button class="lnk" data-act="toggle-src" data-id="${s.id}">${open ? "원문 닫기" : "원문 보기"}</button>${open ? `<div class="raw">${esc(ch.text)}</div>` : ""}` : s.chunkId ? `<p class="err-t sm">연결된 원문 조각이 없습니다(원문이 다시 등록됨).</p>` : `<p class="warn-t sm">${esc(s.note ?? "원문이 등록되지 않았습니다.")}</p>`}</div>`;
    }).join("")}</div>`;
  }).join("")}
  <h2 class="mt">검토사항</h2><small class="muted">프로그램 점검 ${issues.length}건</small>
  <ul class="iss">${issues.length ? issues.map((i) => `<li class="sev-${i.severity}"><b>${ISSUE_LABEL[i.kind]}</b> · ${esc(i.message)}</li>`).join("") : `<li class="muted">점검에서 발견된 문제가 없습니다.</li>`}</ul>
  <small class="muted">AI 제안 검토사항: 없음(데모 모드는 AI를 사용하지 않습니다)</small>`;
}

// ───────────────────────── 검토 목록
const GROUPS: { key: string; label: string; kinds: IssueKind[] }[] = [
  { key: "evidence", label: "근거", kinds: ["source_missing", "no_evidence", "quote_mismatch"] },
  { key: "condition", label: "운영계획 조건", kinds: ["unconfirmed_condition", "value_mismatch"] },
  { key: "structure", label: "조항 번호·참조", kinds: ["numbering", "broken_ref"] },
  { key: "review", label: "검토 상태", kinds: ["unreviewed", "needs_fix", "rereview"] },
];
function pageReview(issues: Issue[]) {
  const w = ws!;
  if (!w.clauses.length) return `${header("검토 목록")}<div class="empty"><b>아직 초안이 없습니다</b></div>`;
  const nums = { rule: articleNumbers(w, "rule"), manual: articleNumbers(w, "manual") };
  const label = (cid?: string) => {
    const c = w.clauses.find((x) => x.id === cid);
    return c ? `${DOC_KIND_LABEL[c.docKind]} 제${nums[c.docKind].get(c.id)}조(${esc(c.title)})` : "-";
  };
  const g = GROUPS.find((x) => x.key === ui.reviewGroup);
  const rank = { high: 0, medium: 1, low: 2 };
  const shown = issues.filter((i) => !g || g.kinds.includes(i.kind)).sort((a, b) => rank[a.severity] - rank[b.severity]);
  const pending = w.suggestions.filter((s) => s.status === "pending" || s.status === "held");
  return `${header("검토 목록", "프로그램으로 확인한 문제와 AI가 제안한 검토사항을 구분해 보여줍니다. 항목을 누르면 해당 조항으로 이동합니다.")}
  <div class="row chips">${[{ key: "all", label: "전체", kinds: [] as IssueKind[] }, ...GROUPS].map((x) => `<button class="pill ${ui.reviewGroup === x.key ? "on" : ""}" data-act="rv-group" data-k="${x.key}">${x.label} <b>${x.key === "all" ? issues.length : issues.filter((i) => x.kinds.includes(i.kind)).length}</b></button>`).join("")}</div>
  <div class="g-side r">${card(`프로그램 점검 결과 ${badge("규칙으로 확인", "navy")}`, shown.length ? `<ul class="ilist">${shown.map((i) => {
    const c = w.clauses.find((x) => x.id === i.clauseId);
    return `<li><button data-act="goto-clause" data-id="${i.clauseId ?? ""}"><i class="sv sv-${i.severity}"></i><div><div class="row tight">${badge(ISSUE_LABEL[i.kind], i.severity === "high" ? "red" : i.severity === "medium" ? "amber" : "gray")}<b class="navy">${label(i.clauseId)}</b>${c ? reviewBadge(c.reviewStatus) : ""}</div><p>${esc(i.message)}</p></div><span class="link">이동 →</span></button></li>`;
  }).join("")}</ul>` : `<p class="muted">해당하는 문제가 없습니다.</p>`)}
  <div>${card(`AI 제안 검토사항 ${badge("AI 제안", "purple")}`, `<p class="muted">데모 모드에서는 AI를 사용하지 않습니다.</p>`)}${card(`결정 대기·보류 제안 ${pending.length}건`, pending.length ? `<ul class="ul">${pending.map((s) => `<li><button class="lnk" data-act="goto-clause" data-id="${s.clauseId}">${badge(s.status === "held" ? "보류" : "대기", s.status === "held" ? "gray" : "blue")} ${label(s.clauseId)}</button></li>`).join("")}</ul>` : `<p class="muted">없음</p>`)}</div></div>`;
}

// ───────────────────────── 계획 변경
function pageChanges() {
  const w = ws!;
  if (!w.clauses.length) return `${header("계획 변경·신구대비표")}<div class="empty"><b>초안이 없습니다</b><p>계획 변경 비교는 초안이 있어야 합니다. 초안 작성 전에는 사업 조건 화면에서 값을 직접 고치세요.</p></div>`;
  const plans = w.docs.filter((d) => d.type === "plan" && d.textStatus === "registered");
  if (!ui.planId || !plans.some((p) => p.id === ui.planId)) ui.planId = plans[plans.length - 1]?.id ?? "";
  const proposal = ui.changeMode === "plan" && ui.planId ? proposeFromPlanDoc(w, ui.planId) : null;
  const diffs = ui.changeMode === "plan" ? (proposal ? diffConditions(w, proposal.proposed) : []) : diffConditions(w, ui.direct);
  const affected = w.clauses.filter((c) => c.conditionIds.some((id) => diffs.some((d) => d.conditionId === id))).length;
  const linked = w.conditions.filter((c) => w.clauses.some((x) => x.conditionIds.includes(c.id)));
  const input = ui.changeMode === "plan"
    ? `<div class="row"><label class="grow">비교할 운영계획(안)<select data-change="plan-id">${plans.map((d) => `<option value="${d.id}" ${ui.planId === d.id ? "selected" : ""}>${esc(d.title)} (${esc(d.version || "버전 미기재")})</option>`).join("")}</select></label>${w.isDemo && !w.docs.some((d) => d.version === "가상 v2") ? btn("가상 계획 v2 등록(시연용: 한도 1억→1.5억원)", "add-v2", { v: "sub" }) : ""}<a class="btn ghost" href="#/sources">새 계획(안) 등록</a></div>${proposal ? `<small class="muted">${proposal.method}. 새 계획에서 찾지 못한 기존 조건 ${proposal.notFound.length}개는 바꾸지 않습니다.</small>` : ""}`
    : `<div class="scroll"><table class="tbl"><thead><tr><th>조건</th><th>현재 값</th><th>새 값</th><th>새 상태</th></tr></thead><tbody>${linked.map((c) => {
        const cur = ui.direct[c.id];
        return `<tr><td><b>${esc(conditionTitle(w, c))}</b></td><td class="muted">${esc(c.value) || `<span class="mark">비어 있음</span>`}</td><td><input data-change="direct-val" data-id="${c.id}" value="${esc(cur?.value ?? c.value)}"></td><td><select data-change="direct-st" data-id="${c.id}"><option value="unconfirmed" ${(cur?.status ?? c.status) === "unconfirmed" ? "selected" : ""}>미확정</option><option value="confirmed" ${(cur?.status ?? c.status) === "confirmed" ? "selected" : ""}>확정</option></select></td></tr>`;
      }).join("")}</tbody></table></div>`;
  const diffTbl = diffs.length
    ? `<table class="tbl"><thead><tr><th>조건</th><th>이전</th><th>신규</th><th>원문 위치</th><th>연결 조항</th></tr></thead><tbody>${diffs.map((d) => `<tr><td><b>${esc(d.label)}</b></td><td><del>${esc(d.beforeValue || "(빈 값)")}</del> <small class="muted">${d.beforeStatus === "confirmed" ? "확정" : "미확정"}</small></td><td><ins>${esc(d.afterValue || "(빈 값)")}</ins> <small class="muted">${d.afterStatus === "confirmed" ? "확정" : "미확정"}</small></td><td class="muted sm">${esc(d.afterLocator ?? "-")}</td><td>${w.clauses.filter((c) => c.conditionIds.includes(d.conditionId)).length}개</td></tr>`).join("")}</tbody></table>
       <div class="row">${btn("② 연결 조항 찾기 · ③ 수정안 생성", "start-cs", { v: "pri" })}<small class="muted">조건과 연결된 조항 ${affected}개만 대상입니다. 변경 전 상태는 자동으로 버전 저장되며, 새 값은 ‘미확정’으로 들어옵니다.</small></div>`
    : `<p class="muted">현재 조건과 달라진 값이 없습니다.</p>`;
  if (!ui.activeCs || !w.changeSets.some((c) => c.id === ui.activeCs)) ui.activeCs = w.changeSets[w.changeSets.length - 1]?.id ?? "";
  const cs = w.changeSets.find((c) => c.id === ui.activeCs);
  return `${header("계획 변경·신구대비표", "① 이전·신규 계획 조건 비교 → ② 연결된 조항 찾기 → ③ 수정안 생성 → ④ 변경 전·후 비교 → ⑤ 개별 반영·보류 → ⑥ 새 버전 저장")}
  ${card("새 계획 반영 · 조건 비교", `<div class="seg wide">${btn("새 운영계획(안)과 비교", "cmode", { v: ui.changeMode === "plan" ? "pri" : "sec", data: 'data-m="plan"' })}${btn("주요 조건 직접 변경", "cmode", { v: ui.changeMode === "direct" ? "pri" : "sec", data: 'data-m="direct"' })}</div>${input}<h3>① 조건 비교 결과 — 바뀐 조건 ${diffs.length}개</h3>${diffTbl}`)}
  ${w.changeSets.length ? `<div class="row chips"><small class="muted">변경 이력</small>${[...w.changeSets].reverse().map((c) => `<button class="pill ${ui.activeCs === c.id ? "on" : ""}" data-act="sel-cs" data-id="${c.id}">${formatDate(c.createdAt)} · ${esc(c.label)}</button>`).join("")}</div>` : ""}
  ${cs ? changeSetView(cs) : ""}
  ${compareSection()}`;
}
function changeSetView(cs: ChangeSet) {
  const w = ws!;
  const sugs = w.suggestions.filter((s) => s.changeSetId === cs.id);
  const decided = sugs.filter((s) => s.status !== "pending").length;
  const result = cs.resultSnapshotId ? w.snapshots.find((s) => s.id === cs.resultSnapshotId) : undefined;
  const base = w.snapshots.find((s) => s.id === cs.baseSnapshotId);
  const nums = { rule: articleNumbers(w, "rule"), manual: articleNumbers(w, "manual") };
  return card(`변경: ${esc(cs.label)}`, `<div class="g3"><div class="box">변경된 조건 <b>${cs.diffs.length}</b>개: ${cs.diffs.map((d) => `${esc(d.label)} ${esc(d.beforeValue || "(빈 값)")}→${esc(d.afterValue || "(빈 값)")}`).join(", ")}</div><div class="box">② 연결된 조항 <b>${cs.affectedClauseIds.length}</b>개에 수정안 생성 · 결정 ${decided}/${sugs.length}</div><div class="box">비교 기준: 변경 전 자동 저장 v${base?.version ?? "?"}${result ? ` → 반영 저장 v${result.version}` : " → (아직 새 버전 저장 전)"}</div></div>
  <div class="notice gray">조건과 연결되지 않은 ${cs.unlinkedClauseCount}개 조항은 자동 검토 범위에 포함되지 않았습니다. 같은 숫자가 들어 있어도 바꾸지 않았으니 필요하면 직접 확인하세요.</div>
  ${sugs.map((s) => {
    const c = w.clauses.find((x) => x.id === s.clauseId);
    const stale = c ? c.body !== s.before || c.title !== s.beforeTitle : true;
    return `<div class="sugrow ${s.status}"><div class="row tight">${badge("[수정]", "blue")}${c ? `<button class="lnk navy b" data-act="goto-clause" data-id="${c.id}">${DOC_KIND_LABEL[c.docKind]} 제${nums[c.docKind].get(c.id)}조(${esc(c.title)})</button>` : `<span class="err-t">삭제된 조항</span>`}${badge(SUGGESTION_STATUS_LABEL[s.status], s.status === "applied" ? "green" : s.status === "held" ? "amber" : s.status === "rejected" ? "gray" : "blue")}<small class="muted">${esc(s.reason)}</small></div>
    ${s.warnings.map((x) => `<div class="notice">${esc(x)}</div>`).join("")}
    <div class="g2"><div class="dbox"><small>④ 변경 전</small><div class="pre">${diffHtml(s.before, s.after, "before")}</div></div><div class="dbox add"><small>변경 제안</small><div class="pre">${s.manualOnly ? "자동 수정안 없음 — 편집기에서 직접 수정하세요." : diffHtml(s.before, s.after, "after")}</div></div></div>
    ${s.status !== "applied" && s.status !== "rejected" ? `<div class="row">${btn("⑤ 반영", "sug-apply", { v: "pri", sm: true, data: `data-id="${s.id}"`, disabled: stale || s.manualOnly })}${s.status !== "held" ? btn("보류", "sug-hold", { sm: true, data: `data-id="${s.id}"` }) : ""}${btn("반영 안 함", "sug-reject", { v: "ghost", sm: true, data: `data-id="${s.id}"` })}${stale ? `<small class="err-t">제안 생성 후 조항이 수정되어 반영할 수 없습니다(담당자 수정본 보존).</small>` : ""}</div>` : ""}
    ${s.status === "held" ? `<small class="warn-t">보류 중인 조항은 현재 조건 값과 달라 검토 목록에 ‘조건 값 불일치’로 표시됩니다.</small>` : ""}</div>`;
  }).join("")}`, btn("⑥ 반영 결과를 새 버전으로 저장", "save-version", { v: "pri", sm: true, data: `data-id="${cs.id}"`, disabled: decided === 0 }));
}
function currentBasis(): CompareBasis | null {
  const w = ws!;
  const last = w.changeSets[w.changeSets.length - 1];
  if (ui.basis === "changeset") {
    const id = ui.basisCs && w.changeSets.some((c) => c.id === ui.basisCs) ? ui.basisCs : last?.id;
    return id ? { kind: "changeset", changeSetId: id } : null;
  }
  if (ui.basis === "versions") {
    const from = ui.fromSnap || w.snapshots[0]?.id;
    return from ? { kind: "versions", fromSnapshotId: from, toSnapshotId: ui.toSnap || "current" } : null;
  }
  return { kind: "similar" };
}
function compareSection() {
  const w = ws!;
  if (ui.basis === "changeset" && !w.changeSets.length) ui.basis = "versions";
  const basis = currentBasis();
  const rows = basis ? buildCompareRows(w, basis) : [];
  const TYPE = { modify: ["[수정]", "blue"], add: ["[추가]", "green"], delete: ["[삭제]", "red"] } as const;
  const bl = ui.basis === "similar" ? "유사사업 참고 규정" : "변경 전";
  const al = ui.basis === "similar" ? "새 초안" : ui.basis === "versions" ? "변경 후" : "변경 제안";
  const opts = `<label>비교 기준<select data-change="basis"><option value="changeset" ${ui.basis === "changeset" ? "selected" : ""} ${w.changeSets.length ? "" : "disabled"}>기본: 이전 초안 ↔ 계획 반영 초안</option><option value="versions" ${ui.basis === "versions" ? "selected" : ""}>저장 버전 간 비교</option><option value="similar" ${ui.basis === "similar" ? "selected" : ""}>선택: 유사사업 참고 규정 ↔ 새 초안</option></select></label>
  ${ui.basis === "versions" ? `<label>이전<select data-change="from-snap">${w.snapshots.map((s) => `<option value="${s.id}" ${(basis as { fromSnapshotId?: string })?.fromSnapshotId === s.id ? "selected" : ""}>v${s.version} · ${esc(s.label)}</option>`).join("")}</select></label><label>이후<select data-change="to-snap"><option value="current">현재 작업본</option>${w.snapshots.map((s) => `<option value="${s.id}" ${ui.toSnap === s.id ? "selected" : ""}>v${s.version} · ${esc(s.label)}</option>`).join("")}</select></label>` : ""}`;
  const table = rows.length ? `<div class="scroll"><table class="tbl cmp"><thead><tr><th style="width:170px">문서 종류와 조항</th><th>${bl}</th><th>${al}</th><th style="width:180px">변경 사유</th><th style="width:170px">관련 계획·근거</th><th style="width:80px">반영 상태</th></tr></thead><tbody>${rows.map((r) => `<tr class="ct-${r.changeType}"><td>${badge(TYPE[r.changeType][0], TYPE[r.changeType][1])}<div class="navy b">${esc(r.clauseLabel)}</div></td><td><div class="pre">${r.before ? diffHtml(r.before, r.after, "before") : `<span class="muted">(없음)</span>`}</div></td><td><div class="pre">${r.after ? diffHtml(r.before, r.after, "after") : `<span class="muted">(삭제)</span>`}</div></td><td class="sm">${esc(r.reason)}${r.warnings.map((x) => `<div class="warn-t">⚠ ${esc(x)}</div>`).join("")}</td><td class="sm muted pre">${esc(r.related || "-")}</td><td>${badge(r.status, r.status === "반영" ? "green" : r.status === "보류" ? "amber" : r.status === "결정 대기" ? "blue" : "gray")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted c">비교할 변경 사항이 없습니다.</p>`;
  return card("신구대비표", `<div class="row form-inline">${opts}</div><p class="sm">비교 기준: <b>${BASIS_LABEL[ui.basis]}</b> · 추가·삭제·수정은 색과 [배지]로 함께 표시합니다.</p>${ui.basis === "similar" ? `<div class="notice blue">유사사업 규정은 이번 사업의 현행 규정이 아닙니다. 참고 비교용입니다.</div>` : ""}${table}`, btn("신구대비표.docx 다운로드", "dl-compare", { v: "pri", sm: true, disabled: !rows.length }));
}

// ───────────────────────── 내보내기
function pageExport(issues: Issue[]) {
  const w = ws!;
  const items: [string, string, string, boolean][] = [
    ["rule", "운영규칙 초안.docx", "8개 장 구성 운영규칙 1부 + 조항별 근거 목록 부록", w.clauses.some((c) => c.docKind === "rule")],
    ["manual", "운영요령 초안.docx", "공통편 + 사업별 3개 편 운영요령 1부 + 근거 목록 부록", w.clauses.some((c) => c.docKind === "manual")],
    ["compare", "신구대비표.docx", "가장 최근 계획 변경 기준(다른 기준은 계획 변경 화면에서 선택)", w.changeSets.length > 0],
    ["csv", "근거 매핑표.csv", "조항 × 근거(역할·자료·버전·위치·인용·원문 상태·연결 조건), UTF-8 BOM 포함", w.clauses.length > 0],
    ["backup", "작업 백업.json", "작업공간 전체(자료 원문 포함). 비공개 자료가 있을 수 있으니 보관에 주의", true],
  ];
  return `${header("내보내기·백업", "모든 파일에 프로젝트명·버전·작성일·검토용 초안 표시가 들어가며, 【확인 필요】·【미확정】 표시도 유지됩니다.")}
  ${card("", `<div class="row">현재 버전 <b>${esc(currentVersionLabel(w))}</b> · 검토 목록 <b>${issues.length}</b>건 ${w.isDemo ? badge("파일에 ‘시연용 가상 자료’ 표시", "amber") : ""}</div>`)}
  ${card("파일 내려받기", `<ul class="dl">${items.map(([t, n, d, ok]) => `<li><div><b class="navy">${n}</b><small class="muted">${d}</small></div>${btn(ok ? "다운로드" : t === "compare" ? "계획 변경 이력 없음" : "초안 없음", "export", { v: ok ? "pri" : "sec", data: `data-t="${t}"`, disabled: !ok })}</li>`).join("")}</ul>`)}
  ${card("백업 복원", `<p class="muted sm">작업 백업.json을 선택하면 형식을 확인한 뒤 현재 작업공간(${kind === "sample" ? "샘플" : "실제"})을 덮어씁니다.</p><input type="file" accept=".json" data-change="restore">`)}
  ${card("데이터 초기화", `<p class="muted sm">데이터는 이 브라우저의 localStorage에만 저장됩니다. 브라우저 데이터를 지우면 사라지므로 백업을 권장합니다.</p>${btn(kind === "sample" ? "샘플을 처음 상태로" : "실제 작업공간 초기화", "reset", { v: "danger" })}`)}`;
}

// ───────────────────────── 이벤트
async function exportFile(t: string) {
  const w = ws!;
  const p = prefix();
  const d = today();
  try {
    if (t === "rule" || t === "manual") {
      const blob = await Packer.toBlob(regulationDocument(w, t));
      return download(blob, `${p}${t === "rule" ? "운영규칙" : "운영요령"} 초안_${d}.docx`);
    }
    if (t === "compare") {
      const basis = t === "compare" && route() === "changes" ? currentBasis() : { kind: "changeset" as const, changeSetId: w.changeSets[w.changeSets.length - 1].id };
      if (!basis) return;
      let detail = "";
      if (basis.kind === "changeset") {
        const cs = w.changeSets.find((c) => c.id === basis.changeSetId)!;
        detail = `변경: ${cs.label} · ${cs.diffs.map((x) => `${x.label} ${x.beforeValue || "(빈 값)"}→${x.afterValue || "(빈 값)"}`).join(", ")} · 조건과 연결된 조항 ${cs.affectedClauseIds.length}개만 자동 검토 대상(연결되지 않은 ${cs.unlinkedClauseCount}개 조항은 자동 검토 범위 밖)`;
      }
      const blob = await Packer.toBlob(compareDocument(w, buildCompareRows(w, basis), basis, detail));
      return download(blob, `${p}신구대비표_${d}.docx`);
    }
    if (t === "csv") return download(buildEvidenceCsv(w), `${p}근거 매핑표_${d}.csv`, "text/csv;charset=utf-8");
    if (t === "backup") return download(JSON.stringify(w, null, 2), `${p}작업 백업_${d}.json`, "application/json");
  } catch {
    notify("파일을 만들지 못했습니다.", "error");
  }
}

function switchKind(k: Kind) {
  kind = k;
  try {
    localStorage.setItem(KIND_KEY, k);
  } catch {}
  ws = loadWs(k);
  if (ws && k === "main" && !safeGet(wsKey("main"))) persist();
  ui.clauseId = null;
  ui.draft = null;
  ui.selectedDoc = null;
  saveMsg = ws ? "저장됨" : "";
  render();
}

document.addEventListener("click", async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!el || (el as HTMLButtonElement).disabled) return;
  const a = el.dataset.act!;
  const id = el.dataset.id ?? "";
  const clauseId = ui.clauseId ?? "";
  switch (a) {
    case "start-sample":
      if (kind === "sample" && ws && !confirm("샘플 프로젝트를 처음 상태로 다시 시작할까요? (실제 작업공간은 영향 없음)")) return;
      kind = "sample";
      try { localStorage.setItem(KIND_KEY, "sample"); } catch {}
      ws = buildSampleWorkspace();
      persist();
      ui.clauseId = null; ui.draft = null; ui.selectedDoc = null;
      location.hash = "#/sources";
      render();
      return;
    case "to-main": return switchKind("main");
    case "open-doc": ui.editDoc = el.dataset.doc as DocKind; ui.clauseId = null; return;
    // 자료
    case "add-doc": ui.addingDoc = true; ui.addText = ""; return render();
    case "close-add": ui.addingDoc = false; return render();
    case "sel-doc": ui.selectedDoc = id; ui.addingDoc = false; ui.editChunk = null; return render();
    case "save-doc":
    case "save-doc-empty": {
      const m = readMeta("n-");
      const text = a === "save-doc" ? (document.getElementById("n-text") as HTMLTextAreaElement).value : "";
      if (!m.title) return notify("문서명을 입력하세요.", "error");
      if (a === "save-doc" && !text.trim()) return notify("원문을 붙여넣거나 TXT 파일을 불러오세요.", "error");
      const nid = update((w) => addDoc(w, { ...m, text: text || undefined, format: text ? "paste" : undefined, isDemo: false, allowExternal: false }).id, text ? "자료와 원문을 등록했습니다." : "자료를 목록에 등록했습니다(원문 미등록).");
      if (nid) { ui.addingDoc = false; ui.selectedDoc = nid; render(); }
      return;
    }
    case "save-meta": return void update((w) => updateDocMeta(w, id, readMeta("e-")), "자료 정보를 저장했습니다.");
    case "del-doc": if (confirm("이 자료를 삭제할까요? 연결된 조항의 근거가 끊어집니다.")) { update((w) => deleteDoc(w, id), "자료를 삭제했습니다."); ui.selectedDoc = null; render(); } return;
    case "extract": { const r = update((w) => applyExtraction(w, id)); if (r) notify(`조건 ${r.found.length}개 추출, 빈 값 ${r.emptyKeys.length}개. 사업 조건 화면에서 확인하세요.`, "ok"); return; }
    case "edit-chunk": ui.editChunk = id; return render();
    case "cancel-chunk": ui.editChunk = null; return render();
    case "save-chunk": { const t = (document.getElementById("chunk-text") as HTMLTextAreaElement).value; ui.editChunk = null; return void update((w) => updateChunkText(w, id, t), "원문 조각을 수정했습니다(원문 버전 증가)."); }
    case "reg-text": { const t = (document.getElementById("reg-text") as HTMLTextAreaElement).value; if (!t.trim()) return; return void update((w) => setDocText(w, id, { text: t, format: "paste" }), "원문을 등록했습니다."); }
    // 조건
    case "conds-done": {
      const n = ws!.conditions.filter((c) => c.status !== "confirmed" || !c.value.trim()).length;
      if (n && !confirm(`미확정·빈 조건 ${n}개가 있습니다. 이 값들은 임의로 채우지 않고 초안에 확인 필요로 남깁니다. 조건 확인을 완료할까요?`)) return;
      return void update((w) => markConditionsReviewed(w), "조건 확인을 완료했습니다. 편집기에서 초안을 작성하세요.");
    }
    // 편집기
    case "gen-draft": update((w) => { generateDraft(w); createSnapshot(w, "초안 작성(템플릿)"); }, "운영규칙·운영요령 초안을 작성했습니다(v1 저장)."); ui.editDoc = "rule"; ui.clauseId = null; return render();
    case "ed-doc": if (dirtyGuard()) { ui.editDoc = el.dataset.doc as DocKind; ui.clauseId = null; ui.draft = null; render(); } return;
    case "sel-clause": if (dirtyGuard()) { ui.clauseId = id; ui.draft = null; ui.linking = false; render(); } return;
    case "goto-clause": {
      const c = ws!.clauses.find((x) => x.id === id);
      if (!c) return;
      ui.editDoc = c.docKind; ui.clauseId = c.id; ui.draft = null;
      location.hash = "#/editor";
      return render();
    }
    case "add-clause": { const nid = update((w) => addClause(w, ui.editDoc, el.dataset.sec!).id, "조항을 추가했습니다."); if (nid) { ui.clauseId = nid; ui.draft = null; render(); } return; }
    case "rename-sec": { const s = ws!.sections.find((x) => x.id === id); const t = prompt("장·편 이름", s?.title); if (t) update((w) => renameSection(w, id, t)); return; }
    case "save-clause": { const d = ui.draft!; const wasApproved = ws!.clauses.find((c) => c.id === clauseId)?.reviewStatus === "approved"; ui.draft = null; return void update((w) => editClause(w, clauseId, { title: d.title, body: d.body }), wasApproved ? "저장했습니다. 검토 완료 조항이 수정되어 ‘재검토 필요’로 바뀌었습니다." : "조항을 저장했습니다."); }
    case "revert-clause": ui.draft = null; return render();
    case "review": return void update((w) => setReviewStatus(w, clauseId, el.dataset.s as ReviewStatus), `검토 상태: ${REVIEW_LABEL[el.dataset.s as ReviewStatus]}`);
    case "move-up": return void update((w) => moveClause(w, clauseId, -1));
    case "move-down": return void update((w) => moveClause(w, clauseId, 1));
    case "del-clause": if (confirm("이 조항을 삭제할까요? 이후 조문 번호가 당겨집니다.")) { update((w) => deleteClause(w, clauseId), "조항을 삭제했습니다."); ui.clauseId = null; ui.draft = null; render(); } return;
    case "tpl-suggest": return void update((w) => {
      const c = w.clauses.find((x) => x.id === clauseId)!;
      const r = templateRewrite(w, c);
      if (!r) throw new Error("템플릿이 없는 조항입니다(담당자가 추가한 조항).");
      if (r.body === c.body && r.title === c.title) throw new Error("현재 조건 기준 템플릿 결과가 지금 본문과 같습니다.");
      addRewriteSuggestion(w, c.id, { title: r.title, body: r.body, origin: "template", reason: "현재 사업 조건 값으로 템플릿 재작성(AI 분석 아님)", sources: r.sources });
    }, "템플릿 재작성 제안을 만들었습니다. 적용 여부를 선택하세요.");
    case "sug-apply": { const r = update((w) => applySuggestion(w, id)); if (r && !r.ok) notify(r.reason, "error"); else if (r?.ok) { ui.draft = null; render(); notify("반영했습니다. 검토 완료였던 조항은 재검토 필요로 바뀝니다.", "ok"); } return; }
    case "sug-hold": return void update((w) => decideSuggestion(w, id, "held"), "보류했습니다.");
    case "sug-reject": return void update((w) => decideSuggestion(w, id, "rejected"), "반영하지 않기로 했습니다.");
    case "add-memo": { const t = (document.getElementById("memo") as HTMLInputElement).value; if (t.trim()) update((w) => addNote(w, clauseId, t)); return; }
    case "toggle-src": if (ui.showSource.has(id)) ui.showSource.delete(id); else ui.showSource.add(id); return render();
    case "toggle-link": ui.linking = !ui.linking; ui.linkQuery = ws!.clauses.find((c) => c.id === clauseId)?.title ?? ""; return render();
    case "link-chunk": ui.linking = false; return void update((w) => addSourceLink(w, clauseId, id), "근거를 연결했습니다.");
    case "unlink": return void update((w) => removeSourceLink(w, clauseId, id), "근거 연결을 해제했습니다.");
    // 검토
    case "rv-group": ui.reviewGroup = el.dataset.k!; return render();
    // 계획 변경
    case "cmode": ui.changeMode = el.dataset.m as "plan" | "direct"; return render();
    case "add-v2": {
      const nid = update((w) => addDoc(w, { title: "[가상] 재기지원 사업 운영계획(안)", type: "plan", version: "가상 v2", effectiveDate: "", text: DEMO_PLAN_V2, applicability: "applicable", isPublic: false, isDemo: true, allowExternal: false }).id, "가상 운영계획(안) v2를 등록했습니다(지원 한도 1억원 → 1.5억원, 시연용).");
      if (nid) { ui.planId = nid; render(); }
      return;
    }
    case "start-cs": {
      const w0 = ws!;
      const plan = w0.docs.find((d) => d.id === ui.planId);
      const diffs = ui.changeMode === "plan" ? diffConditions(w0, proposeFromPlanDoc(w0, ui.planId).proposed) : diffConditions(w0, ui.direct);
      const label = ui.changeMode === "plan" && plan ? `${plan.title} ${plan.version}` : "조건 직접 변경";
      const nid = update((w) => startChangeSet(w, diffs, { label, planDocId: ui.changeMode === "plan" ? ui.planId : undefined }).id, "변경을 적용하고 연결된 조항의 수정안을 만들었습니다.");
      if (nid) { ui.activeCs = nid; ui.basis = "changeset"; ui.basisCs = nid; ui.direct = {}; render(); }
      return;
    }
    case "sel-cs": ui.activeCs = id; return render();
    case "save-version": return void update((w) => saveChangeSetVersion(w, id), "반영 결과를 새 버전으로 저장했습니다.");
    case "dl-compare": return exportFile("compare");
    // 내보내기
    case "export": return exportFile(el.dataset.t!);
    case "reset":
      if (prompt(`현재 ${kind === "sample" ? "샘플" : "실제"} 작업공간의 모든 내용을 지웁니다. 계속하려면 ‘초기화’를 입력하세요.`) !== "초기화") return;
      ws = kind === "sample" ? buildSampleWorkspace() : emptyWorkspace("main");
      persist();
      ui.clauseId = null; ui.draft = null;
      notify("초기화했습니다.", "ok");
      return render();
  }
});

function dirtyGuard() {
  const d = ui.draft;
  const c = d && ws!.clauses.find((x) => x.id === d.id);
  if (d && c && (d.title !== c.title || d.body !== c.body)) return confirm("저장하지 않은 수정 내용이 있습니다. 이동하면 버려집니다. 계속할까요?");
  return true;
}

document.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "cl-title" || t.id === "cl-body") {
    if (!ui.draft) return;
    if (t.id === "cl-title") ui.draft.title = t.value;
    else ui.draft.body = t.value;
    const c = ws!.clauses.find((x) => x.id === ui.draft!.id)!;
    const dirty = ui.draft.title !== c.title || ui.draft.body !== c.body;
    document.querySelectorAll<HTMLButtonElement>('[data-act="save-clause"],[data-act="revert-clause"]').forEach((b) => (b.disabled = !dirty));
    const ap = document.querySelector<HTMLButtonElement>('[data-act="review"][data-s="approved"]');
    if (ap) ap.disabled = dirty;
    const di = document.getElementById("dirty");
    if (di) di.textContent = dirty ? "저장하지 않은 수정 내용이 있습니다" : "";
    const pv = document.querySelector(".preview");
    if (pv) pv.innerHTML = marked(ui.draft.body);
  }
  if (t.id === "n-text") ui.addText = t.value;
});

document.addEventListener("keydown", (e) => {
  const t = e.target as HTMLInputElement;
  if (e.key === "Enter" && t.id === "link-q") {
    ui.linkQuery = t.value;
    render();
  }
  if (e.key === "Enter" && t.id === "memo" && t.value.trim()) update((w) => addNote(w, ui.clauseId ?? "", t.value));
});

document.addEventListener("change", async (e) => {
  const t = e.target as HTMLInputElement & HTMLSelectElement;
  const c = t.dataset.change;
  if (!c) return;
  const id = t.dataset.id ?? "";
  switch (c) {
    case "kind": return switchKind(t.value as Kind);
    case "txt-file": {
      const f = t.files?.[0];
      if (!f) return;
      if (!/\.(txt|md)$/i.test(f.name)) return notify("HTML 한 장 버전은 TXT만 불러올 수 있습니다. PDF·DOCX는 본문을 복사해 붙여넣으세요.", "error");
      const buf = await f.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(buf);
      if (text.includes("�")) { try { text = new TextDecoder("euc-kr").decode(buf); } catch {} }
      ui.addText = text.replace(/^﻿/, "");
      const ta = document.getElementById("n-text") as HTMLTextAreaElement;
      if (ta) ta.value = ui.addText;
      const ti = document.getElementById("n-title") as HTMLInputElement;
      if (ti && !ti.value) ti.value = f.name.replace(/\.[^.]+$/, "");
      return notify("TXT 원문을 불러왔습니다. 확인 후 등록하세요.", "ok");
    }
    case "cond-val": return void update((w) => updateCondition(w, id, { value: t.value.trim() }));
    case "cond-status": return void update((w) => updateCondition(w, id, { status: t.value as CondStatus }));
    case "cond-check": return void update((w) => updateCondition(w, id, { userChecked: t.checked }));
    case "prog-name": if (t.value.trim()) update((w) => updateProgram(w, id, { name: t.value.trim() }), "세부사업명을 바꿨습니다. 이미 작성된 조문 본문은 자동으로 바뀌지 않습니다."); return;
    case "prog-ok": return void update((w) => updateProgram(w, id, { confirmedByAgency: t.checked }));
    case "link-doc": ui.linkDoc = t.value; return render();
    case "plan-id": ui.planId = t.value; return render();
    case "direct-val": { const cur = ws!.conditions.find((x) => x.id === id)!; ui.direct = { ...ui.direct, [id]: { value: t.value, status: ui.direct[id]?.status ?? cur.status } }; return render(); }
    case "direct-st": { const cur = ws!.conditions.find((x) => x.id === id)!; ui.direct = { ...ui.direct, [id]: { value: ui.direct[id]?.value ?? cur.value, status: t.value as CondStatus } }; return render(); }
    case "basis": ui.basis = t.value as CompareBasis["kind"]; return render();
    case "from-snap": ui.fromSnap = t.value; return render();
    case "to-snap": ui.toSnap = t.value; return render();
    case "restore": {
      const f = t.files?.[0];
      if (!f) return;
      let parsed: unknown;
      try { parsed = JSON.parse(await f.text()); } catch { return notify("JSON 파일이 아닙니다.", "error"); }
      const v = validateWorkspace(parsed);
      if (!v.ok) return notify(v.error, "error");
      if (!confirm(`‘${v.ws.project.name}’ 백업으로 현재 작업공간을 덮어쓸까요? 현재 내용은 사라집니다.`)) return;
      v.ws.kind = kind;
      ws = v.ws;
      persist();
      ui.clauseId = null; ui.draft = null;
      notify("백업을 복원했습니다.", "ok");
      return render();
    }
  }
});

window.addEventListener("hashchange", () => {
  ui.linking = false;
  render();
});
if (ws && kind === "main" && !safeGet(wsKey("main"))) persist();
render();
