"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarSection } from "@/components/dashboard/calendar-section";
import { DirectionSection } from "@/components/dashboard/direction-section";
import { InsightSection } from "@/components/dashboard/insight-section";
import { RepeatOptionsSheet } from "@/components/dashboard/repeat-options-sheet";
import {
  KeyboardAccessoryInput,
  type KeyboardAccessoryInputHandle,
} from "@/components/ui/keyboard-accessory-input";
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
import { useBucketTodos } from "@/hooks/use-todos";
import { splitStridesByGroup } from "@/lib/ai/analyze";
import { FEATURE_NAMES } from "@/lib/constants";
import {
  deriveTodosForDate,
  formatRepeatInputLabel,
  getTodayDateString,
  parseDateString,
} from "@/lib/todos/repeat";
import type {
  BucketTodosData,
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
  // iOS 키보드 즉시 오픈용 — 클릭 핸들러에서 동기 focus 호출
  const inputHandleRef = useRef<KeyboardAccessoryInputHandle | null>(null);
  // add 모드 드래프트 — 배경 탭으로 닫아도 유지, 성공 제출 시에만 초기화 (탭 이동/페이지 이탈은 언마운트로 자연 초기화)
  const addDraftRef = useRef("");

  // Phase B: [반복] 버튼 — 선택 시 할 일이 루틴이 된다
  const [repeatSheetOpen, setRepeatSheetOpen] = useState(false);
  const [selectedRepeat, setSelectedRepeat] = useState<TodoRepeatInput | null>(null);

  // DirectionSection prop 호환용 (AI 재생성 제거로 항상 null)
  const regeneratingLevel: StrideLevel | null = null;

  // 캘린더 선택 날짜 (기본 오늘).
  // todos는 **버킷 단위 캐시**(['todos', bucketId]) — 날짜 필터는 클라 파생이라
  // 어떤 날짜를 탭해도 서버 왕복 0회(버킷당 최초 1회만 로드).
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateString());
  const bucketId = data.selectedBucket?.id ?? null;
  const { data: bucketTodos, isLoading: isLoadingTodos } = useBucketTodos(bucketId);
  const todosKey = useMemo(() => ["todos", bucketId] as const, [bucketId]);

  const todos = useMemo(
    () =>
      bucketTodos
        ? deriveTodosForDate(bucketTodos, selectedDate, getTodayDateString())
        : [],
    [bucketTodos, selectedDate]
  );

  const invalidateTodos = () => queryClient.invalidateQueries({ queryKey: todosKey });

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
    // 클릭 제스처 안에서 동기 focus → iOS 소프트 키보드 즉시 오픈
    inputHandleRef.current?.focus();
  }

  // FAB(+) → 키보드 입력창 (직접 입력 + AI + 반복). 드래프트가 있으면 복원.
  function handleAddOpen() {
    if (!data.selectedBucket?.id) {
      toast(`먼저 ${FEATURE_NAMES.BUCKET}을 선택해주세요.`, "error");
      return;
    }
    setInputValue(addDraftRef.current);
    setInputMode({ type: "add" });
    inputHandleRef.current?.focus();
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
        if (!result.success || !result.todo) {
          toast(result.error ?? "추가에 실패했어요.", "error");
          return;
        }
        // 성공 시에만 드래프트/반복 초기화 + 생성 row를 캐시에 직접 append (재페치 0)
        const created = result.todo;
        queryClient.setQueryData<BucketTodosData>(todosKey, (old) =>
          old ? { ...old, todos: [...old.todos, created] } : old
        );
        addDraftRef.current = "";
        setInputValue("");
        setSelectedRepeat(null);
        setInputMode(null);
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

  // 할 일 완료 토글 — 캐시(completions)에 직접 반영(체감 0ms) → 서버는 백그라운드.
  // 서버 toggleTodoCompletionAction과 동일 규칙: (todoId, selectedDate) completion 행 유무 토글.
  function handleToggleTodo(todoId: string) {
    queryClient.setQueryData<BucketTodosData>(todosKey, (old) => {
      if (!old) return old;
      const exists = old.completions.some(
        (c) => c.todo_id === todoId && c.completion_date === selectedDate
      );
      return {
        ...old,
        completions: exists
          ? old.completions.filter(
              (c) => !(c.todo_id === todoId && c.completion_date === selectedDate)
            )
          : [...old.completions, { todo_id: todoId, completion_date: selectedDate }],
      };
    });

    void toggleTodoCompletionAction(todoId, selectedDate).then((result) => {
      if (!result.success) {
        // 실패 → 서버 진실로 롤백
        toast(result.error ?? "상태 변경에 실패했어요.", "error");
        invalidateTodos();
        return;
      }
      // 회고 통계(action_logs) 영향만 무효화 — todos는 캐시가 이미 진실
      queryClient.invalidateQueries({ queryKey: ["review"] });
    });
  }

  // 할 일 삭제 — 캐시에서 즉시 제거(체감 0ms) → 서버(1회성=hard, 반복=비활성)는 백그라운드
  function handleDeleteTodo(todo: TodoWithCompletion) {
    queryClient.setQueryData<BucketTodosData>(todosKey, (old) =>
      old
        ? {
            todos: old.todos.filter((t) => t.id !== todo.id),
            completions: old.completions.filter((c) => c.todo_id !== todo.id),
          }
        : old
    );

    void deleteTodoAction(todo.id).then((result) => {
      if (!result.success) {
        toast(result.error ?? "할 일 삭제에 실패했어요.", "error");
        invalidateTodos();
      }
    });
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
      {/* 나의 시간은 상단 네비(MyTimeBar)로 이동 — 본문 카드 제거 */}

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
            todos={todos}
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

      {/* 키보드 상단 입력창 — 추가/수정 공용 (피그마 32502-1352: 2단, 시스템 테마 서피스) */}
      <KeyboardAccessoryInput
        ref={inputHandleRef}
        open={inputMode !== null}
        onClose={() => setInputMode(null)}
        onSubmit={handleInputSubmit}
        value={inputValue}
        onValueChange={(v) => {
          setInputValue(v);
          // add 드래프트 동기 저장 — 배경 탭으로 닫아도 유지
          if (inputMode?.type === "add") addDraftRef.current = v;
        }}
        placeholder={
          inputMode?.type === "edit"
            ? `${inputMode.stride.label} 내용을 수정하세요`
            : selectedDate === getTodayDateString()
              ? "무엇이 하고싶으신가요?"
              : `${parseDateString(selectedDate).getMonth() + 1}월 ${parseDateString(selectedDate).getDate()}일에 무엇이 하고싶으신가요?`
        }
        isSubmitting={isSubmittingInput}
        isBusy={isGeneratingAI}
        busyPlaceholder={`${data.selectedBucket?.title ?? "버킷"} 관련 추천중...`}
        actions={
          inputMode?.type === "add" ? (
            <>
              <button
                type="button"
                onClick={() => setRepeatSheetOpen(true)}
                aria-label="반복 설정"
                aria-pressed={selectedRepeat !== null}
                className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-xs transition-opacity hover:opacity-80"
                style={
                  selectedRepeat
                    ? {
                        background: "var(--kai-accent)",
                        color: "var(--kai-accent-text)",
                        borderColor: "var(--kai-accent)",
                      }
                    : { color: "var(--kai-text)", borderColor: "var(--kai-border)" }
                }
              >
                🔁 {formatRepeatInputLabel(selectedRepeat)}
              </button>
              <button
                type="button"
                onClick={handleGenerateAI}
                disabled={isGeneratingAI}
                aria-label="AI 추천 받기"
                className="inline-flex h-8 shrink-0 items-center rounded-lg border px-2.5 text-xs transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ color: "var(--kai-text)", borderColor: "var(--kai-border)" }}
              >
                {isGeneratingAI ? "…" : "AI"}
              </button>
            </>
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
