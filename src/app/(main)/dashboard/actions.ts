"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  analyzeLifeScene,
  generateActionTip,
  generateWeeklyItems,
  regenerateSingleStride,
} from "@/lib/ai/analyze";
import { getCurrentWeekStartDate } from "@/lib/utils";
import type {
  ActionLogItemType,
  Gender,
  ItemSource,
  PersonalityType,
  Profile,
  RoutineRepeatUnit,
  StrideItem,
  StrideLevel,
  StridePlan,
  StrideScope,
} from "@/types";

function toClientErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message?.trim();
  if (!message) return fallback;

  const lower = message.toLowerCase();
  if (
    lower.includes("googlegenerativeai") ||
    lower.includes("generativelanguage.googleapis.com")
  ) {
    return "AI 서비스 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  }

  if (message.length > 180) {
    return fallback;
  }

  return message;
}

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  return { supabase, userId: user.id };
}

function normalizeItemType(itemType: string): ActionLogItemType {
  return itemType === "routine" ? "routine" : "daily_todo";
}

function normalizeSource(source: ItemSource | undefined): ItemSource {
  if (source === "manual" || source === "ai_generated" || source === "onboarding") {
    return source;
  }
  return "manual";
}

function normalizeRepeatUnit(value: RoutineRepeatUnit | undefined): RoutineRepeatUnit {
  return value === "daily" ? "daily" : "weekly";
}

function normalizeRepeatValue(value: number | undefined, unit: RoutineRepeatUnit): number {
  const max = unit === "daily" ? 7 : 14;
  return Math.max(1, Math.min(max, Math.round(value || 1)));
}

export async function toggleDailyTodoAction(todoId: string): Promise<{
  success: boolean;
  data?: { status: "pending" | "completed" };
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthContext();

    const { data: todo, error: todoError } = await supabase
      .from("daily_todos")
      .select("id, title, status, action_tip, bucket_id")
      .eq("id", todoId)
      .eq("user_id", userId)
      .maybeSingle();

    if (todoError || !todo) {
      throw new Error("해당 데일리투두에 접근할 수 없습니다.");
    }

    const nextStatus = todo.status === "completed" ? "pending" : "completed";
    const completedAt = nextStatus === "completed" ? new Date().toISOString() : null;

    const { error: updateError } = await supabase
      .from("daily_todos")
      .update({ status: nextStatus, completed_at: completedAt })
      .eq("id", todo.id)
      .eq("user_id", userId);

    if (updateError) {
      throw updateError;
    }

    if (nextStatus === "completed") {
      const { error: logError } = await supabase.from("action_logs").insert({
        user_id: userId,
        bucket_id: todo.bucket_id,
        item_type: "daily_todo",
        item_id: todo.id,
        title: todo.title,
        ai_advice: todo.action_tip ?? null,
        completed_at: completedAt,
      });

      if (logError) {
        throw logError;
      }
    } else {
      const { data: latestLog } = await supabase
        .from("action_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("item_type", "daily_todo")
        .eq("item_id", todo.id)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestLog?.id) {
        await supabase
          .from("action_logs")
          .delete()
          .eq("id", latestLog.id)
          .eq("user_id", userId);
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/review");

    return { success: true, data: { status: nextStatus } };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "데일리투두 상태 변경에 실패했습니다."),
    };
  }
}

export async function toggleRoutineCompletionAction(routineId: string): Promise<{
  success: boolean;
  data?: { completed: boolean };
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthContext();
    const weekStart = getCurrentWeekStartDate();

    const { data: routine, error: routineError } = await supabase
      .from("routines")
      .select("id, title, action_tip, bucket_id")
      .eq("id", routineId)
      .eq("user_id", userId)
      .maybeSingle();

    if (routineError || !routine) {
      throw new Error("해당 루틴에 접근할 수 없습니다.");
    }

    const { data: existingCompletion, error: completionError } = await supabase
      .from("routine_completions")
      .select("id")
      .eq("routine_id", routine.id)
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (completionError) {
      throw completionError;
    }

    if (existingCompletion?.id) {
      const { error: deleteError } = await supabase
        .from("routine_completions")
        .delete()
        .eq("id", existingCompletion.id)
        .eq("user_id", userId);

      if (deleteError) {
        throw deleteError;
      }

      const { data: latestLog } = await supabase
        .from("action_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("item_type", "routine")
        .eq("item_id", routine.id)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestLog?.id) {
        await supabase
          .from("action_logs")
          .delete()
          .eq("id", latestLog.id)
          .eq("user_id", userId);
      }

      revalidatePath("/dashboard");
      revalidatePath("/review");
      return { success: true, data: { completed: false } };
    }

    const completedAt = new Date().toISOString();

    const { error: insertError } = await supabase
      .from("routine_completions")
      .insert({
        routine_id: routine.id,
        user_id: userId,
        week_start: weekStart,
        completed_at: completedAt,
      });

    if (insertError) {
      throw insertError;
    }

    const { error: logError } = await supabase.from("action_logs").insert({
      user_id: userId,
      bucket_id: routine.bucket_id,
      item_type: "routine",
      item_id: routine.id,
      title: routine.title,
      ai_advice: routine.action_tip ?? null,
      completed_at: completedAt,
    });

    if (logError) {
      throw logError;
    }

    revalidatePath("/dashboard");
    revalidatePath("/review");

    return { success: true, data: { completed: true } };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "루틴 완료 처리에 실패했습니다."),
    };
  }
}

