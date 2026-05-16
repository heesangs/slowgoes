// 공통 타입 정의

export type TaskStatus = "pending" | "in_progress" | "completed";

export type Difficulty = "easy" | "medium" | "hard";

export type SelfLevel = "low" | "medium" | "high";

export type UserContext = "student" | "university" | "work" | "personal";

// v2 온보딩/개편 도메인 타입
export type Gender = "male" | "female";
export type PersonalityType =
  | "ISTJ" | "ISFJ" | "INFJ" | "INTJ"
  | "ISTP" | "ISFP" | "INFP" | "INTP"
  | "ESTP" | "ESFP" | "ENFP" | "ENTP"
  | "ESTJ" | "ESFJ" | "ENFJ" | "ENTJ";
export type PaceType = "slow" | "balanced" | "focused" | "recovery";
export type OnboardingVersion = 1 | 2;

export type LifeAreaName =
  | "건강"
  | "관계"
  | "성장"
  | "경험"
  | "일"
  | "내면"
  | "돈";

// 나의 발걸음(stride) — 유저 목표의 시간 스케일. 짧은 → 긴 순서로 나열.
export type StrideLevel =
  | "today"
  | "this_week"
  | "this_month"
  | "this_season"
  | "this_year"
  | "five_years"
  | "decade"
  | "someday";
// 버킷의 중심 발걸음 스코프 — 드롭다운에서 선택하는 값 (StrideLevel 풀과 동일)
export type StrideScope = StrideLevel;
export type BucketStatus = "not_started" | "in_progress" | "completed" | "paused";
export type TaskCondition = "light" | "normal" | "focused" | "tired";
export type ItemSource = "onboarding" | "ai_generated" | "manual";
export type DailyTodoStatus = "pending" | "completed";
export type RoutineRepeatUnit = "daily" | "weekly";
// PR 19: 루틴 시간대 (DB CHECK 제약과 동일)
export type RoutineTimeSlot = "morning" | "afternoon" | "evening" | "night";
export type ActionLogItemType = "daily_todo" | "routine";

export interface Profile {
  id: string;
  display_name: string | null;
  life_clock_age?: number | null;
  gender?: Gender | null;
  personality_type?: PersonalityType | null;
  pace_type?: PaceType | null;
  onboarding_version?: number | null;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  status: TaskStatus;
  total_estimated_minutes: number | null;
  total_actual_minutes: number | null;
  created_at: string;
  completed_at: string | null;
  memo?: string | null;
  desired_subtask_count?: number | null;
  target_duration_minutes?: number | null;
  due_date?: string | null; // ISO date "YYYY-MM-DD"
  chapter_id?: string | null;
  bucket_id?: string | null;
  is_daily_step?: boolean;
  condition?: TaskCondition | null;
}

// 폼 → 액션 전달용 입력 데이터
export interface TaskInputData {
  title: string;
  memo?: string;
  desiredSubtaskCount?: number; // undefined = AI 추천
  targetDurationMinutes?: number; // undefined = AI 추천
  dueDate?: string; // ISO date "YYYY-MM-DD"
  bucketId?: string;
  chapterId?: string;
}

export interface Subtask {
  id: string;
  task_id: string;
  parent_subtask_id: string | null;
  depth: number;
  title: string;
  difficulty: Difficulty;
  ai_suggested_difficulty: Difficulty | null;
  estimated_minutes: number;
  ai_suggested_minutes: number | null;
  actual_minutes: number | null;
  sort_order: number;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
}

// 과제 + 하위 과제 조인 타입
export interface TaskWithSubtasks extends Task {
  subtasks: Subtask[];
  bucket?: Pick<Bucket, "id" | "title"> | null;
}

// 과제 통계 타입
export interface TaskStats {
  totalDailyTodos: number;
  completedDailyTodos: number;
  totalRoutines: number;
  completedRoutinesThisWeek: number;
  totalActionsCompleted: number;
  completedInLast14Days: number;
}

// 클라이언트 편집용 하위 과제 타입
export interface EditableSubtask {
  temp_id: string;
  parent_temp_id: string | null;
  depth: number;
  title: string;
  difficulty: Difficulty;
  ai_suggested_difficulty: Difficulty;
  estimated_minutes: number;
  ai_suggested_minutes: number;
  sort_order: number;
  is_decomposing: boolean;
}

