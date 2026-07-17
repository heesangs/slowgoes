"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import {
  getProfileForRequest,
  getUserBucketsForRequest,
  getTodosForDate,
  getStridePlan,
} from "@/lib/dashboard";
import {
  generateSingleNextStep,
  regenerateSingleStride,
  STRIDE_ORDER,
  STRIDE_LABELS,
  type SingleNextStepResult,
} from "@/lib/ai/analyze";
import {
  AUTH_ERRORS,
  AI_ERRORS,
  BUCKET_ERRORS,
  TODO_ERRORS,
  STRIDE_ERRORS,
} from "@/lib/constants";
import type {
  DashboardV2Data,
  ItemSource,
  StrideItem,
  StrideLevel,
  StridePlan,
  StrideScope,
  StrideTitleHistory,
  StrideTitleHistoryEntry,
  TodoRepeatInput,
  TodoRepeatType,
  TodoWithCompletion,
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

// ── React Query queryFn용 대시보드 읽기 액션 ──
// requestedBucketId(URL ?bucket= 또는 쿠키)를 받아 버킷 선택을 해석하고
// DashboardV2Data를 조합해 반환한다. profile 없으면(온보딩 미완) null 반환.
export async function fetchDashboardDataAction(
  requestedBucketId: string | null
): Promise<DashboardV2Data | null> {
  const user = await getAuthUser();
  if (!user) throw new Error(AUTH_ERRORS.LOGIN_REQUIRED);

  const supabase = await createClient();

  const [profile, buckets] = await Promise.all([
    getProfileForRequest(user.id),
    getUserBucketsForRequest(user.id),
  ]);

  // 온보딩 미완 → null (로더가 /onboarding으로 보냄)
  if (!profile) return null;

  // 선택 해석: 요청 버킷이 유효하면 그것, 아니면 buckets[0]
  const selectedBucketId =
    requestedBucketId && buckets.some((b) => b.id === requestedBucketId)
      ? requestedBucketId
      : (buckets[0]?.id ?? null);
  const selectedBucket =
    (selectedBucketId && buckets.find((b) => b.id === selectedBucketId)) || null;

  // Phase C: todos는 날짜별 독립 쿼리(fetchTodosForDateAction)로 분리 —
  // 날짜 전환 시 대시보드 셸(profile/buckets/stride)을 재조회하지 않는다.
  const stridePlan = await getStridePlan(supabase, user.id, selectedBucketId);

  return { profile, buckets, selectedBucket, stridePlan };
}

// 선택 날짜의 할 일 목록 (React Query queryFn — 키: ['todos', bucketId, date])
export async function fetchTodosForDateAction(
  bucketId: string | null,
  dateStr: string
): Promise<TodoWithCompletion[]> {
  const user = await getAuthUser();
  if (!user) throw new Error(AUTH_ERRORS.LOGIN_REQUIRED);
  if (!DATE_RE.test(dateStr)) throw new Error("날짜 형식이 올바르지 않습니다.");

  const supabase = await createClient();
  return getTodosForDate(supabase, user.id, bucketId, dateStr);
}

function normalizeSource(source: ItemSource | undefined): ItemSource {
  if (source === "manual" || source === "ai_generated" || source === "onboarding") {
    return source;
  }
  return "manual";
}

// AI 추천 컨텍스트 로드 — 버킷/발걸음/기존 할일(중복 방지용 제목)
async function loadNextStepContext(bucketId: string) {
  const { supabase, userId } = await getAuthContext();

  const [bucketResult, analysisResult, todosResult] = await Promise.all([
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
      .from("todos")
      .select("title, repeat_type")
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
  if (todosResult.error) throw todosResult.error;

  const bucket = bucketResult.data as {
    id: string;
    title: string;
    life_area?: { name?: string } | { name?: string }[] | null;
  };

  const lifeAreaRaw = bucket.life_area;
  const bucketLifeArea = Array.isArray(lifeAreaRaw)
    ? lifeAreaRaw[0]?.name ?? null
    : lifeAreaRaw?.name ?? null;

  const todoRows =
    (todosResult.data as Array<{ title: string; repeat_type: string | null }> | null) ?? [];

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
    bucket,
    lifeArea: bucketLifeArea ?? (analysisResult.data.life_area as string) ?? "성장",
    strides,
    todoRows,
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
    // 통합 모델: 반복 여부와 무관하게 전체 할 일 제목을 중복 방지에 사용
    const existingSameType = ctx.todoRows.map((row) => row.title);

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
//   단일 발걸음 재생성(regenerateStrideItemAction)은 StepSheet(edit-with-ai)에서 계속 사용 (IA v2 목표 4).

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
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, BUCKET_ERRORS.DELETE_ERROR),
    };
  }
}

/**
 * PR 37: 데일리투두 삭제 — 발걸음 수정 시트의 trash 아이콘에서 호출.
 *
 * Hard delete. action_logs는 `bucket_id ON DELETE SET NULL`이 아니라 별도 컬럼이며,
 * daily_todos 자체에 대한 FK 정책이 없어 삭제해도 logs는 그대로 남음(고아 참조).
 * 통계/회고용으로 historical record는 의도된 보존.
 */
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
 * StepSheet(edit-with-ai)의 "저장" 버튼에서 호출. AI 재생성은 regenerateStrideItemAction이 담당.
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

// ── Phase B: 통합 todos 액션 ──

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidWeekday(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 6;
}

