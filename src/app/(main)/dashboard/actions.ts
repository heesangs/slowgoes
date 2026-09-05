"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import {
  getProfileForRequest,
  getUserBucketsForRequest,
  getBucketTodos,
  getStridePlan,
} from "@/lib/dashboard";
import {
  COMPLETED_TODOS_FOR_PROMPT,
  generateTodoSuggestions,
  generateWeeklyGoals,
  regenerateSingleStride,
  STRIDE_ORDER,
  STRIDE_LABELS,
} from "@/lib/ai/analyze";
import { getRecentDiaryExcerpts } from "@/lib/diary/queries";
import {
  AUTH_ERRORS,
  AI_ERRORS,
  BUCKET_ERRORS,
  TODO_ERRORS,
  STRIDE_ERRORS,
} from "@/lib/constants";
import type {
  BucketSummary,
  CompletedBucketSummary,
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
  BucketTodosData,
  Todo,
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

  const [profile, allBuckets] = await Promise.all([
    getProfileForRequest(user.id),
    getUserBucketsForRequest(user.id),
  ]);

  // 온보딩 미완 → null (로더가 /onboarding으로 보냄)
  if (!profile) return null;

  // 완료한 버킷은 대시보드 주 동선에서 빼되 **버리지는 않는다** — 버킷 시트 하단의
  // "완료한 버킷 N"이 이걸 쓰고, 거기서 다시 시작할 수 있다(restoreBucketAction).
  // 걸러진 뒤에 선택을 해석하므로, ?bucket= 이 완료된 버킷을 가리켜도 자동으로
  // 남은 활성 버킷 중 첫 번째로 넘어간다.
  const buckets = allBuckets.filter((b) => b.status !== "completed");
  const completedBuckets = allBuckets
    .filter((b) => b.status === "completed")
    // 최근에 끝낸 것이 위로. completed_at이 없는 예전 행은 맨 뒤로 민다.
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));

  // 선택 해석: 요청 버킷이 유효하면 그것, 아니면 buckets[0]
  const selectedBucketId =
    requestedBucketId && buckets.some((b) => b.id === requestedBucketId)
      ? requestedBucketId
      : (buckets[0]?.id ?? null);
  const selectedBucket =
    (selectedBucketId && buckets.find((b) => b.id === selectedBucketId)) || null;

  // todos는 ['todos', bucketId] 캐시가 따로 관리하지만(날짜 전환 왕복 0회),
  // **첫 진입분만은 여기서 같이 실어 보낸다.**
  // 안 그러면 "대시보드 응답 → 그제서야 bucketId 확정 → todos 요청"으로 순차 2왕복이
  // 되고, 그 사이 빈 상태("오늘의 할 일이 없어요")가 스친다. 특히 최초 로그인은
  // 쿠키가 없어 클라이언트가 프리페치할 버킷 id조차 모른다.
  const [stridePlan, bucketTodos] = await Promise.all([
    getStridePlan(supabase, user.id, selectedBucketId),
    getBucketTodos(supabase, user.id, selectedBucketId),
  ]);

  return { profile, buckets, completedBuckets, selectedBucket, stridePlan, bucketTodos };
}

