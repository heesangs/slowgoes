"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { DirectionSection } from "@/components/dashboard/direction-section";
import { ExecutionPlanSection } from "@/components/dashboard/execution-plan-section";
import { InsightSection } from "@/components/dashboard/insight-section";
import { LifeClockHeader } from "@/components/dashboard/life-clock-header";
import { RoutineCalendarSheet } from "@/components/dashboard/routine-calendar-sheet";
import { KeyboardAccessoryInput } from "@/components/ui/keyboard-accessory-input";
import { useToast } from "@/components/ui/toast";
import {
  applyNextStepAction,
  deactivateRoutineAction,
  deleteBucketAction,
  deleteDailyTodoAction,
  generateNextStepPreviewAction,
  toggleDailyTodoAction,
  toggleRoutineCompletionAction,
  updateStrideItemAction,
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
  const queryClient = useQueryClient();

  // 대시보드 캐시 무효화 헬퍼 (router.refresh 대체).
  // optimistic 토글은 await로 base 갱신을 기다려 깜빡임을 막는다.
  const invalidateDashboard = () =>
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });

  // PR 31: 현재 보고 있는 버킷을 cookie에 기록 (로고 클릭 시 복귀에 사용)
  useTrackLastViewedBucket(data.selectedBucket?.id ?? null);

  // 할일 추가/발걸음 수정 — 키보드 상단 입력창(Input Accessory View) 단일 패턴.
  //   - FAB(+)      → mode="add": 직접 입력 + [AI] 버튼만 (투두로 저장)
  //   - 카드 ⋮ 수정 → mode="edit": 해당 발걸음 타이틀 텍스트만 수정
  //   StepSheet(구 763줄)은 이 패턴으로 대체되어 삭제됨.
  const [inputMode, setInputMode] = useState<
    | { type: "add" }
    | { type: "edit"; stride: StrideItem }
    | null
  >(null);
  const [inputValue, setInputValue] = useState("");
  const [isSubmittingInput, setIsSubmittingInput] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // DirectionSection / ExecutionPlanSection prop 호환용 (AI 재생성 제거로 항상 null)
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

  // IA v2 목표 5: /actions 폐기로 "더보기" 링크가 사라져 extraCount/detailHref도 불필요.
  //   완료 항목 진입은 ExecutionPlanSection 헤더 탭이 대신한다.

  // 발걸음 3섹션 분류 (PR 8) — strides가 바뀔 때만 재계산
  const strideGroups = useMemo(
    () => splitStridesByGroup(data.stridePlan?.strides ?? []),
    [data.stridePlan]
  );

  // IA v2 목표 5: /actions 헤더에 있던 '버킷 삭제' 메뉴를 대시보드(ExecutionPlanSection 헤더)로 흡수.
  //   CASCADE로 stride_plan/daily_todos/routines 자동 정리되며,
  //   삭제 후 다른 버킷이 있으면 그쪽으로, 없으면 /dashboard 루트로 라우팅.
  const [isDeletingBucket, startDeleteBucket] = useTransition();
  function handleDeleteBucket() {
    const bucketId = data.selectedBucket?.id;
    if (!bucketId || isDeletingBucket) return;
    const confirmMsg =
      typeof window !== "undefined"
        ? window.confirm(
            `이 ${FEATURE_NAMES.BUCKET}을 삭제할까요?\n관련된 ${FEATURE_NAMES.DAILY_TODO}/${FEATURE_NAMES.ROUTINE}/${FEATURE_NAMES.MY_STRIDES}도 함께 사라져요.`,
          )
        : true;
    if (!confirmMsg) return;

    startDeleteBucket(async () => {
      const result = await deleteBucketAction(bucketId);
      if (!result.success) {
        toast(result.error ?? `${FEATURE_NAMES.BUCKET} 삭제에 실패했어요.`, "error");
        return;
      }
      const nextBucket = data.buckets.find((b) => b.id !== bucketId);
      toast(`${FEATURE_NAMES.BUCKET}을 삭제했어요.`, "success");
      // 버킷 목록이 바뀌었으므로 대시보드 캐시 전체 무효화 후 이동
      await invalidateDashboard();
      if (nextBucket) {
        router.replace(`/dashboard?bucket=${nextBucket.id}`);
      } else {
        router.replace("/dashboard");
      }
    });
  }

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

  // 카드 ⋮ "수정" → 키보드 입력창(타이틀 프리필, 텍스트만 수정)
  function handleEditOpen(item: StrideItem) {
    setInputValue(item.action);
    setInputMode({ type: "edit", stride: item });
  }

  // FAB(+) → 키보드 입력창 (직접 입력 + AI)
  function handleAddOpen() {
    if (!data.selectedBucket?.id) {
      toast(`먼저 ${FEATURE_NAMES.BUCKET}을 선택해주세요.`, "error");
      return;
    }
    setInputValue("");
    setInputMode({ type: "add" });
  }

  // [AI] 버튼 — 추천 타이틀을 입력창에 채움(사용자가 수정 후 확정)
  async function handleGenerateAI() {
    const bucketId = data.selectedBucket?.id;
    if (!bucketId || isGeneratingAI) return;
    setIsGeneratingAI(true);
    try {
      const existingTitles = data.dailyTodos.map((t) => t.title);
      const result = await generateNextStepPreviewAction(bucketId, "daily_todo", existingTitles);
      if (result.success && result.data) {
        setInputValue(result.data.title);
      } else {
        toast(result.error ?? "AI 추천에 실패했어요.", "error");
      }
    } finally {
      setIsGeneratingAI(false);
    }
  }

  async function handleInputSubmit(value: string) {
    const bucketId = data.selectedBucket?.id;
    if (!inputMode || !bucketId || isSubmittingInput) return;

    // 수정인데 변경이 없으면 서버 호출 없이 닫기 (dirty 체크)
    if (inputMode.type === "edit" && value === inputMode.stride.action.trim()) {
      setInputMode(null);
      return;
    }

    setIsSubmittingInput(true);
    try {
      if (inputMode.type === "add") {
        const result = await applyNextStepAction(bucketId, {
          daily: { title: value, strideLevel: "this_month" },
          routine: null,
        });
        if (!result.success) {
          toast(result.error ?? "추가에 실패했어요.", "error");
          return;
        }
      } else {
        const result = await updateStrideItemAction(bucketId, inputMode.stride.level, value);
        if (!result.success) {
          toast(result.error ?? "수정에 실패했어요.", "error");
          return;
        }
      }
      setInputMode(null);
      invalidateDashboard();
    } finally {
      setIsSubmittingInput(false);
    }
  }

  // PR 25 — 실행계획 카드 안 투두 토글: useOptimistic으로 즉시 반영
  function handleToggleTodoFromCard(todoId: string) {
    startTransition(async () => {
      applyOptimisticDaily(todoId);
      const result = await toggleDailyTodoAction(todoId);
      if (!result.success) {
        toast(result.error ?? "상태 변경에 실패했어요.", "error");
      }
      // 회고 통계(action_logs)도 영향 → 무효화. 대시보드는 await로 base 갱신을 기다려
      // optimistic 값이 깜빡이지 않게 한다.
      queryClient.invalidateQueries({ queryKey: ["review"] });
      await invalidateDashboard();
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
      queryClient.invalidateQueries({ queryKey: ["review"] });
      await invalidateDashboard();
    });
  }

  // PR 34: 전체 발걸음 재생성 삭제. Phase A: 수정 시 AI 재생성도 제거(텍스트 수정만).

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
            // 행 단위 삭제/비활성 — 구 StepSheet 삭제 섹션을 행 ⋮ 메뉴로 이관
            onDeleteTodo={async (id) => {
              const r = await deleteDailyTodoAction(id);
              if (r.success) {
                invalidateDashboard();
              } else {
                toast(r.error ?? `${FEATURE_NAMES.DAILY_TODO} 삭제에 실패했어요.`, "error");
              }
            }}
            onDeactivateRoutine={async (id) => {
              const r = await deactivateRoutineAction(id);
              if (r.success) {
                invalidateDashboard();
              } else {
                toast(r.error ?? `${FEATURE_NAMES.ROUTINE} 비활성화에 실패했어요.`, "error");
              }
            }}
            onDeleteBucket={data.selectedBucket ? handleDeleteBucket : undefined}
            isDeletingBucket={isDeletingBucket}
          />
        </>
      )}

      {!data.stridePlan && (
        <p className="rounded-xl border border-foreground/10 px-4 py-4 text-sm text-foreground/60">
          아직 {FEATURE_NAMES.MY_STRIDES}이 없어요. 상단 + 버튼으로 새 장면을 추가해보세요.
        </p>
      )}

      {/* FAB(+) — 키보드 상단 입력창으로 할 일 추가 (직접 입력 + AI) */}
      <button
        type="button"
        onClick={handleAddOpen}
        className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-2xl text-background shadow-lg transition-opacity hover:opacity-90"
        aria-label={FEATURE_NAMES.STEP_MORE}
      >
        +
      </button>

      {/* 키보드 상단 입력창 — 추가/수정 공용 (Input Accessory View 패턴) */}
      <KeyboardAccessoryInput
        open={inputMode !== null}
        onClose={() => setInputMode(null)}
        onSubmit={handleInputSubmit}
        value={inputValue}
        onValueChange={setInputValue}
        placeholder={
          inputMode?.type === "edit"
            ? `${inputMode.stride.label} 내용을 수정하세요`
            : "할 일을 입력하세요"
        }
        submitLabel={inputMode?.type === "edit" ? "저장" : "추가"}
        isSubmitting={isSubmittingInput}
        rightActions={
          inputMode?.type === "add" ? (
            <button
              type="button"
              onClick={handleGenerateAI}
              disabled={isGeneratingAI}
              aria-label="AI 추천 받기"
              className="shrink-0 rounded-lg border border-foreground/20 px-3 py-2 text-sm text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
            >
              {isGeneratingAI ? "…" : "AI"}
            </button>
          ) : undefined
        }
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
