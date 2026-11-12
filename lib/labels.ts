import type {
  Applicability,
  CondKey,
  DocKind,
  ReviewStatus,
  SourceRole,
  SourceType,
  Strategy,
  SuggestionStatus,
  TextStatus,
} from "./types";

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  rule: "운영규칙",
  manual: "운영요령",
};

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  plan: "운영계획(안)",
  law: "법령·시행령",
  guideline: "지침",
  similar: "유사사업 규정",
  background: "배경자료",
};

export const TEXT_STATUS_LABEL: Record<TextStatus, string> = {
  registered: "원문 등록",
  missing: "원문 미등록",
  failed: "추출 실패",
};

export const APPLICABILITY_LABEL: Record<Applicability, string> = {
  unchecked: "적용 여부 미확인",
  applicable: "적용 확인",
  reference: "참고용",
  not_applicable: "적용 안 함",
};

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  pending: "검토 대기",
  needs_fix: "수정 필요",
  approved: "검토 완료",
  needs_rereview: "재검토 필요",
};

export const ROLE_LABEL: Record<SourceRole, string> = {
  legal_candidate: "적용 근거 후보",
  similar_ref: "유사사업 참고",
  plan_reflect: "운영계획 반영",
  needs_check: "작성 제안·근거 확인 필요",
};

export const STRATEGY_LABEL: Record<Strategy, string> = {
  modify: "기존 규정 수정",
  convert: "유사 운영 방식 전환",
  new: "미확정 항목을 남긴 신규 초안",
};

export const SUGGESTION_STATUS_LABEL: Record<SuggestionStatus, string> = {
  pending: "결정 대기",
  applied: "반영",
  held: "보류",
  rejected: "미반영",
};

export const COND_LABEL: Record<CondKey, string> = {
  name: "사업명",
  purpose: "사업 목적",
  org: "추진 주체",
  budget: "사업비 관리 조건",
  asset: "자산 취득 사전승인 기준",
  target: "지원 대상",
  exclusion: "제외 대상",
  amount: "지원 한도(기업당)",
  period: "지원 기간",
  scale: "선정 규모",
  selection: "선정 방식",
};

export const COMMON_KEYS: CondKey[] = ["name", "purpose", "org", "budget", "asset"];
export const PROGRAM_KEYS: CondKey[] = [
  "target",
  "exclusion",
  "amount",
  "period",
  "scale",
  "selection",
];

/** 자료 유형에 따라 근거 역할이 결정된다. 배경자료는 근거로 연결하지 않는다. */
export function roleForType(t: SourceType): SourceRole | null {
  switch (t) {
    case "plan":
      return "plan_reflect";
    case "law":
    case "guideline":
      return "legal_candidate";
    case "similar":
      return "similar_ref";
    case "background":
      return null;
  }
}

export const DRAFT_NOTICE = "검토용 초안 — 기관 검토·승인 전 문서이며 법적 적합성을 보장하지 않습니다.";
export const DEMO_NOTICE = "시연용 가상 자료 — 실제 사업 조건이 아닙니다.";
export const PLAN_BASIS_NOTICE = "사업명·구성: 기획안 기준·기관 확인 전";
