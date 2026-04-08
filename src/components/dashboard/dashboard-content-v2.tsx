"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LifeClockHeader } from "@/components/dashboard/life-clock-header";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { useToast } from "@/components/ui/toast";
import {
  generateActionTipAction,
  generateWeeklyItemsAction,
  toggleDailyTodoAction,
  toggleRoutineCompletionAction,
} from "@/app/(main)/dashboard/actions";
import { cn } from "@/lib/utils";
import type {
  ActionLogItemType,
  DailyTodo,
  DashboardV2Data,
  Gender,
  PersonalityType,
  RoutineWithCompletion,
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
  actionTip: string | null;
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
  const [horizonSheetOpen, setHorizonSheetOpen] = useState(false);
  const [explorationSheetOpen, setExplorationSheetOpen] = useState(false);
  const [selectedActionItem, setSelectedActionItem] = useState<ActionSheetItem | null>(null);
  const [actionTip, setActionTip] = useState<string | null>(null);
  const [isTipLoading, setIsTipLoading] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isGeneratingWeekly, setIsGeneratingWeekly] = useState(false);

  const firstDailyTodo = data.dailyTodos[0] ?? null;
  const firstRoutine = data.routines[0] ?? null;
  const totalItemsCount = data.dailyTodos.length + data.routines.length;
  const extraMergedCount = data.extraDailyTodoCount + data.extraRoutineCount;

  // 탐색 바텀시트용 프로필 데이터 구성
  const prefillProfile = useMemo(() => {
    const { life_clock_age, gender, personality_type } = data.profile;
    if (
      life_clock_age != null &&
      (gender === "male" || gender === "female") &&
      personality_type != null
    ) {
      return {
        age: life_clock_age,
        gender: gender as Gender,
        personalityType: personality_type as PersonalityType,
      };
    }
    return null;
  }, [data.profile]);

  const detailHref = useMemo(() => {
    if (!data.selectedBucket?.id) return "/actions";
    return `/actions?bucket=${data.selectedBucket.id}`;
  }, [data.selectedBucket?.id]);

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

  async function handleChangeBucket(bucketId: string) {
    const nextUrl = bucketId ? `/dashboard?bucket=${bucketId}` : "/dashboard";
    router.push(nextUrl);
  }

  async function openDailyTodoSheet(todo: DailyTodo) {
    const nextItem: ActionSheetItem = {
      id: todo.id,
      title: todo.title,
      type: "daily_todo",
      isCompleted: todo.status === "completed",
      actionTip: todo.action_tip,
      bucketTitle: data.selectedBucket?.title ?? null,
    };

    setSelectedActionItem(nextItem);
    setActionTip(todo.action_tip ?? null);
    setActionSheetOpen(true);

    if (todo.action_tip?.trim()) {
      return;
    }

    setIsTipLoading(true);
    const result = await generateActionTipAction(todo.id, "daily_todo");
    if (result.success && result.data?.tip) {
      setActionTip(result.data.tip);
    } else if (!result.success) {
      toast(result.error ?? "행동 조언을 불러오지 못했습니다.", "error");
    }
    setIsTipLoading(false);
  }

  async function openRoutineSheet(routine: RoutineWithCompletion) {
    const nextItem: ActionSheetItem = {
      id: routine.id,
      title: routine.title,
      type: "routine",
      isCompleted: Boolean(routine.is_completed_this_week),
      actionTip: routine.action_tip,
      bucketTitle: data.selectedBucket?.title ?? null,
    };

    setSelectedActionItem(nextItem);
    setActionTip(routine.action_tip ?? null);
    setActionSheetOpen(true);

    if (routine.action_tip?.trim()) {
      return;
    }

    setIsTipLoading(true);
    const result = await generateActionTipAction(routine.id, "routine");
    if (result.success && result.data?.tip) {
      setActionTip(result.data.tip);
    } else if (!result.success) {
      toast(result.error ?? "행동 조언을 불러오지 못했습니다.", "error");
    }
    setIsTipLoading(false);
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
    setActionTip(null);
    setIsToggling(false);
    router.refresh();
  }

  async function handleGenerateWeeklyItems() {
    if (!data.selectedBucket?.id) {
      toast("먼저 버킷을 선택해주세요.", "error");
      return;
    }

    setIsGeneratingWeekly(true);
    const result = await generateWeeklyItemsAction(data.selectedBucket.id);
    if (!result.success) {
      toast(result.error ?? "이번 주 항목 생성에 실패했습니다.", "error");
      setIsGeneratingWeekly(false);
      return;
    }

    const addedDailyTodos = result.data?.addedDailyTodos ?? 0;
    const addedRoutines = result.data?.addedRoutines ?? 0;
    toast(`데일리투두 ${addedDailyTodos}개 · 루틴 ${addedRoutines}개를 추가했어요.`, "success");
    setIsGeneratingWeekly(false);
    setHorizonSheetOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <LifeClockHeader
        age={data.profile.life_clock_age}
        activeChapterTitle={data.selectedBucket?.title ?? "버킷을 추가해보세요"}
      />

      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-foreground/60">현재 버킷</p>
            <p className="text-base font-semibold">{data.selectedBucket?.title ?? "선택된 버킷이 없어요"}</p>
          </div>
          <button
            type="button"
            onClick={() => setExplorationSheetOpen(true)}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-foreground/20 px-3 text-xs font-medium transition-colors hover:bg-foreground/5"
          >
            버킷 추가
          </button>
        </div>

        {data.buckets.length > 1 && (
          <select
            value={data.selectedBucket?.id ?? ""}
            onChange={(event) => {
              void handleChangeBucket(event.target.value);
            }}
            className="min-h-[44px] w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          >
            {data.buckets.map((bucket) => (
              <option key={bucket.id} value={bucket.id}>
                {bucket.title}
              </option>
            ))}
          </select>
        )}
      </section>

      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm text-foreground/60">오늘의 한 걸음</p>
            <p className="text-xs text-foreground/60">
              총 {totalItemsCount}개 (데일리 {data.dailyTodos.length} · 루틴 {data.routines.length})
            </p>
          </div>
          {extraMergedCount > 0 && (
            <Link
              href={detailHref}
              className="inline-flex min-h-[36px] items-center rounded-md border border-foreground/20 px-2.5 text-xs transition-colors hover:bg-foreground/5"
            >
              더보기 +{extraMergedCount}
            </Link>
          )}
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
              <p className="text-xs text-foreground/60">데일리투두</p>
              <p className={cn("mt-0.5 text-sm font-medium", firstDailyTodo.status === "completed" && "line-through text-foreground/45")}>
                {firstDailyTodo.title}
              </p>
              <p className="mt-1 text-xs text-foreground/55">{dailyTodoCardLabel(firstDailyTodo)}</p>
            </button>
          ) : (
            <div className="rounded-lg border border-dashed border-foreground/20 px-3 py-3 text-sm text-foreground/60">
              이번 주 데일리투두가 아직 없어요.
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
      </section>

      <section
        className="cursor-pointer rounded-xl border border-foreground/10 px-4 py-4 transition-colors hover:bg-foreground/[0.03]"
        onClick={() => {
          if (data.horizonAnalysis) {
            setHorizonSheetOpen(true);
          }
        }}
      >
        <p className="text-sm text-foreground/60">AI 추천 요약</p>
        {data.horizonAnalysis ? (
          <>
            <p className="mt-1 text-sm font-medium">{data.horizonAnalysis.empathy_message}</p>
            <p className="mt-2 text-xs text-foreground/60">
              {Array.isArray(data.horizonAnalysis.horizons)
                ? data.horizonAnalysis.horizons
                    .slice(0, 2)
                    .map((item) => item.action)
                    .join(" · ")
                : "추천 상세를 열어 이번 주 항목을 추가해보세요."}
            </p>
            <p className="mt-2 text-xs text-foreground/55">카드를 누르면 상세를 볼 수 있어요.</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-foreground/60">아직 AI 추천이 없어요. 온보딩에서 버킷을 추가해보세요.</p>
        )}
      </section>

      <button
        type="button"
        onClick={() => setExplorationSheetOpen(true)}
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
          setActionTip(null);
          setIsTipLoading(false);
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
                {selectedActionItem.type === "daily_todo" ? "데일리투두" : "루틴"}
              </p>
              <p className="mt-0.5 text-sm font-medium">{selectedActionItem.title}</p>
              {selectedActionItem.bucketTitle && (
                <p className="mt-1 text-xs text-foreground/55">버킷: {selectedActionItem.bucketTitle}</p>
              )}
            </div>

            <div className="rounded-lg border border-foreground/10 px-3 py-3">
              <p className="text-xs text-foreground/60">AI 조언</p>
              {isTipLoading ? (
                <p className="mt-2 text-sm text-foreground/60">행동 조언을 만드는 중이에요...</p>
              ) : actionTip ? (
                <p className="mt-2 text-sm leading-relaxed">{actionTip}</p>
              ) : (
                <p className="mt-2 text-sm text-foreground/60">아직 조언이 준비되지 않았어요.</p>
              )}
            </div>
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={horizonSheetOpen}
        onClose={() => setHorizonSheetOpen(false)}
        title="AI 추천 상세"
        footer={
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              void handleGenerateWeeklyItems();
            }}
            isLoading={isGeneratingWeekly}
            disabled={!data.selectedBucket}
          >
            이번 주에 담기
          </Button>
        }
      >
        {data.horizonAnalysis ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-3">
              <p className="text-sm">{data.horizonAnalysis.empathy_message}</p>
            </div>

            <div className="flex flex-col gap-2">
              {(Array.isArray(data.horizonAnalysis.horizons)
                ? data.horizonAnalysis.horizons
                : []
              ).map((item, index) => (
                <div
                  key={`${item.level}-${index}-${item.action}`}
                  className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3"
                >
                  <p className="text-xs text-foreground/60">{item.label}</p>
                  <p className="mt-0.5 text-sm">{item.action}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-foreground/10 px-3 py-3">
              <p className="text-xs text-foreground/60">추천 루틴</p>
              <div className="mt-2 flex flex-col gap-2">
                {(Array.isArray(data.horizonAnalysis.suggested_routines)
                  ? data.horizonAnalysis.suggested_routines
                  : []
                ).map((routine, index) => (
                  <div key={`${routine.title}-${index}`} className="rounded-md border border-foreground/10 px-2.5 py-2">
                    <p className="text-sm">{routine.title}</p>
                    <p className="mt-0.5 text-xs text-foreground/60">
                      반복: {formatRoutineRepeat(routine)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground/60">표시할 AI 추천 정보가 없어요.</p>
        )}
      </BottomSheet>

      {/* 탐색 바텀시트 — 버킷 추가 전체 플로우 */}
      <BottomSheet
        open={explorationSheetOpen}
        onClose={() => setExplorationSheetOpen(false)}
        title="탐색 시작"
        size="large"
      >
        <OnboardingForm
          startStep={2}
          prefillProfile={prefillProfile}
          existingBuckets={data.buckets}
          onComplete={() => {
            setExplorationSheetOpen(false);
            router.refresh();
            toast("새로운 행동이 추가되었어요 ✨", "success");
          }}
        />
      </BottomSheet>
    </div>
  );
}
