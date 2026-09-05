// AI 장면 분석 — Gemini API로 삶의 장면을 발걸음(stride) + 데일리/루틴으로 분해
//
// 책임 (PR 5 정리 후):
// - 온보딩 장면 분석 (analyzeLifeScene)
// - "한걸음 더" 시트의 단건 추천 (generateSingleNextStep)
// - 발걸음 단건 새로고침 (regenerateSingleStride)
// - 발걸음 다건 추가 추천 (generateWeeklyItems) — generateSingleNextStep이 내부 재사용
//
// 폐기 이력 (PR 5):
// - analyzeTask / decomposeSubtask: v1 task 분해 흐름. 호출처 0
// - generateFirstStep / adjustPacePlan: v1 온보딩 Step 4. 호출처 0
// - generateActionTip: "행동하기" 시트의 AI 조언. UX와 함께 폐기

import { geminiModel } from "./gemini";
import { AI_ERRORS, BUCKET_ERRORS, STRIDE_ERRORS } from "@/lib/constants";
import type {
  Gender,
  LifeSceneAnalysisResult,
  PersonalityType,
  StrideItem,
  StrideLevel,
  StrideScope,
  SuggestedRoutine,
} from "@/types";

const LIFE_AREA_OPTIONS = ["건강", "관계", "성장", "경험", "일", "돈", "내면"] as const;

/**
 * "다음 목표" 프롬프트에 실을 완료 할 일 개수 상한.
 * 다음 한 단계를 정하는 데는 최근 흐름이면 충분하고, 늘릴수록 토큰만 는다.
 */
export const COMPLETED_TODOS_FOR_PROMPT = 30;

// 나의 발걸음(stride) — 짧은 → 긴 순서
export const STRIDE_LABELS: Record<StrideLevel, string> = {
  today: "오늘",
  this_week: "이번 주",
  this_month: "이번 달",
  this_season: "이번 시즌",
  this_year: "올해안",
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
 *
 * 사용처 (PR 8 이전): StrideSection의 단일 카드 리스트 + 한걸음 더 시트.
 * PR 8 이후: 발걸음 3섹션 분리(splitStridesByGroup)로 대체. 한걸음 더 시트만 유지.
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

// 발걸음 3섹션 분류 (PR 8 → PR 18 단순화)
// - 지향점: someday + this_year + (five_years/decade는 fallback으로 포함)
// - 실행계획: this_month 한 가지만 (PR 18 단순화 — 인지부하 ↓)
//   - today/this_week/this_season은 stride_plan에 데이터가 있어도 화면에 표시하지 않음
//     (실행계획은 daily_todos가 일주일/한 달 단위 행동을 담당)
const DIRECTION_LEVELS = new Set<StrideLevel>(["someday", "this_year", "five_years", "decade"]);
const EXECUTION_LEVELS = new Set<StrideLevel>(["this_month"]);

/**
 * strides를 "지향점"(direction)과 "실행계획"(execution: this_month)으로 분류.
 * - direction: 긴→짧은 순 (언젠가 먼저)
 * - execution: this_month 1개만 (PR 18)
 * - today/this_week/this_season 레벨은 둘 다 아닌 상태 → 화면에서 제외
 */
export function splitStridesByGroup(strides: StrideItem[]): {
  direction: StrideItem[];
  execution: StrideItem[];
} {
  const direction: StrideItem[] = [];
  const execution: StrideItem[] = [];
  for (const s of strides) {
    if (EXECUTION_LEVELS.has(s.level)) {
      execution.push(s);
    } else if (DIRECTION_LEVELS.has(s.level)) {
      direction.push(s);
    }
    // 그 외 (today/this_week/this_season) — PR 18 단순화로 카드 표시 안 함
  }
  // 직관적 순서: 지향점은 긴→짧은 (언젠가 먼저). 실행계획은 1개라 정렬 불필요.
  direction.sort(
    (a, b) => STRIDE_ORDER.indexOf(b.level) - STRIDE_ORDER.indexOf(a.level)
  );
  return { direction, execution };
}

// DIRECTION_LEVELS/EXECUTION_LEVELS은 외부에서도 분류 일관성 위해 노출
export { DIRECTION_LEVELS, EXECUTION_LEVELS };

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

// JSON 응답에서 마크다운 코드펜스 제거
function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  return JSON.parse(cleaned);
}

