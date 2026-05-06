"use client";

// 실행계획 섹션 — 발걸음 3섹션 중 세 번째
//
// 표시 내용: 이번 시즌 + 이번 달 + 이번 주 + 오늘 카드 (짧은 시간 지평)
// 카드 액션:
// - PR 9: ⋮ 더보기 메뉴 (수정 → EditWithAISheet, 추가는 PR 12 연결 예정)
// - PR 10: 카드 본문에 해당 stride_level 투두 리스트 + 클릭 시 완료 토글
// - PR 11: 헤더 우측에 "한걸음 더" 버튼 + "한걸음 상세" 링크 흡수 (구 "오늘의 한걸음" 섹션 폐기)
// - PR 14: 잔여 기간 + 게이지 바 추가 예정

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MoreActionsMenu } from "@/components/ui/more-actions-menu";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DailyTodo, DailyTodoStrideLevel, StrideItem, StrideLevel } from "@/types";

interface ExecutionPlanSectionProps {
  items: StrideItem[];
  /** PR 10: 현재 버킷의 모든 데일리 투두. 카드별로 stride_level 일치하는 것만 표시 */
  dailyTodos: DailyTodo[];
  /** "수정" 클릭 → EditWithAISheet 진입 */
  onEditLevel: (item: StrideItem) => void;
  /** "추가" 클릭 → PR 12의 한걸음 더 흐름과 연결 예정 */
  onAddToLevel?: (item: StrideItem) => void;
  /** PR 10: 투두 클릭 → 완료 토글 */
  onToggleTodo: (todoId: string) => void;
  /** 발걸음 전체 다시 추천 */
  onRegenerateAll: () => void;
  /** 현재 AI 재생성 진행 중인 레벨 */
  regeneratingLevel: StrideLevel | null;
  /** 전체 재생성 진행 중 */
  isRegenAll: boolean;
  /** PR 10: 현재 토글 진행 중인 투두 ID (중복 클릭 방지) */
  togglingTodoId: string | null;
  /** PR 11: "한걸음 더" 버튼 클릭 (구 오늘의 한걸음 섹션 헤더에서 이동) */
  onOpenNextStep: () => void;
  /** PR 11: "한걸음 상세" 페이지 링크 (extraCount > 0일 때만 노출) */
  strideDetailHref: string;
  /** PR 11: 한걸음 상세 페이지로 가야 보이는 추가 항목 개수 — 0이면 더보기 링크 숨김 */
  extraCount: number;
  /** PR 11: 한걸음 더 버튼 disabled 여부 (버킷 미선택 시 등) */
  isNextStepDisabled?: boolean;
}

// stride_level은 4개 값만 가능 (DailyTodoStrideLevel)
// 발걸음 카드의 level이 그 중 하나일 때만 투두 매칭
function isExecutionLevel(level: StrideLevel): level is DailyTodoStrideLevel {
  return level === "today" || level === "this_week" || level === "this_month" || level === "this_season";
}

export function ExecutionPlanSection({
  items,
  dailyTodos,
  onEditLevel,
  onAddToLevel,
  onToggleTodo,
  onRegenerateAll,
  regeneratingLevel,
  isRegenAll,
  togglingTodoId,
  onOpenNextStep,
  strideDetailHref,
  extraCount,
  isNextStepDisabled = false,
}: ExecutionPlanSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-foreground/10 px-4 py-4">
      {/* 헤더: 라벨 + 우측에 한걸음 더 + 더보기 (PR 11에서 흡수) */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground/70">{FEATURE_NAMES.EXECUTION_PLAN}</p>

        <div className="flex items-center gap-2">
          {extraCount > 0 && (
            <Link
              href={strideDetailHref}
              className="inline-flex min-h-[28px] items-center rounded-md border border-foreground/15 px-2 text-[11px] text-foreground/70 transition-colors hover:bg-foreground/5"
            >
              더보기 +{extraCount}
            </Link>
          )}
          <button
            type="button"
            onClick={onOpenNextStep}
            disabled={isNextStepDisabled}
            className="inline-flex min-h-[28px] items-center rounded-md border border-foreground/20 bg-foreground/[0.04] px-2 text-[11px] font-medium transition-colors hover:bg-foreground/[0.08] disabled:opacity-40"
          >
            한걸음 더
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {items.map((item, index) => {
          const busy = regeneratingLevel === item.level || isRegenAll;
          // PR 10: 카드의 stride_level과 일치하는 투두만 추출
          const cardTodos = isExecutionLevel(item.level)
            ? dailyTodos.filter((todo) => todo.stride_level === item.level)
            : [];

          return (
            <article
              key={`execution-${item.level}-${index}`}
              className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-foreground/55">{item.label}</p>
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

              {/* PR 10: 투두 리스트 — 클릭 시 완료 토글 */}
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
            </article>
          );
        })}
      </div>

      {/* 본문 가장 아래 — 발걸음 전체 다시 추천 */}
      <Button
        type="button"
        variant="secondary"
        className="mt-3 w-full"
        onClick={onRegenerateAll}
        isLoading={isRegenAll}
        disabled={isRegenAll || regeneratingLevel !== null}
      >
        ↻ {FEATURE_NAMES.MY_STRIDES} 전체 다시 추천
      </Button>
    </section>
  );
}
