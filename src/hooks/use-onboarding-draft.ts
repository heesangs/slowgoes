"use client";

import { useEffect, useRef } from "react";
import type {
  DemoSceneItem,
  Gender,
  LifeSceneAnalysisResult,
  OnboardingSceneCategory,
} from "@/types";
import { DRAFT_VERSION, type LifeCategory } from "@/components/auth/onboarding/constants";

export interface OnboardingDraftData {
  step: number;
  // Step 1 프로필 — 이게 빠져 있으면 복원해도 제출 시
  // "기본 프로필 정보가 비어 있어요"에 걸린다.
  age: number | null;
  gender: Gender | null;
  energyType: "I" | "E" | null;
  judgmentType: "T" | "F" | null;
  // Step 4의 선택 보완 입력
  senseType: "S" | "N" | null;
  lifestyleType: "J" | "P" | null;
  selectedLifeCategory: LifeCategory | null;
  sceneCategory: OnboardingSceneCategory["key"];
  selectedDemoScene: DemoSceneItem | null;
  customSceneInput: string;
  lifeSceneAnalysis: LifeSceneAnalysisResult | null;
  selectedDailyTodo: string;
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
        age: (saved.age as number | null) ?? null,
        gender: (saved.gender as Gender | null) ?? null,
        energyType: (saved.energyType as "I" | "E" | null) ?? null,
        judgmentType: (saved.judgmentType as "T" | "F" | null) ?? null,
        senseType: (saved.senseType as "S" | "N" | null) ?? null,
        lifestyleType: (saved.lifestyleType as "J" | "P" | null) ?? null,
        selectedLifeCategory: (saved.selectedLifeCategory as LifeCategory | null) ?? null,
        sceneCategory: (saved.sceneCategory as OnboardingSceneCategory["key"]) ?? "must_do",
        selectedDemoScene: (saved.selectedDemoScene as DemoSceneItem | null) ?? null,
        customSceneInput: (saved.customSceneInput as string) ?? "",
        lifeSceneAnalysis: (saved.lifeSceneAnalysis as LifeSceneAnalysisResult | null) ?? null,
        selectedDailyTodo: (saved.selectedDailyTodo as string) ?? "",
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
    age,
    gender,
    energyType,
    judgmentType,
    senseType,
    lifestyleType,
    selectedLifeCategory,
    sceneCategory,
    selectedDemoScene,
    customSceneInput,
    lifeSceneAnalysis,
    selectedDailyTodo,
    step3AnalysisKey,
  } = draftData;

  // 아직 아무것도 입력하지 않은 상태는 저장하지 않는다.
  //
  // 저장하면 **복원보다 먼저 초기 상태가 draft를 덮어쓴다.** 복원 effect가 부른
  // setState는 다음 렌더에야 반영되는데 저장 effect는 같은 커밋에서 옛 값(step=1)을
  // 기록해 버리고, StrictMode의 effect 이중 실행이 그 값을 그대로 되읽어 확정시킨다.
  // 실제로 이 가드가 없으면 뒤로가기 복원이 항상 Step 1로 떨어졌다.
  const hasProgress =
    step > initialStep ||
    age !== null ||
    gender !== null ||
    customSceneInput.trim().length > 0 ||
    selectedDemoScene !== null;

  // sessionStorage draft 저장 — 개별 값을 dep으로 나열해 정확한 변경 감지
  useEffect(() => {
    if (!sessionKey || typeof window === "undefined" || !hasProgress) return;
    sessionStorage.setItem(
      sessionKey,
      JSON.stringify({
        _v: DRAFT_VERSION,
        step,
        age,
        gender,
        energyType,
        judgmentType,
        senseType,
        lifestyleType,
        selectedLifeCategory,
        sceneCategory,
        selectedDemoScene,
        customSceneInput,
        lifeSceneAnalysis,
        selectedDailyTodo,
        step3AnalysisKey,
      })
    );
  }, [
    sessionKey,
    hasProgress,
    initialStep,
    step,
    age,
    gender,
    energyType,
    judgmentType,
    senseType,
    lifestyleType,
    selectedLifeCategory,
    sceneCategory,
    selectedDemoScene,
    customSceneInput,
    lifeSceneAnalysis,
    selectedDailyTodo,
    step3AnalysisKey,
  ]);

  function clearDraft() {
    if (sessionKey && typeof window !== "undefined") {
      sessionStorage.removeItem(sessionKey);
    }
  }

  return { clearDraft };
}
