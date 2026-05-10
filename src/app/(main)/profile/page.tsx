// 프로필 페이지 — 기본 정보 수정 + 계정 관리 (Server Component)

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileContent } from "@/components/profile/profile-content";
import { getTaskStats } from "@/lib/stats";
import type { TaskStats } from "@/types";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 미로그인 시 로그인 페이지로 리다이렉트
  if (!user) {
    redirect("/login");
  }

  // 프로필 조회 (프로필 화면에 필요한 필드만 조회)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, created_at")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/onboarding");
  }

  // 과제 통계 조회 — 신규 테이블 미적용 등 에러 시 빈 통계로 대체
  const fallbackStats: TaskStats = {
    totalDailyTodos: 0,
    completedDailyTodos: 0,
    totalRoutines: 0,
    completedRoutinesThisWeek: 0,
    totalActionsCompleted: 0,
    completedInLast14Days: 0,
  };

  let stats: TaskStats;
  try {
    stats = await getTaskStats(supabase, user.id);
  } catch {
    stats = fallbackStats;
  }

  return (
    <ProfileContent
      profile={profile}
      email={user.email ?? ""}
      stats={stats}
    />
  );
}
