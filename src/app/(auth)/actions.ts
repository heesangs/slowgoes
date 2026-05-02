"use server";

// 인증 관련 서버 액션

import { resolveMx } from "node:dns/promises";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/flags";
import { analyzeLifeScene } from "@/lib/ai/analyze";
import { redirect } from "next/navigation";
import { getCurrentWeekStartDate } from "@/lib/utils";
import {
  AUTH_ERRORS,
  PROFILE_ERRORS,
  VALIDATION_ERRORS,
  AI_ERRORS,
  BUCKET_ERRORS,
  TODO_ERRORS,
  ROUTINE_ERRORS,
  STRIDE_ERRORS,
  APP,
  buildDefaultChapterTitle,
  buildDefaultEmpathyMessage,
} from "@/lib/constants";
import type {
  LifeSceneAnalysisResult,
  OnboardingV2SavePayload,
  PaceType,
  PersonalityType,
  Gender,
} from "@/types";

const VALID_SELF_LEVELS = ["low", "medium", "high"] as const;
type SelfLevel = (typeof VALID_SELF_LEVELS)[number];

const VALID_USER_CONTEXTS = ["student", "university", "work", "personal"] as const;
type UserContext = (typeof VALID_USER_CONTEXTS)[number];
const VALID_GENDERS = ["male", "female"] as const;
const VALID_PERSONALITY_TYPES = [
  "ISTJ", "ISFJ", "INFJ", "INTJ",
  "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP",
  "ESTJ", "ESFJ", "ENFJ", "ENTJ",
] as const;
const VALID_PACE_TYPES = ["slow", "balanced", "focused", "recovery"] as const;

type ProfileGender = (typeof VALID_GENDERS)[number];
type ProfilePersonality = (typeof VALID_PERSONALITY_TYPES)[number];
type ProfilePaceType = (typeof VALID_PACE_TYPES)[number];

/**
 * 이메일 도메인의 MX 레코드를 확인하여 메일 수신 가능 여부 검증
 */
async function validateEmailDomain(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;

  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

function mapSignInError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return AUTH_ERRORS.SIGN_IN_GENERIC;
  }

  const candidate = error as {
    message?: unknown;
    status?: unknown;
    code?: unknown;
    name?: unknown;
  };

  const message =
    typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  const code =
    typeof candidate.code === "string" ? candidate.code.toLowerCase() : "";
  const name =
    typeof candidate.name === "string" ? candidate.name.toLowerCase() : "";
  const status = typeof candidate.status === "number" ? candidate.status : undefined;

  const hasToken = (...tokens: string[]) =>
    tokens.some(
      (token) =>
        message.includes(token) ||
        code.includes(token) ||
        name.includes(token)
    );

  if (
    status === 429 ||
    hasToken("too many requests", "rate limit", "over_request_rate_limit")
  ) {
    return AUTH_ERRORS.SIGN_IN_TOO_MANY_REQUESTS;
  }

  if (
    hasToken(
      "email not confirmed",
      "email_not_confirmed",
      "not confirmed"
    )
  ) {
    return AUTH_ERRORS.SIGN_IN_EMAIL_NOT_CONFIRMED;
  }

  if (
    hasToken("fetch failed", "failed to fetch", "network", "timeout")
  ) {
    return AUTH_ERRORS.SIGN_IN_NETWORK_ERROR;
  }

  if (
    status === 400 &&
    hasToken(
      "invalid login credentials",
      "invalid_credentials",
      "invalid grant"
    )
  ) {
    return AUTH_ERRORS.SIGN_IN_INVALID_CREDENTIALS;
  }

  if (
    status === 401 ||
    status === 403 ||
    hasToken("unauthorized", "forbidden")
  ) {
    return AUTH_ERRORS.SIGN_IN_UNAUTHORIZED;
  }

  if (typeof status === "number" && status >= 500) {
    return AUTH_ERRORS.SIGN_IN_SERVER_ERROR;
  }

  return AUTH_ERRORS.SIGN_IN_GENERIC;
}

