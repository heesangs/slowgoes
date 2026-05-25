"use client";

// 한걸음 상세 페이지 (PR 13 → PR 22 일 단위 → PR 25 Optimistic UI → PR 36 메뉴/삭제/칩)
// - 진행중 / 완료 탭으로 분리
//   - 진행중: pending 데일리투두 + 오늘 미완료 루틴
//   - 완료: completed 데일리투두 + 오늘 완료 루틴
// - 데일리: 클릭 → 토글 (체크박스/본문 통합)
// - 루틴: 좌측 체크박스 = 토글, 본문 = 캘린더 시트 (PR 22)
// - PR 25: 토글은 useOptimistic으로 즉시 반영, 실패 시 자동 rollback
// - PR 36:
//   - 헤더 "대시보드로" Link → ⋮ 더보기 메뉴 (대시보드로 이동 / 버킷 삭제)
//   - 버킷 칩 리스트 끝에 "+" 칩 → ExploreNewSceneSheet (구 FindMeSheet 'explore' 탭)
//   - 버킷 삭제 후 라우팅: 다른 버킷 → 그쪽 /actions, 없으면 /dashboard
// - IA v2 목표 3: FindMeSheet → ExploreNewSceneSheet 교체 (select 책임은 헤더로 이관).
//   /actions 라우트 자체는 목표 5에서 통째 폐기 예정이라 이 파일의 인라인 버킷 셀렉터는
//   헤더 BucketSwitcher와 시각적으로 중복되더라도 과도기 한정으로 유지한다.

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import {
  deleteBucketAction,
  toggleDailyTodoAction,
  toggleRoutineCompletionAction,
} from "@/app/(main)/dashboard/actions";
import { ExploreNewSceneSheet } from "@/components/dashboard/explore-new-scene-sheet";
import { RoutineCalendarSheet } from "@/components/dashboard/routine-calendar-sheet";
import { MoreActionsMenu } from "@/components/ui/more-actions-menu";
import { useTrackLastViewedBucket } from "@/hooks/use-track-last-viewed-bucket";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
  Bucket,
  DailyTodo,
  Gender,
  PaceType,
  PersonalityType,
  Profile,
  RoutineWithCompletion,
} from "@/types";

type TabKey = "active" | "completed";

