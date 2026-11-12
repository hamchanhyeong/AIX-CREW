import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { WorkspaceProvider } from "@/components/workspace-context";

export const metadata: Metadata = {
  title: "재기지원 사업 규정 작성 지원",
  description: "운영계획(안)과 참고 규정으로 운영규칙·운영요령 검토용 초안을 작성하고 변경사항을 추적합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <WorkspaceProvider>
          <AppShell>{children}</AppShell>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
