"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  DemoSceneItem,
  Gender,
  OnboardingSceneCategory,
  PaceType,
  PersonalityType,
  SelfLevel,
} from "@/types";
import { LIFE_CATEGORIES, type LifeCategory } from "./onboarding/constants";
import { computeLifeClock } from "./onboarding/utils";
import { useOnboardingDraft, type OnboardingDraftData } from "@/hooks/use-onboarding-draft";
import { useOnboardingSubmit } from "@/hooks/use-onboarding-submit";
import { useLifeSceneAnalysis } from "@/hooks/use-life-scene-analysis";
import { StepProfile } from "./onboarding/step-profile";
import { StepScene } from "./onboarding/step-scene";
import { StepAnalysis } from "./onboarding/step-analysis";
import { StepConfirm } from "./onboarding/step-confirm";

interface OnboardingFormProps {
  mode?: "default" | "demo";
  startStep?: 1 | 2;
  prefillProfile?: {
    age: number;
    gender: Gender;
    personalityType: PersonalityType;
    paceType?: PaceType;
    selfLevel?: SelfLevel;
  } | null;
  // 바텀시트 모드 — 완료 시 호출되는 콜백 (없으면 페이지 redirect)
  onComplete?: () => void;
  // sessionStorage 보존 키 (대시보드 탐색 모드에서만 사용)
  sessionKey?: string;
}