// TodoRepeatInput → todos 컬럼 값 (서버측 검증 포함)
function normalizeRepeatInput(repeat: TodoRepeatInput | null | undefined): {
  repeat_type: TodoRepeatType | null;
  repeat_weekdays: number[] | null;
  repeat_month_day: number | null;
  repeat_month: number | null;
} {
  if (!repeat) {
    return { repeat_type: null, repeat_weekdays: null, repeat_month_day: null, repeat_month: null };
  }
  switch (repeat.type) {
    case "daily":
      return { repeat_type: "daily", repeat_weekdays: null, repeat_month_day: null, repeat_month: null };
    case "weekly": {
      const weekdays = [...new Set((repeat.weekdays ?? []).filter(isValidWeekday))].sort(
        (a, b) => a - b
      );
      if (weekdays.length === 0) {
        throw new Error("반복 요일을 선택해주세요.");
      }
      return { repeat_type: "weekly", repeat_weekdays: weekdays, repeat_month_day: null, repeat_month: null };
    }
    case "monthly": {
      const day = repeat.monthDay;
      if (!day || !Number.isInteger(day) || day < 1 || day > 31) {
        throw new Error("반복 일자가 올바르지 않습니다.");
      }
      return { repeat_type: "monthly", repeat_weekdays: null, repeat_month_day: day, repeat_month: null };
    }
    case "yearly": {
      const day = repeat.monthDay;
      const month = repeat.month;
      if (!day || !Number.isInteger(day) || day < 1 || day > 31) {
        throw new Error("반복 일자가 올바르지 않습니다.");
      }
      if (!month || !Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error("반복 월이 올바르지 않습니다.");
      }
      return { repeat_type: "yearly", repeat_weekdays: null, repeat_month_day: day, repeat_month: month };
    }
    default:
      throw new Error("반복 유형이 올바르지 않습니다.");
  }
}

/**
 * 할 일 추가 (반복 옵션 포함 — 반복을 켜면 구 "루틴"이 된다).
 * scheduledDate: 클라이언트 로컬 기준 날짜(캘린더 선택 날짜, 기본 오늘) — TZ 어긋남 방지.
 */
export async function addTodoAction(
  bucketId: string,
  input: {
    title: string;
    scheduledDate: string;
    repeat?: TodoRepeatInput | null;
    source?: ItemSource;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const title = input.title?.trim();
    if (!title) throw new Error("할 일 내용을 입력해주세요.");
    if (!DATE_RE.test(input.scheduledDate)) throw new Error("날짜 형식이 올바르지 않습니다.");

    const repeatCols = normalizeRepeatInput(input.repeat);

    const { error } = await supabase.from("todos").insert({
      user_id: userId,
      bucket_id: bucketId,
      title,
      source: normalizeSource(input.source),
      scheduled_date: input.scheduledDate,
      ...repeatCols,
    });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "할 일 추가에 실패했어요."),
    };
  }
}

/**
 * 할 일 완료 토글 (날짜 단위).
 * 반복/1회성 공통: 해당 날짜의 completion 행을 넣거나 뺀다. 회고용 action_logs 동기화.
 */
export async function toggleTodoCompletionAction(
  todoId: string,
  dateStr: string
): Promise<{ success: boolean; data?: { completed: boolean }; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();
    if (!DATE_RE.test(dateStr)) throw new Error("날짜 형식이 올바르지 않습니다.");

    const { data: todo, error: todoError } = await supabase
      .from("todos")
      .select("id, title, bucket_id")
      .eq("id", todoId)
      .eq("user_id", userId)
      .maybeSingle();

    if (todoError) throw todoError;
    if (!todo) throw new Error("할 일을 찾을 수 없습니다.");

    const { data: existing, error: existingError } = await supabase
      .from("todo_completions")
      .select("id")
      .eq("todo_id", todoId)
      .eq("completion_date", dateStr)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      // 완료 취소 — completion 삭제 + 최근 action_log 제거
      const { error: deleteError } = await supabase
        .from("todo_completions")
        .delete()
        .eq("id", existing.id);
      if (deleteError) throw deleteError;

      const { data: recentLog } = await supabase
        .from("action_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("item_type", "todo")
        .eq("item_id", todoId)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentLog) {
        await supabase.from("action_logs").delete().eq("id", recentLog.id);
      }

      return { success: true, data: { completed: false } };
    }

    // 완료 — completion 추가 + action_log 기록
    const { error: insertError } = await supabase.from("todo_completions").insert({
      todo_id: todoId,
      user_id: userId,
      completion_date: dateStr,
    });
    if (insertError) throw insertError;

    await supabase.from("action_logs").insert({
      user_id: userId,
      bucket_id: todo.bucket_id,
      item_type: "todo",
      item_id: todoId,
      title: todo.title,
      completed_at: new Date().toISOString(),
    });

    return { success: true, data: { completed: true } };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "상태 변경에 실패했어요."),
    };
  }
}

/**
 * 할 일 삭제.
 * 반복 없는 1회성 → hard delete / 반복 있음 → is_active=false (달성 기록 보존).
 */
export async function deleteTodoAction(
  todoId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const { data: todo, error: todoError } = await supabase
      .from("todos")
      .select("id, repeat_type")
      .eq("id", todoId)
      .eq("user_id", userId)
      .maybeSingle();

    if (todoError) throw todoError;
    if (!todo) throw new Error("할 일을 찾을 수 없습니다.");

    if (todo.repeat_type) {
      const { error } = await supabase
        .from("todos")
        .update({ is_active: false })
        .eq("id", todoId)
        .eq("user_id", userId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("todos")
        .delete()
        .eq("id", todoId)
        .eq("user_id", userId);
      if (error) throw error;
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "할 일 삭제에 실패했어요."),
    };
  }
}