export async function signUpAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: AUTH_ERRORS.EMAIL_PASSWORD_REQUIRED };
  }

  // MX 레코드 기반 이메일 도메인 검증
  const isDomainValid = await validateEmailDomain(email);
  if (!isDomainValid) {
    return { error: AUTH_ERRORS.EMAIL_DOMAIN_INVALID };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  // 이메일 인증이 필요한 설정이면 즉시 세션이 생기지 않는다.
  if (!data.session) {
    const identities = data.user?.identities;
    const isLikelyExistingUser =
      Array.isArray(identities) && identities.length === 0;

    if (isLikelyExistingUser) {
      redirect("/login?verify=existing");
    }

    redirect(`/login?verify=pending&email=${encodeURIComponent(email)}`);
  }

  const shouldUseOnboardingV2 = data.user?.id
    ? featureFlags.onboardingV2(data.user.id)
    : featureFlags.onboardingV2();

  if (shouldUseOnboardingV2) {
    redirect("/onboarding");
  }
  redirect("/dashboard");
}

export async function signInAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: AUTH_ERRORS.EMAIL_PASSWORD_REQUIRED };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: mapSignInError(error) };
  }

  const userId = data.user?.id;
  if (!userId) {
    return { error: AUTH_ERRORS.SIGN_IN_FAILED };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return { error: AUTH_ERRORS.PROFILE_LOAD_ERROR };
  }

  if (profile) {
    redirect("/dashboard");
  }

  if (featureFlags.onboardingV2(userId)) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function saveProfileAction(formData: FormData) {
  const displayName = formData.get("display_name") as string;
  const grade = formData.get("grade") as string | null;
  const subjectsRaw = formData.get("subjects") as string | null;
  const selfLevel = formData.get("self_level") as string;
  const userContextRaw = formData.get("user_context") as string | null;

  if (!displayName || !selfLevel) {
    return { error: PROFILE_ERRORS.DISPLAY_NAME_SELF_LEVEL_REQUIRED };
  }

  const normalizedDisplayName = displayName.trim();
  if (!normalizedDisplayName) {
    return { error: PROFILE_ERRORS.DISPLAY_NAME_INVALID };
  }

  // user_context 파싱 및 검증
  let userContext: UserContext[] = [];
  if (userContextRaw) {
    let parsedCtx: unknown;
    try {
      parsedCtx = JSON.parse(userContextRaw);
    } catch {
      return { error: PROFILE_ERRORS.USER_CONTEXT_FORMAT_INVALID };
    }
    if (!Array.isArray(parsedCtx)) {
      return { error: PROFILE_ERRORS.USER_CONTEXT_FORMAT_INVALID };
    }
    if (!parsedCtx.every((c) => VALID_USER_CONTEXTS.includes(c as UserContext))) {
      return { error: PROFILE_ERRORS.USER_CONTEXT_VALUE_INVALID };
    }
    userContext = parsedCtx as UserContext[];
  }

  // subjects 파싱 (optional)
  let subjects: string[] = [];
  if (subjectsRaw) {
    let parsedSubjects: unknown;
    try {
      parsedSubjects = JSON.parse(subjectsRaw);
    } catch {
      return { error: PROFILE_ERRORS.SUBJECTS_FORMAT_INVALID };
    }
    if (
      !Array.isArray(parsedSubjects) ||
      parsedSubjects.some((s) => typeof s !== "string")
    ) {
      return { error: PROFILE_ERRORS.SUBJECTS_FORMAT_INVALID };
    }
    subjects = [...new Set(
      parsedSubjects
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    )];
  }

  if (!VALID_SELF_LEVELS.includes(selfLevel as SelfLevel)) {
    return { error: PROFILE_ERRORS.SELF_LEVEL_INVALID };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const normalizedGrade = grade?.trim() || null;

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    display_name: normalizedDisplayName,
    grade: normalizedGrade,
    subjects,
    self_level: selfLevel as SelfLevel,
    user_context: userContext,
  });

  if (error) {
    return { error: PROFILE_ERRORS.SAVE_FAILED };
  }

  redirect("/dashboard");
}

