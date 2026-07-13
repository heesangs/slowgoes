"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchProfileViewAction } from "@/app/(main)/profile/actions";

// 프로필 화면 데이터 — 재방문 시 캐시 즉시 표시.
export function useProfileView() {
  return useQuery({
    queryKey: ["profile", "view"],
    queryFn: () => fetchProfileViewAction(),
  });
}
