"use client";

import { Button } from "@/components/ui/button";
import { SegmentControl } from "@/components/ui/segment-control";
import {
  addItemsToExistingBucketAction,
  analyzeLifeSceneAction,
  saveOnboardingV2Action,
} from "@/app/(auth)/actions";
import { demoAnalyzeLifeSceneAction } from "@/app/demo/actions";
import { saveDemoOnboardingData } from "@/lib/demo/storage";
import { cn } from "@/lib/utils";
import { partitionStrides, STRIDE_ORDER } from "@/lib/ai/analyze";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDemoScenes, getSceneCategoryOptions } from "@/lib/onboarding/demo-scenes";
import { useRouter } from "next/navigation";
import type {
  Bucket,
  DemoSceneItem,
  ExistingBucketContext,
  Gender,
  PaceType,
  SelfLevel,
  StrideLevel,
  LifeSceneAnalysisResult,
  OnboardingSceneCategory,
  PersonalityType,
  SuggestedRoutine,
} from "@/types";

const DRAFT_VERSION = "v1";


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

// MBTI 축별 세그먼트 옵션
const MBTI_ENERGY_OPTIONS = [
  { value: "I" as const, label: "I" },
  { value: "E" as const, label: "E" },
];
const MBTI_SENSE_OPTIONS = [
  { value: "S" as const, label: "S" },
  { value: "N" as const, label: "N" },
];
const MBTI_JUDGMENT_OPTIONS = [
  { value: "T" as const, label: "T" },
  { value: "F" as const, label: "F" },
];
const MBTI_LIFESTYLE_OPTIONS = [
  { value: "J" as const, label: "J" },
  { value: "P" as const, label: "P" },
];

// 생활 속도 세그먼트 옵션
const PACE_OPTIONS = [
  { value: "slow" as PaceType, label: "느긋" },
  { value: "balanced" as PaceType, label: "보통" },
  { value: "focused" as PaceType, label: "빠른편" },
];

// Step 2 라이프 카테고리 카드
const LIFE_CATEGORIES = [
  {
    key: "experience" as const,
    icon: "🎨",
    label: "경험",
    desc: "꼭 한번 해보고 싶은것",
    sceneCategoryKey: "must_do" as OnboardingSceneCategory["key"],
  },
  {
    key: "growth" as const,
    icon: "💪",
    label: "성장",
    desc: "조금씩 완성되는 나",
    sceneCategoryKey: "life_scene" as OnboardingSceneCategory["key"],
  },
  {
    key: "possession" as const,
    icon: "💰",
    label: "소유",
    desc: "꼭 갖고 싶은것",
    sceneCategoryKey: "must_do" as OnboardingSceneCategory["key"],
  },
  {
    key: "relationship" as const,
    icon: "👨‍👩‍👧‍👦",
    label: "관계",
    desc: "소중한 사람과의 시간",
    sceneCategoryKey: "dont_miss" as OnboardingSceneCategory["key"],
  },
] as const;

type LifeCategory = (typeof LIFE_CATEGORIES)[number]["key"];

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
  // 바텀시트 모드: 기존 버킷 목록 + 완료 콜백
  existingBuckets?: Array<Pick<Bucket, "id" | "title" | "stride_scope" | "status" | "created_at">>;
  onComplete?: () => void;
  // sessionStorage 보존 키 (대시보드 탐색 모드에서만 사용)
  sessionKey?: string;
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

// 길수록 진하게 — someday가 가장 진한 톤
function getStrideTone(level: StrideLevel) {
  const idx = STRIDE_ORDER.indexOf(level);
  // 0~7 index를 5개 tone에 매핑 (높은 index = 긴 단계 = 진하게)
  if (idx >= 7) return "border-foreground/30 bg-foreground/[0.12]"; // someday
  if (idx >= 5) return "border-foreground/25 bg-foreground/[0.1]";
  if (idx >= 3) return "border-foreground/20 bg-foreground/[0.07]";
  if (idx >= 1) return "border-foreground/15 bg-foreground/[0.04]";
  return "border-foreground/10 bg-foreground/[0.02]";
}

