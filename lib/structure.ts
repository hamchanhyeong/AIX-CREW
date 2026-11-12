import { COMMON_KEYS, COND_LABEL, PROGRAM_KEYS } from "./labels";
import type { Condition, Program, Section, Workspace, WorkspaceKind } from "./types";
import { nowIso, uid } from "./util";

// 기획안 기준 초기 구성. 기관 확정 구조가 아니며 화면에서 수정할 수 있다.
export function defaultPrograms(): Program[] {
  return [
    {
      id: "school",
      name: "재도전성공학교",
      order: 1,
      strategy: "convert",
      strategyNote: "유사 입주형 운영 방식을 재창업 대상에 맞게 전환",
      confirmedByAgency: false,
    },
    {
      id: "package",
      name: "재도전성공패키지",
      order: 2,
      strategy: "modify",
      strategyNote: "기존 세부관리기준을 바탕으로 확대된 대상·한도를 반영",
      confirmedByAgency: false,
    },
    {
      id: "cheer",
      name: "재도전응원프로젝트",
      order: 3,
      strategy: "new",
      strategyNote: "바우처 구조로 틀을 잡고 미확정 항목은 확인 필요로 남김",
      confirmedByAgency: false,
    },
  ];
}

const RULE_CHAPTERS: [string, string][] = [
  ["총칙", "법 제2조·제42조"],
  ["사업 내용", "법 제5·12조, 영 제2·4조"],
  ["추진체계", "세부관리기준 제4조"],
  ["선정", "법 제43조, 영 제7조"],
  ["협약·사업비", "영 제7조, 통합관리지침"],
  ["사후관리", "세부관리기준 제28·29조"],
  ["제재", "법 제63조, 영 제40조"],
  ["보칙", "법 제64조, 영 제41조"],
];

export function defaultSections(): Section[] {
  const rule: Section[] = RULE_CHAPTERS.map(([title, note], i) => ({
    id: `s-rule-${i + 1}`,
    docKind: "rule",
    order: i + 1,
    title,
    planNote: `기획안 기재 참고: ${note} (원문 미등록·미검증)`,
  }));
  const manual: Section[] = [
    { id: "s-manual-1", docKind: "manual", order: 1, title: "공통" },
    { id: "s-manual-2", docKind: "manual", order: 2, title: "재도전성공학교", programId: "school" },
    { id: "s-manual-3", docKind: "manual", order: 3, title: "재도전성공패키지", programId: "package" },
    { id: "s-manual-4", docKind: "manual", order: 4, title: "재도전응원프로젝트", programId: "cheer" },
  ];
  return [...rule, ...manual];
}

export function condId(programId: string | null, key: string): string {
  return `c-${programId ?? "common"}-${key}`;
}

/** 표준 조건 칸. 값은 비워 두고 '미확정'으로 시작한다. */
export function defaultConditions(programs: Program[]): Condition[] {
  const t = nowIso();
  const out: Condition[] = COMMON_KEYS.map((key) => ({
    id: condId(null, key),
    programId: null,
    key,
    label: COND_LABEL[key],
    value: "",
    status: "unconfirmed",
    userChecked: false,
    updatedAt: t,
  }));
  for (const p of programs) {
    for (const key of PROGRAM_KEYS) {
      out.push({
        id: condId(p.id, key),
        programId: p.id,
        key,
        label: COND_LABEL[key],
        value: "",
        status: "unconfirmed",
        userChecked: false,
        updatedAt: t,
      });
    }
  }
  return out;
}

export function emptyWorkspace(kind: WorkspaceKind, name?: string): Workspace {
  const t = nowIso();
  const programs = defaultPrograms();
  return {
    schemaVersion: 1,
    kind,
    isDemo: kind === "sample",
    project: {
      id: uid("prj"),
      name: name ?? "재기지원 사업 운영규칙·요령 작성",
      createdAt: t,
      updatedAt: t,
      generationMode: "template",
      modifiedSinceSnapshot: false,
    },
    programs,
    sections: defaultSections(),
    docs: [],
    chunks: [],
    conditions: defaultConditions(programs),
    clauses: [],
    suggestions: [],
    changeSets: [],
    snapshots: [],
    aiIssues: [],
  };
}

export function programName(ws: Workspace, programId: string | null): string {
  if (!programId) return "공통";
  return ws.programs.find((p) => p.id === programId)?.name ?? programId;
}

export function conditionTitle(ws: Workspace, c: { programId: string | null; label: string }): string {
  return `${programName(ws, c.programId)} · ${c.label}`;
}
