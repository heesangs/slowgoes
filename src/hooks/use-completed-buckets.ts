"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCompletedBucketsAction } from "@/app/(main)/dashboard/actions";

/**
 * 완료한 버킷 목록 — 재방문 시 캐시 즉시 표시.
 *
 * 대시보드 캐시(['dashboard', bucketId])와 키를 나눈다. 되돌리기가 양쪽을 모두
 * 바꾸므로 복구 후에는 둘 다 무효화해야 한다.
 */
export function useCompletedBuckets() {
  return useQuery({
    queryKey: ["buckets", "completed"],
    queryFn: () => fetchCompletedBucketsAction(),
  });
}
