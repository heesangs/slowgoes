"use client";

// 실행계획 섹션 — 발걸음 3섹션 중 세 번째
//
// 표시 내용: 이번 달 카드 (PR 18에서 4개 → 1개로 단순화)
// 카드 액션:
// - PR 9: ⋮ 더보기 메뉴 (수정/추가 → 통합 StepSheet, IA v2 목표 4)
// - PR 10: 카드 본문에 해당 stride_level 투두 리스트 + 클릭 시 완료 토글
// - PR 11: 헤더 우측에 "한걸음 더" 버튼 + "한걸음 상세" 링크 흡수
// - PR 14: 잔여 기간 + 게이지 바
// - PR 20: 카드 본문에 루틴 리스트도 함께 표시 (this_month 카드에만)
//   - 루틴: title + 주기(매일/매주) + 시간대(있으면)
//   - 클릭 → 완료 토글 (PR 21에서 시각 효과 차별화 예정)
//
// IA v2 목표 5: /actions 폐기 → 흡수
// - 헤더 "더보기" Link 제거 (같은 화면이므로 이동 불필요)
// - 헤더 우측에 ⋮ MoreActionsMenu 추가 (버킷 삭제 액션)
// - 헤더 아래에 진행중/완료 탭 추가 — 카드 내부 todos/routines를 activeTab에 따라 필터링.
//   완료 항목은 line-through 대신 "완료 탭에서만" 노출하는 방식이라
//   진행중 탭의 시각적 노이즈가 줄어든다.

import { useState } from "react";
import { MoreActionsMenu } from "@/components/ui/more-actions-menu";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getDaysLeftLabel, getPeriodProgress } from "@/lib/utils/period";
import type {
  DailyTodo,
  DailyTodoStrideLevel,
  RoutineTimeSlot,
  RoutineWithCompletion,
  StrideItem,
  StrideLevel,
} from "@/types";

const TIME_SLOT_LABELS: Record<RoutineTimeSlot, string> = {
  morning: "아침",
  afternoon: "점심",
  evening: "저녁",
  night: "밤",
};

type TabKey = "active" | "completed";

function formatRoutineMeta(routine: RoutineWithCompletion): string {
  const parts: string[] = [];
  if (routine.repeat_unit === "daily") {
    parts.push(routine.repeat_value <= 1 ? "매일" : `${routine.repeat_value}일마다`);
  } else {
    parts.push(routine.repeat_value <= 1 ? "매주" : `${routine.repeat_value}주마다`);
  }
  if (routine.time_slot) {
    parts.push(TIME_SLOT_LABELS[routine.time_slot]);
  }
  return parts.join(" · ");
}

interface ExecutionPlanSectionProps {
  items: StrideItem[];
  /** PR 10: 현재 버킷의 모든 데일리 투두. 카드별로 stride_level 일치하는 것만 표시 */
  dailyTodos: DailyTodo[];
  /** PR 20: 현재 버킷의 모든 루틴. this_month 카드에만 표시. */
  routines: RoutineWithCompletion[];
  /** "수정" 클릭 → StepSheet(edit-with-ai) 진입 */
  onEditLevel: (item: StrideItem) => void;
  /** "추가" 클릭 → 한걸음 더 흐름과 연결 (PR 12) */
  onAddToLevel?: (item: StrideItem) => void;
  /** PR 10: 투두 클릭 → 완료 토글 */
  onToggleTodo: (todoId: string) => void;
  /** PR 20: 루틴 좌측 체크박스 클릭 → 완료 토글 (PR 22: 일 단위로 변경) */
  onToggleRoutine: (routineId: string) => void;
  /** PR 22: 루틴 본문 클릭 → 캘린더 시트 진입 */
  onOpenRoutineCalendar: (routine: RoutineWithCompletion) => void;
  /** 현재 AI 재생성 진행 중인 레벨 (PR 34: 전체 재생성 제거되어 단일 재생성만 남음) */
  regeneratingLevel: StrideLevel | null;
  /** PR 10: 현재 토글 진행 중인 투두 ID (중복 클릭 방지) */
  togglingTodoId: string | null;
  /** PR 20: 현재 토글 진행 중인 루틴 ID (중복 클릭 방지) */
  togglingRoutineId: string | null;
  /**
   * IA v2 목표 5: /actions 헤더의 "버킷 삭제" 액션이 이쪽으로 흡수됨.
   * 버킷이 선택되어 있을 때만 활성화.
   */
  onDeleteBucket?: () => void;
  /** 버킷 삭제 진행 중 (UI disable + 중복 클릭 방지) */
  isDeletingBucket?: boolean;
}

// stride_level은 4개 값만 가능 (DailyTodoStrideLevel)
// 발걸음 카드의 level이 그 중 하나일 때만 투두 매칭
function isExecutionLevel(level: StrideLevel): level is DailyTodoStrideLevel {
  return level === "today" || level === "this_week" || level === "this_month" || level === "this_season";
}

