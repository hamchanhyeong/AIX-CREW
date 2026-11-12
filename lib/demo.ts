import { chunkPlainText } from "./chunk";
import { applyExtraction } from "./ops";
import { emptyWorkspace } from "./structure";
import type { SourceDoc, SourceType, Workspace } from "./types";
import { nowIso, uid } from "./util";

// 모든 데모 자료는 시연용 가상 자료다. 수치는 시연용이며 실제 사업 조건이 아니다.

export const DEMO_PLAN_V1 = `[시연용 가상 자료] 재기지원 사업 운영계획(안) — 가상 예시 v1
※ 이 문서는 시연을 위해 만든 가상 계획안이며 실제 사업 조건이 아닙니다.

1. 공통
- 사업명: 재기지원 사업
- 사업 목적: 폐업 또는 경영위기를 겪은 중소기업인의 재창업과 재도약을 지원하여 재도전 기반을 마련
- 추진 주체: 미정
- 사업비 관리: 정부지원금은 전용 계좌로 관리하고 협약 종료 후 정산
- 자산 취득 사전승인 기준: 1억원

2. 재도전성공학교
- 지원 대상: 재창업을 준비 중인 예비 재창업자
- 제외 대상: 국세·지방세 체납 중인 자
- 지원 기간: 미정
- 선정 규모: 미정
- 선정 방식: 서류평가 후 면접평가

3. 재도전성공패키지
- 지원 대상: 폐업 경험이 있는 재창업 예정자 또는 재창업 후 7년 이내 기업
- 제외 대상: 국세·지방세 체납 중인 자, 금융기관 연체 중인 자
- 지원 한도(기업당 최대): 1억원
- 지원 기간: 협약일부터 10개월 이내
- 선정 규모: 185개사 내외
- 선정 방식: 서류평가 후 발표평가

4. 재도전응원프로젝트
- 지원 대상: 재창업 후 성과를 낸 우수 재도전기업
- 지원 한도(기업당 최대): 미정
- 선정 규모: 미정
- 선정 방식: 미정
`;

export const DEMO_PLAN_V2 = DEMO_PLAN_V1.replace("가상 예시 v1", "가상 예시 v2").replace(
  "- 지원 한도(기업당 최대): 1억원",
  "- 지원 한도(기업당 최대): 1.5억원",
);

export const DEMO_SIMILAR = `[시연용 가상 자료] 가상 유사사업 운영규정(예시)
※ 시연을 위해 만든 가상 규정입니다. 이번 사업의 현행 규정이 아니며 의무 기준도 아닙니다.
제1조(목적) 이 규정은 가상 유사사업의 운영에 필요한 사항을 정한다.
제2조(정의) "협약기업"이란 선정되어 운영기관과 협약을 체결한 기업을 말한다.
제3조(위원회) 운영기관은 사업의 주요 사항을 심의하기 위하여 위원회를 둔다. 위원회는 위원장 1명을 포함하여 5명 이상으로 구성하고 재적위원 3분의 2 이상의 출석으로 의결한다.
제4조(모집 공고) 운영기관은 지원 대상, 지원 내용, 신청 방법을 정하여 공고한다.
제5조(지원 제외) 국세 또는 지방세를 체납 중인 자는 지원 대상에서 제외한다.
제6조(중복 지원 제한) 같은 연도에 유사한 정부지원사업에 선정된 기업은 중복하여 지원할 수 없다.
제7조(평가) 지원 대상은 서류평가와 발표평가를 거쳐 선정한다.
제8조(평가위원의 제척) 평가위원은 신청기업과 이해관계가 있는 경우 평가에서 제외된다.
제9조(이의신청) 선정 결과에 이의가 있는 자는 통보일부터 7일 이내에 이의를 신청할 수 있다.
제10조(지원 한도) 기업당 지원 한도는 사업별 계획에서 정한다.
제11조(협약) 운영기관은 선정된 기업과 협약을 체결한다.
제12조(협약의 해약) 거짓이나 부정한 방법으로 지원을 받은 경우 협약을 해약할 수 있다.
제13조(입주 운영) 입주기업은 입주 기간 동안 교육과 멘토링에 참여하여야 한다.
제14조(비밀유지) 사업 관계자는 업무상 알게 된 정보를 누설하여서는 아니 된다.
`;

