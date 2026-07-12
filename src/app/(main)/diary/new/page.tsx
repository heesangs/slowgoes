// 일기 작성 페이지 (Server Component)

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DiaryEditor } from "@/components/diary/diary-editor";

export default async function NewDiaryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <DiaryEditor mode="create" />;
}
