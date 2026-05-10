"use client";

// 한걸음 상세 페이지 (PR 13 → PR 22 일 단위 → PR 25 Optimistic UI)
// - 진행중 / 완료 탭으로 분리
//   - 진행중: pending 데일리투두 + 오늘 미완료 루틴
//   - 완료: completed 데일리투두 + 오늘 완료 루틴
// - 데일리: 클릭 → 토글 (체크박스/본문 통합)
// - 루틴: 좌측 체크박스 = 토글, 본문 = 캘린더 시트 (PR 22)
// - PR 25: 토글은 useOptimistic으로 즉시 반영, 실패 시 자동 rollback

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import {
  toggleDailyTodoAction,
  toggleRoutineCompletionAction,
} from "@/app/(main)/dashboard/actions";
import { RoutineCalendarSheet } from "@/components/dashboard/routine-calendar-sheet";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
  Bucket,
  DailyTodo,
  RoutineWithCompletion,
} from "@/types";

type TabKey = "active" | "completed";

interface ActionsContentProps {
  dailyTodos: DailyTodo[];
  routines: RoutineWithCompletion[];
  buckets: Pick<Bucket, "id" | "title">[];
  selectedBucketId: string | null;
}

function formatRoutineRepeat(unit: "daily" | "weekly", value: number) {
  if (unit === "daily") {
    return value <= 1 ? "매일" : `${value}일마다`;
  }
  return value <= 1 ? "매주" : `${value}주마다`;
}

