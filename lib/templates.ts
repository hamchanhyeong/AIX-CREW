import { condId as cid } from "./structure";
import type { DocKind, SourceType } from "./types";

// 조문 템플릿. 사업 조건은 연결된 조건 ID로만 채운다(문자열 치환 아님).
// 근거 원문이 없는 내용은 본문에 【확인 필요】로 남긴다. 법령 조문 번호는 넣지 않는다.

export interface RefSpec {
  type: Extract<SourceType, "law" | "guideline" | "similar">;
  titleHint?: string;
  keywords: string[];
}

export interface TemplateCtx {
  v: (conditionId: string) => string;
  p: (programId: string) => string;
  no: (templateKey: string) => string;
}

export interface TemplateDef {
  key: string;
  docKind: DocKind;
  sectionId: string;
  title: string;
  conds: string[];
  refs: RefSpec[];
  body: (c: TemplateCtx) => string;
}

const LAW: RefSpec["type"] = "law";
const GUIDE: RefSpec["type"] = "guideline";
const SIM: RefSpec["type"] = "similar";
const P = ["school", "package", "cheer"] as const;
const each = (c: TemplateCtx, key: string, fmt?: (v: string) => string) =>
  P.map((p, i) => `${i + 1}. ${c.p(p)}: ${fmt ? fmt(c.v(cid(p, key))) : c.v(cid(p, key))}`).join("\n");

