"use server";

// 인증 관련 서버 액션

import { resolveMx } from "node:dns/promises";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/flags";
import { analyzeLifeScene } from "@/lib/ai/analyze";
import { redirect } from "next/navigation";
import { getCurrentWeekStartDate } from "@/lib/utils";
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
const VALID_PERSONALITY_TYPES = ["IT", "IF", "ET", "EF"] as const;
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
    return "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
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
    return "요청이 많아 잠시 제한되었어요. 잠시 후 다시 시도해주세요.";
  }

  if (
    hasToken(
      "email not confirmed",
      "email_not_confirmed",
      "not confirmed"
    )
  ) {
    return "이메일 인증이 완료되지 않았어요. 메일함에서 인증 후 다시 로그인해주세요.";
  }

  if (
    hasToken("fetch failed", "failed to fetch", "network", "timeout")
  ) {
    return "네트워크 연결이 불안정해 로그인에 실패했습니다. 연결 상태를 확인해주세요.";
  }

  if (
    status === 400 &&
    hasToken(
      "invalid login credentials",
      "invalid_credentials",
      "invalid grant"
    )
  ) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }

  if (
    status === 401 ||
    status === 403 ||
    hasToken("unauthorized", "forbidden")
  ) {
    return "로그인 권한을 확인할 수 없습니다. 다시 로그인해주세요.";
  }

  if (typeof status === "number" && status >= 500) {
    return "서버 오류로 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.";
  }

  return "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
}

export async function signUpAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해주세요." };
  }

  // MX 레코드 기반 이메일 도메인 검증
  const isDomainValid = await validateEmailDomain(email);
  if (!isDomainValid) {
    return { error: "이메일 도메인이 유효하지 않아요. 주소를 다시 확인해주세요." };
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

    redirect("/login?verify=pending");
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
    return { error: "이메일과 비밀번호를 입력해주세요." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: mapSignInError(error) };
  }

  const userId = data.user?.id;
  if (!userId) {
    return { error: "로그인에 실패했습니다." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return { error: "프로필 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
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
    return { error: "닉네임과 속도를 입력해주세요." };
  }

  const normalizedDisplayName = displayName.trim();
  if (!normalizedDisplayName) {
    return { error: "닉네임을 올바르게 입력해주세요." };
  }

  // user_context 파싱 및 검증
  let userContext: UserContext[] = [];
  if (userContextRaw) {
    let parsedCtx: unknown;
    try {
      parsedCtx = JSON.parse(userContextRaw);
    } catch {
      return { error: "사용 목적 형식이 올바르지 않습니다." };
    }
    if (!Array.isArray(parsedCtx)) {
      return { error: "사용 목적 형식이 올바르지 않습니다." };
    }
    if (!parsedCtx.every((c) => VALID_USER_CONTEXTS.includes(c as UserContext))) {
      return { error: "사용 목적 값이 올바르지 않습니다." };
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
      return { error: "분야 정보 형식이 올바르지 않습니다." };
    }
    if (
      !Array.isArray(parsedSubjects) ||
      parsedSubjects.some((s) => typeof s !== "string")
    ) {
      return { error: "분야 정보 형식이 올바르지 않습니다." };
    }
    subjects = [...new Set(
      parsedSubjects
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    )];
  }

  if (!VALID_SELF_LEVELS.includes(selfLevel as SelfLevel)) {
    return { error: "속도 값이 올바르지 않습니다." };
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
    return { error: "프로필 저장에 실패했습니다. 다시 시도해주세요." };
  }

  redirect("/dashboard");
}

export async function saveOnboardingV2Action(
  data: OnboardingV2SavePayload & {
    displayName?: string;
    selfLevel: SelfLevel;
    userContext?: UserContext[];
    grade?: string | null;
    subjects?: string[];
    chapterTitle?: string;
  }
) {
  const sceneText = data.sceneText?.trim();
  const lifeArea = data.lifeArea?.trim();
  const displayName = data.displayName?.trim() || "slowgoes 사용자";
  const chapterTitle =
    data.chapterTitle?.trim() || `${sceneText || "삶의 장면"} 이번 시즌 실행`;

  if (!displayName) {
    return { error: "닉네임을 올바르게 입력해주세요." };
  }
  if (!sceneText) {
    return { error: "삶의 장면이 비어 있습니다." };
  }
  if (!lifeArea) {
    return { error: "삶의 영역 정보가 비어 있습니다." };
  }
  if (!Number.isFinite(data.age) || data.age < 0 || data.age > 100) {
    return { error: "나이 값이 올바르지 않습니다." };
  }
  if (!VALID_GENDERS.includes(data.gender as ProfileGender)) {
    return { error: "성별 값이 올바르지 않습니다." };
  }
  if (!VALID_PERSONALITY_TYPES.includes(data.personalityType as ProfilePersonality)) {
    return { error: "성향 값이 올바르지 않습니다." };
  }
  if (!VALID_PACE_TYPES.includes(data.paceType as ProfilePaceType)) {
    return { error: "페이스 값이 올바르지 않습니다." };
  }
  if (!VALID_SELF_LEVELS.includes(data.selfLevel)) {
    return { error: "속도 값이 올바르지 않습니다." };
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
    return { error: "데일리투두 또는 루틴을 최소 1개 선택해주세요." };
  }

  const normalizedHorizons = (data.horizonAnalysis?.horizons ?? []).map((item) => ({
    level: item.level,
    label: item.label,
    action: item.action,
  }));
  const normalizedSuggestedRoutines = (data.horizonAnalysis?.suggestedRoutines ?? [])
    .map((item) => ({
      title: item.title?.trim() ?? "",
      repeatUnit: item.repeatUnit === "daily" ? "daily" : "weekly",
      repeatValue: Math.max(1, Math.min(item.repeatUnit === "daily" ? 7 : 14, Math.round(item.repeatValue || 1))),
    }))
    .filter((item) => item.title.length > 0);

  const horizonAnalysisPayload = {
    lifeArea,
    empathyMessage:
      data.horizonAnalysis?.empathyMessage?.trim() ||
      `${lifeArea}에 대한 장면이네요, 멋져요.`,
    horizons: normalizedHorizons,
    suggestedRoutines: normalizedSuggestedRoutines,
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!featureFlags.onboardingV2(user.id)) {
    return { error: "온보딩 v2가 비활성화되어 있습니다." };
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
    p_bucket_horizon: "someday",
    p_horizon_analysis: horizonAnalysisPayload,
    p_daily_todos: normalizedDailyTodos,
    p_routines: normalizedRoutines,
  });

  if (error) {
    return { error: "온보딩 저장에 실패했습니다. 다시 시도해주세요." };
  }

  redirect("/dashboard?onboarding_saved=1");
}

