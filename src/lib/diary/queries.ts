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
