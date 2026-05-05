"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DirectionSection } from "@/components/dashboard/direction-section";
import { ExecutionPlanSection } from "@/components/dashboard/execution-plan-section";
import { FindMeSheet } from "@/components/dashboard/find-me-sheet";
import { InsightSection } from "@/components/dashboard/insight-section";
import { LifeClockHeader } from "@/components/dashboard/life-clock-header";
import { NextStepSheet } from "@/components/dashboard/next-step-sheet";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  regenerateStrideItemAction,
  regenerateStridePlanAction,
  toggleDailyTodoAction,
  toggleRoutineCompletionAction,
  updateStrideItemAction,
} from "@/app/(main)/dashboard/actions";
import { EditWithAISheet } from "@/components/ui/edit-with-ai-sheet";
import { splitStridesByGroup } from "@/lib/ai/analyze";
import { cn } from "@/lib/utils";
import { FEATURE_NAMES } from "@/lib/constants";
import type {
  ActionLogItemType,
  DailyTodo,
  DashboardV2Data,
  Gender,
  PersonalityType,
  RoutineWithCompletion,
  StrideItem,
  StrideLevel,
  SuggestedRoutine,
} from "@/types";

interface DashboardContentV2Props {
  data: DashboardV2Data;
  fetchError?: string;
}

interface ActionSheetItem {
  id: string;
  title: string;
  type: ActionLogItemType;
  isCompleted: boolean;
  bucketTitle: string | null;
}

function formatRoutineRepeat(routine: Pick<SuggestedRoutine, "repeatUnit" | "repeatValue">) {
  if (routine.repeatUnit === "daily") {
    return routine.repeatValue <= 1 ? "매일" : `${routine.repeatValue}일마다`;
  }
  return routine.repeatValue <= 1 ? "매주" : `${routine.repeatValue}주마다`;
}

function dailyTodoCardLabel(todo: DailyTodo) {
  return todo.status === "completed" ? "완료" : "진행 전";
}

function routineCardLabel(routine: RoutineWithCompletion) {
  return routine.is_completed_this_week ? "이번 주 완료" : "이번 주 진행 전";
}

