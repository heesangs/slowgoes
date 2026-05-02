import type { Gender, LifeAreaName, OnboardingSceneCategory, PaceType } from "@/types";

export const DRAFT_VERSION = "v1";

export const GENDER_OPTIONS = [
  { value: "male" as Gender, label: "남성" },
  { value: "female" as Gender, label: "여성" },
] as const;

export const CLOCK_HAND_ROTATION_CLASSES = [
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

export const MBTI_ENERGY_OPTIONS = [
  { value: "I" as const, label: "I" },
  { value: "E" as const, label: "E" },
];
export const MBTI_SENSE_OPTIONS = [
  { value: "S" as const, label: "S" },
  { value: "N" as const, label: "N" },
];
export const MBTI_JUDGMENT_OPTIONS = [
  { value: "T" as const, label: "T" },
  { value: "F" as const, label: "F" },
];
export const MBTI_LIFESTYLE_OPTIONS = [
  { value: "J" as const, label: "J" },
  { value: "P" as const, label: "P" },
];

export const PACE_OPTIONS = [
  { value: "slow" as PaceType, label: "느긋" },
  { value: "balanced" as PaceType, label: "보통" },
  { value: "focused" as PaceType, label: "빠른편" },
];

// 사용자가 정한 6개 카테고리 — 순서: 경험 / 성장 / 소유 / 관계 / 건강 / 내면
// 백엔드 LifeAreaName(7개)과 1:1이 아니라, "일/돈"은 "소유"로 흡수해 UI를 6개로 단순화.
// `lifeAreaHint`는 Step 3에서 AI에게 영역 추론 힌트로 전달(필수 아님, 안전망은 normalizeLifeArea).
export const LIFE_CATEGORIES = [
  {
    key: "experience" as const,
    icon: "🎨",
    label: "경험",
    desc: "꼭 한번 해보고 싶은 것",
    sceneCategoryKey: "must_do" as OnboardingSceneCategory["key"],
    lifeAreaHint: "경험" as LifeAreaName,
  },
  {
    key: "growth" as const,
    icon: "💪",
    label: "성장",
    desc: "조금씩 완성되는 나",
    sceneCategoryKey: "life_scene" as OnboardingSceneCategory["key"],
    lifeAreaHint: "성장" as LifeAreaName,
  },
  {
    key: "possession" as const,
    icon: "💰",
    label: "소유",
    desc: "꼭 갖고 싶은 것 · 일과 돈",
    sceneCategoryKey: "must_do" as OnboardingSceneCategory["key"],
    lifeAreaHint: "돈" as LifeAreaName,
  },
  {
    key: "relationship" as const,
    icon: "👨‍👩‍👧‍👦",
    label: "관계",
    desc: "소중한 사람과의 시간",
    sceneCategoryKey: "dont_miss" as OnboardingSceneCategory["key"],
    lifeAreaHint: "관계" as LifeAreaName,
  },
  {
    key: "health" as const,
    icon: "🌿",
    label: "건강",
    desc: "몸과 마음의 컨디션",
    sceneCategoryKey: "life_scene" as OnboardingSceneCategory["key"],
    lifeAreaHint: "건강" as LifeAreaName,
  },
  {
    key: "inner" as const,
    icon: "🧘",
    label: "내면",
    desc: "나를 들여다보는 시간",
    sceneCategoryKey: "life_scene" as OnboardingSceneCategory["key"],
    lifeAreaHint: "내면" as LifeAreaName,
  },
] as const;

export type LifeCategory = (typeof LIFE_CATEGORIES)[number]["key"];

// 구버전 sessionStorage draft에서 안전하게 fallback하기 위한 키 집합
const VALID_LIFE_CATEGORY_KEYS = new Set<string>(LIFE_CATEGORIES.map((c) => c.key));

export function isLifeCategory(value: unknown): value is LifeCategory {
  return typeof value === "string" && VALID_LIFE_CATEGORY_KEYS.has(value);
}
