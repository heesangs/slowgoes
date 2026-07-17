"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarSection } from "@/components/dashboard/calendar-section";
import { DirectionSection } from "@/components/dashboard/direction-section";
import { InsightSection } from "@/components/dashboard/insight-section";
import { LifeClockHeader } from "@/components/dashboard/life-clock-header";
import { RepeatOptionsSheet } from "@/components/dashboard/repeat-options-sheet";
import { KeyboardAccessoryInput } from "@/components/ui/keyboard-accessory-input";
import { useToast } from "@/components/ui/toast";
import {
  addTodoAction,
  deleteBucketAction,
  deleteTodoAction,
  generateNextStepPreviewAction,
  toggleTodoCompletionAction,
  updateStrideItemAction,
} from "@/app/(main)/dashboard/actions";
import { useTrackLastViewedBucket } from "@/hooks/use-track-last-viewed-bucket";
import { useTodos } from "@/hooks/use-todos";
import { splitStridesByGroup } from "@/lib/ai/analyze";
import { FEATURE_NAMES } from "@/lib/constants";
import { formatRepeatInputLabel, getTodayDateString, parseDateString } from "@/lib/todos/repeat";
import type {
  DashboardV2Data,
  StrideItem,
  StrideLevel,
  TodoRepeatInput,
  TodoWithCompletion,
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

  // Phase B: [반복] 버튼 — 선택 시 할 일이 루틴이 된다
  const [repeatSheetOpen, setRepeatSheetOpen] = useState(false);
  const [selectedRepeat, setSelectedRepeat] = useState<TodoRepeatInput | null>(null);

  // DirectionSection prop 호환용 (AI 재생성 제거로 항상 null)
  const regeneratingLevel: StrideLevel | null = null;

  // Phase C: 캘린더 선택 날짜 (기본 오늘). 날짜별 todos는 독립 쿼리 —
  // 방문했던 날짜는 캐시로 즉시 표시된다 (['todos', bucketId, date]).
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateString());
  const { data: todosData, isLoading: isLoadingTodos } = useTodos(
    data.selectedBucket?.id ?? null,
    selectedDate
  );
  const todos = useMemo(() => todosData ?? [], [todosData]);

  const invalidateTodos = () => queryClient.invalidateQueries({ queryKey: ["todos"] });

  // Optimistic UI: 토글 즉시 반영, 실패 시 자동 rollback
  const [, startTransition] = useTransition();
  const [optimisticTodos, applyOptimisticTodo] = useOptimistic(
    todos,
    (state: TodoWithCompletion[], todoId: string) =>
      state.map((t) =>
        t.id === todoId ? { ...t, is_completed: !t.is_completed } : t
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

  // FAB(+) → 키보드 입력창 (직접 입력 + AI + 반복)
  function handleAddOpen() {
    if (!data.selectedBucket?.id) {
      toast(`먼저 ${FEATURE_NAMES.BUCKET}을 선택해주세요.`, "error");
      return;
    }
    setInputValue("");
    setSelectedRepeat(null);
    setInputMode({ type: "add" });
  }

  // [AI] 버튼 — 추천 타이틀을 입력창에 채움(사용자가 수정 후 확정)
  async function handleGenerateAI() {
    const bucketId = data.selectedBucket?.id;
    if (!bucketId || isGeneratingAI) return;
    setIsGeneratingAI(true);
    try {
      const existingTitles = todos.map((t) => t.title);
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
        // Phase C: 기준일 = 캘린더 선택 날짜 (기본 오늘). 반복 선택 시 루틴이 된다.
        const result = await addTodoAction(bucketId, {
          title: value,
          scheduledDate: selectedDate,
          repeat: selectedRepeat,
          source: "manual",
        });
        if (!result.success) {
          toast(result.error ?? "추가에 실패했어요.", "error");
          return;
        }
        setSelectedRepeat(null);
        setInputMode(null);
        invalidateTodos();
      } else {
        const result = await updateStrideItemAction(bucketId, inputMode.stride.level, value);
        if (!result.success) {
          toast(result.error ?? "수정에 실패했어요.", "error");
          return;
        }
        setInputMode(null);
        invalidateDashboard();
      }
    } finally {
      setIsSubmittingInput(false);
    }
  }

  // 할 일 완료 토글 — useOptimistic 즉시 반영 (선택 날짜 단위)
  function handleToggleTodo(todoId: string) {
    startTransition(async () => {
      applyOptimisticTodo(todoId);
      const result = await toggleTodoCompletionAction(todoId, selectedDate);
      if (!result.success) {
        toast(result.error ?? "상태 변경에 실패했어요.", "error");
      }
      // 회고 통계(action_logs)도 영향 → 무효화. todos는 await로 base 갱신을 기다려
      // optimistic 값이 깜빡이지 않게 한다.
      queryClient.invalidateQueries({ queryKey: ["review"] });
      await invalidateTodos();
    });
  }

  // 할 일 삭제 — 1회성=hard delete, 반복=비활성(서버 판단)
  async function handleDeleteTodo(todo: TodoWithCompletion) {
    const result = await deleteTodoAction(todo.id);
    if (result.success) {
      invalidateTodos();
    } else {
      toast(result.error ?? "할 일 삭제에 실패했어요.", "error");
    }
  }

  // 캘린더 헤더의 이번달 발걸음 (수정 진입 대상)
  const thisMonthStride = useMemo(
    () =>
      strideGroups.execution.find((item) => item.level === "this_month") ??
      strideGroups.execution[0] ??
      null,
    [strideGroups]
  );

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
          {/* Phase C: 캘린더 섹션 — 주↔월 전환 + 날짜 탭 + 진행중/완료 상하 구분 */}
          <CalendarSection
            thisMonthStride={thisMonthStride}
            onEditThisMonth={handleEditOpen}
            todos={optimisticTodos}
            isLoadingTodos={isLoadingTodos}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onToggleTodo={handleToggleTodo}
            onDeleteTodo={handleDeleteTodo}
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
            : selectedDate === getTodayDateString()
              ? "할 일을 입력하세요"
              : `${parseDateString(selectedDate).getMonth() + 1}월 ${parseDateString(selectedDate).getDate()}일의 할 일을 입력하세요`
        }
        submitLabel={inputMode?.type === "edit" ? "저장" : "추가"}
        isSubmitting={isSubmittingInput}
        leftActions={
          inputMode?.type === "add" ? (
            <button
              type="button"
              onClick={() => setRepeatSheetOpen(true)}
              aria-label="반복 설정"
              aria-pressed={selectedRepeat !== null}
              className={
                selectedRepeat
                  ? "shrink-0 whitespace-nowrap rounded-lg border border-foreground bg-foreground px-2.5 py-2 text-xs text-background"
                  : "shrink-0 whitespace-nowrap rounded-lg border border-foreground/20 px-2.5 py-2 text-xs text-foreground/70 transition-colors hover:bg-foreground/5"
              }
            >
              🔁 {formatRepeatInputLabel(selectedRepeat)}
            </button>
          ) : undefined
        }
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

      {/* [반복] 옵션 시트 — 기준일은 캘린더 선택 날짜. 선택 시 할 일이 루틴이 된다 */}
      <RepeatOptionsSheet
        open={repeatSheetOpen}
        onClose={() => setRepeatSheetOpen(false)}
        baseDate={selectedDate}
        selected={selectedRepeat}
        onSelect={setSelectedRepeat}
      />
    </div>
  );
}
