"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AUTH_ERRORS, DIARY_ERRORS } from "@/lib/constants";

function toClientErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message?.trim();
  if (!message) return fallback;
  if (message.length > 180) return fallback;
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

interface DiaryInput {
  content: string;
  plainText: string;
}

// 생성 — 성공 시 새 일기 id 반환
export async function createDiaryAction(
  input: DiaryInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();
    const plainText = input.plainText?.trim() ?? "";

    if (!plainText) {
      throw new Error(DIARY_ERRORS.CONTENT_REQUIRED);
    }

    const { data, error } = await supabase
      .from("diaries")
      .insert({
        user_id: userId,
        content: input.content,
        plain_text: plainText,
      })
      .select("id")
      .single();

    if (error) throw error;

    revalidatePath("/diary");
    return { success: true, id: data.id };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, DIARY_ERRORS.CREATE_FAILED),
    };
  }
}

// 수정 — 소유권 가드 + updated_at 갱신
export async function updateDiaryAction(
  id: string,
  input: DiaryInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const trimmedId = id?.trim();
    if (!trimmedId) {
      return { success: false, error: DIARY_ERRORS.NOT_FOUND };
    }

    const plainText = input.plainText?.trim() ?? "";
    if (!plainText) {
      throw new Error(DIARY_ERRORS.CONTENT_REQUIRED);
    }

    const { error } = await supabase
      .from("diaries")
      .update({
        content: input.content,
        plain_text: plainText,
        updated_at: new Date().toISOString(),
      })
      .eq("id", trimmedId)
      .eq("user_id", userId);

    if (error) throw error;

    revalidatePath("/diary");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, DIARY_ERRORS.UPDATE_FAILED),
    };
  }
}

// 삭제 — hard delete
export async function deleteDiaryAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const trimmedId = id?.trim();
    if (!trimmedId) {
      return { success: false, error: DIARY_ERRORS.NOT_FOUND };
    }

    const { error } = await supabase
      .from("diaries")
      .delete()
      .eq("id", trimmedId)
      .eq("user_id", userId);

    if (error) throw error;

    revalidatePath("/diary");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, DIARY_ERRORS.DELETE_FAILED),
    };
  }
}