/**
 * 삶의 장면 분석 — 영역 분류 + 시간 지평 + 루틴 추천 (온보딩 Step 3)
 */
export async function analyzeLifeSceneAction(data: {
  sceneText: string;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
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
      throw new Error("인증이 필요합니다.");
    }

    const sceneText = data.sceneText?.trim();
    if (!sceneText) {
      throw new Error("삶의 장면을 입력해주세요.");
    }
    if (!Number.isFinite(data.age) || data.age < 0 || data.age > 100) {
      throw new Error("나이 값이 올바르지 않습니다.");
    }
    if (!VALID_GENDERS.includes(data.gender as ProfileGender)) {
      throw new Error("성별 값이 올바르지 않습니다.");
    }
    if (!VALID_PERSONALITY_TYPES.includes(data.personalityType as ProfilePersonality)) {
      throw new Error("성향 값이 올바르지 않습니다.");
    }

    const analysis = await analyzeLifeScene({
      sceneText,
      age: data.age,
      gender: data.gender,
      personalityType: data.personalityType,
    });

    return { success: true, data: analysis };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "삶의 장면 분석 중 오류가 발생했습니다.";
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
  horizonAnalysis: LifeSceneAnalysisResult;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "인증이 필요합니다." };
    }

    // 버킷 소유권 검증
    const { data: bucket, error: bucketError } = await supabase
      .from("buckets")
      .select("id, user_id")
      .eq("id", data.bucketId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (bucketError || !bucket) {
      return { success: false, error: "버킷을 찾을 수 없거나 접근 권한이 없습니다." };
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
        return { success: false, error: "데일리투두 추가에 실패했습니다." };
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
        return { success: false, error: "루틴 추가에 실패했습니다." };
      }
    }

    // horizon_analyses UPSERT (기존 분석 갱신)
    const horizonPayload = {
      user_id: user.id,
      bucket_id: data.bucketId,
      life_area: data.horizonAnalysis.lifeArea,
      empathy_message: data.horizonAnalysis.empathyMessage || "",
      horizons: data.horizonAnalysis.horizons,
      suggested_routines: data.horizonAnalysis.suggestedRoutines,
      updated_at: new Date().toISOString(),
    };

    const { error: analysisError } = await supabase
      .from("horizon_analyses")
      .upsert(horizonPayload, { onConflict: "bucket_id" });

    if (analysisError) {
      // horizon_analyses 업데이트 실패는 비치명적 — 아이템은 이미 추가됨
      console.error("horizon_analyses upsert 실패:", analysisError);
    }

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "기존 버킷에 아이템 추가 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}
