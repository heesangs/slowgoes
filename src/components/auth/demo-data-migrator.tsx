"use client";

// 체험판 데이터 마이그레이션 — 온보딩 페이지 진입 시 localStorage 데이터를 DB로 자동 저장

import { useEffect, useState } from "react";
import {
  getDemoOnboardingData,
  clearDemoOnboardingData,
} from "@/lib/demo/storage";
import { saveOnboardingV2Action } from "@/app/(auth)/actions";

interface DemoDataMigratorProps {
  children: React.ReactNode;
}

export function DemoDataMigrator({ children }: DemoDataMigratorProps) {
  const [migrating, setMigrating] = useState(true);

  useEffect(() => {
    async function migrate() {
      const demoData = getDemoOnboardingData();

      if (!demoData) {
        setMigrating(false);
        return;
      }

      try {
        const result = await saveOnboardingV2Action({
          sceneText: demoData.sceneText,
          lifeArea: demoData.lifeArea,
          age: demoData.age,
          gender: demoData.gender,
          personalityType: demoData.personalityType,
          paceType: "balanced",
          displayName: demoData.displayName || "slowgoes 사용자",
          selfLevel: "medium",
          chapterTitle: demoData.chapterTitle,
          horizonAnalysis: demoData.horizonAnalysis,
          selectedDailyTodos: demoData.selectedDailyTodos,
          selectedRoutines: demoData.selectedRoutines,
        });

        clearDemoOnboardingData();

        // saveOnboardingV2Action 성공 시 redirect를 throw하므로 여기에 도달하면 에러 반환된 경우
        if (result?.error) {
          console.error("체험판 데이터 마이그레이션 실패:", result.error);
        }
      } catch {
        // redirect는 에러로 throw되므로 정상 동작 — localStorage만 정리
        clearDemoOnboardingData();
        return;
      }

      setMigrating(false);
    }

    migrate();
  }, []);

  if (migrating) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <p className="text-sm text-foreground/60">
          체험판 데이터를 불러오는 중...
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
