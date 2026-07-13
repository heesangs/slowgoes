"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchReviewDataAction } from "@/app/(main)/review/actions";

// 회고 데이터 — 전역(버킷 무관). 대시보드 토글 시 ['review'] 무효화로 갱신됨.
export function useReview() {
  return useQuery({
    queryKey: ["review"],
    queryFn: () => fetchReviewDataAction(),
  });
}
