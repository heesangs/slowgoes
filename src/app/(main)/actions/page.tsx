import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getDailyTodos,
  getProfile,
  getRoutinesWithCompletions,
  getUserBuckets,
} from "@/lib/dashboard";
import { ActionsContent } from "@/components/actions/actions-content";
import { LAST_VIEWED_BUCKET_COOKIE_NAME } from "@/hooks/use-track-last-viewed-bucket";

interface ActionsPageProps {
  searchParams?: Promise<{ bucket?: string }>;
}

export default async function ActionsPage({ searchParams }: ActionsPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedBucketQuery = resolvedSearchParams.bucket?.trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // PR 36 → IA v2 목표 3: profile도 함께 조회 — '+ 칩' 클릭 시 열리는 ExploreNewSceneSheet의 prefillProfile 용도.
  //   사용자가 온보딩 때 입력한 정보를 다시 입력하지 않게 하기 위함.
  const [buckets, profile] = await Promise.all([
    getUserBuckets(supabase, user.id),
    getProfile(supabase, user.id),
  ]);

  // PR 31: 대시보드와 동일한 우선순위 — URL > cookie > buckets[0]
  const cookieStore = await cookies();
  const cookieBucketId = cookieStore.get(LAST_VIEWED_BUCKET_COOKIE_NAME)?.value;
  const selectedBucketId =
    selectedBucketQuery && buckets.some((bucket) => bucket.id === selectedBucketQuery)
      ? selectedBucketQuery
      : cookieBucketId && buckets.some((bucket) => bucket.id === cookieBucketId)
        ? cookieBucketId
        : buckets[0]?.id ?? null;

  const [dailyTodos, routines] = await Promise.all([
    getDailyTodos(supabase, user.id, selectedBucketId),
    getRoutinesWithCompletions(supabase, user.id, selectedBucketId),
  ]);

  return (
    <ActionsContent
      dailyTodos={dailyTodos}
      routines={routines}
      buckets={buckets}
      selectedBucketId={selectedBucketId}
      profile={profile}
    />
  );
}
