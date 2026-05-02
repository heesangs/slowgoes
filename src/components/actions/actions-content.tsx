"use client";

// 행동하기 상세 페이지 — 데일리투두/루틴 목록 + 바텀시트 (행동하기)

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  generateActionTipAction,
  toggleDailyTodoAction,
  toggleRoutineCompletionAction,
} from "@/app/(main)/dashboard/actions";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
  ActionLogItemType,
  Bucket,
  DailyTodo,
  RoutineWithCompletion,
} from "@/types";

interface ActionsContentProps {
  dailyTodos: DailyTodo[];
  routines: RoutineWithCompletion[];
  buckets: Pick<Bucket, "id" | "title">[];
  selectedBucketId: string | null;
}

interface ActionSheetItem {
  id: string;
  title: string;
  type: ActionLogItemType;
  isCompleted: boolean;
  actionTip: string | null;
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

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ActionSheetItem | null>(null);
  const [actionTip, setActionTip] = useState<string | null>(null);
  const [isTipLoading, setIsTipLoading] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  // 바텀시트 열기 — 데일리투두
  async function openDailyTodoSheet(todo: DailyTodo) {
    const item: ActionSheetItem = {
      id: todo.id,
      title: todo.title,
      type: "daily_todo",
      isCompleted: todo.status === "completed",
      actionTip: todo.action_tip,
    };

    setSelectedItem(item);
    setActionTip(todo.action_tip ?? null);
    setSheetOpen(true);

    if (todo.action_tip?.trim()) return;

    setIsTipLoading(true);
    const result = await generateActionTipAction(todo.id, "daily_todo");
    if (result.success && result.data?.tip) {
      setActionTip(result.data.tip);
    } else if (!result.success) {
      toast(result.error ?? "행동 조언을 불러오지 못했습니다.", "error");
    }
    setIsTipLoading(false);
  }

  // 바텀시트 열기 — 루틴
  async function openRoutineSheet(routine: RoutineWithCompletion) {
    const item: ActionSheetItem = {
      id: routine.id,
      title: routine.title,
      type: "routine",
      isCompleted: Boolean(routine.is_completed_this_week),
      actionTip: routine.action_tip,
    };

    setSelectedItem(item);
    setActionTip(routine.action_tip ?? null);
    setSheetOpen(true);

    if (routine.action_tip?.trim()) return;

    setIsTipLoading(true);
    const result = await generateActionTipAction(routine.id, "routine");
    if (result.success && result.data?.tip) {
      setActionTip(result.data.tip);
    } else if (!result.success) {
      toast(result.error ?? "행동 조언을 불러오지 못했습니다.", "error");
    }
    setIsTipLoading(false);
  }

  // 완료 토글
  async function handleToggle() {
    if (!selectedItem) return;

    setIsToggling(true);
    const result =
      selectedItem.type === "daily_todo"
        ? await toggleDailyTodoAction(selectedItem.id)
        : await toggleRoutineCompletionAction(selectedItem.id);

    if (!result.success) {
      toast(result.error ?? "상태 변경에 실패했습니다.", "error");
      setIsToggling(false);
      return;
    }

    toast(
      selectedItem.isCompleted ? "완료를 취소했어요." : "이번 주 실행을 기록했어요.",
      "success"
    );

    setSheetOpen(false);
    setSelectedItem(null);
    setActionTip(null);
    setIsToggling(false);
    router.refresh();
  }

  function closeSheet() {
    setSheetOpen(false);
    setSelectedItem(null);
    setActionTip(null);
    setIsTipLoading(false);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">오늘의 한걸음 상세</h1>
          <p className="text-sm text-foreground/60">
            총 {dailyTodos.length + routines.length}개 (데일리 {dailyTodos.length} · 루틴{" "}
            {routines.length})
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

      {/* 데일리 투두 섹션 */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <p className="text-sm text-foreground/60">{FEATURE_NAMES.DAILY_TODO}</p>
        <div className="mt-3 flex flex-col gap-2">
          {dailyTodos.length > 0 ? (
            dailyTodos.map((todo) => (
              <button
                key={todo.id}
                type="button"
                onClick={() => openDailyTodoSheet(todo)}
                className="w-full rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3 text-left transition-colors hover:bg-foreground/5 cursor-pointer"
              >
                <p
                  className={cn(
                    "text-sm font-medium",
                    todo.status === "completed" && "line-through text-foreground/45"
                  )}
                >
                  {todo.title}
                </p>
                <p className="mt-1 text-xs text-foreground/60">
                  상태: {todo.status === "completed" ? "완료" : "진행 전"}
                </p>
              </button>
            ))
          ) : (
            <p className="text-sm text-foreground/60">이번 주 {FEATURE_NAMES.DAILY_TODO}가 없어요.</p>
          )}
        </div>
      </section>

      {/* 루틴 섹션 */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <p className="text-sm text-foreground/60">{FEATURE_NAMES.ROUTINE}</p>
        <div className="mt-3 flex flex-col gap-2">
          {routines.length > 0 ? (
            routines.map((routine) => (
              <button
                key={routine.id}
                type="button"
                onClick={() => openRoutineSheet(routine)}
                className="w-full rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3 text-left transition-colors hover:bg-foreground/5 cursor-pointer"
              >
                <p
                  className={cn(
                    "text-sm font-medium",
                    routine.is_completed_this_week && "line-through text-foreground/45"
                  )}
                >
                  {routine.title}
                </p>
                <p className="mt-1 text-xs text-foreground/60">
                  반복: {formatRoutineRepeat(routine.repeat_unit, routine.repeat_value)}
                  {" · "}
                  상태: {routine.is_completed_this_week ? "이번 주 완료" : "이번 주 진행 전"}
                </p>
              </button>
            ))
          ) : (
            <p className="text-sm text-foreground/60">등록된 {FEATURE_NAMES.ROUTINE}이 없어요.</p>
          )}
        </div>
      </section>

      {/* 행동하기 바텀시트 */}
      <BottomSheet
        open={sheetOpen}
        onClose={closeSheet}
        title={selectedItem?.title ?? "행동하기"}
        footer={
          <Button
            type="button"
            className="w-full"
            onClick={handleToggle}
            isLoading={isToggling}
          >
            {selectedItem?.isCompleted ? "완료 취소" : "완료하기"}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {/* 상태 표시 */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                selectedItem?.type === "daily_todo"
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-green-200 bg-green-50 text-green-700"
              )}
            >
              {selectedItem?.type === "daily_todo" ? FEATURE_NAMES.DAILY_TODO : FEATURE_NAMES.ROUTINE}
            </span>
            <span className="text-xs text-foreground/60">
              {selectedItem?.isCompleted ? "완료됨" : "진행 전"}
            </span>
          </div>

          {/* AI 행동 조언 */}
          <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3">
            <p className="mb-1 text-xs font-medium text-foreground/60">AI 행동 조언</p>
            {isTipLoading ? (
              <p className="text-sm text-foreground/50 animate-pulse">조언을 생성하고 있어요...</p>
            ) : actionTip ? (
              <p className="text-sm text-foreground/80 leading-relaxed">{actionTip}</p>
            ) : (
              <p className="text-sm text-foreground/50">아직 행동 조언이 없어요.</p>
            )}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
