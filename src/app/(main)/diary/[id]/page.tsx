// 일기 편집 페이지 (Server Component)

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getDiaryEntry } from "@/lib/diary/queries";
import { DiaryEditor } from "@/components/diary/diary-editor";

interface DiaryDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function DiaryDetailPage({ params }: DiaryDetailPageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const entry = await getDiaryEntry(supabase, user.id, id);
  if (!entry) {
    redirect("/diary");
  }

  return <DiaryEditor mode="edit" entry={entry} />;
}
