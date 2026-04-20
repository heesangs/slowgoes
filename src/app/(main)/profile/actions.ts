"use server";

// 프로필 관련 서버 액션

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  PROFILE_ERRORS,
  PASSWORD_ERRORS,
  ACCOUNT_ERRORS,
  AUTH_ERRORS,
  ACCOUNT_DELETE_CONFIRM_TEXT,
} from "@/lib/constants";

const VALID_SELF_LEVELS = ["low", "medium", "high"] as const;
type SelfLevel = (typeof VALID_SELF_LEVELS)[number];

const VALID_USER_CONTEXTS = ["student", "university", "work", "personal"] as const;
type UserContext = (typeof VALID_USER_CONTEXTS)[number];

export async function updateProfileAction(formData: FormData) {
  const displayName = formData.get("display_name") as string;
  const grade = formData.get("grade") as string | null;
  const subjectsRaw = formData.get("subjects") as string | null;
  const selfLevel = formData.get("self_level") as string;
  const userContextRaw = formData.get("user_context") as string | null;

  if (!displayName || !selfLevel) {
    return { success: false, error: PROFILE_ERRORS.DISPLAY_NAME_SELF_LEVEL_REQUIRED };
  }

  const normalizedDisplayName = displayName.trim();
  if (!normalizedDisplayName) {
    return { success: false, error: PROFILE_ERRORS.DISPLAY_NAME_INVALID };
  }

  // user_context 파싱 및 검증
  let userContext: UserContext[] = [];
  if (userContextRaw) {
    let parsedCtx: unknown;
    try {
      parsedCtx = JSON.parse(userContextRaw);
    } catch {
      return { success: false, error: PROFILE_ERRORS.USER_CONTEXT_FORMAT_INVALID };
    }
    if (!Array.isArray(parsedCtx)) {
      return { success: false, error: PROFILE_ERRORS.USER_CONTEXT_FORMAT_INVALID };
    }
    if (!parsedCtx.every((c) => VALID_USER_CONTEXTS.includes(c as UserContext))) {
      return { success: false, error: PROFILE_ERRORS.USER_CONTEXT_VALUE_INVALID };
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
      return { success: false, error: PROFILE_ERRORS.SUBJECTS_FORMAT_INVALID };
    }
    if (
      !Array.isArray(parsedSubjects) ||
      parsedSubjects.some((s) => typeof s !== "string")
    ) {
      return { success: false, error: PROFILE_ERRORS.SUBJECTS_FORMAT_INVALID };
    }
    subjects = [...new Set(
      parsedSubjects
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    )];
  }

  if (!VALID_SELF_LEVELS.includes(selfLevel as SelfLevel)) {
    return { success: false, error: PROFILE_ERRORS.SELF_LEVEL_INVALID };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const normalizedGrade = grade?.trim() || null;

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: normalizedDisplayName,
      grade: normalizedGrade,
      subjects,
      self_level: selfLevel as SelfLevel,
      user_context: userContext,
    })
    .eq("id", user.id);

  if (error) {
    return { success: false, error: PROFILE_ERRORS.SAVE_FAILED };
  }

  return { success: true };
}

export async function changePasswordAction(formData: FormData) {
  const newPassword = formData.get("new_password") as string;
  const confirmPassword = formData.get("confirm_password") as string;

  if (!newPassword || !confirmPassword) {
    return { success: false, error: PASSWORD_ERRORS.REQUIRED };
  }

  if (newPassword.length < 6) {
    return { success: false, error: PASSWORD_ERRORS.TOO_SHORT };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: PASSWORD_ERRORS.MISMATCH };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    return { success: false, error: PASSWORD_ERRORS.CHANGE_FAILED };
  }

  return { success: true };
}

function mapDeleteAccountError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return ACCOUNT_ERRORS.DELETE_GENERIC;
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
    status === 400 &&
    hasToken("invalid login credentials", "invalid_credentials", "invalid grant")
  ) {
    return PASSWORD_ERRORS.INCORRECT;
  }

  if (
    status === 429 ||
    hasToken("too many requests", "rate limit", "over_request_rate_limit")
  ) {
    return AUTH_ERRORS.SIGN_IN_TOO_MANY_REQUESTS;
  }

  if (typeof status === "number" && status >= 500) {
    return ACCOUNT_ERRORS.DELETE_SERVER_ERROR;
  }

  return ACCOUNT_ERRORS.DELETE_GENERIC;
}

export async function deleteAccountAction(formData: FormData) {
  const password = formData.get("password") as string;
  const confirmText = formData.get("confirm_text") as string;

  if (!password) {
    return { success: false, error: PASSWORD_ERRORS.REQUIRED };
  }

  if (confirmText !== ACCOUNT_DELETE_CONFIRM_TEXT) {
    return {
      success: false,
      error: `확인 문구를 정확히 입력해주세요. (${ACCOUNT_DELETE_CONFIRM_TEXT})`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    redirect("/login");
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (reauthError) {
    return { success: false, error: mapDeleteAccountError(reauthError) };
  }

  const { error: deleteError } = await supabase.rpc("delete_my_account");
  if (deleteError) {
    return { success: false, error: mapDeleteAccountError(deleteError) };
  }

  await supabase.auth.signOut();
  redirect("/login?deleted=1");
}