// Gemini 에러를 사용자 친화 메시지로 변환
export function mapGeminiError(error: unknown): Error {
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
/**
 * PR 17: AI가 만든 stride action 텍스트의 어조를 가볍게 normalize.
 * 어색한 강제 변환은 피하고, 명백한 어미 약속어/구두점만 정리.
 */
function normalizeStrideAction(level: StrideLevel, raw: string): string {
  let result = raw.trim();

  // 흔한 약속어 어미 → 평서형 (단정적 진술)
  // 예: "산책할 것이다." → "산책한다"
  result = result
    .replace(/할\s*것이다\.?$/u, "한다")
    .replace(/할\s*거야\.?$/u, "한다")
    .replace(/할\s*예정이다\.?$/u, "한다")
    .replace(/하기로\s*한다\.?$/u, "한다");

  // 마침표 정리 (연속 마침표 → 한 개)
  result = result.replace(/\.{2,}$/u, ".");

  // someday/this_year에서 "~하고 싶다" 류는 그대로 두되, "~하기" → "~하는 사람"
  // 너무 강제적이라 보류 — 추후 필요 시 활성화
  void level; // 현재는 level별 분기 없이 공통 normalize만

  return result;
}

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
    // PR 17: 어조 normalize 적용
    action: normalizeStrideAction(level, perLevel.get(level)![0]),
  }));

  // today/this_week(= 버킷을 위한 투두)이 하나도 없으면 보충.
  //
  // 온보딩 Step 3은 이 짧은 발걸음 중 하나를 골라야 다음으로 갈 수 있다. AI가 긴 레벨만
  // 돌려주면 고를 것이 없어 **"다음"이 영구 비활성**이 된다(예전엔 루틴 자동 선택이
  // 우연히 안전망 역할을 했다). someday와 같은 급으로 보장한다.
  if (!items.some((i) => STRIDE_ORDER.indexOf(i.level) < STRIDE_BOUNDARY_INDEX)) {
    const shortFallback = fallback.find(
      (f) => STRIDE_ORDER.indexOf(f.level) < STRIDE_BOUNDARY_INDEX
    );
    items.push(
      shortFallback ?? {
        level: "this_week",
        label: STRIDE_LABELS.this_week,
        action: buildStrideFallbackAction(sceneText, "this_week"),
      }
    );
  }

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
  /**
   * 사용자가 실제로 완료한 할 일 제목들 (최근순).
   * "다음 목표" 흐름에서 넘긴다 — 지금까지의 실행을 근거로 다음 단계를 세우기 위해.
   * 비어 있으면 프롬프트에서 통째로 빠진다(기존 재생성 동작 그대로).
   */
  completedTodoTitles?: string[];
}