// PR 34: 전체 다시 추천 기능 제거 — onRegenerateAll/isRegenAll prop 삭제, 푸터 버튼 제거.
// PR 35: 헤더의 "한걸음 더" 버튼 제거 — 우측 하단 FAB로 단일화 (PDF 명세 A-2).
// IA v2 목표 5: strideDetailHref/extraCount prop 제거 — /actions 폐기로 더보기 링크 의미 상실.
//   대신 진행중/완료 탭이 같은 위치에서 완료 항목 진입을 대신한다.
export function ExecutionPlanSection({
  items,
  dailyTodos,
  routines,
  onEditLevel,
  onAddToLevel,
  onToggleTodo,
  onToggleRoutine,
  onOpenRoutineCalendar,
  regeneratingLevel,
  togglingTodoId,
  togglingRoutineId,
  onDeleteBucket,
  isDeletingBucket = false,
}: ExecutionPlanSectionProps) {
  // IA v2 목표 5: 진행중/완료 탭 — /actions의 ActionsContent에서 이관.
  //   기본값 "active": 사용자가 화면 열자마자 보고 싶은 것은 "아직 안 한 것".
  const [activeTab, setActiveTab] = useState<TabKey>("active");

  // 전체 카운트는 *현재 발걸음 그룹 전체* 기준이라 카드 단위 필터링과 별개로 계산.
  // 완료 탭 카운트가 0이어도 진입은 가능 (사용자가 직접 토글해서 채우는 흐름).
  const totalActive =
    dailyTodos.filter((t) => t.status !== "completed").length +
    routines.filter((r) => !r.is_completed_today).length;
  const totalCompleted =
    dailyTodos.filter((t) => t.status === "completed").length +
    routines.filter((r) => r.is_completed_today).length;

  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-foreground/10 px-4 py-4">
      {/* 헤더: 라벨 + 우측 ⋮ 더보기 메뉴 (IA v2 목표 5: 버킷 삭제 액션 흡수) */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground/70">{FEATURE_NAMES.MY_STRIDES}</p>

        {onDeleteBucket && (
          <MoreActionsMenu
            ariaLabel={`${FEATURE_NAMES.MY_STRIDES} 더보기`}
            align="right"
            actions={[
              {
                label: `${FEATURE_NAMES.BUCKET} 삭제`,
                onClick: onDeleteBucket,
                disabled: isDeletingBucket,
                variant: "danger",
              },
            ]}
          />
        )}
      </div>

      {/* IA v2 목표 5: 진행중/완료 탭 — /actions에서 흡수.
          카운트는 전체 dailyTodos+routines 기준이라 카드 단위 필터링과 별개. */}
      <div role="tablist" className="mt-3 flex border-b border-foreground/10">
        <TabButton
          active={activeTab === "active"}
          onClick={() => setActiveTab("active")}
          label="진행중"
          count={totalActive}
        />
        <TabButton
          active={activeTab === "completed"}
          onClick={() => setActiveTab("completed")}
          label="완료"
          count={totalCompleted}
        />
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {items.map((item, index) => {
          const busy = regeneratingLevel === item.level;
          // PR 10: 카드의 stride_level과 일치하는 투두만 추출
          // PR 14: 같은 narrowing으로 잔여 기간 + 진행도 계산
          const execLevel: DailyTodoStrideLevel | null = isExecutionLevel(item.level)
            ? item.level
            : null;
          // IA v2 목표 5: activeTab 기준으로 카드 내부 todos/routines 필터링.
          //   진행중 탭에서 완료 항목은 시각적 노이즈로 작용했음 → 탭 분리로 해소.
          const cardTodos = execLevel
            ? dailyTodos.filter((todo) => {
                if (todo.stride_level !== execLevel) return false;
                return activeTab === "active"
                  ? todo.status !== "completed"
                  : todo.status === "completed";
              })
            : [];
          // PR 20: 루틴은 stride_level 개념이 없으므로 this_month 카드에만 모두 표시
          const cardRoutines =
            execLevel === "this_month"
              ? routines.filter((r) =>
                  activeTab === "active" ? !r.is_completed_today : r.is_completed_today,
                )
              : [];
          const periodLabel = execLevel ? getDaysLeftLabel(execLevel) : null;
          const progress = execLevel ? getPeriodProgress(execLevel) : 0;

          return (
            <article
              key={`execution-${item.level}-${index}`}
              className="relative overflow-hidden rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5"
            >
              {/* PR 14: 카드 상단 게이지 바 (저채도, 얇게) */}
              {execLevel && (
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-foreground/5"
                  aria-hidden
                >
                  <div
                    className="h-full bg-foreground/30 transition-[width]"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              )}

              <div className="flex items-start justify-between gap-2">
                <div className="flex items-baseline gap-1.5">
                  <p className="text-xs font-medium text-foreground/55">{item.label}</p>
                  {periodLabel && (
                    <span className="text-[10px] text-foreground/40">{periodLabel}</span>
                  )}
                </div>
                <MoreActionsMenu
                  ariaLabel={`${item.label} 더보기`}
                  actions={[
                    {
                      label: "수정",
                      onClick: () => onEditLevel(item),
                      disabled: busy,
                    },
                    {
                      label: "추가",
                      onClick: () => onAddToLevel?.(item),
                      disabled: busy || !onAddToLevel,
                    },
                  ]}
                />
              </div>
              <p className="mt-1 text-sm">{item.action}</p>

              {/* PR 10: 투두 리스트 — 클릭 시 완료 토글 (지움 효과) */}
              {cardTodos.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-foreground/10 pt-2">
                  {cardTodos.map((todo) => {
                    const isCompleted = todo.status === "completed";
                    const isToggling = togglingTodoId === todo.id;
                    return (
                      <li key={todo.id}>
                        <button
                          type="button"
                          onClick={() => onToggleTodo(todo.id)}
                          disabled={isToggling}
                          aria-pressed={isCompleted}
                          aria-label={`${todo.title} ${isCompleted ? "완료 취소" : "완료"}`}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors",
                            "hover:bg-foreground/5 disabled:opacity-60",
                            isCompleted && "text-foreground/45"
                          )}
                        >
                          <span
                            className={cn(
                              "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              isCompleted
                                ? "border-foreground bg-foreground text-background"
                                : "border-foreground/30 bg-transparent"
                            )}
                            aria-hidden
                          >
                            {isCompleted && (
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          <span className={cn("flex-1", isCompleted && "line-through")}>{todo.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* PR 20+21+22: 루틴 리스트
                  - 좌측 체크박스 = 일 단위 토글 (PR 22)
                  - 본문 영역 = 캘린더 시트 진입 (PR 22)
                  - 완료 시 선명·채움 효과 (PR 21) */}
              {cardRoutines.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-foreground/10 pt-2">
                  {cardRoutines.map((routine) => {
                    // PR 22: 일 단위로 의미 변경 — "오늘 완료됨"
                    const isCompleted = Boolean(routine.is_completed_today);
                    const isToggling = togglingRoutineId === routine.id;
                    const meta = formatRoutineMeta(routine);
                    return (
                      <li key={routine.id}>
                        <div
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-all duration-200",
                            isCompleted
                              ? "bg-foreground/[0.08] text-foreground"
                              : "text-foreground/55"
                          )}
                        >
                          {/* 체크박스 = 토글 영역 */}
                          <button
                            type="button"
                            onClick={() => onToggleRoutine(routine.id)}
                            disabled={isToggling}
                            aria-pressed={isCompleted}
                            aria-label={`${routine.title} ${isCompleted ? "오늘 완료 취소" : "오늘 완료"}`}
                            className="shrink-0 disabled:opacity-60"
                          >
                            <span
                              className={cn(
                                "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200",
                                isCompleted
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-foreground/25 bg-transparent"
                              )}
                              aria-hidden
                            >
                              {isCompleted && (
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                          </button>

                          {/* 본문 = 캘린더 진입 영역 */}
                          <button
                            type="button"
                            onClick={() => onOpenRoutineCalendar(routine)}
                            aria-label={`${routine.title} 달성 기록 보기`}
                            className="flex-1 min-w-0 text-left transition-colors hover:bg-foreground/5 rounded px-1 -mx-1"
                          >
                            <p
                              className={cn(
                                "truncate transition-all duration-200",
                                isCompleted ? "font-semibold" : "font-normal"
                              )}
                            >
                              {routine.title}
                            </p>
                            <p
                              className={cn(
                                "text-[10px] transition-colors duration-200",
                                isCompleted ? "text-foreground/65" : "text-foreground/35"
                              )}
                            >
                              🔁 {meta}
                            </p>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* IA v2 목표 5: 완료 탭에서 카드에 표시할 항목이 0개일 때 안내 — 진행중 탭에는 항목 0개도 자연스러우므로 표시 안 함. */}
              {activeTab === "completed" &&
                cardTodos.length === 0 &&
                cardRoutines.length === 0 && (
                  <p className="mt-2 border-t border-foreground/10 pt-2 text-xs text-foreground/45">
                    완료한 항목이 아직 없어요.
                  </p>
                )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}

// IA v2 목표 5: /actions의 TabButton 재구현 — 동일 시각 언어 유지로 회귀 0.
function TabButton({ active, onClick, label, count }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative flex-1 px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-foreground/55 hover:text-foreground/80"
      )}
    >
      {label}
      <span
        className={cn(
          "ml-1.5 inline-block min-w-[20px] rounded-full px-1.5 text-[11px]",
          active ? "bg-foreground text-background" : "bg-foreground/10 text-foreground/60"
        )}
      >
        {count}
      </span>
      {active && (
        <span className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground" aria-hidden />
      )}
    </button>
  );
}
