import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { DashboardContentV2 } from "@/components/dashboard/dashboard-content-v2";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { featureFlags } from "@/lib/flags";
import {
  getDailyTodos,
  getStridePlan,
  getProfile,
  getRoutinesWithCompletions,
  getSelectedBucket,
  getUserBuckets,
} from "@/lib/dashboard";
import type { DashboardV2Data, TaskWithSubtasks } from "@/types";

interface DashboardPageProps {
  searchParams?: Promise<{
    bucket?: string;
  }>;
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedBucketQuery = resolvedSearchParams.bucket?.trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const onboardingV2Enabled = featureFlags.onboardingV2(user.id);
  const dashboardV2Enabled = featureFlags.dashboardV2(user.id);

  if (dashboardV2Enabled) {
    const errors: string[] = [];

    const [profileResult, bucketsResult] = await Promise.allSettled([
      getProfile(supabase, user.id),
      getUserBuckets(supabase, user.id),
    ]);

    const profile =
      profileResult.status === "fulfilled"
        ? profileResult.value
        : (errors.push(toErrorMessage(profileResult.reason, "프로필 정보를 불러오지 못했습니다.")), null);

    if (!profile) {
      if (onboardingV2Enabled) {
        redirect("/onboarding");
      }
      redirect("/login");
    }

    const buckets =
      bucketsResult.status === "fulfilled"
        ? bucketsResult.value
        : (errors.push(toErrorMessage(bucketsResult.reason, "버킷 정보를 불러오지 못했습니다.")), []);

    const defaultBucketId = buckets[0]?.id ?? null;
    const selectedBucketId =
      selectedBucketQuery && buckets.some((bucket) => bucket.id === selectedBucketQuery)
        ? selectedBucketQuery
        : defaultBucketId;

    const [selectedBucketResult, dailyTodosResult, routinesResult, stridePlanResult] =
      await Promise.allSettled([
        getSelectedBucket(supabase, user.id, selectedBucketId),
        getDailyTodos(supabase, user.id, selectedBucketId),
        getRoutinesWithCompletions(supabase, user.id, selectedBucketId),
        getStridePlan(supabase, user.id, selectedBucketId),
      ]);

    const selectedBucket =
      selectedBucketResult.status === "fulfilled"
        ? selectedBucketResult.value
        : (errors.push(toErrorMessage(selectedBucketResult.reason, "선택한 버킷을 불러오지 못했습니다.")), null);

    const dailyTodos =
      dailyTodosResult.status === "fulfilled"
        ? dailyTodosResult.value
        : (errors.push(toErrorMessage(dailyTodosResult.reason, "데일리투두를 불러오지 못했습니다.")), []);

    const routines =
      routinesResult.status === "fulfilled"
        ? routinesResult.value
        : (errors.push(toErrorMessage(routinesResult.reason, "루틴 정보를 불러오지 못했습니다.")), []);

    const stridePlan =
      stridePlanResult.status === "fulfilled"
        ? stridePlanResult.value
        : (errors.push(toErrorMessage(stridePlanResult.reason, "AI 추천 정보를 불러오지 못했습니다.")), null);

    const v2Data: DashboardV2Data = {
      profile,
      buckets,
      selectedBucket,
      activeChapters: [],
      dailyTodos,
      routines,
      stridePlan,
      extraDailyTodoCount: Math.max(0, dailyTodos.length - 1),
      extraRoutineCount: Math.max(0, routines.length - 1),
    };

    return (
      <DashboardContentV2
        data={v2Data}
        fetchError={errors.length > 0 ? errors[0] : undefined}
      />
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name ?? null;

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*, subtasks(*), bucket:buckets(id, title)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <DashboardContent
        tasks={[]}
        displayName={displayName}
        fetchError="할일을 불러오는데 실패했습니다."
      />
    );
  }

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