// 메모 템플릿 타입
export interface MemoTemplate {
  id: string;
  user_id: string;
  label: string;
  content: string;
  sort_order: number;
  created_at: string;
}

// v2 개편 도메인 엔티티
export interface LifeArea {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  created_at: string;
}

export interface Bucket {
  id: string;
  user_id: string;
  life_area_id: string | null;
  title: string;
  stride_scope: StrideScope;
  status: BucketStatus;
  created_at: string;
  completed_at: string | null;
}

export interface BucketWithRelations extends Bucket {
  life_area?: LifeArea | null;
}

// PR 18: 실행계획 카드 4개 → 1개(이번 달) 단순화로 union도 축소.
// 기존 today/this_week/this_season은 마이그레이션으로 모두 this_month로 백필됨.
// 지향점 레벨(someday/this_year/...)은 daily_todos가 아닌 stride_plan에 표현됨.
export type DailyTodoStrideLevel = "this_month";

export interface DailyTodo {
  id: string;
  user_id: string;
  bucket_id: string | null;
  title: string;
  status: DailyTodoStatus;
  source: ItemSource;
  /** PR 10: 실행계획 카드 그룹핑 — DB DEFAULT 'today' */
  stride_level: DailyTodoStrideLevel;
  week_start: string;
  sort_order: number;
  created_at: string;
  completed_at: string | null;
}

