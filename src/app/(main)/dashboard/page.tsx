// 대시보드 페이지 — 전체 할일 요약 (Server Component)

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { DashboardContentV2 } from "@/components/dashboard/dashboard-content-v2";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { featureFlags } from "@/lib/flags";
import {
  getActiveChapters,
  getDailyStep,
  getLifeBalance,
  getProfile,
  getReviewData,
  getUnstartedBucket,
} from "@/lib/dashboard";
import type { DashboardV2Data, TaskWithSubtasks } from "@/types";

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 미로그인 시 로그인 페이지로 리다이렉트
  if (!user) {
    redirect("/login");
  }

  if (featureFlags.dashboardV2()) {
    const profile = await getProfile(supabase, user.id);
    if (!profile) {
      redirect("/onboarding");
    }

    const errors: string[] = [];
    const [
      activeChaptersResult,
      dailyStepResult,
      balanceResult,
      suggestedBucketResult,
      reviewResult,
      allTasksResult,
    ] =
      await Promise.allSettled([
        getActiveChapters(supabase, user.id),
        getDailyStep(supabase, user.id),
        getLifeBalance(supabase, user.id),
        getUnstartedBucket(supabase, user.id),
        getReviewData(supabase, user.id),
        (async () => {
          const { data, error } = await supabase
            .from("tasks")
            .select("*, subtasks(*), bucket:buckets(id, title)")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

          if (error) {
            throw error;
          }

          return (data as TaskWithSubtasks[] | null) ?? [];
        })(),
      ]);

    const activeChapters =
      activeChaptersResult.status === "fulfilled"
        ? activeChaptersResult.value
        : (errors.push(toErrorMessage(activeChaptersResult.reason, "챕터 정보를 불러오지 못했습니다.")), []);

    const dailyStep =
      dailyStepResult.status === "fulfilled"
        ? dailyStepResult.value
        : (errors.push(toErrorMessage(dailyStepResult.reason, "오늘의 한 걸음을 불러오지 못했습니다.")), null);

    const balance =
      balanceResult.status === "fulfilled"
        ? balanceResult.value
        : (errors.push(toErrorMessage(balanceResult.reason, "인생균형 정보를 불러오지 못했습니다.")), null);

    const suggestedBucket =
      suggestedBucketResult.status === "fulfilled"
        ? suggestedBucketResult.value
        : (errors.push(toErrorMessage(suggestedBucketResult.reason, "버킷 추천을 불러오지 못했습니다.")), null);

    const review =
      reviewResult.status === "fulfilled"
        ? reviewResult.value
        : (errors.push(toErrorMessage(reviewResult.reason, "회고 데이터를 불러오지 못했습니다.")), null);

    const allTasks =
      allTasksResult.status === "fulfilled"
        ? allTasksResult.value
        : (errors.push(toErrorMessage(allTasksResult.reason, "전체 과제를 불러오지 못했습니다.")), []);

    const v2Data: DashboardV2Data = {
      profile,
      activeChapters,
      dailyStep,
      balance,
      suggestedBucket,
      review,
    };

    return (
      <DashboardContentV2
        data={v2Data}
        allTasks={allTasks}
        fetchError={errors.length > 0 ? errors[0] : undefined}
      />
    );
  }

  // 프로필 조회
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name ?? null;

  // 사용자 전체 과제 + 하위 과제 조회
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*, subtasks(*), bucket:buckets(id, title)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // 에러 발생 시
  if (error) {
    return (
      <DashboardContent
        tasks={[]}
        displayName={displayName}
        fetchError="할일을 불러오는데 실패했습니다."
      />
    );
  }

  // 빈 결과
  if (!tasks || tasks.length === 0) {
    return <DashboardEmpty displayName={displayName} />;
  }

  return (
    <DashboardContent
      tasks={tasks as TaskWithSubtasks[]}
      displayName={displayName}
    />
  );
}
