// 완료한 버킷 목록 (얇은 서버 컴포넌트 — 인증 가드만).
// 데이터는 CompletedBucketsContent가 React Query로 클라이언트 페칭 → 재방문 즉시 표시.

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { CompletedBucketsContent } from "@/components/bucket/completed-buckets-content";

export default async function CompletedBucketsPage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  return <CompletedBucketsContent />;
}
