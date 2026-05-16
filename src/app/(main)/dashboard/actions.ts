"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  analyzeLifeScene,
  generateSingleNextStep,
  generateWeeklyItems,
  regenerateSingleStride,
  STRIDE_ORDER,
  STRIDE_LABELS,
  type SingleNextStepResult,
} from "@/lib/ai/analyze";
import { getCurrentWeekStartDate } from "@/lib/utils";
import {
  AUTH_ERRORS,
  AI_ERRORS,
  BUCKET_ERRORS,
  TODO_ERRORS,
  ROUTINE_ERRORS,
  STRIDE_ERRORS,
} from "@/lib/constants";
import type {
  DailyTodoStrideLevel,
  Gender,
  ItemSource,
  PersonalityType,
  Profile,
  RoutineRepeatUnit,
  RoutineTimeSlot,
  StrideItem,
  StrideLevel,
  StridePlan,
  StrideScope,
  StrideTitleHistory,
  StrideTitleHistoryEntry,
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
    return AI_ERRORS.SERVICE_ERROR;
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
    throw new Error(AUTH_ERRORS.LOGIN_REQUIRED);
  }

  return { supabase, userId: user.id };
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
      .select("id, title, status, bucket_id")
      .eq("id", todoId)
      .eq("user_id", userId)
      .maybeSingle();

    if (todoError || !todo) {
      throw new Error(TODO_ERRORS.ACCESS_DENIED);
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
        ai_advice: null,
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
      error: toClientErrorMessage(error, TODO_ERRORS.STATUS_CHANGE_FAILED),
    };
  }
}

// PR 22: 오늘 날짜를 "YYYY-MM-DD" 로컬 기준으로 반환 (UTC 변환 없이)
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function toggleRoutineCompletionAction(routineId: string): Promise<{
  success: boolean;
  data?: { completed: boolean };
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthContext();
    // PR 22: 일 단위 토글로 변경. week_start는 호환성 위해 함께 저장.
    const today = getTodayDateString();
    const weekStart = getCurrentWeekStartDate();

    const { data: routine, error: routineError } = await supabase
      .from("routines")
      .select("id, title, bucket_id")
      .eq("id", routineId)
      .eq("user_id", userId)
      .maybeSingle();

    if (routineError || !routine) {
      throw new Error(ROUTINE_ERRORS.ACCESS_DENIED);
    }

    const { data: existingCompletion, error: completionError } = await supabase
      .from("routine_completions")
      .select("id")
      .eq("routine_id", routine.id)
      .eq("user_id", userId)
      .eq("completion_date", today)
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
        completion_date: today,
        week_start: weekStart, // 호환성 유지
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
      ai_advice: null,
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
      error: toClientErrorMessage(error, ROUTINE_ERRORS.COMPLETE_FAILED),
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
      throw new Error(BUCKET_ERRORS.INFO_NOT_FOUND);
    }
    if (analysisResult.error || !analysisResult.data) {
      throw new Error(BUCKET_ERRORS.STRIDE_PLAN_REQUIRED);
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
      error: toClientErrorMessage(error, TODO_ERRORS.WEEKLY_GENERATE_FAILED),
    };
  }
}

/**
 * "한걸음 더" 시트 — 버킷의 발걸음/영역 컨텍스트와 기존 항목 제목을 함께 로드.
 * 단건 추천(미리보기)와 적용 액션에서 공통으로 사용.
 */
async function loadNextStepContext(bucketId: string) {
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
    throw new Error(BUCKET_ERRORS.INFO_NOT_FOUND);
  }
  if (analysisResult.error || !analysisResult.data) {
    throw new Error(BUCKET_ERRORS.STRIDE_PLAN_REQUIRED);
  }
  if (dailyResult.error) throw dailyResult.error;
  if (routineResult.error) throw routineResult.error;

  const bucket = bucketResult.data as {
    id: string;
    title: string;
    life_area?: { name?: string } | { name?: string }[] | null;
  };

  const lifeAreaRaw = bucket.life_area;
  const bucketLifeArea = Array.isArray(lifeAreaRaw)
    ? lifeAreaRaw[0]?.name ?? null
    : lifeAreaRaw?.name ?? null;

  const dailyRows =
    (dailyResult.data as Array<{ title: string; sort_order: number | null }> | null) ?? [];
  const routineRows =
    (routineResult.data as Array<{ title: string; sort_order: number | null }> | null) ?? [];

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

  const strides = Array.isArray(analysisResult.data.strides)
    ? (analysisResult.data.strides as Array<{ level: string; label: string; action: string }>).map(
        (item) => ({
          level: (VALID_STRIDE_LEVELS as readonly string[]).includes(item.level)
            ? (item.level as (typeof VALID_STRIDE_LEVELS)[number])
            : "this_week",
          label: item.label,
          action: item.action,
        })
      )
    : [];

  return {
    supabase,
    userId,
    weekStart,
    bucket,
    lifeArea: bucketLifeArea ?? (analysisResult.data.life_area as string) ?? "성장",
    strides,
    dailyRows,
    routineRows,
  };
}

