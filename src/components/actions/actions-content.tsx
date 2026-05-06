"use client";

// 한걸음 상세 페이지 (PR 13)
// - 진행중 / 완료 탭으로 분리
//   - 진행중: pending 데일리투두 + 이번 주 미완료 루틴
//   - 완료: completed 데일리투두 + 이번 주 완료 루틴
// - 항목 클릭 → 즉시 완료 토글 (PR 10 대시보드 카드와 일관)
// - 구 BottomSheet 제거 (불필요한 인터랙션 단계)

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import {
  toggleDailyTodoAction,
  toggleRoutineCompletionAction,
} from "@/app/(main)/dashboard/actions";
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
  // 토글 진행 중 ID (중복 클릭 방지)
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // 탭별 필터링
  const { activeDaily, completedDaily, activeRoutine, completedRoutine } = useMemo(() => {
    const activeDaily: DailyTodo[] = [];
    const completedDaily: DailyTodo[] = [];
    for (const todo of dailyTodos) {
      if (todo.status === "completed") completedDaily.push(todo);
      else activeDaily.push(todo);
    }
    const activeRoutine: RoutineWithCompletion[] = [];
    const completedRoutine: RoutineWithCompletion[] = [];
    for (const routine of routines) {
      if (routine.is_completed_this_week) completedRoutine.push(routine);
      else activeRoutine.push(routine);
    }
    return { activeDaily, completedDaily, activeRoutine, completedRoutine };
  }, [dailyTodos, routines]);

  const visibleDaily = activeTab === "active" ? activeDaily : completedDaily;
  const visibleRoutine = activeTab === "active" ? activeRoutine : completedRoutine;

  async function toggleDaily(todoId: string) {
    if (togglingId) return;
    setTogglingId(todoId);
    const result = await toggleDailyTodoAction(todoId);
    if (result.success) {
      router.refresh();
    } else {
      toast(result.error ?? "상태 변경에 실패했어요.", "error");
    }
    setTogglingId(null);
  }

  async function toggleRoutine(routineId: string) {
    if (togglingId) return;
    setTogglingId(routineId);
    const result = await toggleRoutineCompletionAction(routineId);
    if (result.success) {
      router.refresh();
    } else {
      toast(result.error ?? "상태 변경에 실패했어요.", "error");
    }
    setTogglingId(null);
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
              const isToggling = togglingId === todo.id;
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
              const isCompleted = Boolean(routine.is_completed_this_week);
              const isToggling = togglingId === routine.id;
              return (
                <button
                  key={routine.id}
                  type="button"
                  onClick={() => {
                    void toggleRoutine(routine.id);
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
                      {routine.title}
                    </p>
                    <p className="mt-1 text-xs text-foreground/60">
                      반복: {formatRoutineRepeat(routine.repeat_unit, routine.repeat_value)}
                    </p>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="text-sm text-foreground/60">
              {activeTab === "active" ? "이번 주 진행 전인" : "이번 주 완료한"} {FEATURE_NAMES.ROUTINE}이 없어요.
            </p>
          )}
        </div>
      </section>
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
