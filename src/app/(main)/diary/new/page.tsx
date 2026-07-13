// 일기 작성 페이지 (Server Component)

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { DiaryEditor } from "@/components/diary/diary-editor";

export default async function NewDiaryPage() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  return <DiaryEditor mode="create" />;
}
