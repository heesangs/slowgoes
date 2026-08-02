import type { SupabaseClient } from "@supabase/supabase-js";
import { DIARY_ERRORS } from "@/lib/constants";
import type { Diary, DiaryListItem } from "@/types";
import { toDiaryListItem } from "./format";

// 목록: 사용자별 최신순. content(HTML)는 제외하고 미리보기용 필드만 조회.
export async function getDiaryEntries(
  supabase: SupabaseClient,
  userId: string
): Promise<DiaryListItem[]> {
  // buckets(title) 관계 조인 — 주간 회고의 #버킷명 배지용
  const { data, error } = await supabase
    .from("diaries")
    .select("id, plain_text, created_at, week_start, buckets(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(DIARY_ERRORS.LOAD_FAILED);
  }

  type Row = {
    id: string;
    plain_text: string;
    created_at: string;
    week_start: string | null;
    // 조인 결과는 관계 카디널리티에 따라 객체/배열 어느 쪽으로도 올 수 있어 둘 다 받는다
    buckets: { title: string } | { title: string }[] | null;
  };

  return ((data as Row[] | null) ?? []).map((row) => {
    const bucket = Array.isArray(row.buckets) ? row.buckets[0] : row.buckets;
    return toDiaryListItem({
      id: row.id,
      plain_text: row.plain_text,
      created_at: row.created_at,
      week_start: row.week_start,
      bucket_title: bucket?.title ?? null,
    });
  });
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
    .select(
      "id, user_id, content, plain_text, comments, week_start, bucket_id, created_at, updated_at"
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(DIARY_ERRORS.LOAD_FAILED);
  }

  return (data as Diary | null) ?? null;
}