export function OnboardingForm({
  mode = "default",
  startStep,
  prefillProfile,
  onComplete,
  sessionKey,
}: OnboardingFormProps) {
  const isDemo = mode === "demo";
  const initialStep = startStep === 2 ? 2 : 1;
  const isProfileStep = initialStep === 1;

  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(initialStep);

  // Step 1 상태
  const [age, setAge] = useState<number | null>(prefillProfile?.age ?? null);
  const [gender, setGender] = useState<Gender | null>(prefillProfile?.gender ?? null);
  const [energyType, setEnergyType] = useState<"I" | "E" | null>(
    (prefillProfile?.personalityType?.[0] as "I" | "E" | undefined) ?? null
  );
  const [senseType, setSenseType] = useState<"S" | "N" | null>(
    (prefillProfile?.personalityType?.[1] as "S" | "N" | undefined) ?? null
  );
  const [judgmentType, setJudgmentType] = useState<"T" | "F" | null>(
    (prefillProfile?.personalityType?.[2] as "T" | "F" | undefined) ?? null
  );
  const [lifestyleType, setLifestyleType] = useState<"J" | "P" | null>(
    (prefillProfile?.personalityType?.[3] as "J" | "P" | undefined) ?? null
  );
  const [personalityType, setPersonalityType] = useState<PersonalityType | null>(
    prefillProfile?.personalityType ?? null
  );
  const [paceType, setPaceType] = useState<PaceType | null>(prefillProfile?.paceType ?? null);

  // Step 2 상태
  const [selectedLifeCategory, setSelectedLifeCategory] = useState<LifeCategory | null>(null);
  const [sceneCategory, setSceneCategory] = useState<OnboardingSceneCategory["key"]>("must_do");
  const [selectedDemoScene, setSelectedDemoScene] = useState<DemoSceneItem | null>(null);
  const [customSceneInput, setCustomSceneInput] = useState("");
  const [showGoalChat, setShowGoalChat] = useState(false);

  const isSceneFromCustomInput = customSceneInput.trim().length > 0;
  const selectedSceneText = isSceneFromCustomInput
    ? customSceneInput.trim()
    : selectedDemoScene?.text ?? "";

  const lifeClock = useMemo(() => computeLifeClock(age), [age]);

  // 선택된 카테고리에서 AI lifeArea 힌트 추출 — 분석 정확도 향상에 기여
  const lifeAreaHint = useMemo(() => {
    const cat = LIFE_CATEGORIES.find((c) => c.key === selectedLifeCategory);
    return cat?.lifeAreaHint ?? null;
  }, [selectedLifeCategory]);

  // prefillProfile 변경 시 상태 동기화
  useEffect(() => {
    if (!prefillProfile) return;
    setAge(prefillProfile.age);
    setGender(prefillProfile.gender);
    setPersonalityType(prefillProfile.personalityType);
    setEnergyType(prefillProfile.personalityType[0] as "I" | "E");
    setSenseType(prefillProfile.personalityType[1] as "S" | "N");
    setJudgmentType(prefillProfile.personalityType[2] as "T" | "F");
    setLifestyleType(prefillProfile.personalityType[3] as "J" | "P");
    if (prefillProfile.paceType) setPaceType(prefillProfile.paceType);
  }, [prefillProfile]);

  // AI 분석 hook
  const {
    lifeSceneAnalysis,
    setLifeSceneAnalysis,
    isAnalyzingLifeScene,
    selectedDailyTodo,
    setSelectedDailyTodo,
    selectedRoutineTitles,
    setSelectedRoutineTitles,
    step3AnalysisKey,
    setStep3AnalysisKey,
    displayStrides,
    bucketTodos,
    selectedSeasonAction,
    resetAnalysisState,
    selectRoutineTitle,
    runLifeSceneAnalysis,
  } = useLifeSceneAnalysis({
    isDemo,
    step,
    age,
    gender,
    personalityType,
    selectedSceneText,
    lifeAreaHint,
    setError,
  });

  // draft 복원 콜백
  const onRestore = useCallback(
    (draft: OnboardingDraftData) => {
      if (draft.selectedLifeCategory) setSelectedLifeCategory(draft.selectedLifeCategory);
      setSceneCategory(draft.sceneCategory);
      if (draft.selectedDemoScene) setSelectedDemoScene(draft.selectedDemoScene);
      if (draft.customSceneInput) setCustomSceneInput(draft.customSceneInput);
      if (draft.lifeSceneAnalysis) {
        setLifeSceneAnalysis(draft.lifeSceneAnalysis);
        setStep3AnalysisKey(draft.step3AnalysisKey);
      }
      if (draft.selectedDailyTodo) setSelectedDailyTodo(draft.selectedDailyTodo);
      setSelectedRoutineTitles(draft.selectedRoutineTitles);
      setStep(draft.step);
    },
    [setLifeSceneAnalysis, setStep3AnalysisKey, setSelectedDailyTodo, setSelectedRoutineTitles]
  );

  // sessionStorage draft 관리
  const draftData = useMemo<OnboardingDraftData>(
    () => ({
      step,
      selectedLifeCategory,
      sceneCategory,
      selectedDemoScene,
      customSceneInput,
      lifeSceneAnalysis,
      selectedDailyTodo,
      selectedRoutineTitles,
      step3AnalysisKey,
    }),
    [
      step,
      selectedLifeCategory,
      sceneCategory,
      selectedDemoScene,
      customSceneInput,
      lifeSceneAnalysis,
      selectedDailyTodo,
      selectedRoutineTitles,
      step3AnalysisKey,
    ]
  );

  const { clearDraft } = useOnboardingDraft(sessionKey, initialStep, draftData, onRestore);

  // 제출 hook
  const { handleSubmit, isLoading } = useOnboardingSubmit({
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
    // PR 3 이후 시트는 항상 새 버킷 생성. "기존 버킷에 추가" 흐름은 폐기됨.
    selectedExistingBucket: null,
    onComplete,
    clearDraft,
    setError,
  });

  // MBTI 핸들러
  function handleAgeChange(value: string) {
    if (!value) { setAge(null); return; }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) { setAge(null); return; }
    setAge(Math.max(0, Math.min(100, parsed)));
  }

  function handleEnergySelect(value: "I" | "E") {
    setError(null);
    setEnergyType(value);
    if (senseType && judgmentType && lifestyleType) {
      setPersonalityType(`${value}${senseType}${judgmentType}${lifestyleType}` as PersonalityType);
    } else {
      setPersonalityType(null);
    }
  }

  function handleSenseSelect(value: "S" | "N") {
    setError(null);
    setSenseType(value);
    if (energyType && judgmentType && lifestyleType) {
      setPersonalityType(`${energyType}${value}${judgmentType}${lifestyleType}` as PersonalityType);
    } else {
      setPersonalityType(null);
    }
  }

  function handleJudgmentSelect(value: "T" | "F") {
    setError(null);
    setJudgmentType(value);
    if (energyType && senseType && lifestyleType) {
      setPersonalityType(`${energyType}${senseType}${value}${lifestyleType}` as PersonalityType);
    } else {
      setPersonalityType(null);
    }
  }

  function handleLifestyleSelect(value: "J" | "P") {
    setError(null);
    setLifestyleType(value);
    if (energyType && senseType && judgmentType) {
      setPersonalityType(`${energyType}${senseType}${judgmentType}${value}` as PersonalityType);
    } else {
      setPersonalityType(null);
    }
  }

  function handleLifeCategorySelect(key: LifeCategory) {
    const cat = LIFE_CATEGORIES.find((c) => c.key === key);
    if (!cat) return;
    setSelectedLifeCategory(key);
    setSceneCategory(cat.sceneCategoryKey);
    setSelectedDemoScene(null);
    setCustomSceneInput("");
    setShowGoalChat(false);
  }

  function handleSelectDemoScene(item: DemoSceneItem) {
    if (item.text.includes("직접 입력")) {
      setSelectedDemoScene(null);
      return;
    }
    setSelectedDemoScene(item);
    setCustomSceneInput("");
  }

  function handleNext() {
    setError(null);

    if (step === 1) {
      if (age === null || age < 0 || age > 100) { setError("나이를 입력해주세요."); return; }
      if (!gender) { setError("성별을 선택해주세요."); return; }
      if (!personalityType) { setError("MBTI 성향을 모두 선택해주세요."); return; }
      if (!paceType) { setError("생활 속도를 선택해주세요."); return; }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!selectedSceneText) { setError("장면을 하나 선택하거나 직접 입력해주세요."); return; }
      // 분석이 진행 중이면 새 호출을 막아 중복 호출 방지
      if (isAnalyzingLifeScene) return;
      resetAnalysisState();
      setStep(3);
      return;
    }

    if (step === 3) {
      if (!lifeSceneAnalysis) { setError("아직 분석이 완료되지 않았어요. 잠시만 기다려주세요."); return; }
      if (!selectedDailyTodo && selectedRoutineTitles.length === 0) {
        setError("데일리투두 또는 루틴을 최소 1개 선택해주세요.");
        return;
      }
      setStep(4);
    }
  }

  function handleBack() {
    setError(null);
    setStep((prev) => Math.max(1, prev - 1));
  }

  const stepIndicator = (
    <div className="mb-6 flex items-center gap-1.5">
      {[1, 2, 3, 4].map((s) => (
        <div
          key={s}
          className={cn(
            "h-1.5 rounded-full transition-all",
            s === step ? "w-6 bg-foreground" : "w-3 bg-foreground/20"
          )}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {stepIndicator}

      {step === 1 && isProfileStep && (
        <StepProfile
          age={age}
          gender={gender}
          energyType={energyType}
          senseType={senseType}
          judgmentType={judgmentType}
          lifestyleType={lifestyleType}
          personalityType={personalityType}
          paceType={paceType}
          lifeClock={lifeClock}
          error={error}
          onAgeChange={handleAgeChange}
          onGenderSelect={(v) => { setError(null); setGender(v); }}
          onEnergySelect={handleEnergySelect}
          onSenseSelect={handleSenseSelect}
          onJudgmentSelect={handleJudgmentSelect}
          onLifestyleSelect={handleLifestyleSelect}
          onPaceSelect={(v) => { setError(null); setPaceType(v); }}
          onNext={handleNext}
        />
      )}

      {step === 2 && (
        <StepScene
          age={age}
          gender={gender}
          personalityType={personalityType}
          lifeClock={lifeClock}
          selectedLifeCategory={selectedLifeCategory}
          sceneCategory={sceneCategory}
          selectedDemoScene={selectedDemoScene}
          customSceneInput={customSceneInput}
          showGoalChat={showGoalChat}
          selectedSceneText={selectedSceneText}
          isProfileStep={isProfileStep}
          error={error}
          isSubmitting={isAnalyzingLifeScene}
          onLifeCategorySelect={handleLifeCategorySelect}
          onDemoSceneSelect={handleSelectDemoScene}
          onCustomSceneChange={(v) => {
            setCustomSceneInput(v);
            if (v.trim().length > 0) setSelectedDemoScene(null);
          }}
          onToggleGoalChat={() => setShowGoalChat((prev) => !prev)}
          onCloseGoalChat={() => setShowGoalChat(false)}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}

      {step === 3 && (
        <StepAnalysis
          isAnalyzingLifeScene={isAnalyzingLifeScene}
          lifeSceneAnalysis={lifeSceneAnalysis}
          displayStrides={displayStrides}
          bucketTodos={bucketTodos}
          selectedDailyTodo={selectedDailyTodo}
          selectedRoutineTitles={selectedRoutineTitles}
          error={error}
          onSelectDailyTodo={(action) => { setSelectedDailyTodo(action); setError(null); }}
          onSelectRoutineTitle={(title) => { selectRoutineTitle(title); setError(null); }}
          onRetryAnalysis={() => void runLifeSceneAnalysis(true)}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}

      {step === 4 && (
        <StepConfirm
          selectedSceneText={selectedSceneText}
          lifeSceneAnalysis={lifeSceneAnalysis}
          selectedDailyTodo={selectedDailyTodo}
          selectedRoutineTitles={selectedRoutineTitles}
          error={error}
          isLoading={isLoading}
          onBack={handleBack}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