export const DEMO_BACKGROUND = `[시연용 가상 자료] 예산 관련 보도 요약 메모(가상)
※ 배경 이해용 메모입니다. 법적 근거로 사용하지 않습니다.
- 재도전 관련 3개 사업의 예산이 편성되었다는 보도가 있었음.
- 국회 심의 결과에 따라 금액과 규모는 바뀔 수 있음.
`;

interface DocSeed {
  title: string;
  type: SourceType;
  version: string;
  effectiveDate: string;
  text?: string;
  applicability: SourceDoc["applicability"];
  isPublic: boolean;
  url?: string;
}

const SEEDS: DocSeed[] = [
  { title: "[가상] 재기지원 사업 운영계획(안)", type: "plan", version: "가상 v1", effectiveDate: "", text: DEMO_PLAN_V1, applicability: "applicable", isPublic: false },
  { title: "[가상] 유사사업 운영규정(예시)", type: "similar", version: "가상 예시", effectiveDate: "", text: DEMO_SIMILAR, applicability: "reference", isPublic: false },
  { title: "중소기업창업 지원법", type: "law", version: "기획안 기재: 2026.7.1 시행", effectiveDate: "", applicability: "unchecked", isPublic: true, url: "https://www.law.go.kr" },
  { title: "중소기업창업 지원법 시행령", type: "law", version: "기획안 기재: 2026.9.1 시행", effectiveDate: "", applicability: "unchecked", isPublic: true, url: "https://www.law.go.kr" },
  { title: "중소기업창업 지원사업 통합관리지침", type: "guideline", version: "버전 미확인", effectiveDate: "", applicability: "unchecked", isPublic: true },
  { title: "재도전성공패키지 세부관리기준", type: "guideline", version: "기획안 기재: 2026.4.23 시행", effectiveDate: "", applicability: "unchecked", isPublic: true },
  { title: "[가상] 예산 관련 보도 요약 메모", type: "background", version: "가상", effectiveDate: "", text: DEMO_BACKGROUND, applicability: "reference", isPublic: true },
];

export function addDoc(
  ws: Workspace,
  seed: Omit<DocSeed, "text"> & { text?: string; format?: SourceDoc["format"]; fileName?: string; isDemo?: boolean; allowExternal?: boolean },
): SourceDoc {
  const t = nowIso();
  const doc: SourceDoc = {
    id: uid("doc"),
    title: seed.title,
    type: seed.type,
    version: seed.version,
    effectiveDate: seed.effectiveDate,
    url: seed.url ?? "",
    isPublic: seed.isPublic,
    allowExternal: seed.allowExternal ?? seed.isPublic,
    textStatus: seed.text ? "registered" : "missing",
    applicability: seed.applicability,
    format: seed.format ?? (seed.text ? "paste" : undefined),
    fileName: seed.fileName,
    textVersion: seed.text ? 1 : 0,
    isDemo: seed.isDemo ?? false,
    createdAt: t,
    updatedAt: t,
  };
  ws.docs.push(doc);
  if (seed.text) ws.chunks.push(...chunkPlainText(doc.id, seed.text, 1));
  return doc;
}

/** 샘플 작업공간: 가상 자료 등록 + 계획안 조건 추출(모두 '미확정' 상태로 시작) */
export function buildSampleWorkspace(): Workspace {
  const ws = emptyWorkspace("sample", "[샘플] 재기지원 사업 운영규칙·요령 작성");
  ws.isDemo = true;
  for (const s of SEEDS) addDoc(ws, { ...s, isDemo: true, allowExternal: false });
  const plan = ws.docs.find((d) => d.type === "plan")!;
  applyExtraction(ws, plan.id);
  return ws;
}
