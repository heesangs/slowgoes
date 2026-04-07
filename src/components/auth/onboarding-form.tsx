"use client";

import { Button } from "@/components/ui/button";
import {
  addItemsToExistingBucketAction,
  analyzeLifeSceneAction,
  saveOnboardingV2Action,
} from "@/app/(auth)/actions";
import { demoAnalyzeLifeSceneAction } from "@/app/demo/actions";
import { saveDemoOnboardingData } from "@/lib/demo/storage";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getDemoScenes, getSceneCategoryOptions } from "@/lib/onboarding/demo-scenes";
import { useRouter } from "next/navigation";
import type {
  Bucket,
  DemoSceneItem,
  ExistingBucketContext,
  Gender,
  HorizonAction,
  LifeSceneAnalysisResult,
  OnboardingSceneCategory,
  PersonalityType,
  SuggestedRoutine,
} from "@/types";

const GENDER_OPTIONS = [
  { value: "male" as Gender, label: "남성" },
  { value: "female" as Gender, label: "여성" },
] as const;

const CLOCK_HAND_ROTATION_CLASSES = [
  "rotate-0",
  "rotate-[15deg]",
  "rotate-[30deg]",
  "rotate-[45deg]",
  "rotate-[60deg]",
  "rotate-[75deg]",
  "rotate-[90deg]",
  "rotate-[105deg]",
  "rotate-[120deg]",
  "rotate-[135deg]",
  "rotate-[150deg]",
  "rotate-[165deg]",
  "rotate-180",
  "rotate-[195deg]",
  "rotate-[210deg]",
  "rotate-[225deg]",
  "rotate-[240deg]",
  "rotate-[255deg]",
  "rotate-[270deg]",
  "rotate-[285deg]",
  "rotate-[300deg]",
  "rotate-[315deg]",
  "rotate-[330deg]",
  "rotate-[345deg]",
] as const;

interface OnboardingFormProps {
  mode?: "default" | "demo";
  startStep?: 1 | 2;
  prefillProfile?: {
    age: number;
    gender: Gender;
    personalityType: PersonalityType;
  } | null;
  // 바텀시트 모드: 기존 버킷 목록 + 완료 콜백
  existingBuckets?: Array<Pick<Bucket, "id" | "title" | "horizon" | "status" | "created_at">>;
  onComplete?: () => void; // redirect 대신 호출
}

function formatRoutineRepeat(routine: SuggestedRoutine) {
  if (routine.repeatUnit === "daily") {
    return routine.repeatValue <= 1
      ? "매일"
      : `${routine.repeatValue}일마다`;
  }

  return routine.repeatValue <= 1
    ? "매주"
    : `${routine.repeatValue}주마다`;
}

function getHorizonTone(level: HorizonAction["level"]) {
  if (level === "someday") return "border-foreground/10 bg-foreground/[0.02]";
  if (level === "this_year") return "border-foreground/15 bg-foreground/[0.04]";
  if (level === "this_season") return "border-foreground/20 bg-foreground/[0.07]";
  return "border-foreground/25 bg-foreground/[0.1]";
}

