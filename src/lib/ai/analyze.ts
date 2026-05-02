// AI 할 일 분석 — Gemini API로 하위 과제 분해, 난이도/시간 제안

import { geminiModel } from "./gemini";
import {
  AI_ERRORS,
  BUCKET_ERRORS,
  STRIDE_ERRORS,
} from "@/lib/constants";
import type {
  ActionLogItemType,
  AISubtaskSuggestion,
  Difficulty,
  FirstStepPlanResult,
  Gender,
  LifeSceneAnalysisResult,
  PaceAdjustOption,
  PersonalityType,
  Profile,
  StrideItem,
  StrideLevel,
  StrideScope,
  SuggestedRoutine,
} from "@/types";

const LIFE_AREA_OPTIONS = ["건강", "관계", "성장", "경험", "일", "돈", "내면"] as const;

// 나의 발걸음(stride) — 짧은 → 긴 순서
export const STRIDE_LABELS: Record<StrideLevel, string> = {
  today: "오늘",
  this_week: "이번 주",
  this_month: "이번 달",
  this_season: "이번 시즌",
  this_year: "1년 안",
  five_years: "5년 안",
  decade: "10년 안",
  someday: "언젠가",
};

export const STRIDE_ORDER: StrideLevel[] = [
  "today",
  "this_week",
  "this_month",
  "this_season",
  "this_year",
  "five_years",
  "decade",
  "someday",
];

// 표시 경계: this_month 이상 = 발걸음 카드, 미만 = 버킷 투두 소스
const STRIDE_BOUNDARY_INDEX = STRIDE_ORDER.indexOf("this_month"); // 2

/**
 * strides 배열을 "발걸음 카드"(this_month 이상)와 "버킷 투두"(today/this_week)로 분리
 * - displayStrides: 긴→짧은 순 (someday 먼저)
 * - bucketTodos: 짧은→긴 순
 */
export function partitionStrides(strides: StrideItem[]): {
  displayStrides: StrideItem[];
  bucketTodos: StrideItem[];
} {
  const display: StrideItem[] = [];
  const todos: StrideItem[] = [];
  for (const s of strides) {
    if (STRIDE_ORDER.indexOf(s.level) >= STRIDE_BOUNDARY_INDEX) {
      display.push(s);
    } else {
      todos.push(s);
    }
  }
  // 발걸음: 긴 → 짧은 (someday 먼저)
  display.sort(
    (a, b) => STRIDE_ORDER.indexOf(b.level) - STRIDE_ORDER.indexOf(a.level)
  );
  // 투두: 짧은 → 긴
  todos.sort(
    (a, b) => STRIDE_ORDER.indexOf(a.level) - STRIDE_ORDER.indexOf(b.level)
  );
  return { displayStrides: display, bucketTodos: todos };
}

// 버킷 스코프 힌트 주변 범위 — someday 항상 포함 + 짧은 단계(today/this_week) 포함
const SCOPE_SUGGESTED_RANGE: Record<StrideScope, StrideLevel[]> = {
  today: ["today", "this_week", "this_month", "someday"],
  this_week: ["today", "this_week", "this_month", "someday"],
  this_month: ["today", "this_week", "this_month", "this_season", "someday"],
  this_season: ["today", "this_week", "this_month", "this_season", "someday"],
  this_year: ["today", "this_week", "this_month", "this_season", "this_year", "someday"],
  five_years: ["today", "this_week", "this_season", "this_year", "five_years", "someday"],
  decade: ["today", "this_week", "this_year", "five_years", "decade", "someday"],
  someday: ["today", "this_week", "this_month", "this_year", "someday"],
};
const PERSONALITY_OPTIONS = [
  "ISTJ", "ISFJ", "INFJ", "INTJ",
  "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP",
  "ESTJ", "ESFJ", "ENFJ", "ENTJ",
] as const;
const PACE_OPTIONS = ["slow", "balanced", "focused", "recovery"] as const;

type PersonalityOption = (typeof PERSONALITY_OPTIONS)[number];
type PaceOption = (typeof PACE_OPTIONS)[number];
// 규칙 매트릭스는 E/I × T/F 2축 기준으로 유지 (4가지 조합)
type PersonalityRuleKey = "IT" | "IF" | "ET" | "EF";
type PersonalityPaceKey = `${PersonalityRuleKey}|${PaceOption}`;

// 4글자 MBTI에서 규칙 키(E/I + T/F) 추출
function getMbtiRuleKey(mbti: PersonalityOption): PersonalityRuleKey {
  const ei = mbti[0] as "I" | "E";
  const tf = mbti[2] as "T" | "F";
  return `${ei}${tf}` as PersonalityRuleKey;
}

const PERSONALITY_BASE_RULES: Record<PersonalityRuleKey, string> = {
  IT: "논리적 순서와 명확한 기준으로 단계를 구성한다.",
  IF: "의미와 몰입을 느낄 수 있도록 감정 부담을 낮춘다.",
  ET: "행동-피드백-개선 순환이 빠르게 돌아가도록 구성한다.",
  EF: "사람과의 연결, 공감, 협업 가능성을 반영한다.",
};

const PACE_BASE_RULES: Record<PaceOption, string> = {
  slow: "작은 단위를 자주 실천할 수 있도록 10~20분 마이크로 단계로 쪼갠다.",
  balanced: "20~40분 기준으로 안정적인 리듬을 유지한다.",
  focused: "집중 세션 중심으로 깊이 있게 진행하되 준비/마무리 단계를 붙인다.",
  recovery: "에너지 소모가 낮은 5~15분 시작 행동을 우선 제시한다.",
};

const PERSONALITY_PACE_MATRIX_RULES: Partial<Record<PersonalityPaceKey, string>> = {
  "IT|slow": "체계적 체크리스트와 매일 짧은 분석 단계를 중심으로 제시한다.",
  "IT|focused": "깊은 리서치와 집중 세션 중심으로 제시한다.",
  "IF|slow": "성찰/의미 중심의 작은 단계로 심리적 진입장벽을 낮춘다.",
  "IF|recovery": "감정 상태 점검 후 5분 시작 행동으로 연결한다.",
  "ET|focused": "사람과 함께하는 집중 활동과 빠른 실행을 제시한다.",
  "ET|balanced": "실행 후 즉시 피드백을 반영하는 순환형 단계를 제시한다.",
  "EF|slow": "관계 중심의 작은 실천을 꾸준히 이어가게 제시한다.",
  "EF|recovery": "가벼운 대화/연결 기반의 저부담 행동을 우선 제시한다.",
};

// 기존 학생 학년 여부 판별 (legacy 유저 호환)
function isLegacyStudentGrade(grade: string | null | undefined): boolean {
  if (!grade) return false;
  return /^(중|고)[1-3]$/.test(grade);
}

// JSON 응답에서 마크다운 코드펜스 제거
function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  return JSON.parse(cleaned);
}

// 시스템 정체성 빌드 (컨텍스트별 분기)
function buildSystemIdentity(profile: Profile | null): string {
  const ctx = profile?.user_context ?? [];
  const effective =
    ctx.length === 0 && isLegacyStudentGrade(profile?.grade)
      ? ["student"]
      : ctx;

  if (effective.length === 1) {
    if (effective[0] === "student")
      return "당신은 한국 학생의 학습을 돕는 AI 튜터입니다.";
    if (effective[0] === "university")
      return "당신은 대학생의 과제와 학습을 돕는 AI 조수입니다.";
    if (effective[0] === "work")
      return "당신은 업무 효율을 돕는 AI 어시스턴트입니다.";
    if (effective[0] === "personal")
      return "당신은 목표 달성을 돕는 AI 도우미입니다.";
  }
  return "당신은 사용자의 할 일을 효율적으로 관리하도록 돕는 AI 어시스턴트입니다.";
}

