"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addItemsToExistingBucketAction,
  saveOnboardingV2Action,
  saveOnboardingV2NoRedirectAction,
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
      // - 시트 모드 (onComplete 있음): redirect 안 하는 액션 사용 → onComplete 콜백으로 시트 닫기
      // - standalone 모드 (/onboarding 페이지): redirect 액션 사용 → 대시보드로 이동
      const payload = {
        displayName: "slowgoes 사용자",
        selfLevel: "medium" as const,
        userContext: ["personal" as const],
        grade: "",
        subjects: [],
        sceneText: selectedSceneText,
        selectedWeeklyAction: selectedDailyTodo,
        lifeArea: lifeSceneAnalysis.lifeArea,
        age,
        gender,
        personalityType,
        paceType: paceType ?? ("balanced" as const),
        chapterTitle: selectedSeasonAction || `${selectedSceneText} 이번 시즌 실행`,
        stridePlan: lifeSceneAnalysis,
        selectedDailyTodos,
        selectedRoutines,
      };

      if (onComplete) {
        const result = await saveOnboardingV2NoRedirectAction(payload);
        if (!result.success) {
          setError(result.error ?? "온보딩 저장에 실패했습니다.");
          return;
        }
        onComplete();
        return;
      }

      const result = await saveOnboardingV2Action(payload);
      // saveOnboardingV2Action 성공 시 내부에서 redirect throw → 아래 라인 도달 안 함
      if (result?.error) {
        setError(result.error);
        return;
      }
    } catch {
      // redirect는 throw 에러이므로 무시 (standalone 모드에서만 발생)
    } finally {
      setIsLoading(false);
    }
  }

  return { handleSubmit, isLoading };
}