// 버킷 단위 todos 캐시 (React Query queryFn — 키: ['todos', bucketId]).
// 날짜 필터는 클라이언트 deriveTodosForDate가 수행 → 날짜 전환 시 왕복 0회.
export async function fetchBucketTodosAction(
  bucketId: string | null
): Promise<BucketTodosData> {
  const user = await getAuthUser();
  if (!user) throw new Error(AUTH_ERRORS.LOGIN_REQUIRED);

  const supabase = await createClient();
  return getBucketTodos(supabase, user.id, bucketId);
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
 * R2: AI 투두 3개 추천 — aiprompt.md 규칙(지향점+MBTI+나이+최근 일기) 기반.
 * DB 저장 없음 — 유저가 AiSuggestionsSheet에서 선택 후 addTodosAction으로 등록.
 */
export async function generateTodoSuggestionsAction(
  bucketId: string,
  baseDate?: string
): Promise<{ success: boolean; todos?: string[]; error?: string }> {
  try {
    const ctx = await loadNextStepContext(bucketId);

    // 추가 컨텍스트: MBTI/나이(profiles) + 최근 일기 발췌 (aiprompt.md ③④⑤)
    const [profileResult, diaryNotes] = await Promise.all([
      ctx.supabase
        .from("profiles")
        .select("personality_type, life_clock_age")
        .eq("id", ctx.userId)
        .maybeSingle(),
      getRecentDiaryExcerpts(ctx.supabase, ctx.userId, 3),
    ]);
    const profile = profileResult.data as {
      personality_type: string | null;
      life_clock_age: number | null;
    } | null;

    const todos = await generateTodoSuggestions({
      bucketTitle: ctx.bucket.title,
      lifeArea: ctx.lifeArea,
      strides: ctx.strides,
      personalityType: profile?.personality_type ?? null,
      age: profile?.life_clock_age ?? null,
      recentDiaryNotes: diaryNotes,
      existingTitles: ctx.todoRows.map((row) => row.title),
      baseDate,
    });

    return { success: true, todos };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, TODO_ERRORS.WEEKLY_GENERATE_FAILED),
    };
  }
}

/**
 * AI 주간 목표 4~5개 제안 — 주간 시트의 "주간 목표" 기록에서 체크박스로 넣는다.
 *
 * 일기 쪽 기능이지만 이 파일에 두는 이유: 버킷·영역·발걸음·기존 투두를 모으는
 * loadNextStepContext가 여기에만 있다. DB 저장 없음(유저가 골라 본문에 넣는다).
 */
export async function generateWeeklyGoalsAction(
  bucketId: string,
  weekRange?: string
): Promise<{ success: boolean; goals?: string[]; error?: string }> {
  try {
    const ctx = await loadNextStepContext(bucketId);

    const [profileResult, diaryNotes] = await Promise.all([
      ctx.supabase
        .from("profiles")
        .select("personality_type, life_clock_age")
        .eq("id", ctx.userId)
        .maybeSingle(),
      getRecentDiaryExcerpts(ctx.supabase, ctx.userId, 3),
    ]);
    const profile = profileResult.data as {
      personality_type: string | null;
      life_clock_age: number | null;
    } | null;

    const goals = await generateWeeklyGoals({
      bucketTitle: ctx.bucket.title,
      lifeArea: ctx.lifeArea,
      strides: ctx.strides,
      personalityType: profile?.personality_type ?? null,
      age: profile?.life_clock_age ?? null,
      recentDiaryNotes: diaryNotes,
      existingTitles: ctx.todoRows.map((row) => row.title),
      weekRange,
    });

    return { success: true, goals };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, TODO_ERRORS.WEEKLY_GENERATE_FAILED),
    };
  }
}

/**
 * R2: AI 추천 선택 등록 — 여러 개를 한 번에 추가.
 * 생성 rows를 반환해 클라이언트가 캐시에 직접 append (재페치 0).
 */
export async function addTodosAction(
  bucketId: string,
  input: { titles: string[]; scheduledDate: string }
): Promise<{ success: boolean; todos?: Todo[]; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const titles = (input.titles ?? []).map((t) => t.trim()).filter(Boolean);
    if (titles.length === 0) throw new Error("등록할 항목을 선택해주세요.");
    if (!DATE_RE.test(input.scheduledDate)) throw new Error("날짜 형식이 올바르지 않습니다.");

    const { data, error } = await supabase
      .from("todos")
      .insert(
        titles.map((title) => ({
          user_id: userId,
          bucket_id: bucketId,
          title,
          source: "ai_generated",
          scheduled_date: input.scheduledDate,
        }))
      )
      .select("*");

    if (error) throw error;

    return { success: true, todos: (data as Todo[] | null) ?? [] };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "할 일 추가에 실패했어요."),
    };
  }
}

/**
 * R2: 할 일 수정 — 타이틀 + 반복 규칙 (텍스트 영역 탭 → 입력창에서 진입).
 * 반복 변경으로 투두 ↔ 루틴 전환이 가능하다.
 */