// 프로필 기반 컨텍스트 문자열 생성
function buildProfileContext(profile: Profile | null): string {
  if (!profile) return "사용자 정보가 없습니다.";

  const ctx = profile.user_context ?? [];
  const effectiveCtx =
    ctx.length === 0 && isLegacyStudentGrade(profile.grade)
      ? ["student"]
      : ctx;

  const parts: string[] = [];

  if (effectiveCtx.includes("student") && profile.grade) {
    parts.push(`학년: ${profile.grade}`);
    // 학교 과목만 필터
    const studentSubjects = ["국어", "영어", "수학", "과학", "사회", "기타"];
    const filtered = profile.subjects?.filter((s) => studentSubjects.includes(s)) ?? [];
    if (filtered.length > 0) parts.push(`주요 과목: ${filtered.join(", ")}`);
  }

  if (effectiveCtx.includes("university") && profile.grade) {
    parts.push(`대학 ${profile.grade.replace("대학", "").replace("원", "대학원")}`);
  }

  if (effectiveCtx.includes("work") && profile.subjects?.length) {
    const workSubjects = ["개발", "디자인", "마케팅", "기획", "영업", "연구", "관리", "기타"];
    const filtered = profile.subjects.filter((s) => workSubjects.includes(s));
    if (filtered.length > 0) parts.push(`업무 분야: ${filtered.join(", ")}`);
  }

  if (effectiveCtx.includes("personal") && profile.subjects?.length) {
    const personalSubjects = ["독서", "운동", "어학", "자격증", "창작", "기타"];
    const filtered = profile.subjects.filter((s) => personalSubjects.includes(s));
    if (filtered.length > 0) parts.push(`관심 분야: ${filtered.join(", ")}`);
  }

  if (profile.self_level) {
    const levelLabel = { low: "하", medium: "중", high: "상" }[profile.self_level];
    parts.push(`작업 속도 수준: ${levelLabel}`);
  }

  return parts.length > 0 ? parts.join("\n") : "사용자 정보가 없습니다.";
}

// student 단독 여부
function isStudentOnly(profile: Profile | null): boolean {
  const ctx = profile?.user_context ?? [];
  const effective =
    ctx.length === 0 && isLegacyStudentGrade(profile?.grade)
      ? ["student"]
      : ctx;
  return effective.length === 1 && effective[0] === "student";
}

// Gemini 에러를 사용자 친화 메시지로 변환
function mapGeminiError(error: unknown): Error {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const lower = rawMessage.toLowerCase();
  const retryMatch = rawMessage.match(/retry in\s*([\d.]+)s/i);
  const retrySeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : null;

  if (
    lower.includes("429") ||
    lower.includes("too many requests") ||
    lower.includes("quota")
  ) {
    return new Error(
      retrySeconds
        ? AI_ERRORS.RATE_LIMIT_WITH_RETRY(retrySeconds)
        : AI_ERRORS.RATE_LIMIT
    );
  }

  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("api key") ||
    lower.includes("permission")
  ) {
    return new Error(AI_ERRORS.API_KEY_INVALID);
  }

  return new Error(AI_ERRORS.ANALYSIS_GENERIC);
}

function normalizeLifeArea(raw: unknown, sceneText: string): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (LIFE_AREA_OPTIONS.includes(trimmed as (typeof LIFE_AREA_OPTIONS)[number])) {
      return trimmed;
    }

    const englishToKorean: Record<string, string> = {
      health: "건강",
      relationship: "관계",
      relationships: "관계",
      growth: "성장",
      experience: "경험",
      experiences: "경험",
      work: "일",
      career: "일",
      money: "돈",
      finance: "돈",
      inner: "내면",
      mind: "내면",
    };
    const mapped = englishToKorean[trimmed.toLowerCase()];
    if (mapped) return mapped;
  }

  const lower = sceneText.toLowerCase();
  if (lower.includes("돈") || lower.includes("재테크") || lower.includes("경제")) return "돈";
  if (lower.includes("운동") || lower.includes("수면") || lower.includes("건강")) return "건강";
  if (lower.includes("결혼") || lower.includes("가족") || lower.includes("친구")) return "관계";
  if (lower.includes("여행") || lower.includes("경험")) return "경험";
  if (lower.includes("일") || lower.includes("커리어") || lower.includes("직장")) return "일";
  if (lower.includes("마음") || lower.includes("명상") || lower.includes("심리")) return "내면";
  return "성장";
}

function normalizeStrideLevel(raw: unknown): StrideLevel | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase().replace(/[\s-]/g, "_");

  // 직접 일치
  if ((STRIDE_ORDER as string[]).includes(normalized)) {
    return normalized as StrideLevel;
  }

  // 영문 별칭
  if (normalized === "day" || normalized === "today" || normalized === "this_day") return "today";
  if (normalized === "week" || normalized === "thisweek") return "this_week";
  if (normalized === "month" || normalized === "thismonth") return "this_month";
  if (normalized === "season" || normalized === "thisseason" || normalized === "quarter") return "this_season";
  if (normalized === "year" || normalized === "one_year" || normalized === "within_year") return "this_year";
  if (normalized === "5_years" || normalized === "fiveyears" || normalized === "5year") return "five_years";
  if (normalized === "10_years" || normalized === "tenyears" || normalized === "10year") return "decade";
  if (normalized === "lifetime" || normalized === "dream") return "someday";

  // 한글 별칭
  if (normalized.includes("오늘")) return "today";
  if (normalized.includes("이번_주") || normalized.includes("이번 주")) return "this_week";
  if (normalized.includes("이번_달") || normalized.includes("이번 달") || normalized.includes("한달")) return "this_month";
  if (normalized.includes("시즌") || normalized.includes("분기")) return "this_season";
  if (normalized.includes("1년") || normalized.includes("올해")) return "this_year";
  if (normalized.includes("5년")) return "five_years";
  if (normalized.includes("10년")) return "decade";
  if (normalized.includes("언젠")) return "someday";
  return null;
}

function toNonEmptyText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDifficulty(raw: unknown, fallback: Difficulty = "medium"): Difficulty {
  if (raw === "easy" || raw === "medium" || raw === "hard") return raw;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "쉬움") return "easy";
    if (normalized === "보통") return "medium";
    if (normalized === "어려움") return "hard";
  }
  return fallback;
}

function normalizeEstimatedMinutes(raw: unknown, min: number, max: number, fallback: number) {
  return Math.max(min, Math.min(max, Math.round(Number(raw) || fallback)));
}

function normalizeAISubtasks(
  rawSubtasks: unknown,
  options: { minMinutes: number; maxMinutes: number; fallbackMinutes: number; fallbackTitlePrefix: string }
): AISubtaskSuggestion[] {
  if (!Array.isArray(rawSubtasks) || rawSubtasks.length === 0) return [];

  return rawSubtasks
    .map((item, index) => {
      const row = item as {
        title?: unknown;
        difficulty?: unknown;
        estimated_minutes?: unknown;
        estimatedMinutes?: unknown;
      };
      const title = toNonEmptyText(row.title) ?? `${options.fallbackTitlePrefix} ${index + 1}`;
      const difficulty = normalizeDifficulty(row.difficulty, "medium");
      const estimated_minutes = normalizeEstimatedMinutes(
        row.estimated_minutes ?? row.estimatedMinutes,
        options.minMinutes,
        options.maxMinutes,
        options.fallbackMinutes
      );
      return { title, difficulty, estimated_minutes };
    })
    .filter((item) => item.title.length > 0);
}

