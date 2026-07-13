// 일기 목록 페이지 (Server Component)

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getDiaryEntries } from "@/lib/diary/queries";
import { DiaryListContent } from "@/components/diary/diary-list-content";
import type { DiaryListItem } from "@/types";

export default async function DiaryPage() {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  // 목록 조회 — 실패 시 빈 목록 + 에러 배너
  let entries: DiaryListItem[] = [];
  let loadError: string | undefined;
  try {
    entries = await getDiaryEntries(supabase, user.id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "일기를 불러오지 못했습니다.";
  }

  return <DiaryListContent entries={entries} loadError={loadError} />;
}