interface GenerateWeeklyItemsResult {
  dailyTodos: Array<{ title: string }>;
  routines: SuggestedRoutine[];
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

사용자 정보:
- 나이: ${input.age}
- 성별: ${input.gender}
- 성향(MBTI): ${input.personalityType} (2글자면 I/E·T/F 두 축만 응답한 것 — 아는 만큼만 반영하고 나머지는 추측하지 말 것)
- 삶의 장면: "${sceneText}"
${scopeHintLine}
${lifeAreaHintLine}

규칙:
- 문장은 한국어로 작성

어조 가이드 (PR 17):
- "언젠가"(someday): 비전 문장. 어미는 "~한 사람이 되어 있다", "~을 즐기는 사람", "~의 길을 걸어가고 있다" 등 정체성 진술 형식.
- "올해안"(this_year): 마일스톤 문장. 어미는 "~한 모습으로 자리 잡는다", "~의 토대를 마련한다" 등 도달 상태 진술.
- "이번 시즌/이번 달"(this_season/this_month): 시기 선언 문장. "이번 (시즌|달)은 ~을 하는 (시즌|달)이다", "~의 (시즌|달)이다" 형식 권장.
- "이번 주/오늘"(this_week/today): 즉시 실행 가능한 구체 행동. "~을 실행한다", "~한다", "~을 시작한다" 등 능동적 어미.
- 일관성: 어색하면 자연스러운 한국어 표현을 우선. 강제하지 말 것.

아래 JSON 객체만 응답하세요:
{
  "lifeArea": "건강|관계|성장|경험|일|돈|내면",
  "strides": [
    { "level": "today", "label": "오늘", "action": "..." },
    { "level": "this_week", "label": "이번 주", "action": "..." },
    { "level": "this_month", "label": "이번 달", "action": "..." },
    { "level": "this_year", "label": "올해안", "action": "..." },
    { "level": "someday", "label": "언젠가", "action": "..." }
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
    strides?: unknown;
    horizons?: unknown;
  };

  const lifeArea = normalizeLifeArea(object.lifeArea, sceneText);
  // legacy 키 "horizons"도 fallback으로 수용
  const strides = normalizeStrides(
    object.strides ?? object.horizons,
    sceneText,
    strideScope
  );
  // 루틴은 더 이상 요구하지도 파싱하지도 않는다.
  // normalizeSuggestedRoutines를 계속 부르면 응답에 필드가 없을 때 폴백 2개를
  // **자동 생성**해(throw가 아니다) 아무도 본 적 없는 더미가 stride_plans에 저장된다.
  return {
    lifeArea,
    strides,
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
 * AI 투두 자동생성 — 정확히 3개의 실행 가능한 투두를 추천.
 *
 * 품질 규칙의 단일 기준은 루트 `aiprompt.md` — 이 프롬프트는 그 규칙을 구현한다.
 * (규칙 변경 시 aiprompt.md와 이 함수를 함께 수정)
 *
 * 컨텍스트: 지향점 3단(핵심) + MBTI + 나이 + 최근 일기 발췌 + 기존 제목(중복 금지).
 */
export interface GenerateTodoSuggestionsInput {
  bucketTitle: string;
  lifeArea: string;
  /** 지향점: 언젠가/올해안/해당 달 발걸음 */
  strides: StrideItem[];
  personalityType?: string | null;
  age?: number | null;
  /** 최근 일기 발췌 (각 ~200자) — 현재 관심사 반영용 */
  recentDiaryNotes?: string[];
  /** 중복 금지 목록 */
  existingTitles?: string[];
  /** 기준 날짜 (캘린더 선택 날짜, YYYY-MM-DD) */
  baseDate?: string;
}

export async function generateTodoSuggestions(
  input: GenerateTodoSuggestionsInput
): Promise<string[]> {
  const bucketTitle = input.bucketTitle.trim();
  const lifeArea = input.lifeArea.trim();

  if (!bucketTitle) throw new Error(BUCKET_ERRORS.TITLE_EMPTY);
  if (!lifeArea) throw new Error(STRIDE_ERRORS.LIFE_AREA_EMPTY);

  const stridesSummary = input.strides
    .map((item) => `- ${item.label}: ${item.action}`)
    .join("\n");
  const existingTitles =
    (input.existingTitles ?? []).filter(Boolean).join(" | ") || "없음";
  const diaryNotes =
    (input.recentDiaryNotes ?? [])
      .filter(Boolean)
      .map((note, i) => `${i + 1}. ${note}`)
      .join("\n") || "없음";

  // aiprompt.md 규칙 구현 프롬프트
  const prompt = `당신은 slowgoes 앱의 실행 코치입니다.
유저가 "지금 바로 시작할 수 있는" 투두 3개를 추천하세요.
완벽한 계획이 아니라 "70점짜리 행동" — 어설퍼도 오늘 착수할 수 있는 행동 — 을 지향합니다.

컨텍스트:
- 버킷: ${bucketTitle}
- 삶의 영역: ${lifeArea}
- 지향점 (투두는 가장 짧은 지평의 발걸음에 직결되어야 하고, 나머지는 방향의 배경):
${stridesSummary || "- 정보 없음"}
- 유저 성향(MBTI): ${input.personalityType ?? "정보 없음"} (2글자면 I/E·T/F 두 축만 응답한 것이니 아는 만큼만 반영. I형이면 혼자 시작 가능한 행동 우선, E형이면 사람과 연결되는 행동 허용, T형이면 근거·수치가 드러나는 행동, F형이면 의미·관계가 드러나는 행동. J/P가 있으면 J는 계획·정리형, P는 즉흥·탐색형으로 조정)
- 나이: ${input.age != null ? `${input.age}세` : "정보 없음"}
- 최근 일기 발췌 (관심사·막힘이 드러나면 1개는 이것과 연결):
${diaryNotes}
- 기존 투두 제목(의미 중복 금지): ${existingTitles}
- 기준 날짜: ${input.baseDate ?? "오늘"}

품질 규칙:
1. 구체적 행동 동사로 시작 ("~알아보기" 같은 추상 금지, "~검색해서 후보 3개 적기"처럼)
2. 30~60분에 한 번에 끝낼 수 있는 크기
3. 완벽한 준비보다 어설픈 착수를 우선하는 문장
4. 개수·시간·산출물이 문장에 있어 완료 판정 가능할 것
5. 위 지향점을 실제로 전진시키는 행동만
6. 3개가 서로 다른 유형이 되게: 조사·준비형 / 실행·산출형 / 사람·환경 연결형 중 조합
7. "매일 ~하기" 같은 반복 전제 문장 금지 (반복은 유저가 별도 설정)

각 제목은 한국어, 40자 이내. 동기부여 문구·이모지·설명 없이 행동 문장만.
아래 JSON만 응답하세요:
{ "todos": [ { "title": "..." }, { "title": "..." }, { "title": "..." } ] }`;

  let parsed: unknown;
  try {
    const result = await geminiModel.generateContent(prompt);
    parsed = parseJsonResponse(result.response.text());
  } catch (error) {
    throw mapGeminiError(error);
  }

  // 정규화: 문자열 3개로 (중복·공백 제거, 최대 3개)
  const raw = (parsed as { todos?: Array<{ title?: unknown }> })?.todos;
  if (!Array.isArray(raw)) {
    throw new Error("AI 추천 결과 형식이 올바르지 않습니다.");
  }
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const item of raw) {
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    if (!title || seen.has(title)) continue;
    seen.add(title);
    titles.push(title);
    if (titles.length >= 3) break;
  }
  if (titles.length === 0) {
    throw new Error("AI 추천 결과가 비어 있습니다.");
  }
  return titles;
}

/**
 * AI 주간 목표 생성 — 이번 주 안에 끝낼 수 있는 목표 4~5개.
 *
 * 투두(하루 단위 착수)와 달리 **한 주의 성과 단위**다. 유저는 주간 시트의
 * 주간 목표 기록에서 이 제안을 골라 체크박스 목록으로 넣는다.
 * 품질 규칙의 단일 기준은 루트 `aiprompt.md`("주간 목표 생성" 절).
 */
export interface GenerateWeeklyGoalsInput {
  bucketTitle: string;
  lifeArea: string;
  strides: StrideItem[];
  personalityType?: string | null;
  age?: number | null;
  recentDiaryNotes?: string[];
  /** 그 주에 이미 등록된 투두 제목 — 의미 중복 방지 */
  existingTitles?: string[];
  /** 대상 주 범위 라벨 (예: "8.2 ~ 8.8") */
  weekRange?: string;
}

const WEEKLY_GOAL_MAX = 5;

export async function generateWeeklyGoals(
  input: GenerateWeeklyGoalsInput
): Promise<string[]> {
  const bucketTitle = input.bucketTitle.trim();
  const lifeArea = input.lifeArea.trim();

  if (!bucketTitle) throw new Error(BUCKET_ERRORS.TITLE_EMPTY);
  if (!lifeArea) throw new Error(STRIDE_ERRORS.LIFE_AREA_EMPTY);

  const stridesSummary = input.strides
    .map((item) => `- ${item.label}: ${item.action}`)
    .join("\n");
  const existingTitles =
    (input.existingTitles ?? []).filter(Boolean).join(" | ") || "없음";
  const diaryNotes =
    (input.recentDiaryNotes ?? [])
      .filter(Boolean)
      .map((note, i) => `${i + 1}. ${note}`)
      .join("\n") || "없음";

  const prompt = `당신은 slowgoes 앱의 실행 코치입니다.
유저가 **이번 주 안에 끝낼 수 있는** 목표 4~5개를 제안하세요.
하루짜리 할 일이 아니라 "이번 주가 끝났을 때 남아 있을 결과"를 씁니다.

컨텍스트:
- 버킷: ${bucketTitle}
- 삶의 영역: ${lifeArea}
- 이번 주 범위: ${input.weekRange ?? "이번 주"}
- 지향점 (목표는 가장 짧은 지평의 발걸음을 실제로 전진시켜야 한다):
${stridesSummary || "- 정보 없음"}
- 유저 성향(MBTI): ${input.personalityType ?? "정보 없음"} (2글자면 I/E·T/F 두 축만 응답한 것이니 아는 만큼만 반영. I형이면 혼자 진행 가능한 목표 우선, E형이면 사람과 연결되는 목표 허용, T형이면 근거·수치가 드러나는 목표, F형이면 의미·관계가 드러나는 목표. J/P가 있으면 J는 계획·정리형, P는 즉흥·탐색형으로 조정)
- 나이: ${input.age != null ? `${input.age}세` : "정보 없음"}
- 최근 일기 발췌 (관심사·막힘이 드러나면 1개는 이것과 연결):
${diaryNotes}
- 이미 등록된 할 일(의미 중복 금지): ${existingTitles}

품질 규칙:
1. 한 주(7일) 안에 완료 가능한 크기 — 한 달짜리 과제 금지
2. 개수·횟수·산출물이 문장에 있어 주말에 "됐다/안 됐다"를 판정할 수 있을 것
3. 구체적 행동 동사로 시작 ("~알아보기" 같은 추상 금지)
4. 완벽한 준비보다 어설픈 착수를 우선하는 문장
5. 서로 다른 유형으로 구성: 조사·준비형 / 실행·산출형 / 사람·환경 연결형 / 습관·반복형
6. 부담이 크지 않게 — 이번 주에 다 해도 벅차지 않을 분량

각 목표는 한국어, 40자 이내. 동기부여 문구·이모지·번호·설명 없이 목표 문장만.
아래 JSON만 응답하세요:
{ "goals": [ { "title": "..." }, { "title": "..." }, { "title": "..." }, { "title": "..." } ] }`;

  let parsed: unknown;
  try {
    const result = await geminiModel.generateContent(prompt);
    parsed = parseJsonResponse(result.response.text());
  } catch (error) {
    throw mapGeminiError(error);
  }

  const raw = (parsed as { goals?: Array<{ title?: unknown }> })?.goals;
  if (!Array.isArray(raw)) {
    throw new Error("AI 추천 결과 형식이 올바르지 않습니다.");
  }
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const item of raw) {
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    if (!title || seen.has(title)) continue;
    seen.add(title);
    titles.push(title);
    if (titles.length >= WEEKLY_GOAL_MAX) break;
  }
  if (titles.length === 0) {
    throw new Error("AI 추천 결과가 비어 있습니다.");
  }
  return titles;
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

  // "다음 목표" 흐름에서만 채워진다. 없으면 블록째 빠져 기존 프롬프트와 동일하다.
  const doneTitles = (input.completedTodoTitles ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, COMPLETED_TODOS_FOR_PROMPT);

  // 교체 대상 문장을 따로 못박는다. "기존 발걸음" 목록 안에만 있으면 모델이 그걸
  // 정답으로 읽고 그대로 되돌려준다 — 실제로 gemini-2.0-flash 가 그랬다.
  const currentAction =
    input.existingStrides.find((item) => item.level === targetLevel)?.action ?? "";

  const doneBlock = doneTitles.length
    ? `
- 사용자가 지금까지 실제로 해낸 일 (최근순):
${doneTitles.map((t) => `  - ${t}`).join("\n")}${
        currentAction
          ? `
- 이번에 교체할 현재 ${targetLabel} 목표: "${currentAction}"`
          : ""
      }`
    : "";

  const doneRules = doneTitles.length
    ? `
- 해낸 일 목록은 이미 지나간 단계다. 그 **다음 단계**를 제안할 것 — 되풀이 금지
- "이번에 교체할 현재 ${targetLabel} 목표"와 같거나 거의 같은 문장을 내면 실패다.
  낱말만 바꾼 재구성도 안 된다. 행동의 내용 자체가 한 걸음 나아가야 한다`
    : "";

  const prompt = `당신은 slowgoes 앱의 실행 코치입니다.
사용자가 특정 "나의 발걸음(stride)" 단계의 행동만 새로 추천받고 싶어합니다.

입력:
- 버킷: "${bucketTitle}"
- 삶의 영역: ${lifeArea || "미정"}
- 기존 발걸음:
${existingSummary || "- 정보 없음"}
- 재생성 대상 레벨: ${targetLevel} (${targetLabel})${doneBlock}

규칙:
- 다른 단계는 건드리지 말고, 대상 레벨 1개의 action만 새로 제안
- 한국어 1문장
- 기존 action과 중복 금지${doneRules}

어조 가이드 (PR 17, 대상 레벨에 따라):
- someday: "~한 사람이 되어 있다" / "~을 즐기는 사람" / "~의 길을 걸어가고 있다" (정체성 진술)
- this_year: "~한 모습으로 자리 잡는다" / "~의 토대를 마련한다" (도달 상태)
- this_season / this_month: "이번 (시즌|달)은 ~을 하는 (시즌|달)이다" / "~의 (시즌|달)이다" (시기 선언)
- this_week / today: "~을 실행한다" / "~한다" / "~을 시작한다" (능동적 즉시 실행)
- 어색하면 자연스러운 한국어 우선. 강제하지 말 것.

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
    // PR 17: 어조 normalize 적용
    action: normalizeStrideAction(targetLevel, action),
  };
}