// 장면 텍스트에 맞춘 레벨별 기본 액션 문구
function buildStrideFallbackAction(sceneText: string, level: StrideLevel): string {
  const root = sceneText.trim() || "이 장면";
  switch (level) {
    case "today":
      return `${root}를 위해 지금 바로 할 수 있는 가장 작은 행동 1개 하기`;
    case "this_week":
      return `${root} 관련해서 이번 주에 시작할 수 있는 정보 1개 찾아보기`;
    case "this_month":
      return `${root}를 위해 이번 달에 만들 작은 습관 1개 정하기`;
    case "this_season":
      return `${root}를 위한 시즌 루틴 1개 정리해보기`;
    case "this_year":
      return `${root}를 위한 올해의 기반을 1개 만들기`;
    case "five_years":
      return `${root}를 향해 5년 안에 도달하고 싶은 상태 정리하기`;
    case "decade":
      return `${root}의 10년 지향점을 한 문장으로 써보기`;
    case "someday":
      return `${root}`;
  }
}

// 기본 scope별 폴백 (someday 항상 포함 + 짧은 단계 포함)
function buildFallbackStrides(
  sceneText: string,
  scopeHint?: StrideScope | null
): StrideItem[] {
  const levels =
    scopeHint && SCOPE_SUGGESTED_RANGE[scopeHint]
      ? SCOPE_SUGGESTED_RANGE[scopeHint]
      : (["today", "this_week", "this_month", "this_year", "someday"] as StrideLevel[]);

  // someday가 없으면 추가
  const withSomeday = levels.includes("someday")
    ? levels
    : [...levels, "someday" as StrideLevel];

  // 짧은 → 긴 순서 보장
  const ordered = [...withSomeday].sort(
    (a, b) => STRIDE_ORDER.indexOf(a) - STRIDE_ORDER.indexOf(b)
  );

  return ordered.map((level) => ({
    level,
    label: STRIDE_LABELS[level],
    action: buildStrideFallbackAction(sceneText, level),
  }));
}

// AI 응답 → StrideItem[] 정규화 (3~6개, 짧은→긴 정렬, 중복 제거, someday 필수)
function normalizeStrides(
  rawStrides: unknown,
  sceneText: string,
  scopeHint?: StrideScope | null
): StrideItem[] {
  const fallback = buildFallbackStrides(sceneText, scopeHint);

  if (!Array.isArray(rawStrides)) {
    return fallback;
  }

  // level별로 첫 번째 유효 action 하나씩 보관
  const perLevel = new Map<StrideLevel, string[]>();

  for (const row of rawStrides) {
    const item = row as { level?: unknown; label?: unknown; action?: unknown };
    const level = normalizeStrideLevel(item.level ?? item.label);
    if (!level) continue;
    const action = toNonEmptyText(item.action);
    if (!action) continue;
    const arr = perLevel.get(level) ?? [];
    arr.push(action);
    perLevel.set(level, arr);
  }

  // 유효 레벨을 짧은 → 긴 순으로 정렬
  const orderedLevels = [...perLevel.keys()].sort(
    (a, b) => STRIDE_ORDER.indexOf(a) - STRIDE_ORDER.indexOf(b)
  );

  const items: StrideItem[] = orderedLevels.map((level) => ({
    level,
    label: STRIDE_LABELS[level],
    action: perLevel.get(level)![0],
  }));

  // someday가 없으면 fallback에서 보충
  if (!items.some((i) => i.level === "someday")) {
    const somedayFallback = fallback.find((f) => f.level === "someday");
    if (somedayFallback) {
      items.push(somedayFallback);
    } else {
      items.push({
        level: "someday",
        label: STRIDE_LABELS.someday,
        action: buildStrideFallbackAction(sceneText, "someday"),
      });
    }
  }

  // 3개 미만이면 fallback에서 없는 레벨을 보충
  if (items.length < 3) {
    const existingLevels = new Set(items.map((i) => i.level));
    for (const fb of fallback) {
      if (existingLevels.has(fb.level)) continue;
      items.push(fb);
      existingLevels.add(fb.level);
      if (items.length >= 3) break;
    }
  }

  // 재정렬 (짧은 → 긴)
  items.sort((a, b) => STRIDE_ORDER.indexOf(a.level) - STRIDE_ORDER.indexOf(b.level));

  // 6개 초과면 someday 보존하면서 축소
  if (items.length > 6) {
    const someday = items.find((i) => i.level === "someday")!;
    const rest = items.filter((i) => i.level !== "someday").slice(0, 5);
    return [...rest, someday].sort(
      (a, b) => STRIDE_ORDER.indexOf(a.level) - STRIDE_ORDER.indexOf(b.level)
    );
  }

  return items;
}

function normalizeRoutineRepeatUnit(raw: unknown): SuggestedRoutine["repeatUnit"] {
  if (raw === "daily" || raw === "weekly") {
    return raw;
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "매일" || normalized === "day" || normalized === "every_day") {
      return "daily";
    }
    if (normalized === "매주" || normalized === "week" || normalized === "every_week") {
      return "weekly";
    }
  }
  return "weekly";
}

function normalizeRoutineRepeatValue(
  raw: unknown,
  unit: SuggestedRoutine["repeatUnit"]
): number {
  const fallback = 1;
  const parsed = Math.round(Number(raw) || fallback);
  const max = unit === "daily" ? 7 : 14;
  return Math.max(1, Math.min(max, parsed));
}

function buildFallbackSuggestedRoutines(sceneText: string): SuggestedRoutine[] {
  const base = sceneText.trim() || "선택한 장면";
  return [
    {
      title: `${base} 관련 10분 정리하기`,
      repeatUnit: "weekly",
      repeatValue: 1,
    },
    {
      title: `${base}를 위한 5분 점검하기`,
      repeatUnit: "daily",
      repeatValue: 1,
    },
  ];
}

function normalizeSuggestedRoutines(
  raw: unknown,
  sceneText: string
): SuggestedRoutine[] {
  if (!Array.isArray(raw)) {
    return buildFallbackSuggestedRoutines(sceneText);
  }

  const normalized = raw
    .map((item) => {
      const row = item as {
        title?: unknown;
        repeatUnit?: unknown;
        repeat_unit?: unknown;
        repeatValue?: unknown;
        repeat_value?: unknown;
      };

      const title = toNonEmptyText(row.title);
      if (!title) return null;

      const repeatUnit = normalizeRoutineRepeatUnit(row.repeatUnit ?? row.repeat_unit);
      const repeatValue = normalizeRoutineRepeatValue(
        row.repeatValue ?? row.repeat_value,
        repeatUnit
      );

      return {
        title,
        repeatUnit,
        repeatValue,
      };
    })
    .filter((row): row is SuggestedRoutine => Boolean(row));

  const deduped: SuggestedRoutine[] = [];
  const seen = new Set<string>();

  for (const item of normalized) {
    const key = item.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= 3) break;
  }

  if (deduped.length >= 2) {
    return deduped;
  }

  const fallback = buildFallbackSuggestedRoutines(sceneText);
  for (const item of fallback) {
    const key = item.title.toLowerCase();
    if (seen.has(key)) continue;
    deduped.push(item);
    if (deduped.length >= 2) break;
  }

  return deduped;
}