type SaveOnboardingV2Input = OnboardingV2SavePayload & {
  displayName?: string;
  selfLevel: SelfLevel;
  userContext?: UserContext[];
  grade?: string | null;
  subjects?: string[];
  chapterTitle?: string;
};

type SaveOnboardingV2Result =
  | { success: true }
  | { success: false; error: string; requiresAuth?: boolean };

async function saveOnboardingV2Internal(
  data: SaveOnboardingV2Input
): Promise<SaveOnboardingV2Result> {
  const sceneText = data.sceneText?.trim();
  const lifeArea = data.lifeArea?.trim();
  const displayName = data.displayName?.trim() || APP.DEFAULT_USER_NAME;
  const chapterTitle =
    data.chapterTitle?.trim() || buildDefaultChapterTitle(sceneText || "");

  if (!displayName) {
    return { success: false, error: PROFILE_ERRORS.DISPLAY_NAME_INVALID };
  }
  if (!sceneText) {
    return { success: false, error: VALIDATION_ERRORS.SCENE_TEXT_EMPTY };
  }
  if (!lifeArea) {
    return { success: false, error: VALIDATION_ERRORS.LIFE_AREA_EMPTY };
  }
  if (!Number.isFinite(data.age) || data.age < 0 || data.age > 100) {
    return { success: false, error: VALIDATION_ERRORS.AGE_INVALID };
  }
  if (!VALID_GENDERS.includes(data.gender as ProfileGender)) {
    return { success: false, error: VALIDATION_ERRORS.GENDER_INVALID };
  }
  if (!VALID_PERSONALITY_TYPES.includes(data.personalityType as ProfilePersonality)) {
    return { success: false, error: VALIDATION_ERRORS.PERSONALITY_INVALID };
  }
  if (!VALID_PACE_TYPES.includes(data.paceType as ProfilePaceType)) {
    return { success: false, error: VALIDATION_ERRORS.PACE_TYPE_INVALID };
  }
  if (!VALID_SELF_LEVELS.includes(data.selfLevel)) {
    return { success: false, error: PROFILE_ERRORS.SELF_LEVEL_INVALID };
  }

  const normalizedUserContext = (data.userContext ?? ["personal"]).filter((ctx, index, arr) =>
    VALID_USER_CONTEXTS.includes(ctx) && arr.indexOf(ctx) === index
  );
  if (normalizedUserContext.length === 0) {
    normalizedUserContext.push("personal");
  }

  const normalizedSubjects = [...new Set(
    (data.subjects ?? [])
      .map((subject) => subject.trim())
      .filter((subject) => subject.length > 0)
  )];

  const normalizedDailyTodos = (data.selectedDailyTodos ?? [])
    .map((item) => ({
      title: item.title?.trim() ?? "",
      source: item.source ?? "onboarding",
    }))
    .filter((item) => item.title.length > 0);

  const normalizedRoutines = (data.selectedRoutines ?? [])
    .map((item) => ({
      title: item.title?.trim() ?? "",
      repeatUnit: item.repeatUnit === "daily" ? "daily" : "weekly",
      repeatValue: Math.max(1, Math.min(item.repeatUnit === "daily" ? 7 : 14, Math.round(item.repeatValue || 1))),
      source: item.source ?? "onboarding",
    }))
    .filter((item) => item.title.length > 0);

  // 점진 전환: 구버전 payload가 들어오면 selectedWeeklyAction을 daily todo로 승격
  const legacyWeeklyAction = data.selectedWeeklyAction?.trim();
  if (normalizedDailyTodos.length === 0 && legacyWeeklyAction) {
    normalizedDailyTodos.push({
      title: legacyWeeklyAction,
      source: "onboarding",
    });
  }

  if (normalizedDailyTodos.length === 0 && normalizedRoutines.length === 0) {
    return { success: false, error: VALIDATION_ERRORS.DAILY_TODO_OR_ROUTINE_REQUIRED };
  }

  const normalizedStrides = (data.stridePlan?.strides ?? []).map((item) => ({
    level: item.level,
    label: item.label,
    action: item.action,
  }));
  const normalizedSuggestedRoutines = (data.stridePlan?.suggestedRoutines ?? [])
    .map((item) => ({
      title: item.title?.trim() ?? "",
      repeatUnit: item.repeatUnit === "daily" ? "daily" : "weekly",
      repeatValue: Math.max(1, Math.min(item.repeatUnit === "daily" ? 7 : 14, Math.round(item.repeatValue || 1))),
    }))
    .filter((item) => item.title.length > 0);

  const stridePlanPayload = {
    lifeArea,
    empathyMessage:
      data.stridePlan?.empathyMessage?.trim() ||
      buildDefaultEmpathyMessage(lifeArea),
    strides: normalizedStrides,
    suggestedRoutines: normalizedSuggestedRoutines,
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "로그인이 필요합니다. 다시 로그인해주세요.",
      requiresAuth: true,
    };
  }

  if (!featureFlags.onboardingV2(user.id)) {
    return { success: false, error: VALIDATION_ERRORS.ONBOARDING_V2_DISABLED };
  }

  const { error } = await supabase.rpc("save_onboarding_journey", {
    p_user_id: user.id,
    p_display_name: displayName,
    p_self_level: data.selfLevel,
    p_user_context: normalizedUserContext,
    p_grade: data.grade?.trim() || null,
    p_subjects: normalizedSubjects,
    p_life_clock_age: data.age,
    p_gender: data.gender as Gender,
    p_personality_type: data.personalityType as PersonalityType,
    p_pace_type: data.paceType as PaceType,
    p_scene_text: sceneText,
    p_life_area_name: lifeArea,
    p_chapter_title: chapterTitle,
    p_bucket_stride_scope: "someday",
    p_stride_plan: stridePlanPayload,
    p_daily_todos: normalizedDailyTodos,
    p_routines: normalizedRoutines,
  });

  if (error) {
    return { success: false, error: VALIDATION_ERRORS.ONBOARDING_SAVE_FAILED };
  }

  return { success: true };
}

