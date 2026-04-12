import type {
  Gender,
  ItemSource,
  LifeSceneAnalysisResult,
  PersonalityType,
  RoutineRepeatUnit,
} from "@/types";

const DEMO_ONBOARDING_STORAGE_KEY = "slowgoes_demo_onboarding_v1";

export interface DemoOnboardingData {
  displayName: string;
  sceneText: string;
  lifeArea: string;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
  chapterTitle: string;
  stridePlan: LifeSceneAnalysisResult;
  selectedDailyTodos: Array<{ title: string; source?: ItemSource }>;
  selectedRoutines: Array<{
    title: string;
    repeatUnit: RoutineRepeatUnit;
    repeatValue: number;
    source?: ItemSource;
  }>;
  savedAt: string;
}

function hasWindow() {
  return typeof window !== "undefined";
}

export function saveDemoOnboardingData(data: DemoOnboardingData) {
  if (!hasWindow()) return;
  localStorage.setItem(DEMO_ONBOARDING_STORAGE_KEY, JSON.stringify(data));
}

export function getDemoOnboardingData(): DemoOnboardingData | null {
  if (!hasWindow()) return null;

  const raw = localStorage.getItem(DEMO_ONBOARDING_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as DemoOnboardingData & {
      // 레거시 키 호환
      horizonAnalysis?: LifeSceneAnalysisResult & {
        horizons?: LifeSceneAnalysisResult["strides"];
      };
    };

    // 레거시 horizonAnalysis 키를 stridePlan으로 흡수
    if (!parsed.stridePlan && parsed.horizonAnalysis) {
      const legacy = parsed.horizonAnalysis;
      parsed.stridePlan = {
        ...legacy,
        strides: legacy.strides ?? legacy.horizons ?? [],
      };
      delete parsed.horizonAnalysis;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearDemoOnboardingData() {
  if (!hasWindow()) return;
  localStorage.removeItem(DEMO_ONBOARDING_STORAGE_KEY);
}
