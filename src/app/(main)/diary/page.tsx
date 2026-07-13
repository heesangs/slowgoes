// 일기 목록 페이지 (얇은 서버 컴포넌트 — 인증 가드만).
// 데이터는 DiaryListContent가 React Query로 클라이언트 페칭 → 재방문 즉시 표시.

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { DiaryListContent } from "@/components/diary/diary-list-content";

export default async function DiaryPage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  return <DiaryListContent />;
}
