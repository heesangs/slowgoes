// 일기 작성 페이지 (Server Component)
//
// ?week=YYYY-MM-DD&bucket=<id> 로 들어오면 **주간 회고** 작성이 된다
// (52주 캘린더 셀 탭 → 주간 시트 → 회고 카드). 없으면 일반 일기.

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { DiaryEditor } from "@/components/diary/diary-editor";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface NewDiaryPageProps {
  searchParams?: Promise<{ week?: string; bucket?: string; bucketTitle?: string }>;
}

export default async function NewDiaryPage({ searchParams }: NewDiaryPageProps) {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const resolved = (await searchParams) ?? {};
  // 형식이 어긋나면 무시하고 일반 일기로 — 잘못된 값이 DB까지 가지 않게 한다
  const weekStart = resolved.week && DATE_RE.test(resolved.week) ? resolved.week : null;

  return (
    <DiaryEditor
      mode="create"
      weekStart={weekStart}
      bucketId={weekStart ? (resolved.bucket ?? null) : null}
      bucketTitle={weekStart ? (resolved.bucketTitle ?? null) : null}
    />
  );
}
