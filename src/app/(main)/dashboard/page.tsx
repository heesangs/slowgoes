import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardContentV2 } from "@/components/dashboard/dashboard-content-v2";
import { featureFlags } from "@/lib/flags";
import {
  getDailyTodos,
  getStridePlan,
  getProfile,
  getRoutinesWithCompletions,
  getSelectedBucket,
  getUserBuckets,
} from "@/lib/dashboard";
import type { DashboardV2Data } from "@/types";

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
