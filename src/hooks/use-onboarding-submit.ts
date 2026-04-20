"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addItemsToExistingBucketAction,
  saveOnboardingV2Action,
} from "@/app/(auth)/actions";
import { saveDemoOnboardingData } from "@/lib/demo/storage";
import type {
  ExistingBucketContext,
  Gender,
  LifeSceneAnalysisResult,
  PaceType,
  PersonalityType,
} from "@/types";

interface UseOnboardingSubmitParams {
  isDemo: boolean;
  age: number | null;
  gender: Gender | null;
  personalityType: PersonalityType | null;
  paceType: PaceType | null;
  selectedSceneText: string;
  lifeSceneAnalysis: LifeSceneAnalysisResult | null;
  selectedDailyTodo: string;
  selectedRoutineTitles: string[];
  selectedSeasonAction: string;
  selectedExistingBucket: ExistingBucketContext | null;
  onComplete: (() => void) | undefined;
  clearDraft: () => void;
  setError: (error: string) => void;
}

export function useOnboardingSubmit({
  isDemo,
  age,
  gender,
  personalityType,
  paceType,
  selectedSceneText,
  lifeSceneAnalysis,
  selectedDailyTodo,
  selectedRoutineTitles,
  selectedSeasonAction,
  selectedExistingBucket,
  onComplete,
  clearDraft,
  setError,
}: UseOnboardingSubmitParams) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit() {
    if (age === null || !gender || !personalityType) {
      setError("기본 프로필 정보가 비어 있어요. Step 1부터 다시 확인해주세요.");
      return;
    }
    if (!selectedSceneText || !lifeSceneAnalysis) {
      setError("삶의 장면 정보가 비어 있어요. Step 2~3을 다시 확인해주세요.");
      return;
    }

    const selectedDailyTodos = selectedDailyTodo
      ? [{ title: selectedDailyTodo, source: "onboarding" as const }]
      : [];
    const selectedRoutines = lifeSceneAnalysis.suggestedRoutines
      .filter((item) => selectedRoutineTitles.includes(item.title))
      .map((item) => ({
        title: item.title,
        repeatUnit: item.repeatUnit,
        repeatValue: item.repeatValue,
        source: "onboarding" as const,
      }));

    if (selectedDailyTodos.length === 0 && selectedRoutines.length === 0) {
      setError("데일리투두 또는 루틴을 최소 1개 선택해주세요.");
      return;
    }

    setIsLoading(true);
    clearDraft();

    try {
      if (isDemo) {
        saveDemoOnboardingData({
          displayName: "slowgoes 사용자",
          sceneText: selectedSceneText,
          lifeArea: lifeSceneAnalysis.lifeArea,
          age,
          gender,
          personalityType,
          paceType: paceType ?? "balanced",
          selfLevel: "medium",
          chapterTitle: selectedSeasonAction || `${selectedSceneText} 이번 시즌 실행`,
          stridePlan: lifeSceneAnalysis,
          selectedDailyTodos,
          selectedRoutines,
          savedAt: new Date().toISOString(),
        });
        router.push("/demo/complete");
        return;
      }

      // 기존 버킷에 아이템 추가 (바텀시트 모드)
      if (selectedExistingBucket) {
        const result = await addItemsToExistingBucketAction({
          bucketId: selectedExistingBucket.bucketId,
          selectedDailyTodos,
          selectedRoutines,
          stridePlan: lifeSceneAnalysis,
        });

        if (!result.success) {
          setError(result.error ?? "아이템 추가에 실패했습니다.");
          return;
        }

        if (onComplete) {
          onComplete();
          return;
        }
        router.push("/dashboard?onboarding_saved=1");
        return;
      }

      // 새 버킷 생성 (기본 플로우)
      const result = await saveOnboardingV2Action({
        displayName: "slowgoes 사용자",
        selfLevel: "medium",
        userContext: ["personal"],
        grade: "",
        subjects: [],
        sceneText: selectedSceneText,
        selectedWeeklyAction: selectedDailyTodo,
        lifeArea: lifeSceneAnalysis.lifeArea,
        age,
        gender,
        personalityType,
        paceType: paceType ?? "balanced",
        chapterTitle: selectedSeasonAction || `${selectedSceneText} 이번 시즌 실행`,
        stridePlan: lifeSceneAnalysis,
        selectedDailyTodos,
        selectedRoutines,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      if (onComplete) {
        onComplete();
        return;
      }
    } catch {
      // redirect는 throw 에러이므로 무시
    } finally {
      setIsLoading(false);
    }
  }

  return { handleSubmit, isLoading };
}
