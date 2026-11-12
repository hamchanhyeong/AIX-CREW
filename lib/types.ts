// 도메인 모델. 조문 번호와 조항 ID는 분리한다(번호는 순서에서 계산).

export type WorkspaceKind = "sample" | "main";
export type DocKind = "rule" | "manual";
export type SourceType = "plan" | "law" | "guideline" | "similar" | "background";
export type TextStatus = "registered" | "missing" | "failed";
export type Applicability = "unchecked" | "applicable" | "reference" | "not_applicable";
export type ReviewStatus = "pending" | "needs_fix" | "approved" | "needs_rereview";
export type SourceRole = "legal_candidate" | "similar_ref" | "plan_reflect" | "needs_check";
export type CondStatus = "confirmed" | "unconfirmed";
export type Strategy = "modify" | "convert" | "new";
export type GenerationMode = "template" | "ai";

export type CondKey =
  | "name"
  | "purpose"
  | "org"
  | "budget"
  | "asset"
  | "target"
  | "exclusion"
  | "amount"
  | "period"
  | "scale"
  | "selection";

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  conditionsReviewedAt?: string;
  draftGeneratedAt?: string;
  generationMode: GenerationMode;
  modifiedSinceSnapshot: boolean;
}

export interface Program {
  id: string; // 안정 ID (school | package | cheer)
  name: string;
  order: number;
  strategy: Strategy;
  strategyNote: string;
  /** 사업명·구성이 기관에서 확인되었는지. 기본은 '기획안 기준·기관 확인 전' */
  confirmedByAgency: boolean;
}

export interface Section {
  id: string;
  docKind: DocKind;
  order: number;
  title: string;
  programId?: string;
  /** 기획안에 적힌 참고 근거(검증되지 않음) */
  planNote?: string;
}

export interface SourceDoc {
  id: string;
  title: string;
  type: SourceType;
  version: string;
  effectiveDate: string;
  url: string;
  isPublic: boolean;
  /** 외부 LLM 전송 허용 여부 */
  allowExternal: boolean;
  textStatus: TextStatus;
  applicability: Applicability;
  fileName?: string;
  format?: "txt" | "pdf" | "docx" | "paste";
  /** 원문이 바뀔 때마다 증가 */
  textVersion: number;
  parseNote?: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Chunk {
  id: string;
  docId: string;
  seq: number;
  /** 페이지 번호 또는 절·문단 식별자 */
  locator: string;
  text: string;
  textVersion: number;
}

export interface Condition {
  id: string;
  programId: string | null; // null = 공통
  key: CondKey;
  label: string;
  value: string; // 확인되지 않은 값은 빈 문자열로 둔다
  status: CondStatus;
  sourceChunkId?: string;
  locator?: string;
  /** 담당자가 추출 결과를 확인했는지 */
  userChecked: boolean;
  updatedAt: string;
}

export interface ClauseSource {
  id: string;
  role: SourceRole;
  docId?: string;
  chunkId?: string;
  quote?: string;
  note?: string;
  addedBy: "template" | "ai" | "user";
}

export interface Note {
  id: string;
  text: string;
  createdAt: string;
  kind: "memo" | "system";
}

export interface Clause {
  id: string; // 안정 ID — 순서가 바뀌어도 유지
  docKind: DocKind;
  sectionId: string;
  order: number;
  title: string;
  body: string;
  origin: "template" | "ai" | "user";
  templateKey?: string;
  generated: boolean;
  userEdited: boolean;
  reviewStatus: ReviewStatus;
  reviewedAt?: string;
  conditionIds: string[];
  sources: ClauseSource[];
  notes: Note[];
  updatedAt: string;
}

export type SuggestionStatus = "pending" | "applied" | "held" | "rejected";

export interface Suggestion {
  id: string;
  clauseId: string;
  kind: "plan_change" | "rewrite";
  origin: "template" | "ai";
  changeType: "modify" | "add" | "delete";
  beforeTitle: string;
  afterTitle: string;
  before: string;
  after: string;
  reason: string;
  conditionIds: string[];
  changeSetId?: string;
  status: SuggestionStatus;
  createdAt: string;
  decidedAt?: string;
  newSources?: ClauseSource[];
  warnings: string[];
  /** 자동 수정안을 만들지 못해 직접 수정이 필요한 경우 */
  manualOnly: boolean;
}

export interface ConditionDiff {
  conditionId: string;
  label: string;
  beforeValue: string;
  afterValue: string;
  beforeStatus: CondStatus;
  afterStatus: CondStatus;
  afterChunkId?: string;
  afterLocator?: string;
}

export interface ChangeSet {
  id: string;
  createdAt: string;
  label: string;
  planDocId?: string;
  diffs: ConditionDiff[];
  affectedClauseIds: string[];
  unlinkedClauseCount: number;
  baseSnapshotId: string;
  resultSnapshotId?: string;
}

export interface Snapshot {
  id: string;
  version: number;
  label: string;
  createdAt: string;
  clauses: Clause[];
  sections: Section[];
  conditions: Condition[];
  programs: Program[];
}

export interface AiIssue {
  id: string;
  clauseId: string;
  text: string;
  createdAt: string;
  resolved: boolean;
}

export interface Workspace {
  schemaVersion: 1;
  kind: WorkspaceKind;
  isDemo: boolean;
  project: Project;
  programs: Program[];
  sections: Section[];
  docs: SourceDoc[];
  chunks: Chunk[];
  conditions: Condition[];
  clauses: Clause[];
  suggestions: Suggestion[];
  changeSets: ChangeSet[];
  snapshots: Snapshot[];
  aiIssues: AiIssue[];
}
