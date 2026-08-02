// 일기 편집 페이지 (얇은 서버 컴포넌트 — 인증 가드만).
// 데이터는 DiaryEditorLoader가 React Query로 클라이언트 페칭 → 재방문 즉시 표시.
//
// ?from=week&week=YYYY-MM-DD 로 들어오면(주간 시트에서 진입) 뒤로가기가
// 일기 목록이 아니라 대시보드의 그 주 시트로 돌아간다.

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { DiaryEditorLoader } from "@/components/diary/diary-editor-loader";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface DiaryDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string; backWeek?: string }>;
}

export default async function DiaryDetailPage({ params, searchParams }: DiaryDetailPageProps) {
  const { id } = await params;

  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  const resolved = (await searchParams) ?? {};
  // 형식이 어긋나면 무시하고 기본(목록) 복귀로 떨어뜨린다
  const fromWeek =
    resolved.from === "week" && resolved.backWeek && DATE_RE.test(resolved.backWeek)
      ? resolved.backWeek
      : null;

  return (
    <DiaryEditorLoader
      id={id}
      backHref={fromWeek ? `/dashboard?week=${fromWeek}` : undefined}
    />
  );
}
