"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDashboardDataAction } from "@/app/(main)/dashboard/actions";

// 대시보드 데이터 — 버킷별 캐시. 재방문/버킷 재선택 시 캐시 즉시 표시.
// data === null 이면 온보딩 미완(로더가 리다이렉트).
export function useDashboard(requestedBucketId: string | null) {
  return useQuery({
    queryKey: ["dashboard", requestedBucketId],
    queryFn: () => fetchDashboardDataAction(requestedBucketId),
  });
}
