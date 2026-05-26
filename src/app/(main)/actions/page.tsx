// IA v2 목표 5: /actions 폐기 → /dashboard 흡수.
//
// 이 파일은 구 링크 호환만 담당하는 redirect 페이지로 축소.
// - /actions          → /dashboard
// - /actions?bucket=X → /dashboard?bucket=X
//
// 외부에서 공유된 링크가 있을 수 있어 라우트 자체는 한동안 유지하고,
// 컴포넌트/로딩 스켈레톤은 함께 제거했다.

import { redirect } from "next/navigation";

interface ActionsPageProps {
  searchParams?: Promise<{ bucket?: string }>;
}

export default async function ActionsPage({ searchParams }: ActionsPageProps) {
  const resolved = (await searchParams) ?? {};
  const bucket = resolved.bucket?.trim();
  redirect(bucket ? `/dashboard?bucket=${bucket}` : "/dashboard");
}
