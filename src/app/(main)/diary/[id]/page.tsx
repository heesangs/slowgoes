// 일기 편집 페이지 (얇은 서버 컴포넌트 — 인증 가드만).
// 데이터는 DiaryEditorLoader가 React Query로 클라이언트 페칭 → 재방문 즉시 표시.

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { DiaryEditorLoader } from "@/components/diary/diary-editor-loader";

interface DiaryDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function DiaryDetailPage({ params }: DiaryDetailPageProps) {
  const { id } = await params;

  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  return <DiaryEditorLoader id={id} />;
}
