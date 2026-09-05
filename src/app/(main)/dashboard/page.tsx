// 대시보드 페이지 (얇은 서버 컴포넌트 — 인증 가드만).
// 데이터는 DashboardLoader가 React Query로 버킷별 클라이언트 페칭 → 재방문 즉시 표시.

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { DashboardLoader } from "@/components/dashboard/dashboard-loader";

// 이 라우트의 서버 액션 중 Gemini를 부르는 것들(투두 추천·주간 목표·다음 목표)이
// 이 함수를 탄다. 기본 실행 한도로는 긴 응답이 잘려 "이유 없는 실패"가 된다 —
// /diary/new·/diary/[id]가 같은 이유로 이미 60초를 쓰고 있다.
export const maxDuration = 60;

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  return <DashboardLoader />;
}
