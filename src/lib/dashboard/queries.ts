import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { occursOn } from "@/lib/todos/repeat";
import type {
  Bucket,
  StridePlan,
  LifeBalanceInsight,
  LifeArea,
  Profile,
  Todo,
  TodoWithCompletion,
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

// 요청 스코프 dedup 버전 — 클라이언트를 내부 생성하여 userId만 키로 캐싱한다.
// (getProfile/getUserBuckets는 supabase 인스턴스를 인자로 받아 cache 키가 매번 달라지므로
//  layout의 nav 로더와 페이지에서 각각 호출해도 중복 쿼리가 생긴다. 아래 버전은 dedup됨.)
export const getProfileForRequest = cache(async (userId: string): Promise<Profile | null> => {
  const supabase = await createClient();
  return getProfile(supabase, userId);
});

export const getUserBucketsForRequest = cache(
  async (userId: string) => {
    const supabase = await createClient();
    return getUserBuckets(supabase, userId);
  }
);

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

// Phase B: 투두/루틴 통합 — 선택 날짜의 할 일 목록 (완료 여부 포함).
//
// 표시 규칙:
//   - 반복 있음: occursOn(date) 발생일에 표시. 완료 = 그 날짜의 completion 존재
//   - 반복 없음: scheduled_date 당일 표시. 단, 미완료인 채 지난 할 일은
//     오늘 뷰로 이월(overdue rollover — 완료 전까지 사라지지 않게)
//     완료 = completion 존재(1회성이므로 어느 날짜든)
export async function getTodosForDate(
  supabase: DashboardSupabase,
  userId: string,
  bucketId: string | null,
  dateStr: string
): Promise<TodoWithCompletion[]> {
  if (!bucketId) return [];

  try {
    const todosResult = await supabase
      .from("todos")
      .select("*")
      .eq("user_id", userId)
      .eq("bucket_id", bucketId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (todosResult.error) throw todosResult.error;

    const todos = (todosResult.data as Todo[] | null) ?? [];
    if (todos.length === 0) return [];

    const repeatingIds = todos.filter((t) => t.repeat_type).map((t) => t.id);
    const onceIds = todos.filter((t) => !t.repeat_type).map((t) => t.id);

    // 반복: 해당 날짜의 완료만 / 1회성: 어느 날짜든 완료 여부
    const [dateCompletionsResult, onceCompletionsResult] = await Promise.all([
      repeatingIds.length > 0
        ? supabase
            .from("todo_completions")
            .select("todo_id")
            .eq("user_id", userId)
            .eq("completion_date", dateStr)
            .in("todo_id", repeatingIds)
        : Promise.resolve({ data: [], error: null }),
      onceIds.length > 0
        ? supabase
            .from("todo_completions")
            .select("todo_id")
            .eq("user_id", userId)
            .in("todo_id", onceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (dateCompletionsResult.error) throw dateCompletionsResult.error;
    if (onceCompletionsResult.error) throw onceCompletionsResult.error;

    const completedOnDate = new Set(
      ((dateCompletionsResult.data as Array<{ todo_id: string }> | null) ?? []).map(
        (c) => c.todo_id
      )
    );
    const completedOnce = new Set(
      ((onceCompletionsResult.data as Array<{ todo_id: string }> | null) ?? []).map(
        (c) => c.todo_id
      )
    );

    return todos
      .filter((todo) => {
        if (todo.repeat_type) return occursOn(todo, dateStr);
        // 1회성: 당일 표시 + 미완료 이월(과거 날짜인데 아직 미완료면 오늘 뷰에 표시)
        if (todo.scheduled_date === dateStr) return true;
        return todo.scheduled_date < dateStr && !completedOnce.has(todo.id);
      })
      .map((todo) => ({
        ...todo,
        is_completed: todo.repeat_type
          ? completedOnDate.has(todo.id)
          : completedOnce.has(todo.id),
      }));
  } catch (error) {
    throw toClientError(error, "할 일을 불러오지 못했습니다.");
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
    // Phase B: 통합 todos — 완료는 todo_completions 단일 경로로 집계
    const [lifeAreasResult, bucketsResult, todosResult, completionsResult] =
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
          .from("todos")
          .select("id, bucket_id")
          .eq("user_id", userId),
        supabase
          .from("todo_completions")
          .select("todo_id, completed_at")
          .eq("user_id", userId)
          .gte("completed_at", toUtcIsoDaysAgo(TWO_WEEKS_DAYS)),
      ]);

    if (lifeAreasResult.error) throw lifeAreasResult.error;
    if (bucketsResult.error) throw bucketsResult.error;
    if (todosResult.error) throw todosResult.error;
    if (completionsResult.error) throw completionsResult.error;

    const lifeAreas =
      (lifeAreasResult.data as Array<Pick<LifeArea, "id" | "name">> | null) ?? [];
    const buckets =
      (bucketsResult.data as Array<Pick<Bucket, "id" | "life_area_id" | "status">> | null) ?? [];
    const todoRows =
      (todosResult.data as Array<{ id: string; bucket_id: string | null }> | null) ?? [];
    const completions =
      (completionsResult.data as Array<{ todo_id: string; completed_at: string | null }> | null) ??
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

    const todoBucketMap = new Map<string, string | null>();
    for (const todo of todoRows) {
      todoBucketMap.set(todo.id, todo.bucket_id);
    }

    for (const completion of completions) {
      const bucketId = todoBucketMap.get(completion.todo_id) ?? null;
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
