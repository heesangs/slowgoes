"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchDiaryEntriesAction,
  fetchDiaryEntryAction,
} from "@/app/(main)/diary/actions";

// 일기 목록 — 재방문 시 캐시 즉시 표시, staleTime 지나면 백그라운드 갱신.
export function useDiaryEntries() {
  return useQuery({
    queryKey: ["diary", "list"],
    queryFn: () => fetchDiaryEntriesAction(),
  });
}

// 일기 단건 (편집용)
export function useDiaryEntry(id: string) {
  return useQuery({
    queryKey: ["diary", "entry", id],
    queryFn: () => fetchDiaryEntryAction(id),
    enabled: !!id,
  });
}
