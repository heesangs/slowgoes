import type { Gender, PaceType, OnboardingSceneCategory } from "@/types";

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

export const LIFE_CATEGORIES = [
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

export type LifeCategory = (typeof LIFE_CATEGORIES)[number]["key"];