export const TEMPLATES: TemplateDef[] = [
  // ── 운영규칙 제1장 총칙
  {
    key: "rule.purpose",
    docKind: "rule",
    sectionId: "s-rule-1",
    title: "목적",
    conds: [cid(null, "name"), cid(null, "purpose")],
    refs: [{ type: LAW, titleHint: "창업 지원법", keywords: ["목적"] }],
    body: (c) =>
      `① 이 규칙은 중소벤처기업진흥공단(이하 "공단"이라 한다)이 수행하는 ${c.v(cid(null, "name"))}(이하 "사업"이라 한다)의 운영에 필요한 사항을 정함을 목적으로 한다.\n② 사업의 목적은 다음과 같다: ${c.v(cid(null, "purpose"))}`,
  },
  {
    key: "rule.definitions",
    docKind: "rule",
    sectionId: "s-rule-1",
    title: "정의",
    conds: [],
    refs: [
      { type: LAW, titleHint: "창업 지원법", keywords: ["정의", "재창업"] },
      { type: SIM, keywords: ["정의", "협약기업"] },
    ],
    body: () =>
      `이 규칙에서 사용하는 용어의 뜻은 다음과 같다.\n1. "재창업자"란 【확인 필요: 근거 법령의 정의 조항 원문 확인 후 기재】\n2. "협약기업"이란 사업에 선정되어 공단과 협약을 체결한 기업을 말한다.\n3. "수행기관"이란 공단이 사업 수행을 위하여 지정한 기관을 말한다.`,
  },
  {
    key: "rule.scope",
    docKind: "rule",
    sectionId: "s-rule-1",
    title: "적용 범위",
    conds: [],
    refs: [{ type: GUIDE, titleHint: "통합관리지침", keywords: ["적용", "범위"] }],
    body: (c) =>
      `① 사업은 다음 각 호의 세부사업으로 구성한다.\n1. ${c.p("school")}\n2. ${c.p("package")}\n3. ${c.p("cheer")}\n② 세부사업별 집행 기준은 운영요령으로 정한다.\n③ 이 규칙에서 정하지 아니한 사항은 관계 법령과 지침에서 정하는 바에 따른다.`,
  },
  // ── 제2장 사업 내용
  {
    key: "rule.target",
    docKind: "rule",
    sectionId: "s-rule-2",
    title: "지원 대상",
    conds: P.map((p) => cid(p, "target")),
    refs: [{ type: LAW, titleHint: "창업 지원법", keywords: ["지원 대상", "재창업"] }],
    body: (c) => `① 세부사업별 지원 대상은 다음 각 호와 같다.\n${each(c, "target")}\n② 지원 대상의 세부 요건은 운영요령으로 정한다.`,
  },
  {
    key: "rule.exclusion",
    docKind: "rule",
    sectionId: "s-rule-2",
    title: "지원 제외 대상",
    conds: P.map((p) => cid(p, "exclusion")),
    refs: [{ type: SIM, keywords: ["제외", "체납"] }],
    body: (c) => `다음 각 호의 세부사업별 제외 기준에 해당하는 자는 지원 대상에서 제외한다.\n${each(c, "exclusion")}`,
  },
  {
    key: "rule.amount",
    docKind: "rule",
    sectionId: "s-rule-2",
    title: "지원 한도",
    conds: P.map((p) => cid(p, "amount")),
    refs: [{ type: SIM, keywords: ["한도"] }],
    body: (c) =>
      `① 세부사업별 지원 한도는 다음 각 호와 같다.\n${each(c, "amount", (v) => `기업당 최대 ${v}`)}\n② 실제 지원 금액은 평가 결과와 예산 범위에서 정한다.`,
  },
  {
    key: "rule.period",
    docKind: "rule",
    sectionId: "s-rule-2",
    title: "지원 기간",
    conds: P.map((p) => cid(p, "period")),
    refs: [],
    body: (c) => `세부사업별 지원 기간은 다음 각 호와 같다.\n${each(c, "period")}`,
  },
  {
    key: "rule.duplicate",
    docKind: "rule",
    sectionId: "s-rule-2",
    title: "중복 지원 제한",
    conds: [],
    refs: [{ type: SIM, keywords: ["중복"] }],
    body: () =>
      `동일 기업이 같은 연도에 이 규칙에 따른 세부사업 중 둘 이상에 참여할 수 있는지는 【확인 필요: 중복 지원 제한 범위 기관 확인】에 따른다.`,
  },
  // ── 제3장 추진체계
  {
    key: "rule.org",
    docKind: "rule",
    sectionId: "s-rule-3",
    title: "운영기관",
    conds: [cid(null, "org")],
    refs: [{ type: GUIDE, titleHint: "세부관리기준", keywords: ["운영기관", "주관기관"] }],
    body: (c) =>
      `① 사업의 운영기관은 ${c.v(cid(null, "org"))}(으)로 한다.\n② 운영기관은 사업 수행에 필요한 경우 수행기관을 지정할 수 있으며, 지정 기준은 운영요령으로 정한다.`,
  },
  {
    key: "rule.committee",
    docKind: "rule",
    sectionId: "s-rule-3",
    title: "사업운영위원회",
    conds: [],
    refs: [
      { type: GUIDE, titleHint: "세부관리기준", keywords: ["위원회"] },
      { type: SIM, keywords: ["위원회"] },
    ],
    body: () =>
      `① 공단은 사업의 주요 사항을 심의하기 위하여 사업운영위원회(이하 "위원회"라 한다)를 둘 수 있다.\n② 위원회의 구성 인원과 의결 기준은 【확인 필요: 위원 수·의결 정족수】로 한다.`,
  },
  // ── 제4장 선정
  {
    key: "rule.notice",
    docKind: "rule",
    sectionId: "s-rule-4",
    title: "모집 공고",
    conds: [],
    refs: [{ type: SIM, keywords: ["공고"] }],
    body: () =>
      `① 공단은 세부사업별 지원 대상, 지원 내용, 신청 방법 및 선정 절차를 정하여 공고한다.\n② 공고 기간은 【확인 필요: 공고 기간】로 한다.`,
  },
  {
    key: "rule.selection",
    docKind: "rule",
    sectionId: "s-rule-4",
    title: "선정 방식",
    conds: P.map((p) => cid(p, "selection")),
    refs: [{ type: SIM, keywords: ["평가", "선정"] }],
    body: (c) => `지원 대상은 세부사업별로 다음 각 호의 방식에 따라 선정한다.\n${each(c, "selection")}`,
  },
  {
    key: "rule.scale",
    docKind: "rule",
    sectionId: "s-rule-4",
    title: "선정 규모",
    conds: P.map((p) => cid(p, "scale")),
    refs: [],
    body: (c) => `세부사업별 선정 규모는 다음 각 호와 같다. 다만, 예산 사정에 따라 조정할 수 있다.\n${each(c, "scale")}`,
  },
  {
    key: "rule.evaluator",
    docKind: "rule",
    sectionId: "s-rule-4",
    title: "평가위원의 제척",
    conds: [],
    refs: [{ type: SIM, keywords: ["이해관계", "제척"] }],
    body: () => `평가위원은 신청기업과 이해관계가 있는 경우 해당 평가에서 제외된다.`,
  },
  {
    key: "rule.objection",
    docKind: "rule",
    sectionId: "s-rule-4",
    title: "이의신청",
    conds: [],
    refs: [{ type: SIM, keywords: ["이의"] }],
    body: () =>
      `① 선정 결과에 이의가 있는 신청기업은 결과 통보일부터 【확인 필요: 이의신청 기간】 이내에 이의를 신청할 수 있다.\n② 공단은 이의신청 내용을 검토하여 그 결과를 신청기업에 알린다.`,
  },
  // ── 제5장 협약·사업비
  {
    key: "rule.agreement",
    docKind: "rule",
    sectionId: "s-rule-5",
    title: "협약 체결",
    conds: [],
    refs: [{ type: SIM, keywords: ["협약"] }],
    body: (c) =>
      `① 공단은 선정된 기업과 협약을 체결한다.\n② 협약 기간은 제${c.no("rule.period")}조에 따른 지원 기간 이내로 한다.`,
  },
  {
    key: "rule.budget",
    docKind: "rule",
    sectionId: "s-rule-5",
    title: "사업비 관리",
    conds: [cid(null, "budget"), cid(null, "asset")],
    refs: [{ type: GUIDE, titleHint: "통합관리지침", keywords: ["사업비", "관리"] }],
    body: (c) =>
      `① 협약기업은 다음 기준에 따라 사업비를 관리한다: ${c.v(cid(null, "budget"))}\n② 단일 품목 ${c.v(cid(null, "asset"))} 이상의 자산을 취득하려는 경우에는 사전에 공단의 승인을 받아야 한다.\n③ 사업비의 세부 집행 기준은 운영요령으로 정한다.`,
  },
  {
    key: "rule.amend",
    docKind: "rule",
    sectionId: "s-rule-5",
    title: "협약의 변경 및 해약",
    conds: [],
    refs: [{ type: SIM, keywords: ["해약", "변경"] }],
    body: () =>
      `① 협약기업은 사업 내용을 변경하려는 경우 공단의 승인을 받아야 한다.\n② 공단은 협약기업이 거짓이나 부정한 방법으로 지원을 받은 경우 협약을 해약할 수 있다. 그 밖의 해약 사유는 【확인 필요: 해약 사유 세부 기준】로 한다.`,
  },
  {
    key: "rule.settlement",
    docKind: "rule",
    sectionId: "s-rule-5",
    title: "정산",
    conds: [],
    refs: [{ type: GUIDE, titleHint: "통합관리지침", keywords: ["정산"] }],
    body: () => `공단은 협약 종료 후 사업비 사용 내역을 정산하고, 정산 결과 남은 금액의 처리는 【확인 필요: 근거 지침 원문 확인 후 기재】에 따른다.`,
  },
  // ── 제6장 사후관리
  {
    key: "rule.inspection",
    docKind: "rule",
    sectionId: "s-rule-6",
    title: "점검",
    conds: [],
    refs: [{ type: GUIDE, titleHint: "세부관리기준", keywords: ["점검"] }],
    body: () => `공단은 협약기업의 사업 수행 상황과 사업비 집행 상황을 점검할 수 있다.`,
  },
  {
    key: "rule.report",
    docKind: "rule",
    sectionId: "s-rule-6",
    title: "결과보고 및 성과관리",
    conds: [],
    refs: [{ type: GUIDE, titleHint: "세부관리기준", keywords: ["성과", "결과보고"] }],
    body: () =>
      `① 협약기업은 협약 종료 후 【확인 필요: 보고 기한】 이내에 결과보고서를 제출한다.\n② 공단은 협약 종료 후 【확인 필요: 성과조사 기간】 동안 성과를 조사할 수 있다.`,
  },
  // ── 제7장 제재
  {
    key: "rule.recovery",
    docKind: "rule",
    sectionId: "s-rule-7",
    title: "사업비 환수",
    conds: [],
    refs: [{ type: LAW, titleHint: "창업 지원법", keywords: ["환수"] }],
    body: () =>
      `공단은 협약기업이 다음 각 호의 어느 하나에 해당하는 경우 지급한 사업비의 전부 또는 일부를 환수할 수 있다.\n1. 거짓이나 그 밖의 부정한 방법으로 지원을 받은 경우\n2. 사업비를 협약 목적 외로 사용한 경우\n3. 그 밖의 환수 사유: 【확인 필요: 근거 법령 원문 확인 후 기재】`,
  },
  {
    key: "rule.restriction",
    docKind: "rule",
    sectionId: "s-rule-7",
    title: "참여 제한",
    conds: [],
    refs: [{ type: LAW, titleHint: "창업 지원법", keywords: ["참여 제한", "제한"] }],
    body: () => `환수 대상 기업에 대한 사업 참여 제한 기간과 기준은 【확인 필요: 근거 법령 원문 확인 후 기재】에 따른다.`,
  },
  // ── 제8장 보칙
  {
    key: "rule.secrecy",
    docKind: "rule",
    sectionId: "s-rule-8",
    title: "비밀유지",
    conds: [],
    refs: [{ type: SIM, keywords: ["비밀"] }],
    body: () => `사업 관계자는 업무상 알게 된 신청기업과 협약기업의 정보를 누설하거나 사업 목적 외로 사용해서는 아니 된다.`,
  },
  {
    key: "rule.delegation",
    docKind: "rule",
    sectionId: "s-rule-8",
    title: "운영요령에의 위임",
    conds: [],
    refs: [],
    body: () => `이 규칙의 시행에 필요한 세부 사항은 운영요령으로 정한다.`,
  },
  {
    key: "rule.effective",
    docKind: "rule",
    sectionId: "s-rule-8",
    title: "시행일",
    conds: [],
    refs: [],
    body: () => `이 규칙은 【확인 필요: 시행일】부터 시행한다.`,
  },

  // ── 운영요령 제1편 공통
  {
    key: "manual.purpose",
    docKind: "manual",
    sectionId: "s-manual-1",
    title: "목적",
    conds: [cid(null, "name")],
    refs: [],
    body: (c) => `이 요령은 ${c.v(cid(null, "name"))} 운영규칙에서 위임한 사항과 그 시행에 필요한 세부 사항을 정함을 목적으로 한다.`,
  },
  {
    key: "manual.evaluators",
    docKind: "manual",
    sectionId: "s-manual-1",
    title: "평가위원 운영",
    conds: [],
    refs: [{ type: SIM, keywords: ["평가위원", "이해관계"] }],
    body: () =>
      `① 평가위원회는 【확인 필요: 위원 수】 이상의 외부 전문가를 포함하여 구성한다.\n② 평가위원은 신청기업과 이해관계가 있는 경우 평가에서 제외된다.`,
  },
  {
    key: "manual.budget",
    docKind: "manual",
    sectionId: "s-manual-1",
    title: "사업비 집행 기준",
    conds: [cid(null, "budget"), cid(null, "asset")],
    refs: [{ type: GUIDE, titleHint: "통합관리지침", keywords: ["사업비", "집행"] }],
    body: (c) =>
      `① 사업비는 다음 기준에 따라 집행한다: ${c.v(cid(null, "budget"))}\n② 단일 품목 ${c.v(cid(null, "asset"))} 이상의 자산 취득은 사전 승인 대상으로 한다.`,
  },
  {
    key: "manual.settlement",
    docKind: "manual",
    sectionId: "s-manual-1",
    title: "정산 절차",
    conds: [],
    refs: [{ type: GUIDE, titleHint: "통합관리지침", keywords: ["정산"] }],
    body: () => `협약기업은 협약 종료일부터 【확인 필요: 정산 서류 제출 기한】 이내에 정산 서류를 제출한다.`,
  },
  // ── 제2편 재도전성공학교 (전환형)
  {
    key: "manual.school.target",
    docKind: "manual",
    sectionId: "s-manual-2",
    title: "지원 대상",
    conds: [cid("school", "target"), cid("school", "exclusion")],
    refs: [],
    body: (c) =>
      `① ${c.p("school")}의 지원 대상은 다음과 같다: ${c.v(cid("school", "target"))}\n② 다음에 해당하는 자는 제외한다: ${c.v(cid("school", "exclusion"))}`,
  },
  {
    key: "manual.school.operation",
    docKind: "manual",
    sectionId: "s-manual-2",
    title: "입주 및 교육 운영",
    conds: [cid("school", "period")],
    refs: [{ type: SIM, keywords: ["입주", "교육"] }],
    body: (c) =>
      `① 입주 및 교육 기간은 ${c.v(cid("school", "period"))}로 한다.\n② 입주 공간과 교육 과정의 운영 기준은 【확인 필요: 거점·입주 공간 운영 기준】로 한다.`,
  },
  {
    key: "manual.school.selection",
    docKind: "manual",
    sectionId: "s-manual-2",
    title: "선정 기준 및 규모",
    conds: [cid("school", "selection"), cid("school", "scale")],
    refs: [],
    body: (c) => `① 선정은 다음 방식으로 한다: ${c.v(cid("school", "selection"))}\n② 선정 규모는 ${c.v(cid("school", "scale"))}로 한다.`,
  },
  // ── 제3편 재도전성공패키지 (수정형)
  {
    key: "manual.package.target",
    docKind: "manual",
    sectionId: "s-manual-3",
    title: "지원 대상",
    conds: [cid("package", "target"), cid("package", "exclusion")],
    refs: [{ type: GUIDE, titleHint: "세부관리기준", keywords: ["지원 대상", "신청 자격"] }],
    body: (c) =>
      `① ${c.p("package")}의 지원 대상은 다음과 같다: ${c.v(cid("package", "target"))}\n② 다음에 해당하는 자는 제외한다: ${c.v(cid("package", "exclusion"))}`,
  },
  {
    key: "manual.package.amount",
    docKind: "manual",
    sectionId: "s-manual-3",
    title: "사업화 자금 한도",
    conds: [cid("package", "amount")],
    refs: [{ type: SIM, keywords: ["한도"] }],
    body: (c) =>
      `① 사업화 자금은 기업당 최대 ${c.v(cid("package", "amount"))} 이내로 지원한다.\n② 정부지원금 비율과 자기부담 기준은 【확인 필요: 분담 비율】로 한다.`,
  },
  {
    key: "manual.package.selection",
    docKind: "manual",
    sectionId: "s-manual-3",
    title: "선정 기준 및 규모",
    conds: [cid("package", "selection"), cid("package", "scale")],
    refs: [{ type: SIM, keywords: ["평가", "선정"] }],
    body: (c) => `① 선정은 다음 방식으로 한다: ${c.v(cid("package", "selection"))}\n② 선정 규모는 ${c.v(cid("package", "scale"))}로 한다.`,
  },
  {
    key: "manual.package.agreement",
    docKind: "manual",
    sectionId: "s-manual-3",
    title: "협약 기간 및 지원 금액",
    conds: [cid("package", "period"), cid("package", "amount")],
    refs: [],
    body: (c) =>
      `협약 기간은 ${c.v(cid("package", "period"))}로 하며, 지원 금액은 기업당 최대 ${c.v(cid("package", "amount"))} 범위에서 평가 결과에 따라 정한다.`,
  },
  // ── 제4편 재도전응원프로젝트 (신규형)
  {
    key: "manual.cheer.target",
    docKind: "manual",
    sectionId: "s-manual-4",
    title: "지원 대상",
    conds: [cid("cheer", "target"), cid("cheer", "exclusion")],
    refs: [],
    body: (c) =>
      `① ${c.p("cheer")}의 지원 대상은 다음과 같다: ${c.v(cid("cheer", "target"))}\n② 다음에 해당하는 자는 제외한다: ${c.v(cid("cheer", "exclusion"))}`,
  },
  {
    key: "manual.cheer.voucher",
    docKind: "manual",
    sectionId: "s-manual-4",
    title: "바우처 한도 및 사용",
    conds: [cid("cheer", "amount"), cid("cheer", "period")],
    refs: [],
    body: (c) =>
      `① 바우처는 기업당 최대 ${c.v(cid("cheer", "amount"))} 범위에서 지급하며, 사용 기간은 ${c.v(cid("cheer", "period"))}로 한다.\n② 바우처 사용 범위와 컨설팅 운영 방식은 【확인 필요: 계획(안) 확정 시 기재】.`,
  },
  {
    key: "manual.cheer.selection",
    docKind: "manual",
    sectionId: "s-manual-4",
    title: "선정 기준 및 규모",
    conds: [cid("cheer", "selection"), cid("cheer", "scale")],
    refs: [],
    body: (c) => `① 선정은 다음 방식으로 한다: ${c.v(cid("cheer", "selection"))}\n② 선정 규모는 ${c.v(cid("cheer", "scale"))}로 한다.`,
  },
];

export function templateByKey(key?: string): TemplateDef | undefined {
  return key ? TEMPLATES.find((t) => t.key === key) : undefined;
}
