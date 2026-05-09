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

// 발걸음 3섹션 분류 (PR 8) — 인사이트는 별도 처리(empathy_message), strides는 지향점/실행계획으로 분류
const DIRECTION_LEVELS = new Set<StrideLevel>(["someday", "this_year"]);
const EXECUTION_LEVELS = new Set<StrideLevel>(["this_season", "this_month", "this_week", "today"]);

/**
 * strides를 "지향점"(direction: someday + 1년 안)과 "실행계획"(execution: 시즌/달/주/오늘)으로 분류
 * - direction: 긴→짧은 순 (언젠가 먼저)
 * - execution: 긴→짧은 순 (시즌 먼저)
 * - 그 외 레벨(this_month 외 중간 단계 등)은 가장 가까운 그룹에 매핑:
 *   - five_years/decade → direction
 *
 * PR 8에서 신설. PR 8 이후 dashboard-content-v2의 3섹션 컴포넌트가 이 함수를 사용.
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
    } else {
      // someday, this_year, five_years, decade → direction
      direction.push(s);
    }
  }
  // 둘 다 긴 → 짧은 순 (사용자 인지 자연스러움: 더 큰 그림부터)
  direction.sort(
    (a, b) => STRIDE_ORDER.indexOf(b.level) - STRIDE_ORDER.indexOf(a.level)
  );
  execution.sort(
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
- suggestedRoutines는 정확히 2개, 서로 다른 성격의 루틴

어조 가이드 (PR 17):
- "언젠가"(someday): 비전 문장. 어미는 "~한 사람이 되어 있다", "~을 즐기는 사람", "~의 길을 걸어가고 있다" 등 정체성 진술 형식.
- "1년 안"(this_year): 마일스톤 문장. 어미는 "~한 모습으로 자리 잡는다", "~의 토대를 마련한다" 등 도달 상태 진술.
- "이번 시즌/이번 달"(this_season/this_month): 시기 선언 문장. "이번 (시즌|달)은 ~을 하는 (시즌|달)이다", "~의 (시즌|달)이다" 형식 권장.
- "이번 주/오늘"(this_week/today): 즉시 실행 가능한 구체 행동. "~을 실행한다", "~한다", "~을 시작한다" 등 능동적 어미.
- 일관성: 어색하면 자연스러운 한국어 표현을 우선. 강제하지 말 것.

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
- 기존 action과 중복 금지

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
