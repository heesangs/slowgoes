import type {
  Gender,
  ItemSource,
  LifeSceneAnalysisResult,
  PaceType,
  PersonalityType,
  RoutineRepeatUnit,
  SelfLevel,
} from "@/types";

const DEMO_ONBOARDING_STORAGE_KEY = "slowgoes_demo_onboarding_v1";
const DEMO_ONBOARDING_BACKUP_STORAGE_KEY = "slowgoes_demo_onboarding_backup_v1";
const DEMO_ONBOARDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface DemoOnboardingData {
  displayName: string;
  sceneText: string;
  lifeArea: string;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
  paceType: PaceType;
  selfLevel: SelfLevel;
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

function parseDemoOnboardingData(raw: string): DemoOnboardingData | null {
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

    // 레거시: paceType/selfLevel 없으면 폴백 후 저장
    if (!parsed.paceType) parsed.paceType = "balanced";
    if (!parsed.selfLevel) parsed.selfLevel = "medium";

    return parsed;
  } catch {
    return null;
  }
}

function isDemoOnboardingDataExpired(savedAt?: string): boolean {
  if (!savedAt) return false;
  const savedTime = Date.parse(savedAt);
  if (!Number.isFinite(savedTime)) return false;
  return Date.now() - savedTime > DEMO_ONBOARDING_MAX_AGE_MS;
}

function readDemoOnboardingData(key: string): DemoOnboardingData | null {
  if (!hasWindow()) return null;

  const raw = localStorage.getItem(key);
  if (!raw) return null;

  const parsed = parseDemoOnboardingData(raw);
  if (!parsed) return null;

  // 오래된 체험 데이터는 자동 정리해 localStorage 누적을 방지
  if (isDemoOnboardingDataExpired(parsed.savedAt)) {
    localStorage.removeItem(key);
    return null;
  }

  return parsed;
}

export function saveDemoOnboardingData(data: DemoOnboardingData) {
  if (!hasWindow()) return;
  localStorage.setItem(DEMO_ONBOARDING_STORAGE_KEY, JSON.stringify(data));
}

export function saveDemoOnboardingBackupData(data: DemoOnboardingData) {
  if (!hasWindow()) return;
  localStorage.setItem(DEMO_ONBOARDING_BACKUP_STORAGE_KEY, JSON.stringify(data));
}

export function getDemoOnboardingData(): DemoOnboardingData | null {
  return readDemoOnboardingData(DEMO_ONBOARDING_STORAGE_KEY);
}

export function getDemoOnboardingBackupData(): DemoOnboardingData | null {
  return readDemoOnboardingData(DEMO_ONBOARDING_BACKUP_STORAGE_KEY);
}

export function clearDemoOnboardingData() {
  if (!hasWindow()) return;
  localStorage.removeItem(DEMO_ONBOARDING_STORAGE_KEY);
}

export function clearDemoOnboardingBackupData() {
  if (!hasWindow()) return;
  localStorage.removeItem(DEMO_ONBOARDING_BACKUP_STORAGE_KEY);
}

export function clearAllDemoOnboardingData() {
  clearDemoOnboardingData();
  clearDemoOnboardingBackupData();
}