export function OnboardingForm({
  mode = "default",
  startStep,
  prefillProfile,
  existingBuckets,
  onComplete,
  sessionKey,
}: OnboardingFormProps) {
  const isDemo = mode === "demo";
  const router = useRouter();
  const initialStep = startStep === 2 ? 2 : 1;
  const hasBuckets = (existingBuckets?.length ?? 0) > 0;
  const isProfileStep = initialStep === 1; // Step 1(프로필)을 보여주는 모드

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
  const [paceType, setPaceType] = useState<PaceType | null>(prefillProfile?.paceType ?? null);
  const [displayName] = useState("slowgoes 사용자");

  const [selectedLifeCategory, setSelectedLifeCategory] = useState<LifeCategory | null>(null);
  const [sceneCategory, setSceneCategory] =
    useState<OnboardingSceneCategory["key"]>("must_do");
  const [selectedDemoScene, setSelectedDemoScene] = useState<DemoSceneItem | null>(null);
  const [customSceneInput, setCustomSceneInput] = useState("");
  const [showGoalChat, setShowGoalChat] = useState(false);

  const [lifeSceneAnalysis, setLifeSceneAnalysis] = useState<LifeSceneAnalysisResult | null>(null);
  const [selectedDailyTodo, setSelectedDailyTodo] = useState("");
  const [selectedRoutineTitles, setSelectedRoutineTitles] = useState<string[]>([]);
  const [step3AnalysisKey, setStep3AnalysisKey] = useState<string | null>(null);
  const [isAnalyzingLifeScene, setIsAnalyzingLifeScene] = useState(false);

  // sessionStorage draft 복원 — 마운트 시 1회만 실행
  const sessionKeyRef = useRef(sessionKey);
  useEffect(() => {
    const key = sessionKeyRef.current;
    if (!key || typeof window === "undefined") return;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as Record<string, unknown>;
      if (draft._v !== DRAFT_VERSION) return;
      if (draft.selectedLifeCategory) setSelectedLifeCategory(draft.selectedLifeCategory as LifeCategory);
      if (draft.sceneCategory) setSceneCategory(draft.sceneCategory as OnboardingSceneCategory["key"]);
      if (draft.selectedDemoScene) setSelectedDemoScene(draft.selectedDemoScene as DemoSceneItem);
      if (draft.customSceneInput) setCustomSceneInput(draft.customSceneInput as string);
      if (draft.lifeSceneAnalysis) {
        setLifeSceneAnalysis(draft.lifeSceneAnalysis as LifeSceneAnalysisResult);
        setStep3AnalysisKey((draft.step3AnalysisKey as string) ?? null);
      }
      if (draft.selectedDailyTodo) setSelectedDailyTodo(draft.selectedDailyTodo as string);
      if (draft.selectedRoutineTitles) setSelectedRoutineTitles(draft.selectedRoutineTitles as string[]);
      const draftStep = draft.step as number | undefined;
      if (draftStep && draftStep >= initialStep) setStep(draftStep);
    } catch {
      // 손상된 draft 무시
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 1회만

  // sessionStorage draft 저장
  useEffect(() => {
    if (!sessionKey || typeof window === "undefined") return;
    const draft = {
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
    };
    sessionStorage.setItem(sessionKey, JSON.stringify(draft));
  }, [sessionKey, step, selectedLifeCategory, sceneCategory, selectedDemoScene, customSceneInput, lifeSceneAnalysis, selectedDailyTodo, selectedRoutineTitles, step3AnalysisKey]);

  const isSceneFromCustomInput = customSceneInput.trim().length > 0;
  const selectedSceneText = isSceneFromCustomInput
    ? customSceneInput.trim()
    : selectedDemoScene?.text ?? "";

  const step3RequestKey =
    age !== null && gender && personalityType && selectedSceneText
      ? `${selectedSceneText}|${age}|${gender}|${personalityType}`
      : null;

  // 발걸음(this_month 이상)과 버킷 투두(today/this_week)를 분리
  const { displayStrides, bucketTodos } = useMemo(() => {
    if (!lifeSceneAnalysis) return { displayStrides: [], bucketTodos: [] };
    return partitionStrides(lifeSceneAnalysis.strides);
  }, [lifeSceneAnalysis]);

  // 시즌 액션(있으면) — 챕터 제목 fallback 용
  const selectedSeasonAction =
    lifeSceneAnalysis?.strides.find((item) => item.level === "this_season")?.action ?? "";

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
    if (prefillProfile.paceType) setPaceType(prefillProfile.paceType);
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

  // 루틴 라디오 선택 (1개만)
  function selectRoutineTitle(title: string) {
    setSelectedRoutineTitles([title]);
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
      // 버킷 투두(today/this_week) 중 첫 번째를 기본 데일리투두로 선택
      const { bucketTodos: todos } = partitionStrides(analysis.strides);
      const firstTodoAction = todos[0]?.action ?? "";

      setLifeSceneAnalysis(analysis);
      setStep3AnalysisKey(step3RequestKey);
      setSelectedDailyTodo((prev) => {
        if (prev && prev === firstTodoAction) return prev;
        return firstTodoAction;
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
        setError("MBTI 성향을 모두 선택해주세요.");
        return;
      }
      if (!paceType) {
        setError("생활 속도를 선택해주세요.");
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

    if (hasBuckets) {
      if (step === 3 && selectedExistingBucket) {
        setSelectedExistingBucket(null);
        setShowBucketSelect(true);
        return;
      }
      if (step === 2) {
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

    // sessionStorage 정리
    if (sessionKey && typeof window !== "undefined") {
      sessionStorage.removeItem(sessionKey);
    }

    try {
      if (isDemo) {
        saveDemoOnboardingData({
          displayName: displayName.trim(),
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

  function handleSelectExistingBucket(bucket: Pick<Bucket, "id" | "title">) {
    setError(null);
    const context: ExistingBucketContext = {
      bucketId: bucket.id,
      bucketTitle: bucket.title,
    };
    setSelectedExistingBucket(context);
    setShowBucketSelect(false);
    setCustomSceneInput(bucket.title);
    setSelectedDemoScene(null);
    resetStep3State();
    setStep(3);
  }

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

      {/* Step 1 — 나이·성별·MBTI·생활속도 */}
      {!showBucketSelect && step === 1 && isProfileStep && (
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
            {/* 나이 */}
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

            {/* 성별 */}
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

            {/* MBTI — 4축 세그먼트 컨트롤 */}
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-foreground/70">MBTI 성향</p>

              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-foreground/50">에너지 방향</p>
                  <SegmentControl
                    options={MBTI_ENERGY_OPTIONS}
                    value={energyType}
                    onChange={handleEnergySelect}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <p className="text-xs text-foreground/50">정보 수집 방식</p>
                  <SegmentControl
                    options={MBTI_SENSE_OPTIONS}
                    value={senseType}
                    onChange={handleSenseSelect}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <p className="text-xs text-foreground/50">판단 방식</p>
                  <SegmentControl
                    options={MBTI_JUDGMENT_OPTIONS}
                    value={judgmentType}
                    onChange={handleJudgmentSelect}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <p className="text-xs text-foreground/50">생활 방식</p>
                  <SegmentControl
                    options={MBTI_LIFESTYLE_OPTIONS}
                    value={lifestyleType}
                    onChange={handleLifestyleSelect}
                  />
                </div>
              </div>
            </div>

            {/* 생활 속도 — 세그먼트 컨트롤 */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground/70">생활 속도</p>
              <SegmentControl
                options={PACE_OPTIONS}
                value={paceType}
                onChange={(v) => { setError(null); setPaceType(v); }}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="button" onClick={handleNext} className="w-full">
            시작하기
          </Button>
        </div>
      )}

      {/* Step 2 — 삶의 장면 선택 */}
      {!showBucketSelect && step === 2 && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
            <p className="text-sm text-foreground/60">인생시계</p>
            <p className="text-base font-semibold">
              {lifeClock ? `당신의 인생 시계는 ${lifeClock.label}이에요.` : "당신의 시간을 알려주세요"}
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-lg font-semibold">내가 원하는게 뭘까요?</h2>
          </div>

          {/* 카테고리 4개 카드 — 2×2 그리드 */}
          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground/60">
              하나만 선택할 수 있어요. 마음이 1%라도 더 기우는 쪽으로!
            </p>
            <div className="grid grid-cols-2 gap-2">
              {LIFE_CATEGORIES.map((cat) => {
                const isSelected = selectedLifeCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => handleLifeCategorySelect(cat.key)}
                    className={cn(
                      "flex flex-col items-start rounded-xl border px-4 py-4 text-left transition-colors",
                      isSelected
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground/15 hover:bg-foreground/[0.04]"
                    )}
                  >
                    <span className="text-2xl">{cat.icon}</span>
                    <p className="mt-2 text-sm font-semibold">{cat.label}</p>
                    <p
                      className={cn(
                        "mt-0.5 text-xs",
                        isSelected ? "text-background/80" : "text-foreground/60"
                      )}
                    >
                      {cat.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 선택된 카테고리에 맞는 추천 장면 */}
          {selectedLifeCategory && gender && personalityType && age !== null && (
            <div className="flex flex-col gap-2">
              {getDemoScenes({
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
              ))}
            </div>
          )}

          {/* 직접 입력 */}
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

          {/* 목표를 이룬 나와 대화해보기 */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowGoalChat((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-foreground/10 px-4 py-3 text-left text-sm transition-colors hover:bg-foreground/[0.04]"
            >
              <span>💬 목표를 이룬 나와 대화해보기</span>
              <span className="text-foreground/60">→</span>
            </button>
            {showGoalChat && (
              <div className="rounded-xl border border-foreground/15 bg-foreground/[0.03] px-4 py-4">
                <p className="text-sm text-foreground/60">
                  이 기능은 곧 출시될 예정이에요. 목표를 이룬 미래의 나와 대화하며 방향을 찾아볼 수 있어요.
                </p>
                <button
                  type="button"
                  onClick={() => setShowGoalChat(false)}
                  className="mt-2 text-xs text-foreground/50 underline"
                >
                  닫기
                </button>
              </div>
            )}
          </div>

          {selectedSceneText && (
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
              <p className="mb-1 text-xs text-foreground/50">선택한 삶의 장면</p>
              <p className="text-sm font-medium">{selectedSceneText}</p>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            {isProfileStep && (
              <Button type="button" variant="secondary" onClick={handleBack} className="flex-1">
                이전
              </Button>
            )}
            <Button type="button" onClick={handleNext} className="flex-1">
              다음
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 — AI 분석 결과 */}
      {!showBucketSelect && step === 3 && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="mb-1 text-lg font-semibold">삶의 장면을 시간으로 정리하고 있어요</h2>
            <p className="text-sm text-foreground/60">나의 발걸음과 투두, 루틴을 확인해보세요</p>
          </div>

          {isAnalyzingLifeScene && (
            <div className="flex animate-pulse flex-col gap-3">
              <div className="h-8 w-24 rounded-full bg-foreground/10" />
              <div className="h-5 w-2/3 rounded bg-foreground/10" />
              <div className="h-20 rounded-xl border border-foreground/10 bg-foreground/[0.12]" />
              <div className="h-20 rounded-xl border border-foreground/10 bg-foreground/[0.07]" />
              <div className="h-20 rounded-xl border border-foreground/10 bg-foreground/[0.03]" />
            </div>
          )}

          {!isAnalyzingLifeScene && lifeSceneAnalysis && (
            <>
              {/* 공감 메시지 */}
              <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-4">
                <span className="inline-flex rounded-full border border-foreground/20 px-3 py-1 text-xs font-medium">
                  {lifeSceneAnalysis.lifeArea}
                </span>
                <p className="mt-3 text-sm text-foreground/70">{lifeSceneAnalysis.empathyMessage}</p>
              </div>

              {/* 나의 발걸음 (this_month 이상, 긴→짧은 순 — someday 먼저) */}
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">나의 발걸음</h3>
                <div className="flex flex-col gap-3">
                  {displayStrides.map((item, index) => (
                    <div
                      key={`stride-${item.level}-${index}`}
                      className={cn(
                        "w-full rounded-xl border px-4 py-4 text-left",
                        getStrideTone(item.level)
                      )}
                    >
                      <p className="mb-1 text-xs font-medium text-foreground/60">
                        {item.label}
                      </p>
                      <p className="text-sm font-medium">{item.action}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* 버킷을 위한 투두 (today/this_week — 라디오 선택) */}
              {bucketTodos.length > 0 && (
                <section className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">버킷을 위한 투두</h3>
                    <p className="text-xs text-foreground/60">하나를 선택하면 이번 주 데일리투두가 됩니다.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {bucketTodos.map((item, index) => {
                      const isSelected = selectedDailyTodo === item.action;
                      return (
                        <button
                          key={`todo-${item.level}-${index}`}
                          type="button"
                          onClick={() => {
                            setSelectedDailyTodo(item.action);
                            setError(null);
                          }}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                            isSelected
                              ? "border-foreground bg-foreground text-background"
                              : "border-foreground/15 hover:bg-foreground/[0.04]"
                          )}
                        >
                          <span className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                            isSelected
                              ? "border-background bg-background"
                              : "border-foreground/30"
                          )}>
                            {isSelected && (
                              <span className="h-2 w-2 rounded-full bg-foreground" />
                            )}
                          </span>
                          <div className="flex-1">
                            <p className={cn(
                              "mb-0.5 text-xs",
                              isSelected ? "text-background/70" : "text-foreground/50"
                            )}>
                              {item.label}
                            </p>
                            <p className="text-sm font-medium">{item.action}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 버킷을 위한 루틴 (라디오 선택) */}
              <section className="flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-semibold">버킷을 위한 루틴</h3>
                  <p className="text-xs text-foreground/60">하나를 선택하면 반복 루틴으로 등록됩니다.</p>
                </div>
                <div className="flex flex-col gap-2">
                  {lifeSceneAnalysis.suggestedRoutines.map((routine) => {
                    const selected = selectedRoutineTitles.includes(routine.title);
                    return (
                      <button
                        key={routine.title}
                        type="button"
                        onClick={() => {
                          selectRoutineTitle(routine.title);
                          setError(null);
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                          selected
                            ? "border-foreground bg-foreground text-background"
                            : "border-foreground/15 hover:bg-foreground/[0.04]"
                        )}
                      >
                        <span className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          selected
                            ? "border-background bg-background"
                            : "border-foreground/30"
                        )}>
                          {selected && (
                            <span className="h-2 w-2 rounded-full bg-foreground" />
                          )}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{routine.title}</p>
                          <p
                            className={cn(
                              "mt-1 text-xs",
                              selected ? "text-background/80" : "text-foreground/60"
                            )}
                          >
                            반복: {formatRoutineRepeat(routine)}
                          </p>
                        </div>
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

      {/* Step 4 — 확인 */}
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