export async function generateActionTipAction(
  itemId: string,
  itemType: ActionLogItemType
): Promise<{ success: boolean; data?: { tip: string }; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();
    const normalizedType = normalizeItemType(itemType);

    if (normalizedType === "daily_todo") {
      const { data: todo, error: todoError } = await supabase
        .from("daily_todos")
        .select("id, title, action_tip, bucket_id")
        .eq("id", itemId)
        .eq("user_id", userId)
        .maybeSingle();

      if (todoError || !todo) {
        throw new Error("데일리투두 정보를 찾을 수 없습니다.");
      }

      if (todo.action_tip?.trim()) {
        return { success: true, data: { tip: todo.action_tip } };
      }

      const [bucketResult, profileResult] = await Promise.all([
        todo.bucket_id
          ? supabase
              .from("buckets")
              .select("title, life_area:life_areas(name)")
              .eq("id", todo.bucket_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      ]);

      if (bucketResult.error) throw bucketResult.error;
      if (profileResult.error) throw profileResult.error;

      const lifeAreaRaw = (bucketResult.data as { life_area?: { name?: string } | { name?: string }[] | null } | null)
        ?.life_area;
      const lifeArea = Array.isArray(lifeAreaRaw)
        ? lifeAreaRaw[0]?.name ?? null
        : lifeAreaRaw?.name ?? null;
      const bucketTitle = (bucketResult.data as { title?: string } | null)?.title ?? null;

      const tip = await generateActionTip({
        itemTitle: todo.title,
        itemType: "daily_todo",
        bucketTitle,
        lifeArea,
        profile: (profileResult.data as Profile | null) ?? null,
      });

      const { error: updateError } = await supabase
        .from("daily_todos")
        .update({ action_tip: tip, action_tip_generated_at: new Date().toISOString() })
        .eq("id", todo.id)
        .eq("user_id", userId);

      if (updateError) {
        throw updateError;
      }

      return { success: true, data: { tip } };
    }

    const { data: routine, error: routineError } = await supabase
      .from("routines")
      .select("id, title, action_tip, bucket_id")
      .eq("id", itemId)
      .eq("user_id", userId)
      .maybeSingle();

    if (routineError || !routine) {
      throw new Error("루틴 정보를 찾을 수 없습니다.");
    }

    if (routine.action_tip?.trim()) {
      return { success: true, data: { tip: routine.action_tip } };
    }

    const [bucketResult, profileResult] = await Promise.all([
      routine.bucket_id
        ? supabase
            .from("buckets")
            .select("title, life_area:life_areas(name)")
            .eq("id", routine.bucket_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    ]);

    if (bucketResult.error) throw bucketResult.error;
    if (profileResult.error) throw profileResult.error;

    const lifeAreaRaw = (bucketResult.data as { life_area?: { name?: string } | { name?: string }[] | null } | null)
      ?.life_area;
    const lifeArea = Array.isArray(lifeAreaRaw)
      ? lifeAreaRaw[0]?.name ?? null
      : lifeAreaRaw?.name ?? null;
    const bucketTitle = (bucketResult.data as { title?: string } | null)?.title ?? null;

    const tip = await generateActionTip({
      itemTitle: routine.title,
      itemType: "routine",
      bucketTitle,
      lifeArea,
      profile: (profileResult.data as Profile | null) ?? null,
    });

    const { error: updateError } = await supabase
      .from("routines")
      .update({ action_tip: tip, action_tip_generated_at: new Date().toISOString() })
      .eq("id", routine.id)
      .eq("user_id", userId);

    if (updateError) {
      throw updateError;
    }

    return { success: true, data: { tip } };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "행동 조언 생성에 실패했습니다."),
    };
  }
}