interface AnalyzeLifeSceneInput {
  sceneText: string;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
  strideScope?: StrideScope | null;
  /** UI 카테고리에서 추론한 lifeArea 힌트 — AI가 더 적합한 영역으로 분류해도 무방. */
  lifeAreaHint?: string | null;
}

interface GenerateFirstStepInput {
  weeklyAction: string;
  sceneText: string;
  lifeArea: string;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
}

interface AdjustPacePlanInput extends GenerateFirstStepInput {
  option: PaceAdjustOption;
  currentPlan: FirstStepPlanResult;
}

// AI 분석 힌트 (선택 컨텍스트)
interface TaskAnalysisHints {
  memo?: string;
  desiredSubtaskCount?: number;
  targetDurationMinutes?: number;
  dueDate?: string;
  difficultyLearning?: DifficultyLearningHint | null;
}

interface DifficultyLearningHint {
  tendency: "easier" | "harder" | "neutral";
  averageTimeMultiplier: number | null;
  sampleSize: number;
  note: string;
}

interface GenerateWeeklyItemsInput {
  bucketTitle: string;
  lifeArea: string;
  strides: StrideItem[];
  existingTitles?: string[];
}

interface RegenerateSingleStrideInput {
  bucketTitle: string;
  lifeArea: string;
  existingStrides: StrideItem[];
  targetLevel: StrideLevel;
}

interface GenerateWeeklyItemsResult {
  dailyTodos: Array<{ title: string }>;
  routines: SuggestedRoutine[];
}

interface GenerateActionTipInput {
  itemTitle: string;
  itemType: ActionLogItemType;
  bucketTitle?: string | null;
  lifeArea?: string | null;
  profile?: Profile | null;
}

function normalizePersonalityType(
  value: Profile["personality_type"] | undefined | null
): PersonalityOption | null {
  if (value && PERSONALITY_OPTIONS.includes(value as PersonalityOption)) {
    return value as PersonalityOption;
  }
  return null;
}

function normalizePaceType(value: Profile["pace_type"] | undefined | null): PaceOption | null {
  if (value && PACE_OPTIONS.includes(value as PaceOption)) {
    return value as PaceOption;
  }
  return null;
}

function buildPersonalityPaceHints(profile: Profile | null): {
  summary: string;
  rules: string[];
} {
  const personality = normalizePersonalityType(profile?.personality_type);
  const pace = normalizePaceType(profile?.pace_type);
  const summary = `${personality ?? "미정"} × ${pace ?? "미정"}`;
  const rules: string[] = [];
  let hasMatrixRule = false;

  if (personality && pace) {
    const ruleKey = getMbtiRuleKey(personality);
    const matrixRule = PERSONALITY_PACE_MATRIX_RULES[`${ruleKey}|${pace}`];
    if (matrixRule) {
      rules.push(matrixRule);
      hasMatrixRule = true;
    }
  }

  if (!hasMatrixRule && personality) {
    rules.push(PERSONALITY_BASE_RULES[getMbtiRuleKey(personality)]);
  }
  if (!hasMatrixRule && pace) {
    rules.push(PACE_BASE_RULES[pace]);
  }

  if (rules.length === 0) {
    rules.push("성향/페이스 정보가 없으면 부담이 낮고 명확한 기본 실행 단계를 제시한다.");
  }

  return { summary, rules };
}

function buildPersonalityPacePromptBlock(profile: Profile | null): string {
  const hints = buildPersonalityPaceHints(profile);
  const rulesBlock = hints.rules.map((rule) => `- ${rule}`).join("\n");
  return `성향×페이스 매트릭스:
- 조합: ${hints.summary}
${rulesBlock}`;
}

function shiftDifficultyByTendency(
  difficulty: Difficulty,
  tendency: DifficultyLearningHint["tendency"]
): Difficulty {
  if (tendency === "easier") {
    if (difficulty === "hard") return "medium";
    if (difficulty === "medium") return "easy";
  }
  if (tendency === "harder") {
    if (difficulty === "easy") return "medium";
    if (difficulty === "medium") return "hard";
  }
  return difficulty;
}

function applyDifficultyLearning(
  suggestions: AISubtaskSuggestion[],
  learning: DifficultyLearningHint | null | undefined,
  minMinutes: number,
  maxMinutes: number
): AISubtaskSuggestion[] {
  if (!learning || learning.sampleSize < 3) {
    return suggestions;
  }

  const multiplier = learning.averageTimeMultiplier
    ? Math.max(0.8, Math.min(1.3, learning.averageTimeMultiplier))
    : 1;

  return suggestions.map((item) => ({
    ...item,
    difficulty:
      learning.sampleSize >= 8
        ? shiftDifficultyByTendency(item.difficulty, learning.tendency)
        : item.difficulty,
    estimated_minutes: normalizeEstimatedMinutes(
      Math.round(item.estimated_minutes * multiplier),
      minMinutes,
      maxMinutes,
      item.estimated_minutes
    ),
  }));
}

function buildDifficultyLearningPromptBlock(
  learning: DifficultyLearningHint | null | undefined
): string {
  if (!learning || learning.sampleSize < 3) {
    return "난이도 학습 힌트: 아직 충분한 조정 이력이 없어 기본 추천을 사용";
  }

  const tendencyLabel =
    learning.tendency === "easier"
      ? "사용자가 보통 더 쉽게 조정"
      : learning.tendency === "harder"
        ? "사용자가 보통 더 도전적으로 조정"
        : "난이도 조정 경향은 중립";

  const multiplierLabel =
    typeof learning.averageTimeMultiplier === "number"
      ? `${learning.averageTimeMultiplier.toFixed(2)}배`
      : "중립";

  return `난이도 학습 힌트:
- 샘플 수: ${learning.sampleSize}
- 난이도 경향: ${tendencyLabel}
- 시간 조정 배율: ${multiplierLabel}
- 참고 메모: ${learning.note}`;
}

/**
 * 할 일을 3~7개 하위 과제로 분해
 */