export interface Routine {
  id: string;
  user_id: string;
  bucket_id: string | null;
  title: string;
  source: ItemSource;
  repeat_unit: RoutineRepeatUnit;
  repeat_value: number;
  /** PR 19: 루틴 실행 시간대 (선택). 기존 row는 null. */
  time_slot: RoutineTimeSlot | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface RoutineCompletion {
  id: string;
  routine_id: string;
  user_id: string;
  /** PR 22: 일 단위 완료 일자 (date "YYYY-MM-DD"). UNIQUE (routine_id, completion_date). */
  completion_date: string;
  /** PR 22: 호환성 위해 유지 — 향후 cleanup PR로 제거 가능 */
  week_start: string;
  completed_at: string;
}

export interface RoutineWithCompletion extends Routine {
  completion?: RoutineCompletion | null;
  /** PR 22: "오늘 완료됨" — 일 단위 토글 기준 */
  is_completed_today?: boolean;
  /** PR 22: "이번 주 안에 한 번이라도 완료" — 호환성 위해 유지 */
  is_completed_this_week?: boolean;
}

export interface SuggestedRoutine {
  title: string;
  repeatUnit: RoutineRepeatUnit;
  repeatValue: number;
}

// PR 15: 발걸음 카드 ⋮ 수정 시트의 이력 picker용
export interface StrideTitleHistoryEntry {
  /** 과거 시점에 카드에 표시되었던 action 텍스트 */
  title: string;
  /** ISO 타임스탬프 — 그 타이틀이 history에 push된 시각 */
  generated_at: string;
  /** "ai" = AI 재생성으로 교체된 이전 값, "manual" = 사용자 직접 수정으로 교체된 이전 값 */
  source: "ai" | "manual";
}

export type StrideTitleHistory = Partial<Record<StrideLevel, StrideTitleHistoryEntry[]>>;

export interface StridePlan {
  id: string;
  user_id: string;
  bucket_id: string;
  life_area: string;
  strides: StrideItem[];
  suggested_routines: SuggestedRoutine[];
  /** PR 15: 단계별 과거 타이틀 이력 (마이그레이션 DEFAULT '{}') */
  title_history?: StrideTitleHistory;
  created_at: string;
  updated_at: string;
}

export interface ActionLog {
  id: string;
  user_id: string;
  bucket_id: string | null;
  item_type: ActionLogItemType;
  item_id: string;
  title: string;
  ai_advice: string | null;
  completed_at: string;
  created_at: string;
}

// 기존 버킷에 아이템 추가 시 사용하는 컨텍스트
export interface ExistingBucketContext {
  bucketId: string;
  bucketTitle: string; // = sceneText (bucket.title이 장면 텍스트)
}

// 온보딩 v2 타입
export interface OnboardingV2Step1Input {
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
}

export interface OnboardingSceneCategory {
  key: "must_do" | "life_scene" | "dont_miss";
  label: string;
}

export interface DemoSceneItem {
  id: string;
  text: string;
  category: OnboardingSceneCategory["key"];
}

export interface StrideItem {
  level: StrideLevel;
  label: string;
  action: string;
}

export interface LifeSceneAnalysisResult {
  lifeArea: string;
  strides: StrideItem[];
  suggestedRoutines: SuggestedRoutine[];
}

export interface OnboardingV2SavePayload {
  sceneText: string;
  lifeArea: string;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
  paceType: PaceType;
  stridePlan: LifeSceneAnalysisResult;
  selectedDailyTodos: Array<{ title: string; source?: ItemSource }>;
  selectedRoutines: Array<{
    title: string;
    repeatUnit: RoutineRepeatUnit;
    repeatValue: number;
    source?: ItemSource;
  }>;
  // legacy 필드 (점진 전환) — 구 v1 payload가 들어왔을 때 daily todo로 승격
  selectedWeeklyAction?: string;
}

// 대시보드 v2 타입
export interface LifeBalanceInsight {
  focusArea: string | null;
  neglectedArea: string | null;
  steadyArea: string | null;
  message: string;
}

// PR 23: 평균 시간/난이도 측정 데이터가 DB에 없어 항상 null이던 dead 필드 제거
export interface ReviewSummary {
  completedCount: number;
  insight: string | null;
}

export type ReviewTimeBand = "morning" | "afternoon" | "evening" | "night";

export interface ReviewTimeBandStat {
  band: ReviewTimeBand;
  label: string;
  count: number;
}

export interface ReviewRecentItem {
  id: string;
  title: string;
  completedAt: string;
  itemType?: ActionLogItemType;
  bucketTitle: string | null;
  lifeAreaName: string | null;
}

// PR 24: 이번 주 루틴 달성률 (Apple Watch 스타일 링용)
export interface WeeklyRoutineRate {
  /** 이번 주 실제 완료 횟수 (routine_completions) */
  completed: number;
  /** 이번 주 가능한 총 완료 횟수 (daily=7, weekly=1) */
  total: number;
  /** 0~100 정수 */
  percentage: number;
}

// PR 24: 요일별 완료 분포 (최근 4주)
export interface WeekdayCompletion {
  /** 0=월, 1=화, ..., 6=일 (한국 기준) */
  weekday: number;
  label: string;
  count: number;
}

export interface ReviewPageData {
  completedCount: number;
  completedInLast14Days: number;
  strongestBand: ReviewTimeBand | null;
  timeBandStats: ReviewTimeBandStat[];
  /** PR 24: 이번 주 루틴 달성률 */
  weeklyRoutineRate: WeeklyRoutineRate;
  /** PR 24: 최근 4주 요일별 완료 분포 (월~일 7개) */
  weekdayCompletions: WeekdayCompletion[];
  insight: string | null;
  summary: ReviewSummary | null;
  recent: ReviewRecentItem[];
}

export interface DashboardV2Data {
  profile: Profile;
  buckets: Array<Pick<Bucket, "id" | "title" | "stride_scope" | "status" | "created_at">>;
  // PR 27: selectedBucket은 buckets에서 추출 가능 (별도 RTT 절약).
  // 컴포넌트가 id/title만 쓰므로 Pick으로 충분.
  selectedBucket: Pick<Bucket, "id" | "title" | "stride_scope" | "status" | "created_at"> | null;
  dailyTodos: DailyTodo[];
  routines: RoutineWithCompletion[];
  stridePlan: StridePlan | null;
  extraDailyTodoCount: number;
  extraRoutineCount: number;
  // legacy 필드 (점진 전환)
  dailyStep?: TaskWithSubtasks | null;
  selectedCondition?: TaskCondition;
  balance?: LifeBalanceInsight | null;
  suggestedBucket?: Bucket | null;
  review?: ReviewSummary | null;
}
