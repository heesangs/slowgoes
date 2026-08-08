"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchBucketTodosAction } from "@/app/(main)/dashboard/actions";
import type { BucketTodosData } from "@/types";

// 버킷 단위 todos 캐시 — 키 ['todos', bucketId] (날짜 차원 없음).
//
// 날짜 필터/완료 판정은 클라이언트 deriveTodosForDate가 수행하므로
// 캘린더에서 어떤 날짜를 탭해도 서버 왕복 0회(버킷당 최초 1회만 로드).
export function useBucketTodos(bucketId: string | null, seed?: BucketTodosData) {
  return useQuery({
    queryKey: ["todos", bucketId],
    queryFn: () => fetchBucketTodosAction(bucketId),
    enabled: !!bucketId,
    // 대시보드 응답이 첫 진입분을 함께 실어 준다(fetchDashboardDataAction).
    // initialData는 **캐시가 비었을 때만** 쓰이므로 재방문 캐시를 덮지 않는다.
    // 이게 없으면 대시보드 응답 뒤에야 todos 요청이 시작돼(순차 2왕복) 그 사이
    // "오늘의 할 일이 없어요"가 스친다.
    initialData: seed,
  });
}
