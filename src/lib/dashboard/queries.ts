import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentWeekStartDate } from "@/lib/utils";
import type {
  Bucket,
  DailyTodo,
  StridePlan,
  LifeBalanceInsight,
  LifeArea,
  Profile,
  RoutineCompletion,
  RoutineWithCompletion,
} from "@/types";

type DashboardSupabase = SupabaseClient;

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_WEEKS_DAYS = 14;

function toClientError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return new Error(error.message);
  }
  return new Error(fallback);
}

function toUtcIsoDaysAgo(days: number) {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function buildBalanceMessage(insight: LifeBalanceInsight) {
  if (!insight.focusArea && !insight.neglectedArea && !insight.steadyArea) {
    return "아직 데이터가 모이고 있어요. 조금만 더 사용하면 패턴이 보일 거예요.";
  }

  const parts: string[] = [];
  if (insight.focusArea) {
    parts.push(`요즘 가장 에너지가 많이 흐르는 영역은 ${insight.focusArea}이에요.`);
  }
  if (insight.neglectedArea) {
    parts.push(`최근 비어 있는 영역은 ${insight.neglectedArea}이에요.`);
  }
  if (!insight.neglectedArea && insight.steadyArea) {
    parts.push(`${insight.steadyArea} 영역은 꾸준히 이어지고 있어요.`);
  }
  return parts.join(" ");
}

export async function getProfile(
  supabase: DashboardSupabase,
  userId: string
): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as Profile | null) ?? null;
  } catch (error) {
    throw toClientError(error, "프로필 정보를 불러오지 못했습니다.");
  }
}

export async function getUserBuckets(
  supabase: DashboardSupabase,
  userId: string
): Promise<Array<Pick<Bucket, "id" | "title" | "stride_scope" | "status" | "created_at">>> {
  try {
    const { data, error } = await supabase
      .from("buckets")
      .select("id, title, stride_scope, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (
      (data as Array<Pick<Bucket, "id" | "title" | "stride_scope" | "status" | "created_at">> | null) ??
      []
    );
  } catch (error) {
    throw toClientError(error, "버킷 정보를 불러오지 못했습니다.");
  }
}

export async function getSelectedBucket(
  supabase: DashboardSupabase,
  userId: string,
  bucketId: string | null
): Promise<Bucket | null> {
  if (!bucketId) return null;

  try {
    const { data, error } = await supabase
      .from("buckets")
      .select("*")
      .eq("user_id", userId)
      .eq("id", bucketId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as Bucket | null) ?? null;
  } catch (error) {
    throw toClientError(error, "선택한 버킷 정보를 불러오지 못했습니다.");
  }
}

export async function getDailyTodos(
  supabase: DashboardSupabase,
  userId: string,
  bucketId: string | null
): Promise<DailyTodo[]> {
  if (!bucketId) return [];

  const weekStart = getCurrentWeekStartDate();

  try {
    const { data, error } = await supabase
      .from("daily_todos")
      .select("*")
      .eq("user_id", userId)
      .eq("bucket_id", bucketId)
      .eq("week_start", weekStart)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return (data as DailyTodo[] | null) ?? [];
  } catch (error) {
    throw toClientError(error, "데일리투두를 불러오지 못했습니다.");
  }
}

