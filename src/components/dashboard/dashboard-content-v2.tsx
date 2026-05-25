"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DirectionSection } from "@/components/dashboard/direction-section";
import { ExecutionPlanSection } from "@/components/dashboard/execution-plan-section";
import { FindMeSheet } from "@/components/dashboard/find-me-sheet";
import { InsightSection } from "@/components/dashboard/insight-section";
import { LifeClockHeader } from "@/components/dashboard/life-clock-header";
import { NextStepSheet } from "@/components/dashboard/next-step-sheet";
import { RoutineCalendarSheet } from "@/components/dashboard/routine-calendar-sheet";
import { useToast } from "@/components/ui/toast";
import {
  deactivateRoutineAction,
  deleteDailyTodoAction,
  regenerateStrideItemAction,
  toggleDailyTodoAction,
  toggleRoutineCompletionAction,
  updateStrideItemAction,
} from "@/app/(main)/dashboard/actions";
import { EditWithAISheet } from "@/components/ui/edit-with-ai-sheet";
import { useTrackLastViewedBucket } from "@/hooks/use-track-last-viewed-bucket";
import { splitStridesByGroup } from "@/lib/ai/analyze";
import { FEATURE_NAMES } from "@/lib/constants";
import type {
  DailyTodo,
  DailyTodoStrideLevel,
  DashboardV2Data,
  Gender,
  PersonalityType,
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

  // "숨은 나 찾기" 시트 — InsightSection 드롭다운(내 버킷) + FAB(버킷 0개일 때 새 장면 탐색).
  // PR 35: 진입처마다 기본 탭이 다르므로 mode를 함께 보관.
  const [findMeSheetOpen, setFindMeSheetOpen] = useState(false);
  const [findMeSheetMode, setFindMeSheetMode] = useState<"select" | "explore" | undefined>(undefined);

  // "한걸음 더" 시트 (NextStepSheet)
  // - FAB 진입(PR 35) → defaultPeriod=null + enableAI=false (직접 입력 폼)
  // - 카드 ⋮ "추가" 진입 → defaultPeriod=this_month + enableAI=true (기존 동작)
  const [nextStepSheetOpen, setNextStepSheetOpen] = useState(false);
  const [nextStepDefaultPeriod, setNextStepDefaultPeriod] = useState<DailyTodoStrideLevel | null>(null);
  const [nextStepEnableAI, setNextStepEnableAI] = useState(true);

  // 발걸음 재생성 진행 상태 (PR 34: 전체 재생성 제거되어 단일 레벨만)
  const [regeneratingLevel, setRegeneratingLevel] = useState<StrideLevel | null>(null);
  // PR 9 — 발걸음 카드 ⋮ → 수정 시트 상태
  const [editingStride, setEditingStride] = useState<StrideItem | null>(null);
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

  // 탐색 바텀시트용 프로필 데이터 구성
  const prefillProfile = useMemo(() => {
    const { life_clock_age, gender, personality_type, pace_type } = data.profile;
    if (
      life_clock_age != null &&
      (gender === "male" || gender === "female") &&
      personality_type != null
    ) {
      return {
        age: life_clock_age,
        gender: gender as Gender,
        personalityType: personality_type as PersonalityType,
        paceType: (pace_type ?? undefined) as import("@/types").PaceType | undefined,
      };
    }
    return null;
  }, [data.profile]);

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

  // PR 9 — ⋮ "수정" 클릭 시 시트 진입
  function handleEditOpen(item: StrideItem) {
    setEditingStride(item);
  }

  // PR 9 — EditWithAISheet 확인 → 사용자 입력으로 stride action 업데이트
  async function handleEditConfirm(value: string) {
    if (!editingStride || !data.selectedBucket?.id) return;
    const result = await updateStrideItemAction(
      data.selectedBucket.id,
      editingStride.level,
      value
    );
    if (result.success) {
      toast(`${editingStride.label} 단계를 수정했어요.`, "success");
      setEditingStride(null);
      router.refresh();
    } else {
      toast(result.error ?? "수정에 실패했어요.", "error");
    }
  }

  // PR 9 — EditWithAISheet "AI 생성" 클릭 → 기존 단건 재생성 액션 재사용 → 새 action 반환
  async function handleEditAIGenerate(): Promise<string> {
    if (!editingStride || !data.selectedBucket?.id) {
      throw new Error("수정 대상이 없습니다.");
    }
    setRegeneratingLevel(editingStride.level);
    try {
      const result = await regenerateStrideItemAction(
        data.selectedBucket.id,
        editingStride.level
      );
      if (!result.success || !result.item) {
        throw new Error(result.error ?? "AI 추천에 실패했어요.");
      }
      // editingStride의 action도 업데이트 (시트 닫고 다시 열어도 최신 값 유지)
      setEditingStride({ ...editingStride, action: result.item.action });
      router.refresh();
      return result.item.action;
    } finally {
      setRegeneratingLevel(null);
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
  //   단일 발걸음 재생성(EditWithAISheet 안의 AI 버튼)은 유지.

  return (
    <div className="flex flex-col gap-4 pb-24">
      <LifeClockHeader age={data.profile.life_clock_age} />

      {/* 발걸음 3섹션 (PR 8): 인사이트 → 지향점 → 실행계획
          PR 29: InsightSection은 현재 버킷 + 대화 placeholder만 표시
          PR 35: 버킷 타이틀이 드롭다운 버튼이 되어 FindMeSheet 'select' 탭 진입점 역할 */}
      <InsightSection
        bucketTitle={data.selectedBucket?.title ?? null}
        onClickBucket={
          data.buckets.length > 0
            ? () => {
                setFindMeSheetMode("select");
                setFindMeSheetOpen(true);
              }
            : undefined
        }
      />

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
              // PR 18: 실행계획은 this_month 1개만. 카드 어떤 level이든 this_month로 prefill.
              // PR 35: 카드 ⋮ "추가"는 AI 옵션 유지 (기존 동작).
              void item; // 카드별 분기 불필요 — union이 단일 값으로 축소됨
              setNextStepDefaultPeriod("this_month");
              setNextStepEnableAI(true);
              setNextStepSheetOpen(true);
            }}
            strideDetailHref={detailHref}
            extraCount={extraMergedCount}
          />
        </>
      )}

      {!data.stridePlan && (
        <p className="rounded-xl border border-foreground/10 px-4 py-4 text-sm text-foreground/60">
          아직 {FEATURE_NAMES.MY_STRIDES}이 없어요. 우측 하단 + 버튼으로 새 장면을 탐색해보세요.
        </p>
      )}

      {/* PR 35: FAB 재배치 — "한걸음 더"(직접 입력 폼) 단일 진입점.
          버킷 0개일 때만 FindMeSheet(새 장면 탐색)로 폴백 — 사용자가 막히지 않도록. */}
      <button
        type="button"
        onClick={() => {
          if (!data.selectedBucket?.id) {
            setFindMeSheetMode(undefined); // explore (기본 휴리스틱)
            setFindMeSheetOpen(true);
            return;
          }
          setNextStepDefaultPeriod(null);
          setNextStepEnableAI(false); // FAB → AI 호출 없는 직접 입력 폼
          setNextStepSheetOpen(true);
        }}
        className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-2xl text-background shadow-lg transition-opacity hover:opacity-90"
        aria-label={data.selectedBucket?.id ? FEATURE_NAMES.STEP_MORE : "새 장면 탐색"}
      >
        +
      </button>

      {/* "숨은 나 찾기" 시트 — InsightSection 드롭다운(select) + FAB(버킷 0개일 때 explore). */}
      <FindMeSheet
        open={findMeSheetOpen}
        onClose={() => setFindMeSheetOpen(false)}
        buckets={data.buckets.map((b) => ({ id: b.id, title: b.title }))}
        selectedBucketId={data.selectedBucket?.id ?? null}
        prefillProfile={prefillProfile}
        onExplorationComplete={() => {
          setFindMeSheetOpen(false);
          router.refresh();
          toast("새로운 행동이 추가되었어요 ✨", "success");
        }}
        defaultMode={findMeSheetMode}
      />

      {/* "한걸음 더" 시트 — FAB(enableAI=false) 또는 카드 ⋮ "추가"(enableAI=true) */}
      <NextStepSheet
        open={nextStepSheetOpen}
        onClose={() => setNextStepSheetOpen(false)}
        bucketId={data.selectedBucket?.id ?? null}
        onApplied={() => router.refresh()}
        defaultPeriod={nextStepDefaultPeriod}
        enableAI={nextStepEnableAI}
      />

      {/* PR 9 — 발걸음 카드 ⋮ "수정" 진입 시트
          PR 15 — title_history에서 해당 레벨의 과거 타이틀을 picker로 노출
          PR 37 — 이번 달 카드 수정 시 시트 하단에 데일리투두/루틴 삭제 영역 노출 */}
      <EditWithAISheet
        open={!!editingStride}
        onClose={() => setEditingStride(null)}
        title={editingStride ? `${editingStride.label} 단계 수정` : "수정"}
        initialValue={editingStride?.action ?? ""}
        description="직접 입력하거나 AI로 새로 추천받을 수 있어요."
        placeholder="이 단계의 행동을 한 문장으로 적어주세요"
        onConfirm={(value) => {
          void handleEditConfirm(value);
        }}
        onAIGenerate={handleEditAIGenerate}
        confirmLabel="저장"
        history={
          editingStride
            ? (data.stridePlan?.title_history?.[editingStride.level] ?? []).map(
                (entry) => entry.title
              )
            : undefined
        }
        // PR 37: this_month 카드에서만 의미 있는 데이터 — 다른 단계(언젠가/1년 안 등)는 빈 배열로 섹션 숨김
        todos={
          editingStride?.level === "this_month"
            ? optimisticDailyTodos.filter((t) => t.stride_level === "this_month")
            : []
        }
        routines={editingStride?.level === "this_month" ? optimisticRoutines : []}
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
