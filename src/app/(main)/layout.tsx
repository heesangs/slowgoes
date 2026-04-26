// (main) 라우트 그룹 레이아웃 — 상단 헤더 + 중앙 정렬 컨테이너
// 헤더는 페이지에 따라 분기되어야 해서 (예: /buckets 는 뒤로가기 헤더)
// MainHeader client component 로 분리.

import { MainHeader } from "@/components/layout/main-header";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex flex-col">
      <MainHeader />

      {/* 본문 콘텐츠 */}
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-2xl">{children}</div>
      </main>
    </div>
  );
}
