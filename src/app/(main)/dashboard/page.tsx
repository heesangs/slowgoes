// 대시보드 페이지 (얇은 서버 컴포넌트 — 인증 가드만).
// 데이터는 DashboardLoader가 React Query로 버킷별 클라이언트 페칭 → 재방문 즉시 표시.

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { DashboardLoader } from "@/components/dashboard/dashboard-loader";

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  return <DashboardLoader />;
}
