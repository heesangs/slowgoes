// 프로필 페이지 (얇은 서버 컴포넌트 — 인증 가드만).
// 데이터는 ProfileContent가 React Query로 클라이언트 페칭 → 재방문 즉시 표시.

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { ProfileContent } from "@/components/profile/profile-content";

export default async function ProfilePage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  return <ProfileContent />;
}