/**
 * "한걸음 더" 시트의 단건 미리보기. DB 저장 없이 추천만 반환.
 * type: 'daily_todo' | 'routine'
 * excludeTitles: 부분 새로고침 시 현재 표시 중인 동종 항목 제목(중복 방지)
 */
export async function generateNextStepPreviewAction(
  bucketId: string,
  type: "daily_todo" | "routine",
  excludeTitles: string[] = []
): Promise<{ success: boolean; data?: SingleNextStepResult; error?: string }> {
  try {
    const ctx = await loadNextStepContext(bucketId);
    const existingSameType =
      type === "daily_todo"
        ? ctx.dailyRows.map((row) => row.title)
        : ctx.routineRows.map((row) => row.title);

    const result = await generateSingleNextStep({
      bucketTitle: ctx.bucket.title,
      lifeArea: ctx.lifeArea,
      strides: ctx.strides,
      type,
      excludeTitles: [...existingSameType, ...excludeTitles].filter(Boolean),
    });

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, TODO_ERRORS.WEEKLY_GENERATE_FAILED),
    };
  }
}

/**
 * "한걸음 더" 시트의 "적용하기" — 미리보기로 받은 데일리/루틴을 DB에 저장.
 * daily / routine 둘 다 옵션이며, 적어도 하나는 있어야 함.
 */
export async function applyNextStepAction(
  bucketId: string,
  payload: {
    daily?: { title: string; strideLevel: DailyTodoStrideLevel } | null;
    routine?: {
      title: string;
      repeatUnit: RoutineRepeatUnit;
      repeatValue: number;
      /** PR 19: 루틴 시간대. NULL 허용. */
      timeSlot?: RoutineTimeSlot | null;
    } | null;
  }
): Promise<{
  success: boolean;
  data?: { addedDailyTodos: number; addedRoutines: number };
  error?: string;
}> {
  try {
    const dailyTitle = payload.daily?.title.trim();
    const routineTitle = payload.routine?.title.trim();

    if (!dailyTitle && !routineTitle) {
      throw new Error("적용할 항목을 선택해 주세요.");
    }

    // PR 18: stride_level은 'this_month'만 허용 (실행계획 단순화).
    if (payload.daily && payload.daily.strideLevel !== "this_month") {
      throw new Error("기간 선택이 올바르지 않습니다.");
    }

    // PR 19: time_slot 검증 (CHECK 제약과 일치)
    const allowedTimeSlots: RoutineTimeSlot[] = ["morning", "afternoon", "evening", "night"];
    if (
      payload.routine?.timeSlot &&
      !allowedTimeSlots.includes(payload.routine.timeSlot)
    ) {
      throw new Error("시간대 선택이 올바르지 않습니다.");
    }

    const ctx = await loadNextStepContext(bucketId);

    const dailyStartSortOrder =
      ctx.dailyRows.reduce((max, row) => Math.max(max, row.sort_order ?? 0), -1) + 1;
    const routineStartSortOrder =
      ctx.routineRows.reduce((max, row) => Math.max(max, row.sort_order ?? 0), -1) + 1;

    let addedDailyTodos = 0;
    let addedRoutines = 0;

    if (dailyTitle && payload.daily) {
      const { error } = await ctx.supabase.from("daily_todos").insert({
        user_id: ctx.userId,
        bucket_id: ctx.bucket.id,
        title: dailyTitle,
        status: "pending",
        source: "ai_generated" as const,
        stride_level: payload.daily.strideLevel,
        week_start: ctx.weekStart,
        sort_order: dailyStartSortOrder,
      });
      if (error) throw error;
      addedDailyTodos = 1;
    }

    if (routineTitle && payload.routine) {
      const { error } = await ctx.supabase.from("routines").insert({
        user_id: ctx.userId,
        bucket_id: ctx.bucket.id,
        title: routineTitle,
        source: "ai_generated" as const,
        repeat_unit: payload.routine.repeatUnit,
        repeat_value: payload.routine.repeatValue,
        time_slot: payload.routine.timeSlot ?? null, // PR 19
        is_active: true,
        sort_order: routineStartSortOrder,
      });
      if (error) throw error;
      addedRoutines = 1;
    }

    revalidatePath("/dashboard");

    return { success: true, data: { addedDailyTodos, addedRoutines } };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, TODO_ERRORS.ADD_FAILED),
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
      throw new Error(TODO_ERRORS.TITLE_REQUIRED);
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
      error: toClientErrorMessage(error, TODO_ERRORS.ADD_FAILED),
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
      throw new Error(ROUTINE_ERRORS.TITLE_REQUIRED);
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
      error: toClientErrorMessage(error, ROUTINE_ERRORS.ADD_FAILED),
    };
  }
}