export async function analyzeTask(
  taskTitle: string,
  profile: Profile | null,
  hints?: TaskAnalysisHints
): Promise<AISubtaskSuggestion[]> {
  const studentOnly = isStudentOnly(profile);
  const taskLabel = studentOnly ? "다음 과제를" : "다음 할 일을";
  const levelLabel = studentOnly ? "학생의 수준을 고려하여" : "사용자의 수준을 고려하여";
  const profileLabel = studentOnly ? "학생 정보:" : "사용자 정보:";

  // 힌트 블록 조건부 생성
  const countHint = hints?.desiredSubtaskCount
    ? `사용자가 약 ${hints.desiredSubtaskCount}개의 단계로 나눠주길 원합니다.`
    : "3~7개의 하위 과제로 분해해주세요.";
  const durationHint = hints?.targetDurationMinutes
    ? `전체 소요 시간을 약 ${hints.targetDurationMinutes}분 이내로 계획해주세요.`
    : "";
  const memoHint = hints?.memo ? `상세 설명: ${hints.memo}` : "";
  const dueDateHint = hints?.dueDate ? `마감일: ${hints.dueDate}` : "";

  const hintsBlock = [memoHint, durationHint, dueDateHint]
    .filter(Boolean)
    .join("\n");
  const personalityPaceBlock = buildPersonalityPacePromptBlock(profile);
  const difficultyLearningBlock = buildDifficultyLearningPromptBlock(hints?.difficultyLearning);

  const prompt = `${buildSystemIdentity(profile)}

${profileLabel}
${buildProfileContext(profile)}
${personalityPaceBlock}
${difficultyLearningBlock}

${taskLabel} ${countHint}
각 하위 과제에 대해 난이도(easy/medium/hard)와 예상 소요 시간(분)을 제안해주세요.

규칙:
- 쉬운 과제는 넉넉한 시간이 아니라 빠르게 처리할 수 있도록 짧은 시간을 제안
- 어려운 과제는 충분히 여유로운 시간을 제안 (서두르지 않도록)
- ${levelLabel} 시간을 조정
- 성향×페이스 매트릭스 지침을 단계 구성과 시간 추정에 반영
- 난이도 학습 힌트를 참고해 사용자의 조정 경향에 맞춤
- 최소 5분, 최대 120분 범위

할 일: "${taskTitle}"
${hintsBlock ? hintsBlock + "\n" : ""}
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:
[
  { "title": "하위 과제 제목", "difficulty": "easy|medium|hard", "estimated_minutes": 숫자 }
]`;

  let parsed: AISubtaskSuggestion[];
  try {
    const result = await geminiModel.generateContent(prompt);
    const text = result.response.text();
    parsed = parseJsonResponse(text) as AISubtaskSuggestion[];
  } catch (error) {
    throw mapGeminiError(error);
  }

  // 유효성 검증
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(AI_ERRORS.RESPONSE_INVALID);
  }

  const normalized = parsed.map((item) => ({
    title: String(item.title),
    difficulty: (["easy", "medium", "hard"].includes(item.difficulty) ? item.difficulty : "medium") as AISubtaskSuggestion["difficulty"],
    estimated_minutes: Math.max(5, Math.min(120, Math.round(Number(item.estimated_minutes) || 15))),
  }));

  return applyDifficultyLearning(normalized, hints?.difficultyLearning, 5, 120);
}

/**
 * 삶의 장면을 영역 + 나의 발걸음(stride)으로 분석 (온보딩 Step 3)
 */
export async function analyzeLifeScene(
  input: AnalyzeLifeSceneInput
): Promise<LifeSceneAnalysisResult> {
  const sceneText = input.sceneText.trim();
  if (!sceneText) {
    throw new Error("삶의 장면을 입력해주세요.");
  }
  if (!Number.isFinite(input.age) || input.age < 0 || input.age > 100) {
    throw new Error("나이 값이 올바르지 않습니다.");
  }

  const strideScope = input.strideScope ?? null;
  const scopeHintLine = strideScope
    ? `- 버킷의 중심 발걸음 힌트: ${STRIDE_LABELS[strideScope]} (${strideScope})`
    : "- 버킷의 중심 발걸음 힌트: 자동 판단";
  const lifeAreaHint = input.lifeAreaHint?.trim() || null;
  const lifeAreaHintLine = lifeAreaHint
    ? `- 사용자가 선택한 영역 힌트: ${lifeAreaHint} (다른 영역이 더 자연스러우면 그쪽으로 분류해도 됩니다)`
    : "- 사용자가 선택한 영역 힌트: 자동 판단";

  const prompt = `당신은 slowgoes 앱의 온보딩 AI 코치입니다.
사용자의 삶의 장면을 다음 3가지로 분해하세요.

1) 삶의 영역 분류 (건강/관계/성장/경험/일/돈/내면 중 1개)
2) "나의 발걸음(stride)" 분해 — 3가지 카테고리로 구성:
   a) "언젠가"(someday) — 반드시 1개 포함. 이 장면의 궁극적 지향점/비전.
   b) 중간 단계 1~3개 — this_month, this_season, this_year, five_years, decade 중 버킷 성격에 맞춰 선택. 추상→구체 스펙트럼.
   c) 짧은 단계 정확히 2개 — today 또는 this_week에서 선택. "버킷을 위한 투두"로 즉시 실행 가능한 구체 행동. 사용자가 둘 중 하나를 선택한다.
   - 배열은 짧은 → 긴 순으로 정렬
3) 루틴 제안 정확히 2개
   - 각 루틴은 반복 단위(repeatUnit)와 반복 값(repeatValue)을 포함
   - repeatUnit: daily 또는 weekly
   - 사용자가 둘 중 하나를 선택한다

사용자 정보:
- 나이: ${input.age}
- 성별: ${input.gender}
- 성향: ${input.personalityType}
- 삶의 장면: "${sceneText}"
${scopeHintLine}
${lifeAreaHintLine}

규칙:
- 문장은 한국어로 작성
- 공감 메시지는 짧고 따뜻하게 1문장
- someday의 action은 "~하는 사람이 되고 싶다" 같은 비전 문장
- 중간 단계는 해당 기간에 맞는 구체 목표/마일스톤
- 짧은 단계(today/this_week)의 action은 지금 바로 시작 가능한 구체 행동
- suggestedRoutines는 정확히 2개, 서로 다른 성격의 루틴

아래 JSON 객체만 응답하세요:
{
  "lifeArea": "건강|관계|성장|경험|일|돈|내면",
  "empathyMessage": "공감 메시지",
  "strides": [
    { "level": "today", "label": "오늘", "action": "..." },
    { "level": "this_week", "label": "이번 주", "action": "..." },
    { "level": "this_month", "label": "이번 달", "action": "..." },
    { "level": "this_year", "label": "1년 안", "action": "..." },
    { "level": "someday", "label": "언젠가", "action": "..." }
  ],
  "suggestedRoutines": [
    { "title": "루틴 제목", "repeatUnit": "daily|weekly", "repeatValue": 숫자 },
    { "title": "루틴 제목", "repeatUnit": "daily|weekly", "repeatValue": 숫자 }
  ]
}`;

  let parsed: unknown;
  try {
    const result = await geminiModel.generateContent(prompt);
    parsed = parseJsonResponse(result.response.text());
  } catch (error) {
    throw mapGeminiError(error);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(AI_ERRORS.RESPONSE_INVALID);
  }

  const object = parsed as {
    lifeArea?: unknown;
    empathyMessage?: unknown;
    strides?: unknown;
    horizons?: unknown;
    suggestedRoutines?: unknown;
  };

  const lifeArea = normalizeLifeArea(object.lifeArea, sceneText);
  const empathyMessage =
    toNonEmptyText(object.empathyMessage) ?? `${lifeArea}에 대한 장면이네요, 멋져요.`;
  // legacy 키 "horizons"도 fallback으로 수용
  const strides = normalizeStrides(
    object.strides ?? object.horizons,
    sceneText,
    strideScope
  );
  const suggestedRoutines = normalizeSuggestedRoutines(
    object.suggestedRoutines,
    sceneText
  );

  return {
    lifeArea,
    empathyMessage,
    strides,
    suggestedRoutines,
  };
}

/**
 * 선택한 이번 주 행동을 첫 실행안으로 구체화 (온보딩 Step 4)
 */