export async function generateWeeklyItemsAction(bucketId: string): Promise<{
  success: boolean;
  data?: { addedDailyTodos: number; addedRoutines: number };
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthContext();
    const weekStart = getCurrentWeekStartDate();

    const [bucketResult, analysisResult, dailyResult, routineResult] = await Promise.all([
      supabase
        .from("buckets")
        .select("id, title, life_area:life_areas(name)")
        .eq("id", bucketId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("stride_plans")
        .select("strides, life_area")
        .eq("bucket_id", bucketId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("daily_todos")
        .select("title, sort_order")
        .eq("user_id", userId)
        .eq("bucket_id", bucketId)
        .eq("week_start", weekStart),
      supabase
        .from("routines")
        .select("title, sort_order")
        .eq("user_id", userId)
        .eq("bucket_id", bucketId)
        .eq("is_active", true),
    ]);

    if (bucketResult.error || !bucketResult.data) {
      throw new Error("버킷 정보를 찾을 수 없습니다.");
    }
    if (analysisResult.error || !analysisResult.data) {
      throw new Error("AI 추천 정보를 먼저 생성해주세요.");
    }
    if (dailyResult.error) throw dailyResult.error;
    if (routineResult.error) throw routineResult.error;

    const bucket = bucketResult.data as {
      id: string;
      title: string;
      life_area?: { name?: string } | { name?: string }[] | null;
    };

    const lifeAreaRaw = bucket.life_area;
    const lifeArea = Array.isArray(lifeAreaRaw)
      ? lifeAreaRaw[0]?.name ?? null
      : lifeAreaRaw?.name ?? null;

    const dailyRows = (dailyResult.data as Array<{ title: string; sort_order: number | null }> | null) ?? [];
    const routineRows = (routineResult.data as Array<{ title: string; sort_order: number | null }> | null) ?? [];

    const existingTitles = [
      ...dailyRows.map((item) => item.title),
      ...routineRows.map((item) => item.title),
    ];

    const VALID_STRIDE_LEVELS = [
      "today",
      "this_week",
      "this_month",
      "this_season",
      "this_year",
      "five_years",
      "decade",
      "someday",
    ] as const;

    const weeklyItems = await generateWeeklyItems({
      bucketTitle: bucket.title,
      lifeArea: lifeArea ?? (analysisResult.data.life_area as string) ?? "성장",
      strides: Array.isArray(analysisResult.data.strides)
        ? (analysisResult.data.strides as Array<{ level: string; label: string; action: string }>).map((item) => ({
            level: (VALID_STRIDE_LEVELS as readonly string[]).includes(item.level)
              ? (item.level as (typeof VALID_STRIDE_LEVELS)[number])
              : "this_week",
            label: item.label,
            action: item.action,
          }))
        : [],
      existingTitles,
    });

    const dailyStartSortOrder =
      dailyRows.reduce((max, row) => Math.max(max, row.sort_order ?? 0), -1) + 1;
    const routineStartSortOrder =
      routineRows.reduce((max, row) => Math.max(max, row.sort_order ?? 0), -1) + 1;

    if (weeklyItems.dailyTodos.length > 0) {
      const { error: insertDailyError } = await supabase.from("daily_todos").insert(
        weeklyItems.dailyTodos.map((item, index) => ({
          user_id: userId,
          bucket_id: bucket.id,
          title: item.title,
          status: "pending",
          source: "ai_generated",
          week_start: weekStart,
          sort_order: dailyStartSortOrder + index,
        }))
      );

      if (insertDailyError) {
        throw insertDailyError;
      }
    }

    if (weeklyItems.routines.length > 0) {
      const { error: insertRoutineError } = await supabase.from("routines").insert(
        weeklyItems.routines.map((item, index) => ({
          user_id: userId,
          bucket_id: bucket.id,
          title: item.title,
          source: "ai_generated",
          repeat_unit: item.repeatUnit,
          repeat_value: item.repeatValue,
          is_active: true,
          sort_order: routineStartSortOrder + index,
        }))
      );

      if (insertRoutineError) {
        throw insertRoutineError;
      }
    }

    revalidatePath("/dashboard");

    return {
      success: true,
      data: {
        addedDailyTodos: weeklyItems.dailyTodos.length,
        addedRoutines: weeklyItems.routines.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "이번 주 항목 생성에 실패했습니다."),
    };
  }
}

export async function addDailyTodoAction(
  bucketId: string,
  title: string,
  source: ItemSource = "manual"
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      throw new Error("데일리투두 제목을 입력해주세요.");
    }

    const weekStart = getCurrentWeekStartDate();

    const { data: maxRow } = await supabase
      .from("daily_todos")
      .select("sort_order")
      .eq("user_id", userId)
      .eq("bucket_id", bucketId)
      .eq("week_start", weekStart)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

    const { error } = await supabase.from("daily_todos").insert({
      user_id: userId,
      bucket_id: bucketId,
      title: trimmedTitle,
      status: "pending",
      source: normalizeSource(source),
      week_start: weekStart,
      sort_order: nextSortOrder,
    });

    if (error) {
      throw error;
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "데일리투두 추가에 실패했습니다."),
    };
  }
}

