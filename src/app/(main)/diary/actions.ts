"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getDiaryEntries, getDiaryEntry } from "@/lib/diary/queries";
import { analyzeDiary } from "@/lib/ai/diary-analyze";
import type { DiaryOrganizeMode } from "@/lib/ai/diary-prompts";
import { AI_ERRORS, AUTH_ERRORS, DIARY_ERRORS } from "@/lib/constants";
import type { Diary, DiaryComment, DiaryListItem } from "@/types";

// ── React Query queryFn용 읽기 액션 ──
// 클라이언트 useQuery에서 호출한다. 인증 가드(getAuthUser) + RLS로 보호.

export async function fetchDiaryEntriesAction(): Promise<DiaryListItem[]> {
  const user = await getAuthUser();
  if (!user) throw new Error(AUTH_ERRORS.LOGIN_REQUIRED);
  const supabase = await createClient();
  return getDiaryEntries(supabase, user.id);
}

export async function fetchDiaryEntryAction(id: string): Promise<Diary | null> {
  const user = await getAuthUser();
  if (!user) throw new Error(AUTH_ERRORS.LOGIN_REQUIRED);
  const supabase = await createClient();
  return getDiaryEntry(supabase, user.id, id);
}

function toClientErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message?.trim();
  if (!message) return fallback;
  if (message.length > 180) return fallback;
  return message;
}

// 쓰기 액션 인증 — getAuthUser(쿠키 기반, 네트워크 왕복 0).
// 토큰 검증/갱신은 middleware의 getUser()가 매 요청 담당하고, 데이터 소유권은
// RLS(auth.uid() = user_id)가 DB에서 강제하므로 실질 보안은 동일하다.
async function getAuthContext() {
  const user = await getAuthUser();
  if (!user) {
    throw new Error(AUTH_ERRORS.LOGIN_REQUIRED);
  }

  const supabase = await createClient();
  return { supabase, userId: user.id };
}

interface DiarySaveInput {
  /** 클라이언트가 생성한 UUID (신규/수정 공통) */
  id: string;
  content: string;
  plainText: string;
}

// 저장 — 생성/수정 공용 **멱등** 액션.
//
// 왜 upsert인가: 낙관적 저장은 실패 시 로컬 드래프트로 재전송한다. insert였다면
// 재전송이 일기를 복제하므로, 클라이언트 생성 id + upsert로 몇 번을 보내도 같은 행이 되게 한다.
// created_at은 넣지 않는다 → 신규는 DB default, 수정 시엔 보존.
// 타인 소유 id로 upsert해도 RLS(FOR ALL USING/WITH CHECK auth.uid() = user_id)가 막는다.
//
// revalidatePath 미사용: /diary는 인증만 하는 얇은 페이지라 revalidate할 서버 데이터가
// 없고, 오히려 클라이언트 Router Cache를 파괴해 전환을 느리게 만든다.
// 목록/상세 캐시 갱신은 호출부의 queryClient.setQueryData가 담당.
export async function saveDiaryAction(
  input: DiarySaveInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const id = input.id?.trim();
    if (!id) {
      return { success: false, error: DIARY_ERRORS.NOT_FOUND };
    }

    const plainText = input.plainText?.trim() ?? "";
    if (!plainText) {
      throw new Error(DIARY_ERRORS.CONTENT_REQUIRED);
    }

    const { error } = await supabase.from("diaries").upsert({
      id,
      user_id: userId,
      content: input.content,
      plain_text: plainText,
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;

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

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, DIARY_ERRORS.DELETE_FAILED),
    };
  }
}

// ── AI organize ── 현재 일기 1건을 요약/글쓰기 개선 조언. 저장하지 않는 읽기 전용.
export async function analyzeDiaryAction(input: {
  content: string;
  mode?: DiaryOrganizeMode;
  question?: string;
  selection?: string;
}): Promise<{ success: true; text: string } | { success: false; error: string }> {
  try {
    // 인증 가드만 — DB 쓰기 없음. (AI 호출은 서버에서만: CLAUDE.md)
    await getAuthContext();
    const text = await analyzeDiary(input);
    return { success: true, text };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, AI_ERRORS.ANALYSIS_GENERIC),
    };
  }
}

// ── 코멘트 추가 ── organize 응답을 일기 아래에 붙인다(제목=버튼명/질문). comments jsonb에 append.
export async function addDiaryCommentAction(
  id: string,
  input: { title: string; body: string }
): Promise<{ success: true; comment: DiaryComment } | { success: false; error: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const diaryId = id?.trim();
    const title = input.title?.trim();
    const body = input.body?.trim();
    if (!diaryId) return { success: false, error: DIARY_ERRORS.NOT_FOUND };
    if (!title || !body) return { success: false, error: DIARY_ERRORS.CONTENT_REQUIRED };

    // 현재 comments 읽고 append 후 저장 (본인 소유 행만 — RLS + user_id 필터)
    const { data: row, error: readErr } = await supabase
      .from("diaries")
      .select("comments")
      .eq("id", diaryId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!row) return { success: false, error: DIARY_ERRORS.NOT_FOUND };

    const comment: DiaryComment = {
      id: crypto.randomUUID(),
      title,
      body,
      created_at: new Date().toISOString(),
    };
    const existing = Array.isArray(row.comments) ? (row.comments as DiaryComment[]) : [];
    const next = [...existing, comment];

    const { error: updateErr } = await supabase
      .from("diaries")
      .update({ comments: next })
      .eq("id", diaryId)
      .eq("user_id", userId);
    if (updateErr) throw updateErr;

    return { success: true, comment };
  } catch (error) {
    return { success: false, error: toClientErrorMessage(error, DIARY_ERRORS.UPDATE_FAILED) };
  }
}

// ── 코멘트 삭제 ── comments jsonb에서 해당 id 제거.
export async function deleteDiaryCommentAction(
  id: string,
  commentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const diaryId = id?.trim();
    if (!diaryId || !commentId) return { success: false, error: DIARY_ERRORS.NOT_FOUND };

    const { data: row, error: readErr } = await supabase
      .from("diaries")
      .select("comments")
      .eq("id", diaryId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!row) return { success: false, error: DIARY_ERRORS.NOT_FOUND };

    const existing = Array.isArray(row.comments) ? (row.comments as DiaryComment[]) : [];
    const next = existing.filter((c) => c.id !== commentId);

    const { error: updateErr } = await supabase
      .from("diaries")
      .update({ comments: next })
      .eq("id", diaryId)
      .eq("user_id", userId);
    if (updateErr) throw updateErr;

    return { success: true };
  } catch (error) {
    return { success: false, error: toClientErrorMessage(error, DIARY_ERRORS.DELETE_FAILED) };
  }
}