export async function generateFirstStep(
  input: GenerateFirstStepInput
): Promise<FirstStepPlanResult> {
  const weeklyAction = input.weeklyAction.trim();
  const sceneText = input.sceneText.trim();
  const lifeArea = input.lifeArea.trim();

  if (!weeklyAction) {
    throw new Error("이번 주 행동이 비어 있습니다.");
  }
  if (!sceneText) {
    throw new Error("삶의 장면이 비어 있습니다.");
  }
  if (!Number.isFinite(input.age) || input.age < 0 || input.age > 100) {
    throw new Error("나이 값이 올바르지 않습니다.");
  }

  const prompt = `당신은 slowgoes 앱의 실행 코치입니다.
사용자의 '이번 주 한 걸음'을 바로 실행 가능한 세부 단계로 나눠주세요.

사용자 정보:
- 나이: ${input.age}
- 성별: ${input.gender}
- 성향: ${input.personalityType}
- 삶의 영역: ${lifeArea || "미정"}
- 삶의 장면: "${sceneText}"
- 이번 주 한 걸음: "${weeklyAction}"

규칙:
- 하위 단계는 2~4개
- 각 단계는 5~40분 사이
- 지나치게 추상적인 문장 금지, 즉시 실행 가능한 문장으로 작성
- 전체 난이도는 easy|medium|hard 중 하나
- 전체 예상 시간은 하위 단계 합에 맞춰 현실적으로 제시
- 한국어로 작성

아래 JSON 객체만 응답하세요:
{
  "estimatedMinutes": 숫자,
  "difficulty": "easy|medium|hard",
  "subtasks": [
    { "title": "단계 제목", "difficulty": "easy|medium|hard", "estimated_minutes": 숫자 }
  ]
}`;

  let parsed: unknown;
  try {
    const result = await geminiModel.generateContent(prompt);
    parsed = parseJsonResponse(result.response.text());
  } catch (error) {
    throw mapGeminiError(error);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(AI_ERRORS.RESPONSE_INVALID);
  }

  const row = parsed as {
    estimatedMinutes?: unknown;
    estimated_minutes?: unknown;
    difficulty?: unknown;
    subtasks?: unknown;
  };

  let subtasks = normalizeAISubtasks(row.subtasks, {
    minMinutes: 5,
    maxMinutes: 40,
    fallbackMinutes: 10,
    fallbackTitlePrefix: "실행 단계",
  });

  if (subtasks.length === 0) {
    subtasks = [
      { title: `${weeklyAction} 관련 정보 1개 찾기`, difficulty: "easy", estimated_minutes: 5 },
      { title: `${weeklyAction} 바로 시작할 행동 1개 정하기`, difficulty: "easy", estimated_minutes: 10 },
    ];
  }

  const estimatedFromSubtasks = subtasks.reduce((sum, item) => sum + item.estimated_minutes, 0);
  const estimatedMinutes = normalizeEstimatedMinutes(
    row.estimatedMinutes ?? row.estimated_minutes ?? estimatedFromSubtasks,
    5,
    180,
    estimatedFromSubtasks
  );

  const difficulty = normalizeDifficulty(row.difficulty, "medium");

  return {
    estimatedMinutes,
    difficulty,
    subtasks,
  };
}

/**
 * 페이스 조정 (Step 4) — 현재는 "더 구체적으로" 선택 시에만 AI 재호출
 */
export async function adjustPacePlan(
  input: AdjustPacePlanInput
): Promise<FirstStepPlanResult> {
  if (input.option !== "more_specific") {
    return input.currentPlan;
  }

  const weeklyAction = input.weeklyAction.trim();
  const sceneText = input.sceneText.trim();
  const lifeArea = input.lifeArea.trim();

  if (!weeklyAction) {
    throw new Error("이번 주 행동이 비어 있습니다.");
  }
  if (!sceneText) {
    throw new Error("삶의 장면이 비어 있습니다.");
  }
  if (!Number.isFinite(input.age) || input.age < 0 || input.age > 100) {
    throw new Error("나이 값이 올바르지 않습니다.");
  }

  const currentSubtasks = input.currentPlan.subtasks
    .map((subtask, index) =>
      `${index + 1}. ${subtask.title} (${subtask.estimated_minutes}분, ${subtask.difficulty})`
    )
    .join("\n");

  const prompt = `당신은 slowgoes 앱의 실행 코치입니다.
사용자가 이미 만든 실행안을 "더 구체적으로" 조정하고 싶어합니다.
현재 실행안을 유지하면서 더 세분화된 단계로 바꿔주세요.

사용자 정보:
- 나이: ${input.age}
- 성별: ${input.gender}
- 성향: ${input.personalityType}
- 삶의 영역: ${lifeArea || "미정"}
- 삶의 장면: "${sceneText}"
- 이번 주 한 걸음: "${weeklyAction}"

현재 실행안:
${currentSubtasks || "(세부 단계 없음)"}

규칙:
- 기존 의도는 유지하고, 단계만 더 구체적으로 나눌 것
- 하위 단계는 3~6개
- 각 단계는 5~30분 사이
- 전체 난이도는 easy|medium|hard 중 하나
- 한국어로 작성

아래 JSON 객체만 응답하세요:
{
  "estimatedMinutes": 숫자,
  "difficulty": "easy|medium|hard",
  "subtasks": [
    { "title": "단계 제목", "difficulty": "easy|medium|hard", "estimated_minutes": 숫자 }
  ]
}`;

  let parsed: unknown;
  try {
    const result = await geminiModel.generateContent(prompt);
    parsed = parseJsonResponse(result.response.text());
  } catch (error) {
    throw mapGeminiError(error);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(AI_ERRORS.RESPONSE_INVALID);
  }

  const row = parsed as {
    estimatedMinutes?: unknown;
    estimated_minutes?: unknown;
    difficulty?: unknown;
    subtasks?: unknown;
  };

  let subtasks = normalizeAISubtasks(row.subtasks, {
    minMinutes: 5,
    maxMinutes: 30,
    fallbackMinutes: 10,
    fallbackTitlePrefix: "실행 단계",
  });

  // "더 구체적으로" 요청인데 단계가 줄어드는 경우를 방지하기 위한 최소 보정
  if (subtasks.length <= input.currentPlan.subtasks.length) {
    const fallbackSubtasks: AISubtaskSuggestion[] = [
      {
        title: `${weeklyAction} 시작 전 체크리스트 1개 작성하기`,
        difficulty: "easy",
        estimated_minutes: 5,
      },
      ...input.currentPlan.subtasks.map((item) => ({
        title: item.title,
        difficulty: item.difficulty,
        estimated_minutes: normalizeEstimatedMinutes(item.estimated_minutes, 5, 30, 10),
      })),
    ];
    subtasks = fallbackSubtasks.slice(0, 6);
  }

  const estimatedFromSubtasks = subtasks.reduce((sum, item) => sum + item.estimated_minutes, 0);
  const estimatedMinutes = normalizeEstimatedMinutes(
    row.estimatedMinutes ?? row.estimated_minutes ?? estimatedFromSubtasks,
    5,
    180,
    estimatedFromSubtasks
  );
  const difficulty = normalizeDifficulty(row.difficulty, input.currentPlan.difficulty);

  return {
    estimatedMinutes,
    difficulty,
    subtasks,
  };
}

function buildFallbackDailyTodos(input: GenerateWeeklyItemsInput): Array<{ title: string }> {
  // 가장 짧은 stride의 action을 기본 데일리 투두로 사용
  const sorted = [...input.strides].sort(
    (a, b) => STRIDE_ORDER.indexOf(a.level) - STRIDE_ORDER.indexOf(b.level)
  );
  const shortest = sorted[0]?.action;
  return [
    {
      title: shortest ?? `${input.bucketTitle} 관련 이번 주 시작 행동 1개 하기`,
    },
  ];
}