export async function addRoutineAction(
  bucketId: string,
  title: string,
  source: ItemSource = "manual",
  repeatUnit: RoutineRepeatUnit = "weekly",
  repeatValue = 1
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      throw new Error("루틴 제목을 입력해주세요.");
    }

    const normalizedRepeatUnit = normalizeRepeatUnit(repeatUnit);
    const normalizedRepeatValue = normalizeRepeatValue(repeatValue, normalizedRepeatUnit);

    const { data: maxRow } = await supabase
      .from("routines")
      .select("sort_order")
      .eq("user_id", userId)
      .eq("bucket_id", bucketId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

    const { error } = await supabase.from("routines").insert({
      user_id: userId,
      bucket_id: bucketId,
      title: trimmedTitle,
      source: normalizeSource(source),
      repeat_unit: normalizedRepeatUnit,
      repeat_value: normalizedRepeatValue,
      is_active: true,
      sort_order: nextSortOrder,
    });

    if (error) {
      throw error;
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "루틴 추가에 실패했습니다."),
    };
  }
}

// ============================================================================
// 나의 보폭(stride) 편집 / 재생성 액션
// ============================================================================

const STRIDE_LEVEL_POOL: StrideLevel[] = [
  "today",
  "this_week",
  "this_month",
  "this_season",
  "this_year",
  "five_years",
  "decade",
  "someday",
];

const STRIDE_LABEL_BY_LEVEL: Record<StrideLevel, string> = {
  today: "오늘",
  this_week: "이번 주",
  this_month: "이번 달",
  this_season: "이번 시즌",
  this_year: "1년 안",
  five_years: "5년 안",
  decade: "10년 안",
  someday: "언젠가",
};

function normalizeDraftStrides(raw: unknown): StrideItem[] {
  if (!Array.isArray(raw)) {
    throw new Error("보폭 데이터 형식이 올바르지 않습니다.");
  }
  const normalized: StrideItem[] = [];
  for (const row of raw) {
    const item = row as { level?: unknown; label?: unknown; action?: unknown };
    if (typeof item.level !== "string" || !STRIDE_LEVEL_POOL.includes(item.level as StrideLevel)) {
      throw new Error("보폭 레벨이 올바르지 않습니다.");
    }
    if (typeof item.action !== "string" || item.action.trim().length === 0) {
      throw new Error("빈 action은 저장할 수 없습니다.");
    }
    const level = item.level as StrideLevel;
    normalized.push({
      level,
      label: STRIDE_LABEL_BY_LEVEL[level],
      action: item.action.trim(),
    });
  }
  if (normalized.length < 3 || normalized.length > 5) {
    throw new Error("보폭은 3~5개여야 합니다.");
  }
  // 짧은 → 긴 순 정렬
  normalized.sort(
    (a, b) => STRIDE_LEVEL_POOL.indexOf(a.level) - STRIDE_LEVEL_POOL.indexOf(b.level)
  );
  return normalized;
}

