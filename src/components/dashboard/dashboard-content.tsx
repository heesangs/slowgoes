"use client";

// 대시보드 콘텐츠(v1) — 토스트/쿼리 파라미터 처리 + AllTasksView 래퍼

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { AllTasksView } from "@/components/dashboard/all-tasks-view";
import type { TaskWithSubtasks } from "@/types";

interface DashboardContentProps {
  tasks: TaskWithSubtasks[];
  displayName: string | null;
  fetchError?: string;
}

export function DashboardContent({
  tasks,
  displayName,
  fetchError,
}: DashboardContentProps) {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  // /tasks/new에서 돌아왔을 때 성공 토스트 표시
  useEffect(() => {
    if (searchParams.get("saved") === "1") {
      toast("저장되었습니다 ✓", "success");
      // URL에서 쿼리 파라미터 제거
      window.history.replaceState(null, "", "/dashboard");
      return;
    }

    if (searchParams.get("onboarding_saved") === "1") {
      toast("첫 한 걸음이 준비되었어요 ✨", "success");
      window.history.replaceState(null, "", "/dashboard");
    }
  }, [searchParams, toast]);

  // 에러 토스트 표시
  useEffect(() => {
    if (fetchError) {
      toast(fetchError, "error");
    }
  }, [fetchError, toast]);

  return <AllTasksView tasks={tasks} displayName={displayName} />;
}