export function DashboardContentV2({ data, fetchError }: DashboardContentV2Props) {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  // "숨은 나 찾기" 시트 — + 버튼의 단일 진입점.
  // 시트 안에서 "내 버킷 (전환)" / "새 장면 탐색" 모드 스위칭.
  const [findMeSheetOpen, setFindMeSheetOpen] = useState(false);

  const [selectedActionItem, setSelectedActionItem] = useState<ActionSheetItem | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  // "한걸음 더" 시트 (NextStepSheet)
  const [nextStepSheetOpen, setNextStepSheetOpen] = useState(false);

  // 발걸음 재생성 진행 상태 (StrideSection으로 전달)
  const [regeneratingLevel, setRegeneratingLevel] = useState<StrideLevel | null>(null);
  const [isRegenAll, setIsRegenAll] = useState(false);
  // PR 9 — 발걸음 카드 ⋮ → 수정 시트 상태
  const [editingStride, setEditingStride] = useState<StrideItem | null>(null);
  // PR 10 — 실행계획 카드 안 투두 토글 진행 중 ID (중복 클릭 방지)
  const [togglingExecTodoId, setTogglingExecTodoId] = useState<string | null>(null);

  const firstDailyTodo = data.dailyTodos[0] ?? null;
  const firstRoutine = data.routines[0] ?? null;
  const totalItemsCount = data.dailyTodos.length + data.routines.length;
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

  function openDailyTodoSheet(todo: DailyTodo) {
    setSelectedActionItem({
      id: todo.id,
      title: todo.title,
      type: "daily_todo",
      isCompleted: todo.status === "completed",
      bucketTitle: data.selectedBucket?.title ?? null,
    });
    setActionSheetOpen(true);
  }

  function openRoutineSheet(routine: RoutineWithCompletion) {
    setSelectedActionItem({
      id: routine.id,
      title: routine.title,
      type: "routine",
      isCompleted: Boolean(routine.is_completed_this_week),
      bucketTitle: data.selectedBucket?.title ?? null,
    });
    setActionSheetOpen(true);
  }

  async function handleToggleFromSheet() {
    if (!selectedActionItem) return;

    setIsToggling(true);
    const result =
      selectedActionItem.type === "daily_todo"
        ? await toggleDailyTodoAction(selectedActionItem.id)
        : await toggleRoutineCompletionAction(selectedActionItem.id);

    if (!result.success) {
      toast(result.error ?? "상태 변경에 실패했습니다.", "error");
      setIsToggling(false);
      return;
    }

    toast(
      selectedActionItem.isCompleted ? "완료를 취소했어요." : "이번 주 실행을 기록했어요.",
      "success"
    );

    setActionSheetOpen(false);
    setSelectedActionItem(null);
    setIsToggling(false);
    router.refresh();
  }

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

  // PR 10 — 실행계획 카드 안 투두 클릭 시 완료 토글
  async function handleToggleTodoFromCard(todoId: string) {
    if (togglingExecTodoId) return;
    setTogglingExecTodoId(todoId);
    const result = await toggleDailyTodoAction(todoId);
    if (result.success) {
      router.refresh();
    } else {
      toast(result.error ?? "상태 변경에 실패했어요.", "error");
    }
    setTogglingExecTodoId(null);
  }

  // 전체 발걸음 재생성 — 실행계획 섹션 푸터 버튼에서 호출
  async function handleRegenerateAll() {
    if (!data.selectedBucket?.id) return;
    if (typeof window !== "undefined" && !window.confirm("전체 발걸음을 새로 추천받을까요?")) {
      return;
    }
    setIsRegenAll(true);
    const result = await regenerateStridePlanAction(data.selectedBucket.id);
    if (result.success) {
      toast("AI가 발걸음을 새로 제안했어요.", "success");
      router.refresh();
    } else {
      toast(result.error ?? "전체 재추천에 실패했습니다.", "error");
    }
    setIsRegenAll(false);
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <LifeClockHeader age={data.profile.life_clock_age} />

      {/* 발걸음 3섹션 (PR 8): 인사이트 → 지향점 → 실행계획 */}
      <InsightSection
        bucketTitle={data.selectedBucket?.title ?? null}
        empathyMessage={data.stridePlan?.empathy_message ?? null}
      />

      {data.stridePlan && (
        <>
          <DirectionSection
            items={strideGroups.direction}
            onEditLevel={handleEditOpen}
            isRegenAll={isRegenAll}
            regeneratingLevel={regeneratingLevel}
          />
          <ExecutionPlanSection
            items={strideGroups.execution}
            dailyTodos={data.dailyTodos}
            onEditLevel={handleEditOpen}
            onToggleTodo={(todoId) => {
              void handleToggleTodoFromCard(todoId);
            }}
            onRegenerateAll={() => {
              void handleRegenerateAll();
            }}
            isRegenAll={isRegenAll}
            regeneratingLevel={regeneratingLevel}
            togglingTodoId={togglingExecTodoId}
          />
        </>
      )}

      {!data.stridePlan && (
        <p className="rounded-xl border border-foreground/10 px-4 py-4 text-sm text-foreground/60">
          아직 {FEATURE_NAMES.MY_STRIDES}이 없어요. 우측 하단 + 버튼으로 새 장면을 탐색해보세요.
        </p>
      )}

      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm text-foreground/60">오늘의 한 걸음</p>
            <p className="text-xs text-foreground/60">
              총 {totalItemsCount}개 (데일리 {data.dailyTodos.length} · 루틴 {data.routines.length})
            </p>
          </div>
          {/* Issue 3 — "한걸음 더" 버튼을 핵심 액션으로 승격.
              버킷 미선택 시 안내 toast로 분기. */}
          <button
            type="button"
            onClick={() => {
              if (!data.selectedBucket?.id) {
                toast(`먼저 ${FEATURE_NAMES.BUCKET}을 선택해주세요.`, "error");
                return;
              }
              setNextStepSheetOpen(true);
            }}
            disabled={!data.selectedBucket}
            className="inline-flex min-h-[36px] items-center rounded-md border border-foreground/20 bg-foreground/[0.04] px-3 text-xs font-medium transition-colors hover:bg-foreground/[0.08] disabled:opacity-40"
          >
            한걸음 더
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {firstDailyTodo ? (
            <button
              type="button"
              onClick={() => {
                void openDailyTodoSheet(firstDailyTodo);
              }}
              className="w-full rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3 text-left transition-colors hover:bg-foreground/[0.05]"
            >
              <p className="text-xs text-foreground/60">{FEATURE_NAMES.DAILY_TODO}</p>
              <p className={cn("mt-0.5 text-sm font-medium", firstDailyTodo.status === "completed" && "line-through text-foreground/45")}>
                {firstDailyTodo.title}
              </p>
              <p className="mt-1 text-xs text-foreground/55">{dailyTodoCardLabel(firstDailyTodo)}</p>
            </button>
          ) : (
            <div className="rounded-lg border border-dashed border-foreground/20 px-3 py-3 text-sm text-foreground/60">
              이번 주 {FEATURE_NAMES.DAILY_TODO}가 아직 없어요.
            </div>
          )}

          {firstRoutine ? (
            <button
              type="button"
              onClick={() => {
                void openRoutineSheet(firstRoutine);
              }}
              className="w-full rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3 text-left transition-colors hover:bg-foreground/[0.05]"
            >
              <p className="text-xs text-foreground/60">루틴</p>
              <p className={cn("mt-0.5 text-sm font-medium", firstRoutine.is_completed_this_week && "line-through text-foreground/45")}>
                {firstRoutine.title}
              </p>
              <p className="mt-1 text-xs text-foreground/55">
                {formatRoutineRepeat({
                  repeatUnit: firstRoutine.repeat_unit,
                  repeatValue: firstRoutine.repeat_value,
                })}
                {" · "}
                {routineCardLabel(firstRoutine)}
              </p>
            </button>
          ) : (
            <div className="rounded-lg border border-dashed border-foreground/20 px-3 py-3 text-sm text-foreground/60">
              선택된 루틴이 아직 없어요.
            </div>
          )}
        </div>

        {/* Issue 3 — 더보기 +N 은 카드들 아래, 우측 정렬 */}
        {extraMergedCount > 0 && (
          <div className="mt-3 flex justify-end">
            <Link
              href={detailHref}
              className="inline-flex min-h-[36px] items-center rounded-md border border-foreground/20 px-2.5 text-xs transition-colors hover:bg-foreground/5"
            >
              더보기 +{extraMergedCount}
            </Link>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => setFindMeSheetOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-2xl text-background shadow-lg transition-opacity hover:opacity-90"
        aria-label="버킷 추가"
      >
        +
      </button>

      <BottomSheet
        open={actionSheetOpen}
        onClose={() => {
          setActionSheetOpen(false);
          setSelectedActionItem(null);
        }}
        title={selectedActionItem?.title ?? "행동하기"}
        footer={
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              void handleToggleFromSheet();
            }}
            isLoading={isToggling}
            disabled={!selectedActionItem}
          >
            {selectedActionItem?.isCompleted ? "완료 취소" : "이번 주 완료하기"}
          </Button>
        }
      >
        {selectedActionItem ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-3">
              <p className="text-xs text-foreground/60">
                {selectedActionItem.type === "daily_todo" ? FEATURE_NAMES.DAILY_TODO : FEATURE_NAMES.ROUTINE}
              </p>
              <p className="mt-0.5 text-sm font-medium">{selectedActionItem.title}</p>
              {selectedActionItem.bucketTitle && (
                <p className="mt-1 text-xs text-foreground/55">버킷: {selectedActionItem.bucketTitle}</p>
              )}
            </div>
          </div>
        ) : null}
      </BottomSheet>



      {/* "숨은 나 찾기" 시트 — + 버튼의 단일 진입점.
          시트 안에서 "내 버킷 (전환)" / "새 장면 탐색" 모드 스위칭. */}
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
      />

      {/* "한걸음 더" 시트 — StrideSection 푸터 버튼에서 진입 */}
      <NextStepSheet
        open={nextStepSheetOpen}
        onClose={() => setNextStepSheetOpen(false)}
        bucketId={data.selectedBucket?.id ?? null}
        onApplied={() => router.refresh()}
      />

      {/* PR 9 — 발걸음 카드 ⋮ "수정" 진입 시트 */}
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
      />
    </div>
  );
}