async function loadStridePlanForBucket(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  bucketId: string
): Promise<StridePlan> {
  const { data, error } = await supabase
    .from("stride_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("bucket_id", bucketId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("AI 추천 정보를 먼저 생성해주세요.");
  return data as StridePlan;
}

async function loadBucketContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  bucketId: string
) {
  const { data, error } = await supabase
    .from("buckets")
    .select("id, title, stride_scope, life_area:life_areas(name)")
    .eq("id", bucketId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("해당 버킷에 접근할 수 없습니다.");
  }

  const row = data as {
    id: string;
    title: string;
    stride_scope: StrideScope;
    life_area?: { name?: string } | { name?: string }[] | null;
  };
  const lifeAreaRaw = row.life_area;
  const lifeAreaName = Array.isArray(lifeAreaRaw)
    ? lifeAreaRaw[0]?.name ?? null
    : lifeAreaRaw?.name ?? null;

  return {
    id: row.id,
    title: row.title,
    strideScope: row.stride_scope,
    lifeArea: lifeAreaName ?? "성장",
  };
}

/**
 * stride_plan 편집 저장 — 대시보드 바텀시트의 "저장" 버튼
 */
export async function updateStridePlanAction(
  bucketId: string,
  input: { empathyMessage?: string; strides: StrideItem[] }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();
    const normalized = normalizeDraftStrides(input.strides);

    const updatePayload: Record<string, unknown> = {
      strides: normalized,
      updated_at: new Date().toISOString(),
    };
    if (typeof input.empathyMessage === "string") {
      updatePayload.empathy_message = input.empathyMessage.trim();
    }

    const { error } = await supabase
      .from("stride_plans")
      .update(updatePayload)
      .eq("bucket_id", bucketId)
      .eq("user_id", userId);

    if (error) throw error;

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "보폭 저장에 실패했습니다."),
    };
  }
}

/**
 * stride_plan 전체 재생성 — "전체 다시 추천" 버튼
 */
export async function regenerateStridePlanAction(
  bucketId: string
): Promise<{ success: boolean; plan?: StridePlan; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const [bucket, profileResult] = await Promise.all([
      loadBucketContext(supabase, userId, bucketId),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    ]);

    const profile = (profileResult.data as Profile | null) ?? null;
    if (!profile) {
      throw new Error("프로필 정보가 없습니다.");
    }

    const analysis = await analyzeLifeScene({
      sceneText: bucket.title,
      age: profile.life_clock_age ?? 30,
      gender: (profile.gender as Gender) ?? "male",
      personalityType: (profile.personality_type as PersonalityType) ?? "INFP",
      strideScope: bucket.strideScope,
    });

    const payload = {
      user_id: userId,
      bucket_id: bucketId,
      life_area: analysis.lifeArea || bucket.lifeArea,
      empathy_message: analysis.empathyMessage || "",
      strides: analysis.strides,
      suggested_routines: analysis.suggestedRoutines,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("stride_plans")
      .upsert(payload, { onConflict: "bucket_id" })
      .select("*")
      .single();

    if (error) throw error;

    revalidatePath("/dashboard");
    return { success: true, plan: data as StridePlan };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "보폭 전체 재생성에 실패했습니다."),
    };
  }
}

/**
 * 특정 stride 항목만 재생성 — 각 행의 "🔄" 버튼
 */
export async function regenerateStrideItemAction(
  bucketId: string,
  targetLevel: StrideLevel
): Promise<{ success: boolean; item?: StrideItem; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    if (!STRIDE_LEVEL_POOL.includes(targetLevel)) {
      throw new Error("유효하지 않은 보폭 레벨입니다.");
    }

    const [bucket, plan] = await Promise.all([
      loadBucketContext(supabase, userId, bucketId),
      loadStridePlanForBucket(supabase, userId, bucketId),
    ]);

    const existingStrides = Array.isArray(plan.strides) ? plan.strides : [];
    if (!existingStrides.some((item) => item.level === targetLevel)) {
      throw new Error("해당 레벨이 현재 보폭 구성에 없습니다.");
    }

    const newItem = await regenerateSingleStride({
      bucketTitle: bucket.title,
      lifeArea: plan.life_area || bucket.lifeArea,
      existingStrides,
      targetLevel,
    });

    const updatedStrides = existingStrides.map((item) =>
      item.level === targetLevel ? newItem : item
    );

    const { error } = await supabase
      .from("stride_plans")
      .update({
        strides: updatedStrides,
        updated_at: new Date().toISOString(),
      })
      .eq("bucket_id", bucketId)
      .eq("user_id", userId);

    if (error) throw error;

    revalidatePath("/dashboard");
    return { success: true, item: newItem };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "보폭 재생성에 실패했습니다."),
    };
  }
}
