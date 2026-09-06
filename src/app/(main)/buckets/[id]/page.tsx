// 완료 리포트 (얇은 서버 컴포넌트 — 인증 가드만).
// 데이터는 BucketReportContent가 React Query로 클라이언트 페칭 → 재방문 즉시 표시.

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { BucketReportContent } from "@/components/bucket/bucket-report-content";

interface BucketReportPageProps {
  params: Promise<{ id: string }>;
}

export default async function BucketReportPage({ params }: BucketReportPageProps) {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  return <BucketReportContent bucketId={id} />;
}
