"use server";

// 인증 관련 서버 액션

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const VALID_SELF_LEVELS = ["low", "medium", "high"] as const;
type SelfLevel = (typeof VALID_SELF_LEVELS)[number];

const VALID_USER_CONTEXTS = ["student", "university", "work", "personal"] as const;
type UserContext = (typeof VALID_USER_CONTEXTS)[number];

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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  // 이메일 인증이 필요한 설정이면 즉시 세션이 생기지 않는다.
  if (!data.session) {
    return { message: "인증 메일을 보냈어요. 메일 확인 후 로그인해주세요." };
  }

  redirect("/onboarding");
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
  } else {
    redirect("/onboarding");
  }
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