function normalizeWeeklyItemsResult(
  raw: unknown,
  input: GenerateWeeklyItemsInput
): GenerateWeeklyItemsResult {
  const existing = new Set(
    (input.existingTitles ?? []).map((title) => title.trim().toLowerCase()).filter(Boolean)
  );

  let dailyTodos: Array<{ title: string }> = [];
  let routines: SuggestedRoutine[] = [];

  if (raw && typeof raw === "object") {
    const obj = raw as {
      dailyTodos?: unknown;
      daily_todos?: unknown;
      routines?: unknown;
      suggestedRoutines?: unknown;
      suggested_routines?: unknown;
    };

    const rawDailyTodos = Array.isArray(obj.dailyTodos)
      ? obj.dailyTodos
      : Array.isArray(obj.daily_todos)
        ? obj.daily_todos
        : [];

    dailyTodos = rawDailyTodos
      .map((row) => {
        if (typeof row === "string") {
          const title = row.trim();
          return title ? { title } : null;
        }
        const item = row as { title?: unknown };
        const title = toNonEmptyText(item.title);
        return title ? { title } : null;
      })
      .filter((row): row is { title: string } => Boolean(row));

    const rawRoutines = obj.routines ?? obj.suggestedRoutines ?? obj.suggested_routines;
    routines = normalizeSuggestedRoutines(rawRoutines, input.bucketTitle);
  }

  const dedupedTodos: Array<{ title: string }> = [];
  const seenTodo = new Set<string>();
  for (const item of dailyTodos) {
    const key = item.title.toLowerCase();
    if (seenTodo.has(key) || existing.has(key)) continue;
    seenTodo.add(key);
    dedupedTodos.push(item);
    if (dedupedTodos.length >= 3) break;
  }

  if (dedupedTodos.length === 0) {
    for (const fallback of buildFallbackDailyTodos(input)) {
      const key = fallback.title.toLowerCase();
      if (existing.has(key) || seenTodo.has(key)) continue;
      dedupedTodos.push(fallback);
      seenTodo.add(key);
      break;
    }
  }

  const dedupedRoutines: SuggestedRoutine[] = [];
  const seenRoutine = new Set<string>();
  for (const item of routines) {
    const key = item.title.toLowerCase();
    if (seenRoutine.has(key) || existing.has(key)) continue;
    seenRoutine.add(key);
    dedupedRoutines.push(item);
    if (dedupedRoutines.length >= 3) break;
  }

  if (dedupedRoutines.length === 0) {
    const fallbackRoutines = buildFallbackSuggestedRoutines(input.bucketTitle);
    for (const item of fallbackRoutines) {
      const key = item.title.toLowerCase();
      if (existing.has(key) || seenRoutine.has(key)) continue;
      dedupedRoutines.push(item);
      if (dedupedRoutines.length >= 2) break;
    }
  }

  return {
    dailyTodos: dedupedTodos,
    routines: dedupedRoutines,
  };
}

/**
 * 대시보드 추천 카드에서 "이번주"를 누를 때, 데일리투두+루틴을 생성하기 위한 AI 추천
 */
export async function generateWeeklyItems(
  input: GenerateWeeklyItemsInput
): Promise<GenerateWeeklyItemsResult> {
  const bucketTitle = input.bucketTitle.trim();
  const lifeArea = input.lifeArea.trim();

  if (!bucketTitle) {
    throw new Error(BUCKET_ERRORS.TITLE_EMPTY);
  }
  if (!lifeArea) {
    throw new Error(STRIDE_ERRORS.LIFE_AREA_EMPTY);
  }

  const stridesSummary = input.strides
    .map((item) => `${item.label}: ${item.action}`)
    .join("\n");
  const existingTitles = (input.existingTitles ?? []).filter(Boolean).join(" | ") || "없음";

  const prompt = `당신은 slowgoes 앱의 실행 코치입니다.
아래 버킷의 맥락을 바탕으로 이번 주에 추가할 항목을 추천하세요.

입력:
- 버킷: ${bucketTitle}
- 삶의 영역: ${lifeArea}
- 나의 발걸음:
${stridesSummary || "- 정보 없음"}
- 기존 항목 제목(중복 금지): ${existingTitles}

출력 규칙:
- dailyTodos: 이번 주에 실천할 일회성 작은 행동 1~2개
- routines: 반복 루틴 1~2개 (repeatUnit: daily|weekly, repeatValue: 1 이상의 정수)
- 문장은 한국어
- 추상적 표현 금지, 바로 실행 가능한 문장

아래 JSON 객체만 응답하세요:
{
  "dailyTodos": [
    { "title": "..." }
  ],
  "routines": [
    { "title": "...", "repeatUnit": "daily|weekly", "repeatValue": 숫자 }
  ]
}`;

  let parsed: unknown;
  try {
    const result = await geminiModel.generateContent(prompt);
    parsed = parseJsonResponse(result.response.text());
  } catch (error) {
    throw mapGeminiError(error);
  }

  return normalizeWeeklyItemsResult(parsed, input);
}

/**
 * "한걸음 더" 시트용 — 데일리 투두 1개 또는 루틴 1개만 단건 추천.
 * 사용자가 시트를 열거나 부분 새로고침(↻)을 누를 때 호출.
 *
 * 미리보기용 — DB 저장은 별도 applyNextStepAction에서 처리.
 */
interface GenerateSingleNextStepInput {
  bucketTitle: string;
  lifeArea: string;
  strides: StrideItem[];
  type: "daily_todo" | "routine";
  /** 중복 방지를 위해 이미 표시 중인 항목 제목 (부분 새로고침 시) */
  excludeTitles?: string[];
}

export type SingleNextStepDailyResult = { type: "daily_todo"; title: string };
export type SingleNextStepRoutineResult = {
  type: "routine";
  title: string;
  repeatUnit: SuggestedRoutine["repeatUnit"];
  repeatValue: SuggestedRoutine["repeatValue"];
};
export type SingleNextStepResult = SingleNextStepDailyResult | SingleNextStepRoutineResult;

export async function generateSingleNextStep(
  input: GenerateSingleNextStepInput
): Promise<SingleNextStepResult> {
  const bucketTitle = input.bucketTitle.trim();
  const lifeArea = input.lifeArea.trim();

  if (!bucketTitle) throw new Error(BUCKET_ERRORS.TITLE_EMPTY);
  if (!lifeArea) throw new Error(STRIDE_ERRORS.LIFE_AREA_EMPTY);

  // 단건 호출이라도 generateWeeklyItems를 재사용해 응답 구조의 일관성 유지.
  // type에 따라 결과의 첫 번째 항목만 추출.
  const weekly = await generateWeeklyItems({
    bucketTitle,
    lifeArea,
    strides: input.strides,
    existingTitles: input.excludeTitles ?? [],
  });

  if (input.type === "daily_todo") {
    const first = weekly.dailyTodos[0];
    if (!first) {
      throw new Error("새 데일리 투두 추천 결과가 비어 있습니다.");
    }
    return { type: "daily_todo", title: first.title };
  }

  const firstRoutine = weekly.routines[0];
  if (!firstRoutine) {
    throw new Error("새 루틴 추천 결과가 비어 있습니다.");
  }
  return {
    type: "routine",
    title: firstRoutine.title,
    repeatUnit: firstRoutine.repeatUnit,
    repeatValue: firstRoutine.repeatValue,
  };
}