export async function updateTodoAction(
  todoId: string,
  input: { title: string; detail?: string | null; repeat?: TodoRepeatInput | null }
): Promise<{ success: boolean; todo?: Todo; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const title = input.title?.trim();
    if (!title) throw new Error("할 일 내용을 입력해주세요.");

    const repeatCols = normalizeRepeatInput(input.repeat);

    const { data, error } = await supabase
      .from("todos")
      .update({ title, detail: input.detail?.trim() || null, ...repeatCols })
      .eq("id", todoId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw error;

    return { success: true, todo: data as Todo };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "할 일 수정에 실패했어요."),
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
 * 버킷 완료 — 계획 드롭다운의 "언젠가" 카드 우측 [버킷 완료] 버튼.
 *
 * 삭제가 아니라 **상태 변경**이다. 투두·발걸음·완료 기록은 그대로 남고,
 * 대시보드 목록에서만 빠진다(getUserBuckets 소비처가 status로 거른다).
 * 이 앱은 여러 버킷을 병렬로 굴리는 게 아니라 하나에 집중하는 앱이라,
 * "끝났다"를 선언하는 자리가 필요하다.
 */
export async function completeBucketAction(
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
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", trimmed)
      .eq("user_id", userId);

    if (error) throw error;

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, BUCKET_ERRORS.COMPLETE_ERROR),
    };
  }
}

/**
 * 완료한 버킷 목록 (/buckets/completed).
 *
 * 대시보드 응답의 completedBuckets 와 달리 **완료한 할 일 수까지** 붙인다.
 * 목록 화면에서만 필요한 집계라 대시보드 첫 로드를 무겁게 하지 않으려고 분리했다.
 */