// ============================================================================
// 나의 발걸음(stride) 편집 / 재생성 액션
// ============================================================================

function normalizeDraftStrides(raw: unknown): StrideItem[] {
  if (!Array.isArray(raw)) {
    throw new Error(STRIDE_ERRORS.DATA_FORMAT_INVALID);
  }
  const normalized: StrideItem[] = [];
  for (const row of raw) {
    const item = row as { level?: unknown; label?: unknown; action?: unknown };
    if (typeof item.level !== "string" || !STRIDE_ORDER.includes(item.level as StrideLevel)) {
      throw new Error(STRIDE_ERRORS.LEVEL_INVALID);
    }
    if (typeof item.action !== "string" || item.action.trim().length === 0) {
      throw new Error(STRIDE_ERRORS.EMPTY_ACTION);
    }
    const level = item.level as StrideLevel;
    normalized.push({
      level,
      label: STRIDE_LABELS[level],
      action: item.action.trim(),
    });
  }
  if (normalized.length < 3 || normalized.length > 6) {
    throw new Error(STRIDE_ERRORS.COUNT_INVALID);
  }
  // someday 필수
  if (!normalized.some((s) => s.level === "someday")) {
    throw new Error(STRIDE_ERRORS.SOMEDAY_REQUIRED);
  }
  // 짧은 → 긴 순 정렬
  normalized.sort(
    (a, b) => STRIDE_ORDER.indexOf(a.level) - STRIDE_ORDER.indexOf(b.level)
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
  if (!data) throw new Error(BUCKET_ERRORS.STRIDE_PLAN_REQUIRED);
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
    throw new Error(BUCKET_ERRORS.ACCESS_DENIED);
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
  input: { strides: StrideItem[] }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();
    const normalized = normalizeDraftStrides(input.strides);

    const updatePayload: Record<string, unknown> = {
      strides: normalized,
      updated_at: new Date().toISOString(),
    };

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
      error: toClientErrorMessage(error, "발걸음 저장에 실패했습니다."),
    };
  }
}

// PR 34: regenerateStridePlanAction (전체 재생성) 제거 — UX 단순화.
//   단일 발걸음 재생성(regenerateStrideItemAction)은 EditWithAISheet에서 계속 사용.

/**
 * PR 36: 버킷 삭제 — 한걸음 상세 페이지 ⋮ 메뉴에서 호출.
 *
 * CASCADE 설정으로 자동 정리되는 자식 레코드:
 *   stride_plans / daily_todos / routines / chapters (모두 bucket_id ON DELETE CASCADE)
 *   routine_completions (routine_id ON DELETE CASCADE → routines 통해 연쇄)
 * 유지되는 자식 레코드:
 *   action_logs (bucket_id ON DELETE SET NULL — 회고/통계 데이터 보존)
 *
 * 권한: user_id 매칭 확인 (RLS도 있지만 명시적 가드).
 */
export async function deleteBucketAction(
  bucketId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const trimmed = bucketId?.trim();
    if (!trimmed) {
      return { success: false, error: BUCKET_ERRORS.NOT_FOUND_OR_ACCESS_DENIED };
    }

    const { error } = await supabase
      .from("buckets")
      .delete()
      .eq("id", trimmed)
      .eq("user_id", userId);

    if (error) throw error;

    revalidatePath("/dashboard");
    revalidatePath("/actions");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, BUCKET_ERRORS.DELETE_ERROR),
    };
  }
}

// PR 15: 단계별 타이틀 이력에 prepend (최대 20개까지 누적, 시트 picker는 최근 5개만 표시)
const TITLE_HISTORY_MAX = 20;

function prependHistory(
  current: StrideTitleHistory | null | undefined,
  level: StrideLevel,
  entry: StrideTitleHistoryEntry
): StrideTitleHistory {
  const next: StrideTitleHistory = { ...(current ?? {}) };
  const prev = next[level] ?? [];
  next[level] = [entry, ...prev].slice(0, TITLE_HISTORY_MAX);
  return next;
}

/**
 * 특정 stride 항목만 재생성 — 각 행의 "🔄" 버튼
 * PR 15: 교체 시 기존 타이틀을 title_history에 prepend (source: "ai")
 */