function truncateActionTip(text: string): string {
  if (text.length <= 220) return text;
  return `${text.slice(0, 217).trim()}...`;
}

/**
 * 행동하기 바텀시트용 AI 조언 생성
 */
export async function generateActionTip(
  input: GenerateActionTipInput
): Promise<string> {
  const itemTitle = input.itemTitle.trim();
  if (!itemTitle) {
    throw new Error(STRIDE_ERRORS.ITEM_TITLE_EMPTY);
  }

  const itemTypeLabel = input.itemType === "routine" ? "작은 루틴" : "작은 할 일";
  const profileContext = buildProfileContext(input.profile ?? null);
  const personalityPaceBlock = buildPersonalityPacePromptBlock(input.profile ?? null);
  const bucketLabel = input.bucketTitle?.trim() || "미연결";
  const lifeArea = input.lifeArea?.trim() || "미정";

  const prompt = `당신은 slowgoes 앱의 행동 코치입니다.
사용자가 지금 바로 행동을 시작하도록 짧은 조언 1개를 작성하세요.

항목 정보:
- 유형: ${itemTypeLabel}
- 제목: ${itemTitle}
- 버킷: ${bucketLabel}
- 삶의 영역: ${lifeArea}

사용자 맥락:
${profileContext}
${personalityPaceBlock}

규칙:
- 한국어 1~2문장
- 지나치게 추상적이거나 장황한 표현 금지
- 당장 시작 가능한 첫 행동을 포함

아래 JSON 객체만 응답하세요:
{ "tip": "..." }`;

  let parsed: unknown;
  try {
    const result = await geminiModel.generateContent(prompt);
    parsed = parseJsonResponse(result.response.text());
  } catch (error) {
    throw mapGeminiError(error);
  }

  if (!parsed || typeof parsed !== "object") {
    return `${itemTitle}은(는) 5분만 써서 첫 단계를 시작해보세요.`;
  }

  const tip = toNonEmptyText((parsed as { tip?: unknown }).tip);
  if (!tip) {
    return `${itemTitle}은(는) 5분만 써서 첫 단계를 시작해보세요.`;
  }

  return truncateActionTip(tip);
}

/**
 * 하위 과제를 2~4개로 추가 분해 (depth +1)
 */
export async function decomposeSubtask(
  parentTitle: string,
  taskTitle: string,
  profile: Profile | null,
  difficultyLearning?: DifficultyLearningHint | null
): Promise<AISubtaskSuggestion[]> {
  const studentOnly = isStudentOnly(profile);
  const levelLabel = studentOnly ? "학생의 수준을 고려" : "사용자의 수준을 고려";
  const profileLabel = studentOnly ? "학생 정보:" : "사용자 정보:";
  const taskLabel = studentOnly ? "상위 과제" : "상위 할 일";
  const subtaskLabel = studentOnly ? "분해할 하위 과제" : "분해할 세부 항목";
  const personalityPaceBlock = buildPersonalityPacePromptBlock(profile);
  const difficultyLearningBlock = buildDifficultyLearningPromptBlock(difficultyLearning);

  const prompt = `${buildSystemIdentity(profile)}

${profileLabel}
${buildProfileContext(profile)}
${personalityPaceBlock}
${difficultyLearningBlock}

${taskLabel}: "${taskTitle}"
${subtaskLabel}: "${parentTitle}"

이 항목을 2~4개의 더 작은 단계로 분해해주세요.
각 단계에 대해 난이도(easy/medium/hard)와 예상 소요 시간(분)을 제안해주세요.

규칙:
- 쉬운 단계는 짧은 시간, 어려운 단계는 여유로운 시간
- ${levelLabel}
- 성향×페이스 매트릭스 지침을 단계 분해 방식에 반영
- 난이도 학습 힌트를 참고해 사용자의 조정 경향에 맞춤
- 최소 5분, 최대 60분 범위

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:
[
  { "title": "단계 제목", "difficulty": "easy|medium|hard", "estimated_minutes": 숫자 }
]`;

  let parsed: AISubtaskSuggestion[];
  try {
    const result = await geminiModel.generateContent(prompt);
    const text = result.response.text();
    parsed = parseJsonResponse(text) as AISubtaskSuggestion[];
  } catch (error) {
    throw mapGeminiError(error);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(AI_ERRORS.RESPONSE_INVALID);
  }

  const normalized = parsed.map((item) => ({
    title: String(item.title),
    difficulty: (["easy", "medium", "hard"].includes(item.difficulty) ? item.difficulty : "medium") as AISubtaskSuggestion["difficulty"],
    estimated_minutes: Math.max(5, Math.min(60, Math.round(Number(item.estimated_minutes) || 10))),
  }));

  return applyDifficultyLearning(normalized, difficultyLearning, 5, 60);
}

/**
 * 단일 stride(발걸음) 재생성 — 특정 레벨의 action 하나만 새로 제안
 */
export async function regenerateSingleStride(
  input: RegenerateSingleStrideInput
): Promise<StrideItem> {
  const bucketTitle = input.bucketTitle.trim();
  const lifeArea = input.lifeArea.trim();
  const targetLevel = input.targetLevel;

  if (!bucketTitle) {
    throw new Error(BUCKET_ERRORS.TITLE_EMPTY);
  }
  if (!STRIDE_ORDER.includes(targetLevel)) {
    throw new Error(STRIDE_ERRORS.LEVEL_INVALID_ALT);
  }

  const existingSummary = input.existingStrides
    .map((item) => `${item.label}: ${item.action}`)
    .join("\n");

  const targetLabel = STRIDE_LABELS[targetLevel];
  const isShortest =
    input.existingStrides.length > 0 &&
    [...input.existingStrides].sort(
      (a, b) => STRIDE_ORDER.indexOf(a.level) - STRIDE_ORDER.indexOf(b.level)
    )[0].level === targetLevel;

  const prompt = `당신은 slowgoes 앱의 실행 코치입니다.
사용자가 특정 "나의 발걸음(stride)" 단계의 행동만 새로 추천받고 싶어합니다.

입력:
- 버킷: "${bucketTitle}"
- 삶의 영역: ${lifeArea || "미정"}
- 기존 발걸음:
${existingSummary || "- 정보 없음"}
- 재생성 대상 레벨: ${targetLevel} (${targetLabel})

규칙:
- 다른 단계는 건드리지 말고, 대상 레벨 1개의 action만 새로 제안
- 한국어 1문장
- ${isShortest ? "짧은 단계이므로 지금 당장 실행 가능한 구체 행동" : "긴 단계이므로 지향점을 나타내는 간결한 문장"}
- 기존 action과 중복 금지

아래 JSON 객체만 응답하세요:
{ "level": "${targetLevel}", "label": "${targetLabel}", "action": "..." }`;

  let parsed: unknown;
  try {
    const result = await geminiModel.generateContent(prompt);
    parsed = parseJsonResponse(result.response.text());
  } catch (error) {
    throw mapGeminiError(error);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(AI_ERRORS.RESPONSE_INVALID);
  }

  const row = parsed as { level?: unknown; label?: unknown; action?: unknown };
  const action = toNonEmptyText(row.action);
  if (!action) {
    throw new Error(STRIDE_ERRORS.REGENERATE_RESULT_EMPTY);
  }

  return {
    level: targetLevel,
    label: targetLabel,
    action,
  };
}