export async function fetchCompletedBucketsAction(): Promise<CompletedBucketSummary[]> {
  const { supabase, userId } = await getAuthContext();

  const { data, error } = await supabase
    .from("buckets")
    .select("id, title, stride_scope, status, created_at, completed_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(BUCKET_ERRORS.LIST_ERROR);

  const buckets = (data as BucketSummary[] | null) ?? [];
  if (buckets.length === 0) return [];

  // 완료 횟수는 todo_completions ⋈ todos 로 센다. 버킷마다 쿼리를 돌리지 않고
  // 한 번에 받아 클라이언트 쪽(서버 액션 안)에서 묶는다.
  //
  // is_active=true 로 거르는 이유: 완료 확인 시트가 쓰는 getBucketTodos 가 같은 조건이라,
  // 안 맞추면 **같은 "완료한 할 일"이 두 화면에서 다른 숫자로 나온다**(실측 12 vs 23 —
  // 삭제된 반복 할 일의 완료 기록 때문). 앱 전체가 "이 버킷의 할 일 = 살아 있는 할 일"로
  // 정의하고 있으므로 그쪽에 맞춘다.
  const bucketIds = buckets.map((b) => b.id);
  const { data: completions, error: completionsError } = await supabase
    .from("todo_completions")
    .select("todo_id, todos!inner(bucket_id, is_active)")
    .eq("user_id", userId)
    .eq("todos.is_active", true)
    .in("todos.bucket_id", bucketIds);

  if (completionsError) throw new Error(BUCKET_ERRORS.LIST_ERROR);

  const countByBucket = new Map<string, number>();
  for (const row of (completions as Array<{
    todos:
      | { bucket_id: string | null; is_active: boolean }
      | Array<{ bucket_id: string | null; is_active: boolean }>;
  }> | null) ?? []) {
    const bucketId = Array.isArray(row.todos) ? row.todos[0]?.bucket_id : row.todos?.bucket_id;
    if (!bucketId) continue;
    countByBucket.set(bucketId, (countByBucket.get(bucketId) ?? 0) + 1);
  }

  return buckets.map((bucket) => ({
    ...bucket,
    completedTodoCount: countByBucket.get(bucket.id) ?? 0,
  }));
}

/**
 * 버킷 되돌리기 — 버킷 시트 "완료한 버킷" 목록의 [다시 시작하기].
 *
 * completeBucketAction의 역방향. status를 in_progress로 되돌리고 completed_at을 지운다.
 * 새 버킷을 save_onboarding_journey가 in_progress로 넣으므로 그게 곧 "원래 상태"다 —
 * 완료 직전 상태를 따로 기억해 둘 컬럼이 필요 없다.
 *
 * completed_at을 NULL로 지우는 이유: 남겨두면 "완료 안 했는데 완료일이 있는" 행이 생겨
 * 목록 쿼리가 지저분해진다. 완료↔복구 이력이 필요해지면 별도 테이블로 간다.
 *
 * 투두·발걸음·완료 기록은 애초에 지운 적이 없으므로 그대로 살아난다.
 */
export async function restoreBucketAction(
  bucketId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const trimmed = bucketId?.trim();
    if (!trimmed) {
      return { success: false, error: BUCKET_ERRORS.NOT_FOUND_OR_ACCESS_DENIED };
    }

    const { data: target, error: loadError } = await supabase
      .from("buckets")
      .select("id, life_area_id, title, status")
      .eq("id", trimmed)
      .eq("user_id", userId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!target) {
      return { success: false, error: BUCKET_ERRORS.NOT_FOUND_OR_ACCESS_DENIED };
    }

    const bucket = target as {
      id: string;
      life_area_id: string | null;
      title: string;
      status: string;
    };

    // 이미 활성이면 할 일이 없다 (목록이 잠깐 낡았을 때)
    if (bucket.status !== "completed") {
      revalidatePath("/dashboard");
      return { success: true };
    }

    // 활성 중복 사전 검사 —
    // buckets_user_lifearea_title_active_unique 는 (user_id, life_area_id, title) 에
    // status NOT IN ('completed','paused') 조건으로 걸려 있다. 즉 완료한 뒤 같은 이름으로
    // 새 버킷을 만들 수 있고, 그 상태에서 복구하면 활성이 둘이 되어 반드시 실패한다.
    // DB 에러를 그대로 보여주는 대신 여기서 먼저 사람이 읽는 말로 막는다.
    let duplicateQuery = supabase
      .from("buckets")
      .select("id")
      .eq("user_id", userId)
      .eq("title", bucket.title)
      .not("status", "in", "(completed,paused)")
      .limit(1);
    duplicateQuery = bucket.life_area_id
      ? duplicateQuery.eq("life_area_id", bucket.life_area_id)
      : duplicateQuery.is("life_area_id", null);

    const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) {
      return { success: false, error: BUCKET_ERRORS.RESTORE_TITLE_TAKEN };
    }

    const { error } = await supabase
      .from("buckets")
      .update({ status: "in_progress", completed_at: null })
      .eq("id", trimmed)
      .eq("user_id", userId);

    // 사전 검사와 UPDATE 사이에 같은 이름의 버킷이 생겼다면(경합) 인덱스가 막는다.
    // 사용자에겐 같은 이야기이므로 같은 문구로 바꿔 준다.
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return { success: false, error: BUCKET_ERRORS.RESTORE_TITLE_TAKEN };
      }
      throw error;
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, BUCKET_ERRORS.RESTORE_ERROR),
    };
  }
}

/**
 * R1: 버킷 타이틀 수정 — 버킷 카드 ⋯ "수정"에서 호출.
 * 활성 버킷 unique(user_id, life_area_id, title) 인덱스 충돌 시 안내 메시지.
 */
export async function updateBucketTitleAction(
  bucketId: string,
  newTitle: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const trimmedId = bucketId?.trim();
    const title = newTitle?.trim();
    if (!trimmedId) {
      return { success: false, error: BUCKET_ERRORS.NOT_FOUND_OR_ACCESS_DENIED };
    }
    if (!title) {
      return { success: false, error: "버킷 이름을 입력해주세요." };
    }

    const { error } = await supabase
      .from("buckets")
      .update({ title })
      .eq("id", trimmedId)
      .eq("user_id", userId);

    if (error) {
      // 활성 버킷 (user, life_area, title) unique 충돌
      if (error.code === "23505") {
        return { success: false, error: "같은 이름의 버킷이 이미 있어요." };
      }
      throw error;
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "버킷 이름 수정에 실패했어요."),
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
 * "다음 목표" — 지금까지 완료한 할 일을 근거로 다음 발걸음 **초안만** 만든다.
 *
 * regenerateStrideItemAction과의 차이는 두 가지다.
 *   1) 완료한 투두 제목을 프롬프트에 실어 "이미 한 것 다음"을 제안하게 한다.
 *   2) **DB에 쓰지 않는다.** 초안을 입력창에 채워 주고 확정은 사용자가 한다
 *      (CLAUDE.md "AI는 제안만 하고 유저가 결정하고 실행한다").
 *      저장은 기존 updateStrideItemAction이 맡고, 그때 이전 목표가
 *      title_history로 자동으로 넘어간다.
 */
