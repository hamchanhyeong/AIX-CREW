"use client";

import { useState } from "react";
import { NeedWorkspace } from "@/components/app-shell";
import { Badge, Button, Card, inputCls, Notice, PageHeader } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { SOURCE_TYPE_LABEL } from "@/lib/labels";
import { touch, updateDocMeta } from "@/lib/ops";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="설정" desc="프로젝트 정보, AI 연동 상태, 외부 전송 허용 자료, 데이터 초기화를 관리합니다." />
      <NeedWorkspace>
        <Body />
      </NeedWorkspace>
    </div>
  );
}

function Body() {
  const { ws, ai, kind, update, resetWorkspace } = useWorkspace();
  const w = ws!;
  const [name, setName] = useState(w.project.name);

  return (
    <div className="space-y-4">
      <Card title="프로젝트">
        <div className="flex gap-2">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} aria-label="프로젝트명" />
          <Button variant="primary" disabled={!name.trim() || name === w.project.name} onClick={() => update((x) => { x.project.name = name.trim(); touch(x, false); }, "프로젝트명을 바꿨습니다.")}>저장</Button>
        </div>
      </Card>

      <Card title="작성 모드">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-gray-200 p-3 text-[13px]">
            <div className="mb-1 flex items-center gap-2 font-semibold text-navy">데모 모드 <Badge tone="amber">샘플 작업공간</Badge></div>
            <ul className="list-disc space-y-0.5 pl-5 text-gray-700">
              <li>API 키 없이 실행, 가상 계획안·가상 참고 규정 사용</li>
              <li>조문 템플릿 + 구조화된 조건으로 작성(AI 분석 아님)</li>
              <li>변경 비교·편집·검토·저장·다운로드는 실제 동작</li>
            </ul>
          </div>
          <div className="rounded-md border border-gray-200 p-3 text-[13px]">
            <div className="mb-1 flex items-center gap-2 font-semibold text-navy">
              실제 AI 모드 {ai?.configured ? <Badge tone="green">연결됨</Badge> : <Badge>미설정</Badge>}
            </div>
            <ul className="list-disc space-y-0.5 pl-5 text-gray-700">
              <li>제공자: {ai?.provider ?? "-"} · 모델: {ai?.model ?? "-"}</li>
              <li>서버에서만 호출, 키는 서버 환경변수로 관리(브라우저에 노출 안 함)</li>
              <li>관련 원문 조각만 보내고, 출처 ID·인용 문구를 원문과 대조 검증</li>
              <li>실패한 요청은 데모 결과로 대체하지 않음</li>
            </ul>
            {!ai?.configured && <Notice tone="gray" className="mt-2">{ai?.reason} — README의 ‘환경변수’ 절을 참고해 .env.local을 설정한 뒤 서버를 다시 시작하세요.</Notice>}
          </div>
        </div>
      </Card>

      <Card title="외부 LLM 전송 허용 자료">
        <p className="mb-2 text-[12px] text-gray-600">
          허용하지 않은 자료의 원문은 AI 호출에서 제외됩니다. 배경자료는 근거로 쓰지 않으므로 보내지 않습니다. 다만 AI 제안을 요청한 조항의 현재 제목·본문은 전송됩니다.
          {kind === "sample" && " 샘플(데모) 작업공간에서는 AI를 호출하지 않습니다."}
        </p>
        <table className="rtable w-full text-[13px]">
          <thead><tr className="border-b border-gray-200 text-left text-[12px] text-gray-500"><th className="py-1.5">자료</th><th>유형</th><th>공개</th><th className="text-center">외부 전송 허용</th></tr></thead>
          <tbody>
            {w.docs.map((d) => (
              <tr key={d.id} className="border-b border-gray-100">
                <td className="py-1.5">{d.title}</td>
                <td>{SOURCE_TYPE_LABEL[d.type]}</td>
                <td>{d.isPublic ? "공개" : "비공개"}</td>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${d.title} 외부 전송 허용`} checked={d.allowExternal} disabled={d.type === "background"} onChange={(e) => update((x) => updateDocMeta(x, d.id, { allowExternal: e.target.checked }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="데이터 저장과 초기화">
        <ul className="mb-3 list-disc space-y-1 pl-5 text-[13px] text-gray-700">
          <li>단일 사용자 로컬 MVP입니다. 작업 내용은 서버 실행 위치의 <code>data/workspace-main.json</code>, <code>data/workspace-sample.json</code>에 저장됩니다(Git 제외).</li>
          <li>인증·공동편집이 없으므로 기관 자료가 들어 있는 상태로 외부에 배포하지 마세요.</li>
          <li>샘플과 실제 작업공간은 별도 파일로 분리되어 서로 영향을 주지 않습니다.</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" onClick={() => {
            if (prompt(`현재 ${kind === "sample" ? "샘플" : "실제"} 작업공간의 모든 자료·조건·조항·버전을 지웁니다. 계속하려면 ‘초기화’를 입력하세요.`) !== "초기화") return;
            resetWorkspace(kind);
          }}>
            {kind === "sample" ? "샘플을 처음 상태로" : "실제 작업공간 초기화"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
