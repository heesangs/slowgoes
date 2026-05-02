"use client";

// 체험판 데이터 안심 배너 — 회원가입 페이지에서 체험 데이터가 보관 중임을 안내

import { useEffect, useState } from "react";
import { FEATURE_NAMES } from "@/lib/constants";
import {
  getDemoOnboardingBackupData,
  getDemoOnboardingData,
  type DemoOnboardingData,
} from "@/lib/demo/storage";

export function DemoDataBanner() {
  const [data, setData] = useState<DemoOnboardingData | null>(null);

  useEffect(() => {
    setData(getDemoOnboardingData() ?? getDemoOnboardingBackupData());
  }, []);

  if (!data) return null;

  const todoCount = data.selectedDailyTodos.length;
  const routineCount = data.selectedRoutines.length;

  return (
    <div className="mb-4 rounded-xl border border-foreground/15 bg-foreground/[0.03] p-4 text-sm">
      <p className="font-medium">체험 데이터가 저장되어 있어요</p>
      <p className="mt-1 line-clamp-2 text-foreground/60">
        &ldquo;{data.sceneText}&rdquo;
      </p>
      {(todoCount > 0 || routineCount > 0) && (
        <p className="mt-1 text-foreground/60">
          {FEATURE_NAMES.DAILY_TODO} {todoCount}개, {FEATURE_NAMES.ROUTINE} {routineCount}개가 보관 중이에요.
        </p>
      )}
      <p className="mt-1 text-foreground/60">
        가입하면 그대로 이어서 시작할 수 있어요.
      </p>
    </div>
  );
}
