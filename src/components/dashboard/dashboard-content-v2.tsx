"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AiSuggestionsSheet } from "@/components/dashboard/ai-suggestions-sheet";
import { BucketBar } from "@/components/dashboard/bucket-bar";
import { CalendarSection } from "@/components/dashboard/calendar-section";
import { DirectionSheet } from "@/components/dashboard/direction-sheet";
import { ExploreNewSceneSheet } from "@/components/dashboard/explore-new-scene-sheet";
import { RepeatOptionsSheet } from "@/components/dashboard/repeat-options-sheet";
import {
  KeyboardAccessoryInput,
  type KeyboardAccessoryInputHandle,
} from "@/components/ui/keyboard-accessory-input";
import { useToast } from "@/components/ui/toast";
import {
  addTodoAction,
  addTodosAction,
  deleteBucketAction,
  deleteTodoAction,
  generateTodoSuggestionsAction,
  toggleTodoCompletionAction,
  updateBucketTitleAction,
  updateStrideItemAction,
  updateTodoAction,
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
  todoRepeatToInput,
} from "@/lib/todos/repeat";
import type {
  BucketTodosData,
  DashboardV2Data,
  Gender,
  PaceType,
  PersonalityType,
  StrideItem,
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
    | { type: "bucket-edit"; bucket: { id: string; title: string } }
    | { type: "todo-edit"; todo: TodoWithCompletion }
    | null
  >(null);
  // R1: 새 버킷 추가 시트 (구 BucketSwitcher + 칩에서 버킷 카드 시트로 이동)
  const [exploreOpen, setExploreOpen] = useState(false);
  // R3: 지향점 시트 (구 DirectionSection → 캘린더 헤더 ▼로 진입)
  const [directionOpen, setDirectionOpen] = useState(false);
  // R2: AI 추천 3개 선택 시트
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [isRegisteringAi, setIsRegisteringAi] = useState(false);
  // add 모드의 반복 드래프트 — todo-edit가 selectedRepeat를 덮어써도 복원 가능하게
  const addRepeatDraftRef = useRef<TodoRepeatInput | null>(null);
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
  // 시트 편집 모드에서 임의 버킷 삭제 가능 — bucketId를 파라미터로 받는다
  function handleDeleteBucket(bucket: { id: string; title: string }) {
    if (isDeletingBucket) return;
    const confirmMsg =
      typeof window !== "undefined"
        ? window.confirm(
            `'${bucket.title}' ${FEATURE_NAMES.BUCKET}을 삭제할까요?\n관련된 ${FEATURE_NAMES.DAILY_TODO}/${FEATURE_NAMES.ROUTINE}/${FEATURE_NAMES.MY_STRIDES}도 함께 사라져요.`,
          )
        : true;
    if (!confirmMsg) return;

    startDeleteBucket(async () => {
      const result = await deleteBucketAction(bucket.id);
      if (!result.success) {
        toast(result.error ?? `${FEATURE_NAMES.BUCKET} 삭제에 실패했어요.`, "error");
        return;
      }
      toast(`${FEATURE_NAMES.BUCKET}을 삭제했어요.`, "success");
      // 버킷 목록이 바뀌었으므로 대시보드 캐시 전체 무효화 후 이동
      await invalidateDashboard();
      if (bucket.id === data.selectedBucket?.id) {
        // 현재 보던 버킷을 지웠으면 다른 버킷으로 (없으면 루트)
        const nextBucket = data.buckets.find((b) => b.id !== bucket.id);
        router.replace(nextBucket ? `/dashboard?bucket=${nextBucket.id}` : "/dashboard");
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

  // R3: 지향점 시트 카드 탭 → 시트 닫고 키보드 입력창으로 수정
  function handleEditStrideFromSheet(item: StrideItem) {
    setDirectionOpen(false);
    handleEditOpen(item);
  }

  // 시트 편집 모드 [수정] → 키보드 입력창으로 해당 버킷 타이틀 수정 (임의 버킷 대상)
  function handleEditBucketTitle(bucket: { id: string; title: string }) {
    setInputValue(bucket.title);
    setInputMode({ type: "bucket-edit", bucket });
    inputHandleRef.current?.focus();
  }

  // R2: 투두 텍스트 탭 → 키보드 입력창으로 수정 (타이틀 + 반복 프리필).
  //   반복 변경으로 투두 ↔ 루틴 전환을 커버한다.
  //   add 모드의 반복 드래프트는 보존했다가 닫을 때 복원.
  function handleEditTodo(todo: TodoWithCompletion) {
    addRepeatDraftRef.current = selectedRepeat;
    setInputValue(todo.title);
    setSelectedRepeat(todoRepeatToInput(todo));
    setInputMode({ type: "todo-edit", todo });
    inputHandleRef.current?.focus();
  }

  // 입력창 닫기 — todo-edit를 벗어날 땐 add 모드 반복 드래프트를 복원한다.
  function handleCloseInput() {
    if (inputMode?.type === "todo-edit") {
      setSelectedRepeat(addRepeatDraftRef.current);
    }
    setInputMode(null);
  }

  // 새 장면 탐색 프리필 — 프로필이 완전할 때만 (구 MainNavBarLoader 로직 이식)
  const prefillProfile = useMemo(() => {
    const p = data.profile;
    if (
      p.life_clock_age != null &&
      (p.gender === "male" || p.gender === "female") &&
      p.personality_type != null
    ) {
      return {
        age: p.life_clock_age,
        gender: p.gender as Gender,
        personalityType: p.personality_type as PersonalityType,
        paceType: (p.pace_type ?? undefined) as PaceType | undefined,
      };
    }
    return null;
  }, [data.profile]);

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

  // [AI] 버튼 — aiprompt.md 규칙으로 3개 추천 → AiSuggestionsSheet에서 선택 등록.
  // busy 동안 입력창은 오버레이("...추천중")로 진행 상태를 보여준다.
  async function handleGenerateAI() {
    const bucketId = data.selectedBucket?.id;
    if (!bucketId || isGeneratingAI) return;
    setIsGeneratingAI(true);
    try {
      const result = await generateTodoSuggestionsAction(bucketId, selectedDate);
      if (result.success && result.todos && result.todos.length > 0) {
        setAiSuggestions(result.todos);
        setAiSheetOpen(true);
      } else {
        toast(result.error ?? "AI 추천에 실패했어요.", "error");
      }
    } finally {
      setIsGeneratingAI(false);
    }
  }

  // AiSuggestionsSheet "등록" — 선택 타이틀을 한 번에 저장하고 캐시에 append (재페치 0)
  async function handleRegisterAiTodos(titles: string[]) {
    const bucketId = data.selectedBucket?.id;
    if (!bucketId || titles.length === 0 || isRegisteringAi) return;
    setIsRegisteringAi(true);
    try {
      const result = await addTodosAction(bucketId, { titles, scheduledDate: selectedDate });
      if (!result.success || !result.todos) {
        toast(result.error ?? "등록에 실패했어요.", "error");
        return;
      }
      const created = result.todos;
      queryClient.setQueryData<BucketTodosData>(todosKey, (old) =>
        old ? { ...old, todos: [...old.todos, ...created] } : old
      );
      setAiSheetOpen(false);
      setInputMode(null);
      toast(`${created.length}개 등록했어요 ✨`, "success");
    } finally {
      setIsRegisteringAi(false);
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
    if (inputMode.type === "bucket-edit" && value === inputMode.bucket.title.trim()) {
      setInputMode(null);
      return;
    }
    // 투두 수정: 타이틀·반복 모두 그대로면 서버 호출 없이 닫기
    if (inputMode.type === "todo-edit") {
      const sameTitle = value === inputMode.todo.title.trim();
      const sameRepeat =
        JSON.stringify(selectedRepeat) ===
        JSON.stringify(todoRepeatToInput(inputMode.todo));
      if (sameTitle && sameRepeat) {
        handleCloseInput();
        return;
      }
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
      } else if (inputMode.type === "bucket-edit") {
        // 버킷 타이틀 수정 — 시트 편집 모드에서 임의 버킷 대상
        const result = await updateBucketTitleAction(inputMode.bucket.id, value);
        if (!result.success) {
          toast(result.error ?? "버킷 이름 수정에 실패했어요.", "error");
          return;
        }
        setInputMode(null);
        invalidateDashboard();
      } else if (inputMode.type === "todo-edit") {
        // R2: 투두 타이틀 + 반복 수정 → 캐시 todo 교체 (재페치 0)
        const result = await updateTodoAction(inputMode.todo.id, {
          title: value,
          repeat: selectedRepeat,
        });
        if (!result.success || !result.todo) {
          toast(result.error ?? "수정에 실패했어요.", "error");
          return;
        }
        const updated = result.todo;
        queryClient.setQueryData<BucketTodosData>(todosKey, (old) =>
          old
            ? { ...old, todos: old.todos.map((t) => (t.id === updated.id ? updated : t)) }
            : old
        );
        setSelectedRepeat(addRepeatDraftRef.current); // add 모드 반복 드래프트 복원
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

  // R3: 지향점 시트의 this_month 카드 라벨은 "이번 달" 대신 해당 달(예: "7월")
  const monthLabel = `${parseDateString(getTodayDateString()).getMonth() + 1}월`;

  // PR 34: 전체 발걸음 재생성 삭제. Phase A: 수정 시 AI 재생성도 제거(텍스트 수정만).

  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* 버킷 상단바 — 구 '나의 시간' 바 자리(헤더 바로 아래 flush). 피그마 32821:19432.
          전환/추가/수정/삭제는 모두 시트(편집 모드)가 담당 */}
      <BucketBar
        buckets={data.buckets}
        selectedBucket={data.selectedBucket}
        onEditTitle={handleEditBucketTitle}
        onDelete={handleDeleteBucket}
        isDeleting={isDeletingBucket}
        onAddBucket={() => setExploreOpen(true)}
      />

      {data.stridePlan && (
        /* R3: 지향점은 캘린더 헤더 ▼로 흡수 (DirectionSection 제거) */
        <CalendarSection
          thisMonthStride={thisMonthStride}
          onOpenDirection={() => setDirectionOpen(true)}
          age={data.profile.life_clock_age}
          todos={todos}
          isLoadingTodos={isLoadingTodos}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onToggleTodo={handleToggleTodo}
          onEditTodo={handleEditTodo}
          onDeleteTodo={handleDeleteTodo}
        />
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
        onClose={handleCloseInput}
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
            : inputMode?.type === "bucket-edit"
              ? `${FEATURE_NAMES.BUCKET} 이름을 수정하세요`
              : inputMode?.type === "todo-edit"
                ? "할 일을 수정하세요"
                : selectedDate === getTodayDateString()
                ? "무엇이 하고싶으신가요?"
                : `${parseDateString(selectedDate).getMonth() + 1}월 ${parseDateString(selectedDate).getDate()}일에 무엇이 하고싶으신가요?`
        }
        // R2: add 모드에서만 교차 안내문 애니메이션 (수정 모드는 프리필 값이 있음)
        animatedPlaceholders={
          inputMode?.type === "add"
            ? ["작은 실천을 등록해볼까요?", "70점짜리 행동도 좋아요"]
            : undefined
        }
        // R2: 등록/수정 대상 버킷 뱃지 (add·todo-edit에만 노출)
        badge={
          inputMode?.type === "add" || inputMode?.type === "todo-edit"
            ? data.selectedBucket?.title
            : undefined
        }
        isSubmitting={isSubmittingInput}
        isBusy={isGeneratingAI}
        busyPlaceholder={`${data.selectedBucket?.title ?? "버킷"} 관련 추천중...`}
        actions={
          inputMode?.type === "add" || inputMode?.type === "todo-edit" ? (
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
              {/* AI 추천은 새 할 일 추가(add)에서만 */}
              {inputMode?.type === "add" && (
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
              )}
            </>
          ) : undefined
        }
      />

      {/* R3: 지향점 시트 — 캘린더 헤더 ▼로 진입, 카드 탭 = 바로 수정 */}
      <DirectionSheet
        open={directionOpen}
        onClose={() => setDirectionOpen(false)}
        directionItems={strideGroups.direction}
        monthStride={thisMonthStride}
        monthLabel={monthLabel}
        onEditStride={handleEditStrideFromSheet}
      />

      {/* R2: AI 추천 3개 선택 시트 — 등록 시 캐시 append (입력창 위에 오버레이) */}
      <AiSuggestionsSheet
        open={aiSheetOpen}
        onClose={() => setAiSheetOpen(false)}
        suggestions={aiSuggestions}
        onRegister={handleRegisterAiTodos}
        isRegistering={isRegisteringAi}
      />

      {/* [반복] 옵션 시트 — 기준일은 캘린더 선택 날짜. 선택 시 할 일이 루틴이 된다 */}
      <RepeatOptionsSheet
        open={repeatSheetOpen}
        onClose={() => setRepeatSheetOpen(false)}
        baseDate={selectedDate}
        selected={selectedRepeat}
        onSelect={setSelectedRepeat}
      />

      {/* R1: 새 버킷(장면) 추가 — 버킷 카드 시트의 "+ 버킷 추가"에서 진입 */}
      <ExploreNewSceneSheet
        open={exploreOpen}
        onClose={() => setExploreOpen(false)}
        prefillProfile={prefillProfile}
        onComplete={() => {
          setExploreOpen(false);
          invalidateDashboard();
          toast("새로운 행동이 추가되었어요 ✨", "success");
        }}
      />
    </div>
  );
}