export async function suggestNextStrideAction(
  bucketId: string,
  targetLevel: StrideLevel
): Promise<{ success: boolean; draft?: string; error?: string }> {
  try {
    if (!STRIDE_ORDER.includes(targetLevel)) {
      throw new Error(STRIDE_ERRORS.LEVEL_INVALID_ALT);
    }

    const ctx = await loadNextStepContext(bucketId);

    // 이 버킷에서 완료한 할 일 제목 (최근순).
    // 완료는 todo_completions 단일 경로(Phase B)라 거기서 날짜를 얻고 todos에서 제목을 얻는다.
    const { data: completions, error: completionsError } = await ctx.supabase
      .from("todo_completions")
      .select("completion_date, todos!inner(title, bucket_id)")
      .eq("user_id", ctx.userId)
      .eq("todos.bucket_id", bucketId)
      .order("completion_date", { ascending: false })
      .limit(COMPLETED_TODOS_FOR_PROMPT);

    if (completionsError) throw completionsError;

    // 반복 할 일은 여러 날 완료되어 같은 제목이 반복된다 → 중복 제거(최근순 유지)
    const completedTodoTitles = [
      ...new Set(
        ((completions as Array<{ todos: { title: string } | { title: string }[] }> | null) ?? [])
          .map((row) => (Array.isArray(row.todos) ? row.todos[0]?.title : row.todos?.title))
          .filter((title): title is string => Boolean(title))
      ),
    ];

    // gemini-2.0-flash는 "중복 금지"를 써 놔도 지금 값을 그대로 되돌려줄 때가 있다.
    // 같은 문장을 입력창에 채워 주면 사용자 눈에는 "아무 일도 안 일어난" 것이라
    // 한 번 다시 물어보고, 그래도 같으면 실패로 알린다.
    const currentAction =
      ctx.strides.find((item) => item.level === targetLevel)?.action ?? "";
    const squash = (text: string) => text.replace(/\s+/g, " ").trim();

    let draft = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const item = await regenerateSingleStride({
        bucketTitle: ctx.bucket.title,
        lifeArea: ctx.lifeArea,
        existingStrides: ctx.strides,
        targetLevel,
        completedTodoTitles,
      });
      draft = item.action;
      if (squash(draft) !== squash(currentAction)) break;
      draft = "";
    }

    if (!draft) {
      return { success: false, error: STRIDE_ERRORS.NEXT_GOAL_SAME_AS_CURRENT };
    }

    return { success: true, draft };
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
    /** 제목 아래 한 줄 메모 (선택). 공백이면 저장하지 않는다. */
    detail?: string | null;
    scheduledDate: string;
    repeat?: TodoRepeatInput | null;
    source?: ItemSource;
  }
): Promise<{ success: boolean; todo?: Todo; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const title = input.title?.trim();
    if (!title) throw new Error("할 일 내용을 입력해주세요.");
    if (!DATE_RE.test(input.scheduledDate)) throw new Error("날짜 형식이 올바르지 않습니다.");

    const repeatCols = normalizeRepeatInput(input.repeat);

    // 생성 row 반환 — 클라이언트가 캐시에 직접 append (재페치 0)
    const { data, error } = await supabase
      .from("todos")
      .insert({
        user_id: userId,
        bucket_id: bucketId,
        title,
        detail: input.detail?.trim() || null,
        source: normalizeSource(input.source),
        scheduled_date: input.scheduledDate,
        ...repeatCols,
      })
      .select("*")
      .single();

    if (error) throw error;

    return { success: true, todo: data as Todo };
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