export async function saveOnboardingV2Action(data: SaveOnboardingV2Input) {
  const result = await saveOnboardingV2Internal(data);

  if (!result.success) {
    if (result.requiresAuth) {
      redirect("/login");
    }
    return { error: result.error };
  }

  redirect("/dashboard?onboarding_saved=1");
}

/**
 * 온보딩 저장 — redirect 없이 결과만 반환.
 * 데모 마이그레이션, 대시보드 바텀시트("새로운 장면 탐색") 등
 * 페이지 이동 없이 후속 콜백을 직접 처리해야 하는 컨텍스트에서 사용.
 */
export async function saveOnboardingV2NoRedirectAction(
  data: SaveOnboardingV2Input
): Promise<{ success: boolean; error?: string }> {
  const result = await saveOnboardingV2Internal(data);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true };
}

/**
 * 삶의 장면 분석 — 영역 분류 + 시간 지평 + 루틴 추천 (온보딩 Step 3)
 */
export async function analyzeLifeSceneAction(data: {
  sceneText: string;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
  lifeAreaHint?: string | null;
}): Promise<{
  success: boolean;
  data?: LifeSceneAnalysisResult;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error(AUTH_ERRORS.AUTH_REQUIRED);
    }

    const sceneText = data.sceneText?.trim();
    if (!sceneText) {
      throw new Error(VALIDATION_ERRORS.SCENE_TEXT_REQUIRED);
    }
    if (!Number.isFinite(data.age) || data.age < 0 || data.age > 100) {
      throw new Error(VALIDATION_ERRORS.AGE_INVALID);
    }
    if (!VALID_GENDERS.includes(data.gender as ProfileGender)) {
      throw new Error(VALIDATION_ERRORS.GENDER_INVALID);
    }
    if (!VALID_PERSONALITY_TYPES.includes(data.personalityType as ProfilePersonality)) {
      throw new Error(VALIDATION_ERRORS.PERSONALITY_INVALID);
    }

    const analysis = await analyzeLifeScene({
      sceneText,
      age: data.age,
      gender: data.gender,
      personalityType: data.personalityType,
      lifeAreaHint: data.lifeAreaHint ?? null,
    });

    return { success: true, data: analysis };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : AI_ERRORS.SCENE_ANALYSIS_ERROR;
    return { success: false, error: message };
  }
}

