"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DirectionSection } from "@/components/dashboard/direction-section";
import { ExecutionPlanSection } from "@/components/dashboard/execution-plan-section";
import { InsightSection } from "@/components/dashboard/insight-section";
import { LifeClockHeader } from "@/components/dashboard/life-clock-header";
import { RoutineCalendarSheet } from "@/components/dashboard/routine-calendar-sheet";
import { StepSheet, type StepSheetMode } from "@/components/dashboard/step-sheet";
import { useToast } from "@/components/ui/toast";
import {
  deactivateRoutineAction,
  deleteDailyTodoAction,
  toggleDailyTodoAction,
  toggleRoutineCompletionAction,
} from "@/app/(main)/dashboard/actions";
import { useTrackLastViewedBucket } from "@/hooks/use-track-last-viewed-bucket";
import { splitStridesByGroup } from "@/lib/ai/analyze";
import { FEATURE_NAMES } from "@/lib/constants";
import type {
  DailyTodo,
  DashboardV2Data,
  RoutineWithCompletion,
  StrideItem,
  StrideLevel,
} from "@/types";

interface DashboardContentV2Props {
  data: DashboardV2Data;
  fetchError?: string;
}

export function DashboardContentV2({ data, fetchError }: DashboardContentV2Props) {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  // PR 31: 현재 보고 있는 버킷을 cookie에 기록 (로고 클릭 시 복귀에 사용)
  useTrackLastViewedBucket(data.selectedBucket?.id ?? null);

  // IA v2 목표 4: NextStepSheet + EditWithAISheet → 단일 StepSheet 통합.
  //   진입점이 시트의 초기 segment + AI toggle 기본값을 결정한다.
  //   - FAB           → initialMode="next-step", editingStride=null, defaultAIEnabled=false
  //   - 카드 ⋮ "추가"  → initialMode="next-step", editingStride=null, defaultAIEnabled=true
  //   - 카드 ⋮ "수정"  → initialMode="edit-with-ai", editingStride=item, defaultAIEnabled=true
  //   "새 장면 추가"는 헤더 BucketSwitcher의 + 칩이 단일 진입점 (IA v2 목표 1·3).
  const [stepSheetOpen, setStepSheetOpen] = useState(false);
  const [stepSheetInitialMode, setStepSheetInitialMode] =
    useState<StepSheetMode>("next-step");
  const [stepSheetEnableAI, setStepSheetEnableAI] = useState(true);
  // 발걸음 카드 ⋮ "수정" 진입 컨텍스트. null이면 next-step 단독 모드.
  const [editingStride, setEditingStride] = useState<StrideItem | null>(null);

  // 발걸음 재생성 진행 상태는 StepSheet 내부에서 관리 — 부모는 더 이상 추적할 필요 없음.
  // 단, DirectionSection / ExecutionPlanSection은 prop으로 받아야 하므로 null 고정.
  const regeneratingLevel: StrideLevel | null = null;
  // PR 22 — 루틴 캘린더 시트 상태
  const [calendarRoutine, setCalendarRoutine] = useState<RoutineWithCompletion | null>(null);

  // PR 25 — Optimistic UI: 토글 즉시 반영, 실패 시 자동 rollback
  const [, startTransition] = useTransition();
  const [optimisticDailyTodos, applyOptimisticDaily] = useOptimistic(
    data.dailyTodos,
    (state: DailyTodo[], todoId: string) =>
      state.map((t) =>
        t.id === todoId
          ? {
              ...t,
              status: t.status === "completed" ? "pending" : "completed",
            }
          : t
      )
  );
  const [optimisticRoutines, applyOptimisticRoutine] = useOptimistic(
    data.routines,
    (state: RoutineWithCompletion[], routineId: string) =>
      state.map((r) =>
        r.id === routineId
          ? { ...r, is_completed_today: !Boolean(r.is_completed_today) }
          : r
      )
  );

  const extraMergedCount = data.extraDailyTodoCount + data.extraRoutineCount;

  // 발걸음 3섹션 분류 (PR 8) — strides가 바뀔 때만 재계산
  const strideGroups = useMemo(
    () => splitStridesByGroup(data.stridePlan?.strides ?? []),
    [data.stridePlan]
  );

  const detailHref = useMemo(() => {
    if (!data.selectedBucket?.id) return "/actions";
    return `/actions?bucket=${data.selectedBucket.id}`;
  }, [data.selectedBucket]);

  useEffect(() => {
    if (searchParams.get("onboarding_saved") === "1") {
      toast("첫 한 걸음이 준비되었어요 ✨", "success");
      router.replace("/dashboard");
    }
  }, [searchParams, toast, router]);

  useEffect(() => {
    if (fetchError) {
      toast(fetchError, "error");
    }
  }, [fetchError, toast]);

  // 카드 ⋮ "수정" 클릭 → StepSheet을 edit 모드로 진입.
  // 왜: StepSheet 내부에서 update/regenerate 액션을 모두 처리하므로 부모는 컨텍스트만 set.
  function handleEditOpen(item: StrideItem) {
    setEditingStride(item);
    setStepSheetInitialMode("edit-with-ai");
    setStepSheetEnableAI(true);
    setStepSheetOpen(true);
  }

  // PR 25 — 실행계획 카드 안 투두 토글: useOptimistic으로 즉시 반영
  function handleToggleTodoFromCard(todoId: string) {
    startTransition(async () => {
      applyOptimisticDaily(todoId);
      const result = await toggleDailyTodoAction(todoId);
      if (!result.success) {
        toast(result.error ?? "상태 변경에 실패했어요.", "error");
      }
      // 성공 여부와 무관하게 server data로 정합성 복구
      // useOptimistic은 transition 종료 시 base state로 자동 reset → router.refresh로 새 데이터
      router.refresh();
    });
  }

  // PR 25 — 실행계획 카드 안 루틴 토글 (오늘 단위, 일 단위)
  function handleToggleRoutineFromCard(routineId: string) {
    startTransition(async () => {
      applyOptimisticRoutine(routineId);
      const result = await toggleRoutineCompletionAction(routineId);
      if (!result.success) {
        toast(result.error ?? "상태 변경에 실패했어요.", "error");
      }
      router.refresh();
    });
  }

  // PR 34: 전체 발걸음 재생성 함수(handleRegenerateAll) 삭제 — UX 단순화.
  //   단일 발걸음 재생성은 StepSheet(edit-with-ai) 내부의 AI 생성 버튼이 담당.

  return (
    <div className="flex flex-col gap-4 pb-24">
      <LifeClockHeader age={data.profile.life_clock_age} />

      {/* 발걸음 3섹션 (PR 8): 인사이트 → 지향점 → 실행계획
          PR 29: InsightSection은 현재 버킷 + 대화 placeholder만 표시.
          IA v2 목표 3: 버킷 전환은 헤더 BucketSwitcher로 일원화 — 드롭다운 prop 제거. */}
      <InsightSection bucketTitle={data.selectedBucket?.title ?? null} />

      {data.stridePlan && (
        <>
          <DirectionSection
            items={strideGroups.direction}
            onEditLevel={handleEditOpen}
            regeneratingLevel={regeneratingLevel}
          />
          <ExecutionPlanSection
            items={strideGroups.execution}
            // PR 25: Optimistic — 토글 즉시 반영, transition 종료 시 server data로 정합성 복구
            dailyTodos={optimisticDailyTodos}
            routines={optimisticRoutines}
            onEditLevel={handleEditOpen}
            onToggleTodo={handleToggleTodoFromCard}
            onToggleRoutine={handleToggleRoutineFromCard}
            onOpenRoutineCalendar={(routine) => {
              setCalendarRoutine(routine);
            }}
            regeneratingLevel={regeneratingLevel}
            // PR 25: Optimistic UI가 즉시 반영하므로 disable 불필요 (사용자 체감 0ms).
            // 빠른 연속 클릭은 useTransition이 자동 큐잉.
            togglingTodoId={null}
            togglingRoutineId={null}
            onAddToLevel={(item) => {
              if (!data.selectedBucket?.id) {
                toast(`먼저 ${FEATURE_NAMES.BUCKET}을 선택해주세요.`, "error");
                return;
              }
              // 실행계획은 PR 18 이후 this_month 1개로 단순화 → 카드 level별 분기 없음.
              // 카드 ⋮ "추가"는 AI 옵션 ON 유지 (기존 PR 35 동작 보존).
              void item;
              setEditingStride(null);
              setStepSheetInitialMode("next-step");
              setStepSheetEnableAI(true);
              setStepSheetOpen(true);
            }}
            strideDetailHref={detailHref}
            extraCount={extraMergedCount}
          />
        </>
      )}

      {!data.stridePlan && (
        <p className="rounded-xl border border-foreground/10 px-4 py-4 text-sm text-foreground/60">
          아직 {FEATURE_NAMES.MY_STRIDES}이 없어요. 상단 + 버튼으로 새 장면을 추가해보세요.
        </p>
      )}

      {/* FAB — IA v2 목표 1·4: 항상 StepSheet을 next-step 모드로 진입.
          AI toggle은 기본 OFF (PR 35 직접 입력 폼 의도 유지), 사용자가 시트 안에서 켤 수 있음.
          버킷 0개 빈 상태는 StepSheet 내부 가드가 담당. */}
      <button
        type="button"
        onClick={() => {
          setEditingStride(null);
          setStepSheetInitialMode("next-step");
          setStepSheetEnableAI(false);
          setStepSheetOpen(true);
        }}
        className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-2xl text-background shadow-lg transition-opacity hover:opacity-90"
        aria-label={FEATURE_NAMES.STEP_MORE}
      >
        +
      </button>

      {/* IA v2 목표 4 — 통합 StepSheet (단일 depth).
          NextStepSheet(3단계) + EditWithAISheet(단독)를 흡수한 단일 진입점. */}
      <StepSheet
        open={stepSheetOpen}
        onClose={() => {
          setStepSheetOpen(false);
          setEditingStride(null);
        }}
        initialMode={stepSheetInitialMode}
        bucketId={data.selectedBucket?.id ?? null}
        onApplied={() => router.refresh()}
        editingStride={editingStride}
        editHistory={
          editingStride
            ? (data.stridePlan?.title_history?.[editingStride.level] ?? []).map(
                (entry) => entry.title
              )
            : undefined
        }
        // this_month 카드에서만 의미 — StepSheet 내부에서도 한 번 더 가드하지만 데이터 양 자체를 줄여 전송.
        editTodos={
          editingStride?.level === "this_month"
            ? optimisticDailyTodos.filter((t) => t.stride_level === "this_month")
            : []
        }
        editRoutines={editingStride?.level === "this_month" ? optimisticRoutines : []}
        onDeleteTodo={async (id) => {
          const r = await deleteDailyTodoAction(id);
          if (r.success) {
            toast(`${FEATURE_NAMES.DAILY_TODO}을 삭제했어요.`, "success");
            router.refresh();
          } else {
            toast(r.error ?? `${FEATURE_NAMES.DAILY_TODO} 삭제에 실패했어요.`, "error");
          }
        }}
        onDeactivateRoutine={async (id) => {
          const r = await deactivateRoutineAction(id);
          if (r.success) {
            toast(`${FEATURE_NAMES.ROUTINE}을 비활성화했어요.`, "success");
            router.refresh();
          } else {
            toast(r.error ?? `${FEATURE_NAMES.ROUTINE} 비활성화에 실패했어요.`, "error");
          }
        }}
        defaultAIEnabled={stepSheetEnableAI}
      />

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