// PR 22: 오늘 날짜를 "YYYY-MM-DD" 로컬 기준
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getRoutinesWithCompletions(
  supabase: DashboardSupabase,
  userId: string,
  bucketId: string | null
): Promise<RoutineWithCompletion[]> {
  if (!bucketId) return [];

  const today = getTodayDateString();
  const weekStart = getCurrentWeekStartDate();

  try {
    const [routinesResult, completionsResult] = await Promise.all([
      supabase
        .from("routines")
        .select("*")
        .eq("user_id", userId)
        .eq("bucket_id", bucketId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      // PR 22: 일 단위로 변경됐지만 "이번 주에 한 번이라도" 정보도 유지
      // → 이번 주 범위 내 완료 모두 조회 후 today / week 분리
      supabase
        .from("routine_completions")
        .select("*")
        .eq("user_id", userId)
        .gte("completion_date", weekStart),
    ]);

    if (routinesResult.error) throw routinesResult.error;
    if (completionsResult.error) throw completionsResult.error;

    const routines = (routinesResult.data as RoutineWithCompletion[] | null) ?? [];
    const completions = (completionsResult.data as RoutineCompletion[] | null) ?? [];

    // 루틴별로 today 완료 / 이번 주 완료 둘 다 분류
    const todayByRoutineId = new Map<string, RoutineCompletion>();
    const weekByRoutineId = new Map<string, RoutineCompletion>();
    for (const c of completions) {
      if (c.completion_date === today) todayByRoutineId.set(c.routine_id, c);
      // 이번 주 안 어느 날이든 한 번이라도 있으면 기록 (최근 것 우선)
      if (!weekByRoutineId.has(c.routine_id)) weekByRoutineId.set(c.routine_id, c);
    }

    return routines.map((routine) => {
      const todayCompletion = todayByRoutineId.get(routine.id) ?? null;
      const weekCompletion = weekByRoutineId.get(routine.id) ?? null;
      return {
        ...routine,
        completion: todayCompletion ?? weekCompletion,
        is_completed_today: Boolean(todayCompletion),
        is_completed_this_week: Boolean(weekCompletion),
      };
    });
  } catch (error) {
    throw toClientError(error, "루틴 정보를 불러오지 못했습니다.");
  }
}

export async function getStridePlan(
  supabase: DashboardSupabase,
  userId: string,
  bucketId: string | null
): Promise<StridePlan | null> {
  if (!bucketId) return null;

  try {
    const { data, error } = await supabase
      .from("stride_plans")
      .select("*")
      .eq("user_id", userId)
      .eq("bucket_id", bucketId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as StridePlan | null) ?? null;
  } catch (error) {
    throw toClientError(error, "AI 추천 정보를 불러오지 못했습니다.");
  }
}

export async function getLifeBalance(
  supabase: DashboardSupabase,
  userId: string
): Promise<LifeBalanceInsight | null> {
  try {
    const [lifeAreasResult, bucketsResult, completedDailyResult, routinesResult, routineCompletionsResult] =
      await Promise.all([
        supabase
          .from("life_areas")
          .select("id, name")
          .eq("user_id", userId),
        supabase
          .from("buckets")
          .select("id, life_area_id, status")
          .eq("user_id", userId),
        supabase
          .from("daily_todos")
          .select("bucket_id, completed_at")
          .eq("user_id", userId)
          .eq("status", "completed")
          .gte("completed_at", toUtcIsoDaysAgo(TWO_WEEKS_DAYS)),
        supabase
          .from("routines")
          .select("id, bucket_id")
          .eq("user_id", userId),
        supabase
          .from("routine_completions")
          .select("routine_id, completed_at")
          .eq("user_id", userId)
          .gte("completed_at", toUtcIsoDaysAgo(TWO_WEEKS_DAYS)),
      ]);

    if (lifeAreasResult.error) throw lifeAreasResult.error;
    if (bucketsResult.error) throw bucketsResult.error;
    if (completedDailyResult.error) throw completedDailyResult.error;
    if (routinesResult.error) throw routinesResult.error;
    if (routineCompletionsResult.error) throw routineCompletionsResult.error;

    const lifeAreas =
      (lifeAreasResult.data as Array<Pick<LifeArea, "id" | "name">> | null) ?? [];
    const buckets =
      (bucketsResult.data as Array<Pick<Bucket, "id" | "life_area_id" | "status">> | null) ?? [];
    const completedDailyTodos =
      (completedDailyResult.data as Array<{ bucket_id: string | null; completed_at: string | null }> | null) ??
      [];
    const routines =
      (routinesResult.data as Array<{ id: string; bucket_id: string | null }> | null) ?? [];
    const routineCompletions =
      (routineCompletionsResult.data as Array<{ routine_id: string; completed_at: string | null }> | null) ??
      [];

    if (lifeAreas.length === 0 && buckets.length === 0) {
      return {
        focusArea: null,
        neglectedArea: null,
        steadyArea: null,
        message: "아직 데이터가 모이고 있어요. 조금만 더 사용하면 패턴이 보일 거예요.",
      };
    }

    const areaNameById = new Map<string, string>();
    for (const area of lifeAreas) {
      areaNameById.set(area.id, area.name);
    }

    const bucketAreaMap = new Map<string, string>();
    const areaStatMap = new Map<string, { activeBuckets: number; completedItems: number }>();

    for (const area of lifeAreas) {
      areaStatMap.set(area.name, { activeBuckets: 0, completedItems: 0 });
    }

    for (const bucket of buckets) {
      if (!bucket.life_area_id) continue;
      const areaName = areaNameById.get(bucket.life_area_id);
      if (!areaName) continue;

      bucketAreaMap.set(bucket.id, areaName);
      const stat = areaStatMap.get(areaName) ?? { activeBuckets: 0, completedItems: 0 };
      if (bucket.status === "in_progress") {
        stat.activeBuckets += 1;
      }
      areaStatMap.set(areaName, stat);
    }

    for (const item of completedDailyTodos) {
      if (!item.bucket_id) continue;
      const areaName = bucketAreaMap.get(item.bucket_id);
      if (!areaName) continue;
      const stat = areaStatMap.get(areaName) ?? { activeBuckets: 0, completedItems: 0 };
      stat.completedItems += 1;
      areaStatMap.set(areaName, stat);
    }

    const routineBucketMap = new Map<string, string | null>();
    for (const routine of routines) {
      routineBucketMap.set(routine.id, routine.bucket_id);
    }

    for (const completion of routineCompletions) {
      const bucketId = routineBucketMap.get(completion.routine_id) ?? null;
      if (!bucketId) continue;
      const areaName = bucketAreaMap.get(bucketId);
      if (!areaName) continue;
      const stat = areaStatMap.get(areaName) ?? { activeBuckets: 0, completedItems: 0 };
      stat.completedItems += 1;
      areaStatMap.set(areaName, stat);
    }

    const stats = Array.from(areaStatMap.entries()).map(([name, value]) => ({
      name,
      activeBuckets: value.activeBuckets,
      completedItems: value.completedItems,
      score: value.activeBuckets * 2 + value.completedItems,
    }));

    if (stats.length === 0) {
      return {
        focusArea: null,
        neglectedArea: null,
        steadyArea: null,
        message: "아직 데이터가 모이고 있어요. 조금만 더 사용하면 패턴이 보일 거예요.",
      };
    }

    const sortedByScore = [...stats].sort((a, b) => b.score - a.score);
    const focusArea = sortedByScore[0]?.score > 0 ? sortedByScore[0].name : null;

    const neglectedCandidate = stats.find(
      (item) => item.activeBuckets === 0 && item.completedItems === 0
    );
    const neglectedArea = neglectedCandidate?.name ?? null;

    const steadyCandidate = stats
      .filter((item) => item.completedItems > 0 && item.name !== focusArea)
      .sort((a, b) => b.completedItems - a.completedItems)[0];
    const steadyArea = steadyCandidate?.name ?? null;

    const insight: LifeBalanceInsight = {
      focusArea,
      neglectedArea,
      steadyArea,
      message: "",
    };
    insight.message = buildBalanceMessage(insight);
    return insight;
  } catch (error) {
    throw toClientError(error, "인생 균형 데이터를 불러오지 못했습니다.");
  }
}
