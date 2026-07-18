"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchBucketTodosAction } from "@/app/(main)/dashboard/actions";

// 버킷 단위 todos 캐시 — 키 ['todos', bucketId] (날짜 차원 없음).
//
// 날짜 필터/완료 판정은 클라이언트 deriveTodosForDate가 수행하므로
// 캘린더에서 어떤 날짜를 탭해도 서버 왕복 0회(버킷당 최초 1회만 로드).
export function useBucketTodos(bucketId: string | null) {
  return useQuery({
    queryKey: ["todos", bucketId],
    queryFn: () => fetchBucketTodosAction(bucketId),
    enabled: !!bucketId,
  });
}
