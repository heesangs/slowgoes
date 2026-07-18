import type { SupabaseClient } from "@supabase/supabase-js";
import { DIARY_ERRORS } from "@/lib/constants";
import type { Diary, DiaryListItem } from "@/types";
import { toDiaryListItem } from "./format";

// 목록: 사용자별 최신순. content(HTML)는 제외하고 미리보기용 필드만 조회.
export async function getDiaryEntries(
  supabase: SupabaseClient,
  userId: string
): Promise<DiaryListItem[]> {
  const { data, error } = await supabase
    .from("diaries")
    .select("id, plain_text, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(DIARY_ERRORS.LOAD_FAILED);
  }

  return (data ?? []).map(toDiaryListItem);
}

// AI 투두 생성 컨텍스트용 — 최근 일기 발췌 (aiprompt.md ⑤).
// plain_text 앞부분만 잘라 토큰을 아낀다. 실패해도 AI 생성은 계속돼야 하므로 throw 없이 빈 배열.
const DIARY_EXCERPT_CHARS = 200;

export async function getRecentDiaryExcerpts(
  supabase: SupabaseClient,
  userId: string,
  limit = 3
): Promise<string[]> {
  const { data, error } = await supabase
    .from("diaries")
    .select("plain_text")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  return ((data as Array<{ plain_text: string }> | null) ?? [])
    .map((row) => row.plain_text.trim().slice(0, DIARY_EXCERPT_CHARS))
    .filter(Boolean);
}

// 단건: 편집용 전체 조회. RLS + user_id 가드 이중.
export async function getDiaryEntry(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<Diary | null> {
  const { data, error } = await supabase
    .from("diaries")
    .select("id, user_id, content, plain_text, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(DIARY_ERRORS.LOAD_FAILED);
  }

  return (data as Diary | null) ?? null;
}
