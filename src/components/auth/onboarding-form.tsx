"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  DemoSceneItem,
  Gender,
  OnboardingSceneCategory,
  PersonalityType,
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
  } | null;
  // 바텀시트 모드 — 완료 시 호출되는 콜백 (없으면 페이지 redirect)
  onComplete?: () => void;
  // sessionStorage 보존 키 (대시보드 탐색 모드에서만 사용)
  sessionKey?: string;
}

// MBTI 문자열에서 축을 안전하게 읽는다. 2글자("IF")면 S/N·J/P는 아직 없는 것.
function readJudgment(mbti: string | undefined | null): "T" | "F" | null {
  if (!mbti) return null;
  return (mbti.length === 2 ? mbti[1] : mbti[2]) as "T" | "F";
}
function readSense(mbti: string | undefined | null): "S" | "N" | null {
  if (!mbti || mbti.length < 4) return null;
  return mbti[1] as "S" | "N";
}
function readLifestyle(mbti: string | undefined | null): "J" | "P" | null {
  if (!mbti || mbti.length < 4) return null;
  return mbti[3] as "J" | "P";
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
  // MBTI는 2글자("IF" — Step 1의 I/E·T/F만) 또는 4글자("INFP")다.
  // 4글자일 때만 S/N·J/P를 채운다 — 2글자에 인덱스로 접근하면 undefined가 섞인다.
  const [energyType, setEnergyType] = useState<"I" | "E" | null>(
    () => (prefillProfile?.personalityType?.[0] as "I" | "E" | undefined) ?? null
  );
  const [judgmentType, setJudgmentType] = useState<"T" | "F" | null>(
    () => readJudgment(prefillProfile?.personalityType)
  );
  // 아래 둘은 마지막 단계(StepConfirm)의 **선택** 입력 — 넣으면 4글자로 완성된다
  const [senseType, setSenseType] = useState<"S" | "N" | null>(
    () => readSense(prefillProfile?.personalityType)
  );
  const [lifestyleType, setLifestyleType] = useState<"J" | "P" | null>(
    () => readLifestyle(prefillProfile?.personalityType)
  );

  // Step 2 상태
  const [selectedLifeCategory, setSelectedLifeCategory] = useState<LifeCategory | null>(null);
  const [sceneCategory, setSceneCategory] = useState<OnboardingSceneCategory["key"]>("must_do");
  const [selectedDemoScene, setSelectedDemoScene] = useState<DemoSceneItem | null>(null);
  const [customSceneInput, setCustomSceneInput] = useState("");

  const isSceneFromCustomInput = customSceneInput.trim().length > 0;
  const selectedSceneText = isSceneFromCustomInput
    ? customSceneInput.trim()
    : selectedDemoScene?.text ?? "";

  // 두 축만 고르면 "IF", 마지막 단계에서 나머지를 채우면 "INFP"로 자란다.
  // 안 고른 축을 기본값으로 메우지 않는다 — AI에 사실처럼 전달되면 안 되므로.
  const personalityType = useMemo<PersonalityType | null>(() => {
    if (!energyType || !judgmentType) return null;
    return senseType && lifestyleType
      ? (`${energyType}${senseType}${judgmentType}${lifestyleType}` as PersonalityType)
      : (`${energyType}${judgmentType}` as PersonalityType);
  }, [energyType, judgmentType, senseType, lifestyleType]);

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
    setEnergyType(prefillProfile.personalityType[0] as "I" | "E");
    setJudgmentType(readJudgment(prefillProfile.personalityType));
    setSenseType(readSense(prefillProfile.personalityType));
    setLifestyleType(readLifestyle(prefillProfile.personalityType));
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
  }

  function handleJudgmentSelect(value: "T" | "F") {
    setError(null);
    setJudgmentType(value);
  }

  // Step 4의 선택 입력 — 넣으면 personalityType이 2글자에서 4글자로 자라난다
  function handleSenseSelect(value: "S" | "N") {
    setError(null);
    setSenseType(value);
  }

  function handleLifestyleSelect(value: "J" | "P") {
    setError(null);
    setLifestyleType(value);
  }

  function handleLifeCategorySelect(key: LifeCategory) {
    const cat = LIFE_CATEGORIES.find((c) => c.key === key);
    if (!cat) return;
    setSelectedLifeCategory(key);
    setSceneCategory(cat.sceneCategoryKey);
    setSelectedDemoScene(null);
    setCustomSceneInput("");
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
      if (!energyType || !judgmentType) { setError("MBTI 성향을 선택해주세요."); return; }
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
          judgmentType={judgmentType}
          personalityType={personalityType}
          lifeClock={lifeClock}
          error={error}
          onAgeChange={handleAgeChange}
          onGenderSelect={(v) => { setError(null); setGender(v); }}
          onEnergySelect={handleEnergySelect}
          onJudgmentSelect={handleJudgmentSelect}
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
          lifeClock={lifeClock}
          personalityType={personalityType}
          senseType={senseType}
          lifestyleType={lifestyleType}
          onSenseSelect={handleSenseSelect}
          onLifestyleSelect={handleLifestyleSelect}
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
