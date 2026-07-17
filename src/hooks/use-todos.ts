"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTodosForDateAction } from "@/app/(main)/dashboard/actions";

// 선택 날짜의 할 일 목록 — 날짜/버킷별 캐시.
// 캘린더에서 날짜를 오가면 방문했던 날짜는 캐시로 즉시 표시된다.
export function useTodos(bucketId: string | null, dateStr: string) {
  return useQuery({
    queryKey: ["todos", bucketId, dateStr],
    queryFn: () => fetchTodosForDateAction(bucketId, dateStr),
    enabled: !!bucketId,
  });
}