export async function regenerateStrideItemAction(
  bucketId: string,
  targetLevel: StrideLevel
): Promise<{ success: boolean; item?: StrideItem; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    if (!STRIDE_ORDER.includes(targetLevel)) {
      throw new Error(STRIDE_ERRORS.LEVEL_INVALID_ALT);
    }

    const [bucket, plan] = await Promise.all([
      loadBucketContext(supabase, userId, bucketId),
      loadStridePlanForBucket(supabase, userId, bucketId),
    ]);

    const existingStrides = Array.isArray(plan.strides) ? plan.strides : [];
    const existing = existingStrides.find((item) => item.level === targetLevel);
    if (!existing) {
      throw new Error(STRIDE_ERRORS.LEVEL_NOT_IN_PLAN);
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
    // PR 15: 기존 타이틀을 title_history에 prepend (source: "ai")
    const nextHistory = prependHistory(plan.title_history, targetLevel, {
      title: existing.action,
      generated_at: new Date().toISOString(),
      source: "ai",
    });

    const { error } = await supabase
      .from("stride_plans")
      .update({
        strides: updatedStrides,
        title_history: nextHistory,
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
      error: toClientErrorMessage(error, STRIDE_ERRORS.REGENERATE_SINGLE_FAILED),
    };
  }
}

/**
 * 특정 stride 항목의 action을 사용자 입력 텍스트로 업데이트 (PR 9)
 * EditWithAISheet의 "확인" 버튼에서 호출. AI 재생성은 regenerateStrideItemAction이 담당.
 */
export async function updateStrideItemAction(
  bucketId: string,
  targetLevel: StrideLevel,
  newAction: string
): Promise<{ success: boolean; item?: StrideItem; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    if (!STRIDE_ORDER.includes(targetLevel)) {
      throw new Error(STRIDE_ERRORS.LEVEL_INVALID_ALT);
    }
    const trimmed = newAction.trim();
    if (!trimmed) {
      throw new Error(STRIDE_ERRORS.ITEM_TITLE_EMPTY);
    }

    const plan = await loadStridePlanForBucket(supabase, userId, bucketId);
    const existingStrides = Array.isArray(plan.strides) ? plan.strides : [];
    const existing = existingStrides.find((item) => item.level === targetLevel);
    if (!existing) {
      throw new Error(STRIDE_ERRORS.LEVEL_NOT_IN_PLAN);
    }

    const updatedItem: StrideItem = {
      level: existing.level,
      label: existing.label,
      action: trimmed,
    };
    const updatedStrides = existingStrides.map((item) =>
      item.level === targetLevel ? updatedItem : item
    );

    const updatePayload: Record<string, unknown> = {
      strides: updatedStrides,
      updated_at: new Date().toISOString(),
    };

    // PR 15: 새 값이 기존과 다를 때만 title_history에 prepend (source: "manual")
    if (existing.action !== trimmed) {
      updatePayload.title_history = prependHistory(plan.title_history, targetLevel, {
        title: existing.action,
        generated_at: new Date().toISOString(),
        source: "manual",
      });
    }

    const { error } = await supabase
      .from("stride_plans")
      .update(updatePayload)
      .eq("bucket_id", bucketId)
      .eq("user_id", userId);

    if (error) throw error;

    revalidatePath("/dashboard");
    return { success: true, item: updatedItem };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "발걸음 수정에 실패했습니다."),
    };
  }
}

/**
 * PR 22: 특정 루틴의 월별 완료 일자 조회 (캘린더 시트용).
 * 반환: ["YYYY-MM-DD", ...] — 해당 월에 완료된 날짜 배열.
 */
export async function getRoutineCompletionsForMonthAction(
  routineId: string,
  year: number,
  month: number // 1-12 (사용자 친화적으로)
): Promise<{ success: boolean; dates?: string[]; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    // month는 1-12로 받지만 Date 생성 시는 0-11로 변환
    const monthIndex = month - 1;
    if (monthIndex < 0 || monthIndex > 11) {
      throw new Error("월 값이 올바르지 않습니다.");
    }

    // 월의 시작/끝 ("YYYY-MM-DD" 형식)
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 1); // 다음 달 1일 (exclusive)
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-01`;

    const { data, error } = await supabase
      .from("routine_completions")
      .select("completion_date")
      .eq("routine_id", routineId)
      .eq("user_id", userId)
      .gte("completion_date", startStr)
      .lt("completion_date", endStr);

    if (error) throw error;

    const dates = (data ?? []).map((row) => row.completion_date as string);
    return { success: true, dates };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "달성 기록을 불러오지 못했습니다."),
    };
  }
}