interface ActionsContentProps {
  dailyTodos: DailyTodo[];
  routines: RoutineWithCompletion[];
  buckets: Pick<Bucket, "id" | "title">[];
  selectedBucketId: string | null;
  /** PR 36: '+ 칩' 클릭 시 열리는 ExploreNewSceneSheet의 prefillProfile 공급용 */
  profile: Profile | null;
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
  profile,
}: ActionsContentProps) {
  const { toast } = useToast();
  const router = useRouter();

  // PR 31: 한걸음 상세에서도 보고 있는 버킷을 cookie에 기록 → 로고 클릭 시 복귀
  useTrackLastViewedBucket(selectedBucketId);

  const [activeTab, setActiveTab] = useState<TabKey>("active");
  // PR 22: 루틴 캘린더 시트 상태
  const [calendarRoutine, setCalendarRoutine] = useState<RoutineWithCompletion | null>(null);

  // PR 32: 버킷 전환 즉각 시각 피드백
  const [isBucketSwitching, startBucketSwitch] = useTransition();

  // PR 36 → IA v2 목표 3: + 칩 → ExploreNewSceneSheet
  const [exploreSheetOpen, setExploreSheetOpen] = useState(false);
  // PR 36: ⋮ 메뉴 '버킷 삭제' 진행 상태 (UI disable + 중복 클릭 방지)
  const [isDeleting, startDelete] = useTransition();

  // PR 36: 대시보드와 동일한 prefillProfile 도출 — 사용자가 온보딩 정보 재입력 안 하도록.
  const prefillProfile = useMemo(() => {
    if (!profile) return null;
    const { life_clock_age, gender, personality_type, pace_type } = profile;
    if (
      life_clock_age != null &&
      (gender === "male" || gender === "female") &&
      personality_type != null
    ) {
      return {
        age: life_clock_age,
        gender: gender as Gender,
        personalityType: personality_type as PersonalityType,
        paceType: (pace_type ?? undefined) as PaceType | undefined,
      };
    }
    return null;
  }, [profile]);

  // PR 36: 버킷 삭제 → CASCADE로 stride_plan/daily_todos/routines 자동 정리.
  //   삭제 후 다른 버킷이 있으면 그쪽 /actions, 없으면 /dashboard로 이동.
  function handleDeleteBucket() {
    if (!selectedBucketId || isDeleting) return;
    const confirmMsg =
      typeof window !== "undefined"
        ? window.confirm(
            `이 ${FEATURE_NAMES.BUCKET}을 삭제할까요?\n관련된 ${FEATURE_NAMES.DAILY_TODO}/${FEATURE_NAMES.ROUTINE}/${FEATURE_NAMES.MY_STRIDES}도 함께 사라져요.`,
          )
        : true;
    if (!confirmMsg) return;

    startDelete(async () => {
      const result = await deleteBucketAction(selectedBucketId);
      if (!result.success) {
        toast(result.error ?? `${FEATURE_NAMES.BUCKET} 삭제에 실패했어요.`, "error");
        return;
      }
      const nextBucket = buckets.find((b) => b.id !== selectedBucketId);
      toast(`${FEATURE_NAMES.BUCKET}을 삭제했어요.`, "success");
      if (nextBucket) {
        router.replace(`/actions?bucket=${nextBucket.id}`);
      } else {
        router.replace("/dashboard");
      }
    });
  }

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
      {/* 헤더 — PR 36: "대시보드로" Link → ⋮ 더보기 메뉴 (대시보드로 이동 / 버킷 삭제) */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{FEATURE_NAMES.STRIDE_DETAIL}</h1>
          <p className="text-sm text-foreground/60">
            진행중 {activeDaily.length + activeRoutine.length}개 · 완료{" "}
            {completedDaily.length + completedRoutine.length}개
          </p>
        </div>
        <MoreActionsMenu
          ariaLabel="더보기"
          align="right"
          actions={[
            {
              label: "대시보드로 이동",
              onClick: () => {
                router.push(
                  selectedBucketId ? `/dashboard?bucket=${selectedBucketId}` : "/dashboard",
                );
              },
            },
            {
              label: `${FEATURE_NAMES.BUCKET} 삭제`,
              onClick: handleDeleteBucket,
              disabled: !selectedBucketId || isDeleting,
              variant: "danger",
            },
          ]}
        />
      </div>

      {/* 버킷 선택기 — PR 32: Link → button + useTransition.
          PR 36 → IA v2 목표 3: 칩 리스트 마지막에 '+' 칩 → ExploreNewSceneSheet 진입. */}
      {buckets.length > 0 && (
        <div className="rounded-xl border border-foreground/10 px-4 py-4">
          <p className="text-xs text-foreground/60">{FEATURE_NAMES.BUCKET}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {buckets.map((bucket) => {
              const isCurrent = selectedBucketId === bucket.id;
              return (
                <button
                  key={bucket.id}
                  type="button"
                  onClick={() => {
                    if (isCurrent || isBucketSwitching) return;
                    startBucketSwitch(() => {
                      router.replace(`/actions?bucket=${bucket.id}`);
                    });
                  }}
                  disabled={isBucketSwitching}
                  aria-current={isCurrent ? "true" : undefined}
                  aria-busy={isBucketSwitching && !isCurrent}
                  className={cn(
                    "inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs transition-all",
                    isCurrent
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 hover:bg-foreground/5",
                    isBucketSwitching && !isCurrent && "opacity-50"
                  )}
                >
                  {bucket.title}
                </button>
              );
            })}
            {/* PR 36 → IA v2 목표 3: + 칩 — 새 장면 탐색(ExploreNewSceneSheet) 진입 */}
            <button
              type="button"
              onClick={() => setExploreSheetOpen(true)}
              aria-label={`${FEATURE_NAMES.BUCKET} 추가`}
              className="inline-flex min-h-[36px] items-center justify-center rounded-full border border-dashed border-foreground/30 px-3 text-xs text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              +
            </button>
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

      {/* PR 36 → IA v2 목표 3: '+ 칩' 진입 — ExploreNewSceneSheet */}
      <ExploreNewSceneSheet
        open={exploreSheetOpen}
        onClose={() => setExploreSheetOpen(false)}
        prefillProfile={prefillProfile}
        onComplete={() => {
          setExploreSheetOpen(false);
          router.refresh();
          toast("새로운 행동이 추가되었어요 ✨", "success");
        }}
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
