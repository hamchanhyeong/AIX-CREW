"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { NeedWorkspace } from "@/components/app-shell";
import { Badge, Button, Card, cx, Notice, PageHeader, Progress } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { DOC_KIND_LABEL, PLAN_BASIS_NOTICE, STRATEGY_LABEL } from "@/lib/labels";
import { computeMetrics, STAGES } from "@/lib/metrics";
import { formatDate } from "@/lib/util";

function Stat({ label, value, sub, href, tone }: { label: string; value: string | number; sub?: string; href?: string; tone?: "warn" }) {
  const body = (
    <div className={cx("rounded-lg border bg-white px-4 py-3", tone === "warn" && Number(value) > 0 ? "border-amber-300" : "border-gray-200", href && "hover:border-brand")}>
      <div className="text-[12px] text-gray-600">{label}</div>
      <div className={cx("mt-1 text-2xl font-bold", tone === "warn" && Number(value) > 0 ? "text-amber-700" : "text-navy")}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function Dashboard() {
  const { ws, kind, resetWorkspace, switchKind } = useWorkspace();
  const router = useRouter();

  const startSample = async () => {
    if (kind === "sample" && ws && !confirm("샘플 프로젝트를 처음 상태로 다시 시작할까요? 샘플 작업 내용은 지워집니다(실제 작업공간은 영향 없음).")) return;
    await resetWorkspace("sample");
    router.push("/sources");
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="프로젝트 현황"
        desc="자료 입력 → 조건 확인 → 근거 연결 → 조문 초안 작성 → 검수 → 변경 반영 → 다운로드"
        actions={
          <>
            <Button variant="subtle" onClick={startSample}>
              {kind === "sample" && ws ? "샘플 프로젝트 다시 시작" : "샘플 프로젝트 시작"}
            </Button>
            {kind === "sample" && (
              <Button variant="ghost" onClick={() => switchKind("main")}>
                실제 작업공간으로
              </Button>
            )}
          </>
        }
      />
      <NeedWorkspace>{ws && <DashboardBody />}</NeedWorkspace>
    </div>
  );
}

function DashboardBody() {
  const { ws } = useWorkspace();
  const m = computeMetrics(ws!);
  const w = ws!;
  const nextAction = [
    { href: "/sources", label: "자료 등록" },
    { href: "/conditions", label: "사업 조건 확인" },
    { href: "/editor", label: "초안 작성" },
    { href: "/review", label: "검토 계속하기" },
    { href: "/export", label: "내보내기" },
  ][m.stage];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[12px] text-gray-500">현재 작업 단계</div>
            <ol className="mt-2 flex flex-wrap items-center gap-1.5">
              {STAGES.map((s, i) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span
                    className={cx(
                      "rounded-full px-2.5 py-1 text-[12px] font-semibold",
                      i < m.stage ? "bg-emerald-50 text-emerald-700" : i === m.stage ? "bg-navy text-white" : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {i + 1}. {s}
                  </span>
                  {i < STAGES.length - 1 && <span className="text-gray-300">›</span>}
                </li>
              ))}
            </ol>
            <div className="mt-2 text-[12px] text-gray-500">최근 수정 {formatDate(w.project.updatedAt)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/sources"><Button>자료 등록</Button></Link>
            <Link href="/editor"><Button>초안 작성</Button></Link>
            <Link href="/review"><Button>검토 계속하기</Button></Link>
            <Link href={nextAction.href}><Button variant="primary">다음 단계: {nextAction.label}</Button></Link>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="등록 자료" value={m.docCount} sub={`원문 등록 ${m.registeredDocCount}건 · 미등록 ${m.docCount - m.registeredDocCount}건`} href="/sources" />
        <Stat label="근거 미확인 조항" value={m.unverifiedClauses} sub="원문 미등록·근거 미연결" href="/review?kind=evidence" tone="warn" />
        <Stat label="미확정 사업 조건" value={m.unconfirmedConditions} sub={`전체 ${m.totalConditions}개 조건 중`} href="/conditions" tone="warn" />
        <Stat label="검토 목록" value={m.issueCount} sub={`결정 대기 제안 ${m.pendingSuggestions}건`} href="/review" tone="warn" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["rule", "manual"] as const).map((dk) => {
          const p = m[dk];
          return (
            <Card key={dk} title={`${DOC_KIND_LABEL[dk]} 초안 1부`} actions={<Link className="text-[12px] font-semibold text-brand" href={`/editor?doc=${dk}`}>편집기 열기 →</Link>}>
              {p.total === 0 ? (
                <p className="text-[13px] text-gray-500">아직 조항이 없습니다. 조건 확인 후 편집기에서 초안을 작성하세요.</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex justify-between text-[12px]"><span>작성</span><span>{p.written}/{p.total}조 · {p.writtenPct}%</span></div>
                    <Progress value={p.writtenPct} />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[12px]"><span>검토 완료</span><span>{p.approved}/{p.total}조 · {p.approvedPct}%</span></div>
                    <Progress value={p.approvedPct} tone="green" />
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card title="세부사업 구성과 작성 전략" actions={<Badge tone="amber">{PLAN_BASIS_NOTICE}</Badge>}>
        <div className="grid gap-3 md:grid-cols-3">
          {w.programs.map((p) => (
            <div key={p.id} className="rounded-md border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-navy">{p.name}</span>
                {p.confirmedByAgency ? <Badge tone="green">기관 확인</Badge> : <Badge tone="amber">기관 확인 전</Badge>}
              </div>
              <div className="mt-1 text-[12px] font-semibold text-brand">{STRATEGY_LABEL[p.strategy]}</div>
              <div className="mt-1 text-[12px] text-gray-600">{p.strategyNote}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-gray-500">운영규칙은 3개 세부사업 공통 1부, 운영요령은 공통편과 사업별 3개 편으로 구성된 1부입니다(기획안 기준 초기 목차, 편집 가능).</p>
      </Card>

      {w.isDemo && <Notice>이 작업공간의 계획안·참고 규정·수치는 모두 시연용 가상 자료입니다. 실제 작업은 상단에서 ‘실제 작업공간’을 선택해 진행하세요.</Notice>}
    </div>
  );
}