export function ActionsContent({
  dailyTodos,
  routines,
  buckets,
  selectedBucketId,
}: ActionsContentProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>("active");
  // PR 22: 루틴 캘린더 시트 상태
  const [calendarRoutine, setCalendarRoutine] = useState<RoutineWithCompletion | null>(null);

  // PR 25 — Optimistic UI: 토글 즉시 반영, transition 종료 시 server data로 정합성 복구
  const [, startTransition] = useTransition();
  const [optimisticDailyTodos, applyOptimisticDaily] = useOptimistic(
    dailyTodos,
    (state: DailyTodo[], todoId: string) =>
      state.map((t) =>
        t.id === todoId
          ? { ...t, status: t.status === "completed" ? "pending" : "completed" }
          : t
      )
  );
  const [optimisticRoutines, applyOptimisticRoutine] = useOptimistic(
    routines,
    (state: RoutineWithCompletion[], routineId: string) =>
      state.map((r) =>
        r.id === routineId ? { ...r, is_completed_today: !Boolean(r.is_completed_today) } : r
      )
  );

  // 탭별 필터링 (Optimistic state 기준)
  const { activeDaily, completedDaily, activeRoutine, completedRoutine } = useMemo(() => {
    const activeDaily: DailyTodo[] = [];
    const completedDaily: DailyTodo[] = [];
    for (const todo of optimisticDailyTodos) {
      if (todo.status === "completed") completedDaily.push(todo);
      else activeDaily.push(todo);
    }
    const activeRoutine: RoutineWithCompletion[] = [];
    const completedRoutine: RoutineWithCompletion[] = [];
    for (const routine of optimisticRoutines) {
      if (routine.is_completed_today) completedRoutine.push(routine);
      else activeRoutine.push(routine);
    }
    return { activeDaily, completedDaily, activeRoutine, completedRoutine };
  }, [optimisticDailyTodos, optimisticRoutines]);

  function openRoutineCalendar(routine: RoutineWithCompletion) {
    setCalendarRoutine(routine);
  }

  const visibleDaily = activeTab === "active" ? activeDaily : completedDaily;
  const visibleRoutine = activeTab === "active" ? activeRoutine : completedRoutine;

  function toggleDaily(todoId: string) {
    startTransition(async () => {
      applyOptimisticDaily(todoId);
      const result = await toggleDailyTodoAction(todoId);
      if (!result.success) {
        toast(result.error ?? "상태 변경에 실패했어요.", "error");
      }
      router.refresh();
    });
  }

  function toggleRoutine(routineId: string) {
    startTransition(async () => {
      applyOptimisticRoutine(routineId);
      const result = await toggleRoutineCompletionAction(routineId);
      if (!result.success) {
        toast(result.error ?? "상태 변경에 실패했어요.", "error");
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{FEATURE_NAMES.STRIDE_DETAIL}</h1>
          <p className="text-sm text-foreground/60">
            진행중 {activeDaily.length + activeRoutine.length}개 · 완료{" "}
            {completedDaily.length + completedRoutine.length}개
          </p>
        </div>
        <Link
          href={selectedBucketId ? `/dashboard?bucket=${selectedBucketId}` : "/dashboard"}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-foreground/20 px-3 text-sm transition-colors hover:bg-foreground/5"
        >
          대시보드로
        </Link>
      </div>

      {/* 버킷 선택기 */}
      {buckets.length > 1 && (
        <div className="rounded-xl border border-foreground/10 px-4 py-4">
          <p className="text-xs text-foreground/60">버킷</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {buckets.map((bucket) => (
              <Link
                key={bucket.id}
                href={`/actions?bucket=${bucket.id}`}
                className={`inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs ${
                  selectedBucketId === bucket.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 hover:bg-foreground/5"
                }`}
              >
                {bucket.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 탭 */}
      <div role="tablist" className="flex border-b border-foreground/10">
        <TabButton
          active={activeTab === "active"}
          onClick={() => setActiveTab("active")}
          label="진행중"
          count={activeDaily.length + activeRoutine.length}
        />
        <TabButton
          active={activeTab === "completed"}
          onClick={() => setActiveTab("completed")}
          label="완료"
          count={completedDaily.length + completedRoutine.length}
        />
      </div>

      {/* 데일리 투두 섹션 */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <p className="text-sm text-foreground/60">{FEATURE_NAMES.DAILY_TODO}</p>
        <div className="mt-3 flex flex-col gap-2">
          {visibleDaily.length > 0 ? (
            visibleDaily.map((todo) => {
              const isCompleted = todo.status === "completed";
              // PR 25: useOptimistic이 즉시 반영 → disable 불필요
              const isToggling = false;
              return (
                <button
                  key={todo.id}
                  type="button"
                  onClick={() => {
                    void toggleDaily(todo.id);
                  }}
                  disabled={isToggling}
                  aria-pressed={isCompleted}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3 text-left transition-colors hover:bg-foreground/5",
                    "disabled:opacity-60"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      isCompleted
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground/30"
                    )}
                    aria-hidden
                  >
                    {isCompleted && (
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <div className="flex-1">
                    <p className={cn("text-sm font-medium", isCompleted && "line-through text-foreground/45")}>
                      {todo.title}
                    </p>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="text-sm text-foreground/60">
              {activeTab === "active" ? "진행중인" : "완료된"} {FEATURE_NAMES.DAILY_TODO}가 없어요.
            </p>
          )}
        </div>
      </section>

      {/* 루틴 섹션 */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <p className="text-sm text-foreground/60">{FEATURE_NAMES.ROUTINE}</p>
        <div className="mt-3 flex flex-col gap-2">
          {visibleRoutine.length > 0 ? (
            visibleRoutine.map((routine) => {
              // PR 22: 일 단위 토글로 변경
              const isCompleted = Boolean(routine.is_completed_today);
              // PR 25: useOptimistic이 즉시 반영 → disable 불필요
              const isToggling = false;
              return (
                <div
                  key={routine.id}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-all duration-200",
                    isCompleted
                      ? "border-foreground/30 bg-foreground/[0.08]"
                      : "border-foreground/10 bg-foreground/[0.02]"
                  )}
                >
                  {/* PR 22: 체크박스 = 토글 영역 */}
                  <button
                    type="button"
                    onClick={() => {
                      void toggleRoutine(routine.id);
                    }}
                    disabled={isToggling}
                    aria-pressed={isCompleted}
                    aria-label={`${routine.title} ${isCompleted ? "오늘 완료 취소" : "오늘 완료"}`}
                    className="mt-0.5 shrink-0 disabled:opacity-60"
                  >
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200",
                        isCompleted
                          ? "border-foreground bg-foreground text-background"
                          : "border-foreground/25"
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

                  {/* PR 22: 본문 = 캘린더 진입 영역 */}
                  <button
                    type="button"
                    onClick={() => openRoutineCalendar(routine)}
                    aria-label={`${routine.title} 달성 기록 보기`}
                    className="flex-1 text-left transition-colors hover:bg-foreground/5 rounded px-1 -mx-1"
                  >
                    <p
                      className={cn(
                        "text-sm transition-all duration-200",
                        isCompleted ? "font-semibold text-foreground" : "font-medium text-foreground/65"
                      )}
                    >
                      {routine.title}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-xs transition-colors duration-200",
                        isCompleted ? "text-foreground/70" : "text-foreground/45"
                      )}
                    >
                      반복: {formatRoutineRepeat(routine.repeat_unit, routine.repeat_value)}
                    </p>
                  </button>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-foreground/60">
              {activeTab === "active" ? "이번 주 진행 전인" : "이번 주 완료한"} {FEATURE_NAMES.ROUTINE}이 없어요.
            </p>
          )}
        </div>
      </section>

      {/* PR 22: 루틴 달성 캘린더 시트 */}
      <RoutineCalendarSheet
        open={calendarRoutine !== null}
        onClose={() => setCalendarRoutine(null)}
        routineId={calendarRoutine?.id ?? null}
        routineTitle={calendarRoutine?.title ?? null}
      />
    </div>
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
        "relative flex-1 px-3 py-3 text-sm font-medium transition-colors",
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
