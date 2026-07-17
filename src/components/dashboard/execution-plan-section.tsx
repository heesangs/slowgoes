"use client";

// 실행계획 섹션 — 발걸음 3섹션 중 세 번째
//
// Phase B: 투두/루틴 통합 — 단일 todos 리스트.
//   - 행 = 체크박스 · 타이틀 · (시간 · 반복 라벨) · ⋮ 삭제
//   - 반복 있는 할 일만 우측에 🔁 라벨 표시 (피그마: 셀렉트-투두명-시간·반복아이콘)
//   - 반복 있는 행 본문 클릭 → 달성 기록 캘린더 시트
// 진행중/완료 탭은 유지 (Phase C에서 캘린더 상/하단 구분으로 대체 예정)

import { useState } from "react";
import { MoreActionsMenu } from "@/components/ui/more-actions-menu";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatRepeatLabel } from "@/lib/todos/repeat";
import { getDaysLeftLabel, getPeriodProgress } from "@/lib/utils/period";
import type { StrideItem, StrideLevel, TodoWithCompletion } from "@/types";

type TabKey = "active" | "completed";

// "HH:MM:SS" → "HH:MM"
function formatTime(time: string | null): string | null {
  if (!time) return null;
  return time.slice(0, 5);
}

interface ExecutionPlanSectionProps {
  items: StrideItem[];
  /** Phase B: 통합 할 일 목록 (오늘 기준, 완료 여부 포함) */
  todos: TodoWithCompletion[];
  /** "수정" 클릭 → 키보드 입력창(타이틀 수정) 진입 */
  onEditLevel: (item: StrideItem) => void;
  /** 행 ⋮ "삭제" — 1회성은 삭제, 반복은 비활성(기록 보존). 서버가 판단 */
  onDeleteTodo: (todo: TodoWithCompletion) => void;
  /** 체크박스 클릭 → 완료 토글 (선택 날짜 단위) */
  onToggleTodo: (todoId: string) => void;
  /** 반복 있는 행 본문 클릭 → 달성 기록 캘린더 시트 */
  onOpenTodoCalendar: (todo: TodoWithCompletion) => void;
  /** 현재 AI 재생성 진행 중인 레벨 (수정 버튼 disable용) */
  regeneratingLevel: StrideLevel | null;
  onDeleteBucket?: () => void;
  isDeletingBucket?: boolean;
}

export function ExecutionPlanSection({
  items,
  todos,
  onEditLevel,
  onDeleteTodo,
  onToggleTodo,
  onOpenTodoCalendar,
  regeneratingLevel,
  onDeleteBucket,
  isDeletingBucket = false,
}: ExecutionPlanSectionProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("active");

  const totalActive = todos.filter((t) => !t.is_completed).length;
  const totalCompleted = todos.filter((t) => t.is_completed).length;

  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-foreground/10 px-4 py-4">
      {/* 헤더: 라벨 + 우측 ⋮ 더보기 메뉴 */}
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

      {/* 진행중/완료 탭 */}
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
          // Phase B: stride_level 폐지 — 통합 todos는 이번 달(실행) 카드에 전부 표시
          const cardTodos = todos.filter((t) =>
            activeTab === "active" ? !t.is_completed : t.is_completed
          );
          const isExecutionCard =
            item.level === "today" ||
            item.level === "this_week" ||
            item.level === "this_month" ||
            item.level === "this_season";
          const periodLabel = isExecutionCard ? getDaysLeftLabel(item.level as never) : null;
          const progress = isExecutionCard ? getPeriodProgress(item.level as never) : 0;

          return (
            <article
              key={`execution-${item.level}-${index}`}
              className="relative overflow-hidden rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5"
            >
              {/* 카드 상단 게이지 바 */}
              {isExecutionCard && (
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
                  ]}
                />
              </div>
              <p className="mt-1 text-sm">{item.action}</p>

              {/* 통합 할 일 리스트 */}
              {cardTodos.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-foreground/10 pt-2">
                  {cardTodos.map((todo) => {
                    const repeatLabel = formatRepeatLabel(todo);
                    const time = formatTime(todo.scheduled_time);
                    const isCompleted = todo.is_completed;
                    return (
                      <li key={todo.id} className="flex items-center gap-1">
                        {/* 체크박스 = 토글 */}
                        <button
                          type="button"
                          onClick={() => onToggleTodo(todo.id)}
                          aria-pressed={isCompleted}
                          aria-label={`${todo.title} ${isCompleted ? "완료 취소" : "완료"}`}
                          className="shrink-0 rounded-md p-1 hover:bg-foreground/5"
                        >
                          <span
                            className={cn(
                              "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
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
                        </button>

                        {/* 본문 — 반복 있는 할 일은 달성 기록 진입 */}
                        <button
                          type="button"
                          onClick={() => {
                            if (todo.repeat_type) onOpenTodoCalendar(todo);
                          }}
                          aria-label={
                            todo.repeat_type
                              ? `${todo.title} 달성 기록 보기`
                              : todo.title
                          }
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors",
                            todo.repeat_type && "hover:bg-foreground/5",
                            !todo.repeat_type && "cursor-default",
                            isCompleted && "text-foreground/45"
                          )}
                        >
                          <span className={cn("min-w-0 flex-1 truncate", isCompleted && "line-through")}>
                            {todo.title}
                          </span>
                          {/* 우측 메타: 시간 · 반복 (피그마 행 구조) */}
                          {(time || repeatLabel) && (
                            <span className="flex shrink-0 items-center gap-1 text-[10px] text-foreground/40">
                              {time && <span>{time}</span>}
                              {repeatLabel && <span>🔁 {repeatLabel}</span>}
                            </span>
                          )}
                        </button>

                        {/* 행 ⋮ 삭제 */}
                        <MoreActionsMenu
                          ariaLabel={`${todo.title} 관리`}
                          align="right"
                          actions={[
                            {
                              label: "삭제",
                              onClick: () => {
                                const message = todo.repeat_type
                                  ? `'${todo.title}'을(를) 삭제할까요?\n과거 달성 기록은 보존돼요.`
                                  : `'${todo.title}'을(를) 삭제할까요?`;
                                if (window.confirm(message)) {
                                  onDeleteTodo(todo);
                                }
                              },
                              variant: "danger",
                            },
                          ]}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              {activeTab === "completed" && cardTodos.length === 0 && (
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
