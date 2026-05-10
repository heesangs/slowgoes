import { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentWeekStartDate } from "@/lib/utils";
import type {
  ReviewPageData,
  ReviewRecentItem,
  ReviewSummary,
  ReviewTimeBand,
  ReviewTimeBandStat,
  TaskStats,
} from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_WEEKS_DAYS = 14;
const REVIEW_RECENT_LIMIT = 12;
const REVIEW_ACTION_LIMIT = 120;

interface ActionLogRow {
  id: string;
  item_type: "daily_todo" | "routine";
  title: string;
  completed_at: string;
  bucket?:
    | {
        title?: string | null;
        life_area?:
          | {
              name?: string | null;
            }
          | Array<{
              name?: string | null;
            }>
          | null;
      }
    | Array<{
        title?: string | null;
        life_area?:
          | {
              name?: string | null;
            }
          | Array<{
              name?: string | null;
            }>
          | null;
      }>
    | null;
}

function toUtcIsoDaysAgo(days: number) {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function resolveTimeBand(dateIso: string): ReviewTimeBand {
  const hour = new Date(dateIso).getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}

function buildReviewInsight(
  completedCount: number,
  strongestBand: ReviewTimeBand | null,
  completedInLast14Days: number
) {
  if (completedCount < 3) {
    return "행동 기록이 쌓이면 더 정확한 회고 인사이트를 보여드릴게요.";
  }

  if (completedInLast14Days >= 8) {
    return "최근 2주 동안 실행 흐름이 매우 좋아요. 지금 리듬을 유지해보세요.";
  }

  if (strongestBand === "morning") {
    return "오전에 행동 완료가 가장 많아요. 중요한 한 걸음을 오전에 배치해보세요.";
  }

  if (strongestBand === "evening") {
    return "저녁 시간대 실행력이 좋아요. 루틴 항목을 저녁에 붙여보세요.";
  }

  return "완료 기록이 안정적으로 쌓이고 있어요. 작은 행동을 꾸준히 이어가보세요.";
}

function toRecentItem(action: ActionLogRow): ReviewRecentItem {
  const bucket = normalizeRelation(action.bucket);
  const lifeArea = normalizeRelation(bucket?.life_area);

  return {
    id: action.id,
    title: action.title,
    completedAt: action.completed_at,
    itemType: action.item_type,
    bucketTitle: bucket?.title ?? null,
    lifeAreaName: lifeArea?.name ?? null,
  };
}

// PR 23: 평균 시간 / 난이도 측정 데이터가 DB에 없어 항상 null이던 ReviewSummary는
// completedCount + insight만 의미 있음. 단순화.
function buildReviewSummary(actions: ActionLogRow[], insight: string | null): ReviewSummary | null {
  if (actions.length === 0) return null;
  return {
    completedCount: actions.length,
    insight,
  };
}

export async function getTaskStats(
  supabase: SupabaseClient,
  userId: string
): Promise<TaskStats> {
  const weekStart = getCurrentWeekStartDate();

  const [dailyTodosResult, routinesResult, routineCompletionsResult, actionLogsResult] =
    await Promise.all([
      supabase
        .from("daily_todos")
        .select("status, completed_at")
        .eq("user_id", userId),
      supabase
        .from("routines")
        .select("id, is_active")
        .eq("user_id", userId),
      supabase
        .from("routine_completions")
        .select("id")
        .eq("user_id", userId)
        .eq("week_start", weekStart),
      supabase
        .from("action_logs")
        .select("completed_at")
        .eq("user_id", userId),
    ]);

  if (dailyTodosResult.error) throw new Error(dailyTodosResult.error.message);
  if (routinesResult.error) throw new Error(routinesResult.error.message);
  if (routineCompletionsResult.error) throw new Error(routineCompletionsResult.error.message);
  if (actionLogsResult.error) throw new Error(actionLogsResult.error.message);

  const dailyTodos =
    (dailyTodosResult.data as Array<{ status: "pending" | "completed"; completed_at: string | null }> | null) ??
    [];
  const routines =
    (routinesResult.data as Array<{ id: string; is_active: boolean }> | null) ?? [];
  const routineCompletions =
    (routineCompletionsResult.data as Array<{ id: string }> | null) ?? [];
  const actionLogs =
    (actionLogsResult.data as Array<{ completed_at: string | null }> | null) ?? [];

  const completedInLast14Days = actionLogs.filter((item) => {
    if (!item.completed_at) return false;
    return item.completed_at >= toUtcIsoDaysAgo(TWO_WEEKS_DAYS);
  }).length;

  return {
    totalDailyTodos: dailyTodos.length,
    completedDailyTodos: dailyTodos.filter((item) => item.status === "completed").length,
    totalRoutines: routines.filter((item) => item.is_active).length,
    completedRoutinesThisWeek: routineCompletions.length,
    totalActionsCompleted: actionLogs.length,
    completedInLast14Days,
  };
}

export async function getReviewPageData(
  supabase: SupabaseClient,
  userId: string
): Promise<ReviewPageData | null> {
  const { data, error } = await supabase
    .from("action_logs")
    .select("id, item_type, title, completed_at, bucket:buckets(title, life_area:life_areas(name))")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(REVIEW_ACTION_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  const actions = (data as ActionLogRow[] | null) ?? [];
  if (actions.length === 0) {
    return null;
  }

  const completedInLast14Days = actions.filter((item) => {
    return item.completed_at >= toUtcIsoDaysAgo(TWO_WEEKS_DAYS);
  }).length;

  const timeBandCounts: Record<ReviewTimeBand, number> = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
  };

  for (const action of actions) {
    const band = resolveTimeBand(action.completed_at);
    timeBandCounts[band] += 1;
  }

  const timeBandStats: ReviewTimeBandStat[] = [
    { band: "morning", label: "오전 (05~11시)", count: timeBandCounts.morning },
    { band: "afternoon", label: "오후 (12~17시)", count: timeBandCounts.afternoon },
    { band: "evening", label: "저녁 (18~22시)", count: timeBandCounts.evening },
    { band: "night", label: "밤 (23~04시)", count: timeBandCounts.night },
  ];

  const strongestBandStat = [...timeBandStats].sort((a, b) => b.count - a.count)[0];
  const strongestBand =
    strongestBandStat && strongestBandStat.count > 0 ? strongestBandStat.band : null;

  const insight = buildReviewInsight(actions.length, strongestBand, completedInLast14Days);

  return {
    completedCount: actions.length,
    completedInLast14Days,
    strongestBand,
    timeBandStats,
    insight,
    summary: buildReviewSummary(actions, insight),
    recent: actions.slice(0, REVIEW_RECENT_LIMIT).map(toRecentItem),
  };
}