export function OnboardingForm({
  mode = "default",
  startStep,
  prefillProfile,
  existingBuckets,
  onComplete,
}: OnboardingFormProps) {
  const isDemo = mode === "demo";
  const router = useRouter();
  const initialStep = startStep === 2 ? 2 : 1;
  const hasBuckets = (existingBuckets?.length ?? 0) > 0;

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(initialStep);

  // 버킷 선택 관련 state
  const [showBucketSelect, setShowBucketSelect] = useState(hasBuckets);
  const [selectedExistingBucket, setSelectedExistingBucket] = useState<ExistingBucketContext | null>(null);

  const [age, setAge] = useState<number | null>(prefillProfile?.age ?? null);
  const [gender, setGender] = useState<Gender | null>(prefillProfile?.gender ?? null);
  const [energyType, setEnergyType] = useState<"I" | "E" | null>(
    prefillProfile?.personalityType?.[0] as "I" | "E" | undefined ?? null
  );
  const [senseType, setSenseType] = useState<"S" | "N" | null>(
    prefillProfile?.personalityType?.[1] as "S" | "N" | undefined ?? null
  );
  const [judgmentType, setJudgmentType] = useState<"T" | "F" | null>(
    prefillProfile?.personalityType?.[2] as "T" | "F" | undefined ?? null
  );
  const [lifestyleType, setLifestyleType] = useState<"J" | "P" | null>(
    prefillProfile?.personalityType?.[3] as "J" | "P" | undefined ?? null
  );
  const [personalityType, setPersonalityType] = useState<PersonalityType | null>(
    prefillProfile?.personalityType ?? null
  );
  const [displayName] = useState("slowgoes 사용자");

  const [sceneCategory, setSceneCategory] =
    useState<OnboardingSceneCategory["key"]>("must_do");
  const [selectedDemoScene, setSelectedDemoScene] = useState<DemoSceneItem | null>(null);
  const [customSceneInput, setCustomSceneInput] = useState("");

  const [lifeSceneAnalysis, setLifeSceneAnalysis] = useState<LifeSceneAnalysisResult | null>(null);
  const [selectedDailyTodo, setSelectedDailyTodo] = useState("");
  const [selectedRoutineTitles, setSelectedRoutineTitles] = useState<string[]>([]);
  const [step3AnalysisKey, setStep3AnalysisKey] = useState<string | null>(null);
  const [isAnalyzingLifeScene, setIsAnalyzingLifeScene] = useState(false);

  const isStep1Complete = age !== null && !!gender && !!personalityType;
  const isSceneFromCustomInput = customSceneInput.trim().length > 0;
  const selectedSceneText = isSceneFromCustomInput
    ? customSceneInput.trim()
    : selectedDemoScene?.text ?? "";

  const step3RequestKey =
    age !== null && gender && personalityType && selectedSceneText
      ? `${selectedSceneText}|${age}|${gender}|${personalityType}`
      : null;

  const orderedHorizons = useMemo(() => {
    if (!lifeSceneAnalysis) return [];

    return [
      ...lifeSceneAnalysis.horizons.filter((item) => item.level === "someday").slice(0, 1),
      ...lifeSceneAnalysis.horizons.filter((item) => item.level === "this_year").slice(0, 1),
      ...lifeSceneAnalysis.horizons.filter((item) => item.level === "this_season").slice(0, 1),
      ...lifeSceneAnalysis.horizons.filter((item) => item.level === "this_week"),
    ];
  }, [lifeSceneAnalysis]);

  const weeklyHorizons = useMemo(
    () => orderedHorizons.filter((item) => item.level === "this_week"),
    [orderedHorizons]
  );

  const selectedSeasonAction =
    lifeSceneAnalysis?.horizons.find((item) => item.level === "this_season")?.action ?? "";

  const lifeClock = (() => {
    if (age === null || age < 0 || age > 100) return null;
    const totalHours = (age / 100) * 24;
    const hour24 = Math.floor(totalHours);
    const minute = Math.floor((totalHours - hour24) * 60);
    const meridiem = hour24 < 12 ? "오전" : "오후";
    const hour12Raw = hour24 % 12;
    const hour12 = hour12Raw === 0 ? 12 : hour12Raw;
    const label = `${meridiem} ${hour12}:${String(minute).padStart(2, "0")}`;
    const handIndex = Math.max(
      0,
      Math.min(
        CLOCK_HAND_ROTATION_CLASSES.length - 1,
        Math.floor((hour24 / 24) * CLOCK_HAND_ROTATION_CLASSES.length)
      )
    );

    return { label, handClassName: CLOCK_HAND_ROTATION_CLASSES[handIndex] };
  })();

  useEffect(() => {
    if (!prefillProfile) return;
    setAge(prefillProfile.age);
    setGender(prefillProfile.gender);
    setPersonalityType(prefillProfile.personalityType);
    setEnergyType(prefillProfile.personalityType[0] as "I" | "E");
    setSenseType(prefillProfile.personalityType[1] as "S" | "N");
    setJudgmentType(prefillProfile.personalityType[2] as "T" | "F");
    setLifestyleType(prefillProfile.personalityType[3] as "J" | "P");
  }, [prefillProfile]);

  function resetStep3State() {
    setLifeSceneAnalysis(null);
    setSelectedDailyTodo("");
    setSelectedRoutineTitles([]);
    setStep3AnalysisKey(null);
  }

  function handleAgeChange(value: string) {
    if (!value) {
      setAge(null);
      return;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      setAge(null);
      return;
    }

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

  function handleSceneCategoryChange(nextCategory: OnboardingSceneCategory["key"]) {
    setSceneCategory(nextCategory);
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

  function toggleRoutineTitle(title: string) {
    setSelectedRoutineTitles((prev) =>
      prev.includes(title) ? prev.filter((item) => item !== title) : [...prev, title]
    );
  }

  const runLifeSceneAnalysis = useCallback(
    async (force = false) => {
      if (!step3RequestKey || age === null || !gender || !personalityType) {
        return;
      }
      if (!force && step3AnalysisKey === step3RequestKey && lifeSceneAnalysis) {
        return;
      }

      setIsAnalyzingLifeScene(true);
      setError(null);
      if (force) {
        setLifeSceneAnalysis(null);
        setSelectedDailyTodo("");
        setSelectedRoutineTitles([]);
      }

      const result = await (isDemo
        ? demoAnalyzeLifeSceneAction({
            sceneText: selectedSceneText,
            age,
            gender,
            personalityType,
          })
        : analyzeLifeSceneAction({
            sceneText: selectedSceneText,
            age,
            gender,
            personalityType,
          }));

      if (!result.success || !result.data) {
        setError(result.error ?? "삶의 장면 분석 중 오류가 발생했습니다.");
        setIsAnalyzingLifeScene(false);
        return;
      }

      const analysis = result.data;
      const weeklyActions = analysis.horizons
        .filter((item) => item.level === "this_week")
        .map((item) => item.action);

      setLifeSceneAnalysis(analysis);
      setStep3AnalysisKey(step3RequestKey);
      setSelectedDailyTodo((prev) => {
        if (prev && weeklyActions.includes(prev)) return prev;
        return weeklyActions[0] ?? "";
      });
      setSelectedRoutineTitles((prev) => {
        const available = analysis.suggestedRoutines.map((item) => item.title);
        const filteredPrev = prev.filter((item) => available.includes(item));
        if (filteredPrev.length > 0) return filteredPrev;
        return available.slice(0, 1);
      });
      setIsAnalyzingLifeScene(false);
    },
    [
      age,
      gender,
      isDemo,
      lifeSceneAnalysis,
      personalityType,
      selectedSceneText,
      step3AnalysisKey,
      step3RequestKey,
    ]
  );

  useEffect(() => {
    if (step !== 3) return;
    if (!step3RequestKey) return;
    void runLifeSceneAnalysis(false);
  }, [step, step3RequestKey, runLifeSceneAnalysis]);

  function handleNext() {
    setError(null);

    if (step === 1) {
      if (age === null || age < 0 || age > 100) {
        setError("나이를 입력해주세요.");
        return;
      }
      if (!gender) {
        setError("성별을 선택해주세요.");
        return;
      }
      if (!personalityType) {
        setError("성향을 선택해주세요.");
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!selectedSceneText) {
        setError("삶의 장면을 하나 선택하거나 직접 입력해주세요.");
        return;
      }
      resetStep3State();
      setStep(3);
      return;
    }

    if (step === 3) {
      if (!lifeSceneAnalysis) {
        setError("아직 분석이 완료되지 않았어요. 잠시만 기다려주세요.");
        return;
      }
      if (!selectedDailyTodo && selectedRoutineTitles.length === 0) {
        setError("데일리투두 또는 루틴을 최소 1개 선택해주세요.");
        return;
      }
      setStep(4);
    }
  }

  function handleBack() {
    setError(null);

    // 바텀시트 모드: Step 2 또는 Step 3에서 뒤로가면 버킷 선택 화면으로
    if (hasBuckets) {
      if (step === 3 && selectedExistingBucket) {
        // 기존 버킷 → Step 3에서 뒤로: 버킷 선택 화면으로
        setSelectedExistingBucket(null);
        setShowBucketSelect(true);
        return;
      }
      if (step === 2) {
        // Step 2에서 뒤로: 버킷 선택 화면으로
        setShowBucketSelect(true);
        return;
      }
    }

    setStep((prev) => Math.max(1, prev - 1));
  }

  async function handleSubmit() {
    setError(null);

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

    try {
      if (isDemo) {
        saveDemoOnboardingData({
          displayName: displayName.trim(),
          sceneText: selectedSceneText,
          lifeArea: lifeSceneAnalysis.lifeArea,
          age,
          gender,
          personalityType,
          chapterTitle: selectedSeasonAction || `${selectedSceneText} 이번 시즌 실행`,
          horizonAnalysis: lifeSceneAnalysis,
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
          horizonAnalysis: lifeSceneAnalysis,
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

      // 새 버킷 생성 (기존 플로우)
      const result = await saveOnboardingV2Action({
        displayName: displayName.trim(),
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
        paceType: "balanced",
        chapterTitle: selectedSeasonAction || `${selectedSceneText} 이번 시즌 실행`,
        horizonAnalysis: lifeSceneAnalysis,
        selectedDailyTodos,
        selectedRoutines,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      // 바텀시트 모드: redirect 대신 콜백
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

  // 버킷 선택 화면에서 기존 버킷 클릭
  function handleSelectExistingBucket(bucket: Pick<Bucket, "id" | "title">) {
    setError(null);
    const context: ExistingBucketContext = {
      bucketId: bucket.id,
      bucketTitle: bucket.title,
    };
    setSelectedExistingBucket(context);
    setShowBucketSelect(false);

    // bucket.title이 sceneText 역할 → Step 3으로 바로 이동
    // selectedSceneText를 설정하기 위해 customSceneInput 사용
    setCustomSceneInput(bucket.title);
    setSelectedDemoScene(null);
    resetStep3State();
    setStep(3);
  }

  // 버킷 선택 화면에서 "새 장면 탐색하기" 클릭
  function handleNewBucketFromSelect() {
    setError(null);
    setSelectedExistingBucket(null);
    setShowBucketSelect(false);
    setCustomSceneInput("");
    setSelectedDemoScene(null);
    setStep(2);
  }

  return (
    <div className="flex flex-col gap-6">
      {!showBucketSelect && stepIndicator}

      {/* 버킷 선택 화면 — 기존 버킷이 있는 경우에만 표시 */}
      {showBucketSelect && existingBuckets && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="mb-1 text-lg font-semibold">어떤 버킷에 추가할까요?</h2>
            <p className="text-sm text-foreground/60">기존 버킷에 행동을 추가하거나, 새로운 장면을 탐색해보세요</p>
          </div>

          <div className="flex flex-col gap-2">
            {existingBuckets.map((bucket) => (
              <button
                key={bucket.id}
                type="button"
                onClick={() => handleSelectExistingBucket(bucket)}
                className="w-full rounded-xl border border-foreground/15 bg-foreground/[0.02] px-4 py-4 text-left transition-colors hover:bg-foreground/[0.06]"
              >
                <p className="text-sm font-medium">{bucket.title}</p>
                <p className="mt-1 text-xs text-foreground/55">
                  {bucket.status === "in_progress" ? "진행 중" : bucket.status === "completed" ? "완료" : "시작 전"}
                </p>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleNewBucketFromSelect}
            className="w-full rounded-xl border border-dashed border-foreground/25 px-4 py-4 text-center text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/[0.04]"
          >
            ✨ 새로운 장면 탐색하기
          </button>
        </div>
      )}

      {!showBucketSelect && step === 1 && (
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-foreground/15 bg-foreground/[0.03] p-5">
            <p className="mb-4 text-sm text-foreground/60">당신의 시간을 알려주세요</p>

            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 rounded-full border-2 border-foreground/20 bg-background">
                <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/60" />
                <div
                  className={cn(
                    "absolute left-1/2 top-1/2 h-8 w-0.5 -translate-x-1/2 -translate-y-[95%] origin-bottom rounded-full bg-foreground transition-transform duration-300",
                    lifeClock?.handClassName ?? "rotate-0"
                  )}
                />
              </div>

              <div className="min-h-[48px]">
                {lifeClock ? (
                  <p className="text-base font-semibold">당신의 인생 시계는 {lifeClock.label}이에요.</p>
                ) : (
                  <p className="text-sm text-foreground/50">나이를 입력하면 인생시계가 시작돼요.</p>
                )}
                {personalityType && (
                  <p className="mt-1 text-xs text-foreground/50">현재 성향: {personalityType}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="life_clock_age" className="text-sm font-medium text-foreground/70">
                나이
              </label>
              <input
                id="life_clock_age"
                inputMode="numeric"
                type="number"
                min={0}
                max={100}
                placeholder="예: 27"
                value={age ?? ""}
                onChange={(e) => handleAgeChange(e.target.value)}
                autoFocus
                className="min-h-[44px] w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-3 text-base placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground/70">성별</p>
              <div className="grid grid-cols-2 gap-2">
                {GENDER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => { setError(null); setGender(option.value); }}
                    className={cn(
                      "min-h-[44px] cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                      gender === option.value
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground/20 hover:bg-foreground/5"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground/70">에너지 방향</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleEnergySelect("I")}
                  className={cn(
                    "min-h-[44px] cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    energyType === "I"
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 hover:bg-foreground/5"
                  )}
                >
                  혼자가 편한 (I)
                </button>
                <button
                  type="button"
                  onClick={() => handleEnergySelect("E")}
                  className={cn(
                    "min-h-[44px] cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    energyType === "E"
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 hover:bg-foreground/5"
                  )}
                >
                  사람과 함께가 좋은 (E)
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground/70">정보 수집 방식</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSenseSelect("S")}
                  className={cn(
                    "min-h-[44px] cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    senseType === "S"
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 hover:bg-foreground/5"
                  )}
                >
                  현실과 경험 중심 (S)
                </button>
                <button
                  type="button"
                  onClick={() => handleSenseSelect("N")}
                  className={cn(
                    "min-h-[44px] cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    senseType === "N"
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 hover:bg-foreground/5"
                  )}
                >
                  직관과 가능성 중심 (N)
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground/70">판단 방식</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleJudgmentSelect("T")}
                  className={cn(
                    "min-h-[44px] cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    judgmentType === "T"
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 hover:bg-foreground/5"
                  )}
                >
                  논리적으로 따지는 (T)
                </button>
                <button
                  type="button"
                  onClick={() => handleJudgmentSelect("F")}
                  className={cn(
                    "min-h-[44px] cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    judgmentType === "F"
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 hover:bg-foreground/5"
                  )}
                >
                  감정과 공감 중심 (F)
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground/70">생활 방식</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleLifestyleSelect("J")}
                  className={cn(
                    "min-h-[44px] cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    lifestyleType === "J"
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 hover:bg-foreground/5"
                  )}
                >
                  계획적으로 정리하는 (J)
                </button>
                <button
                  type="button"
                  onClick={() => handleLifestyleSelect("P")}
                  className={cn(
                    "min-h-[44px] cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    lifestyleType === "P"
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 hover:bg-foreground/5"
                  )}
                >
                  유연하게 흐르는 (P)
                </button>
              </div>
            </div>
          </div>

          {isStep1Complete && (
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
              <p className="text-sm text-foreground/70">지금은 탐색의 시간이에요.</p>
              <p className="text-sm text-foreground/70">앞으로 어떤 장면을 그리며 살고 싶은지, 같이 찾아볼까요?</p>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="button" onClick={handleNext} className="w-full">
            시작하기
          </Button>
        </div>
      )}

      {!showBucketSelect && step === 2 && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
            <p className="text-sm text-foreground/60">인생시계</p>
            <p className="text-base font-semibold">
              {lifeClock ? `당신의 인생 시계는 ${lifeClock.label}이에요.` : "당신의 시간을 알려주세요"}
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-lg font-semibold">어떤 것을 만들고, 그리고 살고 싶나요?</h2>
            <p className="text-sm text-foreground/60">삶의 장면을 하나 골라볼게요</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="scene_category" className="text-sm font-medium text-foreground/70">
              카테고리
            </label>
            <select
              id="scene_category"
              value={sceneCategory}
              onChange={(e) =>
                handleSceneCategoryChange(e.target.value as OnboardingSceneCategory["key"])
              }
              className="min-h-[44px] w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-foreground/20"
            >
              {getSceneCategoryOptions().map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            {gender && personalityType && age !== null ? (
              getDemoScenes({
                category: sceneCategory,
                age,
                gender,
                personalityType,
              }).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectDemoScene(item)}
                  className={cn(
                    "min-h-[44px] cursor-pointer rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
                    selectedDemoScene?.id === item.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 hover:bg-foreground/5"
                  )}
                >
                  {item.text}
                </button>
              ))
            ) : (
              <p className="text-sm text-foreground/60">Step 1 정보를 먼저 입력해주세요.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="custom_scene" className="text-sm font-medium text-foreground/70">
              직접 입력 ✏️
            </label>
            <textarea
              id="custom_scene"
              value={customSceneInput}
              onChange={(e) => {
                setCustomSceneInput(e.target.value);
                if (e.target.value.trim().length > 0) {
                  setSelectedDemoScene(null);
                }
              }}
              placeholder="예: 부모님과 여행 가기"
              rows={3}
              className="min-h-[88px] w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-3 text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          {selectedSceneText && (
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
              <p className="mb-1 text-xs text-foreground/50">선택한 삶의 장면</p>
              <p className="text-sm font-medium">{selectedSceneText}</p>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={handleBack} className="flex-1">
              이전
            </Button>
            <Button type="button" onClick={handleNext} className="flex-1">
              다음
            </Button>
          </div>
        </div>
      )}

      {!showBucketSelect && step === 3 && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="mb-1 text-lg font-semibold">삶의 장면을 시간으로 정리하고 있어요</h2>
            <p className="text-sm text-foreground/60">이번 주 데일리투두와 루틴을 선택해볼게요</p>
          </div>

          {isAnalyzingLifeScene && (
            <div className="flex animate-pulse flex-col gap-3">
              <div className="h-8 w-24 rounded-full bg-foreground/10" />
              <div className="h-5 w-2/3 rounded bg-foreground/10" />
              <div className="h-20 rounded-xl border border-foreground/10 bg-foreground/[0.03]" />
              <div className="h-20 rounded-xl border border-foreground/10 bg-foreground/[0.05]" />
              <div className="h-20 rounded-xl border border-foreground/10 bg-foreground/[0.08]" />
            </div>
          )}

          {!isAnalyzingLifeScene && lifeSceneAnalysis && (
            <>
              <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-4">
                <span className="inline-flex rounded-full border border-foreground/20 px-3 py-1 text-xs font-medium">
                  {lifeSceneAnalysis.lifeArea}
                </span>
                <p className="mt-3 text-sm text-foreground/70">{lifeSceneAnalysis.empathyMessage}</p>
              </div>

              <div className="flex flex-col gap-3">
                {orderedHorizons.map((item, index) => {
                  const isWeekly = item.level === "this_week";
                  const isSelected = selectedDailyTodo === item.action;
                  return (
                    <button
                      key={`${item.level}-${index}-${item.action}`}
                      type="button"
                      onClick={() => {
                        if (!isWeekly) return;
                        setSelectedDailyTodo(item.action);
                        setError(null);
                      }}
                      className={cn(
                        "w-full rounded-xl border px-4 py-4 text-left transition-colors",
                        getHorizonTone(item.level),
                        isWeekly ? "cursor-pointer" : "cursor-default",
                        isSelected && "border-foreground bg-foreground text-background",
                        isWeekly && !isSelected && "hover:bg-foreground/[0.14]"
                      )}
                    >
                      <p
                        className={cn(
                          "mb-1 text-xs font-medium",
                          isSelected ? "text-background/80" : "text-foreground/60"
                        )}
                      >
                        {item.label}
                      </p>
                      <p className="text-sm font-medium">{item.action}</p>
                    </button>
                  );
                })}
              </div>

              {weeklyHorizons.length > 0 && (
                <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
                  <p className="text-sm text-foreground/70">데일리투두는 이번 주 항목 중 1개를 선택하면 됩니다.</p>
                </div>
              )}

              <section className="flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-semibold">버킷을 위한 루틴</h3>
                  <p className="text-xs text-foreground/60">AI가 제안한 루틴에서 필요한 항목을 선택하세요.</p>
                </div>
                <div className="flex flex-col gap-2">
                  {lifeSceneAnalysis.suggestedRoutines.map((routine) => {
                    const selected = selectedRoutineTitles.includes(routine.title);
                    return (
                      <button
                        key={routine.title}
                        type="button"
                        onClick={() => {
                          toggleRoutineTitle(routine.title);
                          setError(null);
                        }}
                        className={cn(
                          "w-full rounded-lg border px-4 py-3 text-left transition-colors",
                          selected
                            ? "border-foreground bg-foreground text-background"
                            : "border-foreground/15 hover:bg-foreground/[0.04]"
                        )}
                      >
                        <p className="text-sm font-medium">{routine.title}</p>
                        <p
                          className={cn(
                            "mt-1 text-xs",
                            selected ? "text-background/80" : "text-foreground/60"
                          )}
                        >
                          반복: {formatRoutineRepeat(routine)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {!isAnalyzingLifeScene && !lifeSceneAnalysis && error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
              <p className="text-sm text-red-500">{error}</p>
              <Button
                type="button"
                variant="secondary"
                className="mt-3 w-full"
                onClick={() => {
                  void runLifeSceneAnalysis(true);
                }}
              >
                다시 시도
              </Button>
            </div>
          )}

          {error && lifeSceneAnalysis && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={handleBack} className="flex-1">
              이전
            </Button>
            <Button
              type="button"
              onClick={handleNext}
              className="flex-1"
              disabled={
                isAnalyzingLifeScene ||
                (!selectedDailyTodo && selectedRoutineTitles.length === 0)
              }
            >
              다음
            </Button>
          </div>
        </div>
      )}

      {!showBucketSelect && step === 4 && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="mb-1 text-lg font-semibold">선택한 한 걸음</h2>
            <p className="text-sm text-foreground/60">확정하면 대시보드에 오늘의 한 걸음으로 연결돼요</p>
          </div>

          <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-4">
            <p className="mb-1 text-xs text-foreground/50">삶의 장면</p>
            <p className="text-sm font-medium">{selectedSceneText}</p>
            {lifeSceneAnalysis?.lifeArea && (
              <p className="mt-1 text-xs text-foreground/50">영역: {lifeSceneAnalysis.lifeArea}</p>
            )}
          </div>

          <div className="rounded-xl border border-foreground/10 px-4 py-4">
            <p className="text-xs text-foreground/50">데일리투두</p>
            {selectedDailyTodo ? (
              <p className="mt-1 text-sm font-medium">{selectedDailyTodo}</p>
            ) : (
              <p className="mt-1 text-sm text-foreground/60">선택하지 않았어요.</p>
            )}
          </div>

          <div className="rounded-xl border border-foreground/10 px-4 py-4">
            <p className="text-xs text-foreground/50">루틴</p>
            {selectedRoutineTitles.length > 0 ? (
              <div className="mt-2 flex flex-col gap-2">
                {lifeSceneAnalysis?.suggestedRoutines
                  .filter((item) => selectedRoutineTitles.includes(item.title))
                  .map((routine) => (
                    <div key={routine.title} className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3">
                      <p className="text-sm font-medium">{routine.title}</p>
                      <p className="mt-1 text-xs text-foreground/60">반복: {formatRoutineRepeat(routine)}</p>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-foreground/60">선택하지 않았어요.</p>
            )}
          </div>

          {error && <p className="text-center text-sm text-red-500">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={handleBack} className="flex-1">
              이전
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              isLoading={isLoading}
              className="flex-1"
              disabled={isLoading}
            >
              확정하기
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