/**
 * 기존 버킷에 데일리투두/루틴 추가 — 바텀시트 탐색 플로우에서 사용
 */
export async function addItemsToExistingBucketAction(data: {
  bucketId: string;
  selectedDailyTodos: Array<{ title: string; source?: string }>;
  selectedRoutines: Array<{
    title: string;
    repeatUnit: string;
    repeatValue: number;
    source?: string;
  }>;
  stridePlan: LifeSceneAnalysisResult;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: AUTH_ERRORS.AUTH_REQUIRED };
    }

    // 버킷 소유권 검증
    const { data: bucket, error: bucketError } = await supabase
      .from("buckets")
      .select("id, user_id")
      .eq("id", data.bucketId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (bucketError || !bucket) {
      return { success: false, error: BUCKET_ERRORS.NOT_FOUND_OR_ACCESS_DENIED };
    }

    const weekStart = getCurrentWeekStartDate();

    // 기존 daily_todos의 max sort_order 조회
    const { data: existingTodos } = await supabase
      .from("daily_todos")
      .select("sort_order")
      .eq("bucket_id", data.bucketId)
      .eq("user_id", user.id)
      .order("sort_order", { ascending: false })
      .limit(1);

    const todoStartOrder = (existingTodos?.[0]?.sort_order ?? -1) + 1;

    // 기존 routines의 max sort_order 조회
    const { data: existingRoutines } = await supabase
      .from("routines")
      .select("sort_order")
      .eq("bucket_id", data.bucketId)
      .eq("user_id", user.id)
      .order("sort_order", { ascending: false })
      .limit(1);

    const routineStartOrder = (existingRoutines?.[0]?.sort_order ?? -1) + 1;

    // daily_todos INSERT
    const todosToInsert = data.selectedDailyTodos
      .filter((item) => item.title.trim().length > 0)
      .map((item, index) => ({
        user_id: user.id,
        bucket_id: data.bucketId,
        title: item.title.trim(),
        status: "pending" as const,
        source: item.source ?? "onboarding",
        week_start: weekStart,
        sort_order: todoStartOrder + index,
      }));

    if (todosToInsert.length > 0) {
      const { error: todoError } = await supabase
        .from("daily_todos")
        .insert(todosToInsert);

      if (todoError) {
        return { success: false, error: TODO_ERRORS.ADD_FAILED };
      }
    }

    // routines INSERT
    const routinesToInsert = data.selectedRoutines
      .filter((item) => item.title.trim().length > 0)
      .map((item, index) => ({
        user_id: user.id,
        bucket_id: data.bucketId,
        title: item.title.trim(),
        source: item.source ?? "onboarding",
        repeat_unit: item.repeatUnit === "daily" ? "daily" : "weekly",
        repeat_value: Math.max(1, Math.min(31, Math.round(item.repeatValue || 1))),
        is_active: true,
        sort_order: routineStartOrder + index,
      }));

    if (routinesToInsert.length > 0) {
      const { error: routineError } = await supabase
        .from("routines")
        .insert(routinesToInsert);

      if (routineError) {
        return { success: false, error: ROUTINE_ERRORS.ADD_FAILED };
      }
    }

    // stride_plans UPSERT (기존 분석 갱신)
    const stridePlanPayload = {
      user_id: user.id,
      bucket_id: data.bucketId,
      life_area: data.stridePlan.lifeArea,
      empathy_message: data.stridePlan.empathyMessage || "",
      strides: data.stridePlan.strides,
      suggested_routines: data.stridePlan.suggestedRoutines,
      updated_at: new Date().toISOString(),
    };

    const { error: analysisError } = await supabase
      .from("stride_plans")
      .upsert(stridePlanPayload, { onConflict: "bucket_id" });

    if (analysisError) {
      // stride_plans 업데이트 실패는 비치명적 — 아이템은 이미 추가됨
      console.error("stride_plans upsert 실패:", analysisError);
    }

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : STRIDE_ERRORS.EXISTING_BUCKET_ADD_ERROR;
    return { success: false, error: message };
  }
}
