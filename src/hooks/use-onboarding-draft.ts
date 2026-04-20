"use client";

import { useEffect, useRef } from "react";
import type { DemoSceneItem, LifeSceneAnalysisResult, OnboardingSceneCategory } from "@/types";
import { DRAFT_VERSION, type LifeCategory } from "@/components/auth/onboarding/constants";

export interface OnboardingDraftData {
  step: number;
  selectedLifeCategory: LifeCategory | null;
  sceneCategory: OnboardingSceneCategory["key"];
  selectedDemoScene: DemoSceneItem | null;
  customSceneInput: string;
  lifeSceneAnalysis: LifeSceneAnalysisResult | null;
  selectedDailyTodo: string;
  selectedRoutineTitles: string[];
  step3AnalysisKey: string | null;
}

export function useOnboardingDraft(
  sessionKey: string | undefined,
  initialStep: number,
  draftData: OnboardingDraftData,
  onRestore: (draft: OnboardingDraftData) => void
): { clearDraft: () => void } {
  const onRestoreRef = useRef(onRestore);

  // sessionStorage draft 복원 — 마운트 시 1회만 실행
  useEffect(() => {
    const key = sessionKey;
    if (!key || typeof window === "undefined") return;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      if (saved._v !== DRAFT_VERSION) return;
      const restoredStep =
        typeof saved.step === "number" && saved.step >= initialStep
          ? saved.step
          : initialStep;
      const draft: OnboardingDraftData = {
        step: restoredStep,
        selectedLifeCategory: (saved.selectedLifeCategory as LifeCategory | null) ?? null,
        sceneCategory: (saved.sceneCategory as OnboardingSceneCategory["key"]) ?? "must_do",
        selectedDemoScene: (saved.selectedDemoScene as DemoSceneItem | null) ?? null,
        customSceneInput: (saved.customSceneInput as string) ?? "",
        lifeSceneAnalysis: (saved.lifeSceneAnalysis as LifeSceneAnalysisResult | null) ?? null,
        selectedDailyTodo: (saved.selectedDailyTodo as string) ?? "",
        selectedRoutineTitles: (saved.selectedRoutineTitles as string[]) ?? [],
        step3AnalysisKey: (saved.step3AnalysisKey as string | null) ?? null,
      };
      onRestoreRef.current(draft);
    } catch {
      // 손상된 draft 무시
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 1회만

  const {
    step,
    selectedLifeCategory,
    sceneCategory,
    selectedDemoScene,
    customSceneInput,
    lifeSceneAnalysis,
    selectedDailyTodo,
    selectedRoutineTitles,
    step3AnalysisKey,
  } = draftData;

  // sessionStorage draft 저장 — 개별 값을 dep으로 나열해 정확한 변경 감지
  useEffect(() => {
    if (!sessionKey || typeof window === "undefined") return;
    sessionStorage.setItem(
      sessionKey,
      JSON.stringify({
        _v: DRAFT_VERSION,
        step,
        selectedLifeCategory,
        sceneCategory,
        selectedDemoScene,
        customSceneInput,
        lifeSceneAnalysis,
        selectedDailyTodo,
        selectedRoutineTitles,
        step3AnalysisKey,
      })
    );
  }, [
    sessionKey,
    step,
    selectedLifeCategory,
    sceneCategory,
    selectedDemoScene,
    customSceneInput,
    lifeSceneAnalysis,
    selectedDailyTodo,
    selectedRoutineTitles,
    step3AnalysisKey,
  ]);

  function clearDraft() {
    if (sessionKey && typeof window !== "undefined") {
      sessionStorage.removeItem(sessionKey);
    }
  }

  return { clearDraft };
}
