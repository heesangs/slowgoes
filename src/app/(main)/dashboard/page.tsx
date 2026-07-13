import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { DashboardContentV2 } from "@/components/dashboard/dashboard-content-v2";
import { featureFlags } from "@/lib/flags";
import {
  getDailyTodos,
  getStridePlan,
  getProfileForRequest,
  getRoutinesWithCompletions,
  getUserBucketsForRequest,
} from "@/lib/dashboard";
import { LAST_VIEWED_BUCKET_COOKIE_NAME } from "@/hooks/use-track-last-viewed-bucket";
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
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const onboardingV2Enabled = featureFlags.onboardingV2(user.id);

  const errors: string[] = [];

  const [profileResult, bucketsResult] = await Promise.allSettled([
    getProfileForRequest(user.id),
    getUserBucketsForRequest(user.id),
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

  // PR 31: 우선순위 — URL 쿼리 > cookie(마지막 본 버킷) > buckets[0] fallback
  // 로고/홈 링크로 진입(쿼리 없음)했을 때 마지막으로 보던 버킷을 유지하기 위함.
  const cookieStore = await cookies();
  const cookieBucketId = cookieStore.get(LAST_VIEWED_BUCKET_COOKIE_NAME)?.value;
  const defaultBucketId = buckets[0]?.id ?? null;
  const selectedBucketId =
    selectedBucketQuery && buckets.some((bucket) => bucket.id === selectedBucketQuery)
      ? selectedBucketQuery
      : cookieBucketId && buckets.some((bucket) => bucket.id === cookieBucketId)
        ? cookieBucketId
        : defaultBucketId;

  // PR 27: getSelectedBucket 제거 — buckets에서 직접 추출 (RTT -1)
  const selectedBucket =
    (selectedBucketId && buckets.find((b) => b.id === selectedBucketId)) || null;

  const [dailyTodosResult, routinesResult, stridePlanResult] =
    await Promise.allSettled([
      getDailyTodos(supabase, user.id, selectedBucketId),
      getRoutinesWithCompletions(supabase, user.id, selectedBucketId),
      getStridePlan(supabase, user.id, selectedBucketId),
    ]);

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

  // IA v2 목표 5: extraDailyTodoCount/extraRoutineCount 제거 — /actions "더보기" 링크가 사라져 의미 상실.
  const v2Data: DashboardV2Data = {
    profile,
    buckets,
    selectedBucket,
    dailyTodos,
    routines,
    stridePlan,
  };

  return (
    <DashboardContentV2
      data={v2Data}
      fetchError={errors.length > 0 ? errors[0] : undefined}
    />
  );
}
