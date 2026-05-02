"use client";

// "한걸음 더" 시트 — StrideSection 푸터에서 진입.
//
// 동작 (DEVELOPER.md "14c. Main Dashboard Design Principles" 3번 "세분화된 통제"):
// - 시트 진입 시 데일리 투두 1개 + 루틴 1개를 자동 미리보기 (DB 저장 X).
// - 각 항목 옆 ↻ 부분 새로고침 — 해당 항목만 다시 추천.
// - "적용하기"를 누를 때만 DB(daily_todos / routines)에 INSERT.
//
// 체험판은 "2개 생성 → 사용자 선택"이지만 메인은 "1개 + 새로고침"으로
// 한 번에 모든 결정을 강제하지 않는 흐름.

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  applyNextStepAction,
  generateNextStepPreviewAction,
} from "@/app/(main)/dashboard/actions";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
  SingleNextStepDailyResult,
  SingleNextStepRoutineResult,
} from "@/lib/ai/analyze";
import type { RoutineRepeatUnit } from "@/types";

interface NextStepSheetProps {
  open: boolean;
  onClose: () => void;
  bucketId: string | null;
  /** 적용 성공 후 부모 컴포넌트 리프레시 트리거 */
  onApplied: () => void;
}

function formatRepeat(unit: RoutineRepeatUnit, value: number) {
  if (unit === "daily") return value <= 1 ? "매일" : `${value}일마다`;
  return value <= 1 ? "매주" : `${value}주마다`;
}

export function NextStepSheet({ open, onClose, bucketId, onApplied }: NextStepSheetProps) {
  const { toast } = useToast();

  const [daily, setDaily] = useState<SingleNextStepDailyResult | null>(null);
  const [routine, setRoutine] = useState<SingleNextStepRoutineResult | null>(null);
  const [isLoadingDaily, setIsLoadingDaily] = useState(false);
  const [isLoadingRoutine, setIsLoadingRoutine] = useState(false);
  const [errorDaily, setErrorDaily] = useState<string | null>(null);
  const [errorRoutine, setErrorRoutine] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // 시트가 닫힐 때 상태 초기화
  useEffect(() => {
    if (!open) {
      setDaily(null);
      setRoutine(null);
      setErrorDaily(null);
      setErrorRoutine(null);
    }
  }, [open]);

  // 시트 진입 시 자동 미리보기 — 데일리/루틴 병렬 호출
  useEffect(() => {
    if (!open || !bucketId) return;
    void loadDaily([]);
    void loadRoutine([]);
    // 의도적으로 한 번만 — 재시도는 ↻ 버튼이 담당
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bucketId]);

  async function loadDaily(excludeTitles: string[]) {
    if (!bucketId) return;
    setIsLoadingDaily(true);
    setErrorDaily(null);
    const result = await generateNextStepPreviewAction(bucketId, "daily_todo", excludeTitles);
    if (result.success && result.data?.type === "daily_todo") {
      setDaily(result.data);
    } else {
      setErrorDaily(result.error ?? `${FEATURE_NAMES.DAILY_TODO} 추천에 실패했어요.`);
      setDaily(null);
    }
    setIsLoadingDaily(false);
  }

  async function loadRoutine(excludeTitles: string[]) {
    if (!bucketId) return;
    setIsLoadingRoutine(true);
    setErrorRoutine(null);
    const result = await generateNextStepPreviewAction(bucketId, "routine", excludeTitles);
    if (result.success && result.data?.type === "routine") {
      setRoutine(result.data);
    } else {
      setErrorRoutine(result.error ?? `${FEATURE_NAMES.ROUTINE} 추천에 실패했어요.`);
      setRoutine(null);
    }
    setIsLoadingRoutine(false);
  }

  async function handleApply() {
    if (!bucketId) return;
    if (!daily && !routine) {
      toast("적용할 항목이 없어요.", "error");
      return;
    }

    setIsApplying(true);
    const result = await applyNextStepAction(bucketId, {
      daily: daily ? { title: daily.title } : null,
      routine: routine
        ? {
            title: routine.title,
            repeatUnit: routine.repeatUnit,
            repeatValue: routine.repeatValue,
          }
        : null,
    });
    setIsApplying(false);

    if (!result.success) {
      toast(result.error ?? "적용에 실패했어요.", "error");
      return;
    }

    const added = result.data;
    toast(
      `${FEATURE_NAMES.DAILY_TODO} ${added?.addedDailyTodos ?? 0}개 · ${FEATURE_NAMES.ROUTINE} ${
        added?.addedRoutines ?? 0
      }개를 추가했어요.`,
      "success"
    );
    onApplied();
    onClose();
  }

  const canApply =
    !isApplying && !isLoadingDaily && !isLoadingRoutine && (daily !== null || routine !== null);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="한걸음 더"
      footer={
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            void handleApply();
          }}
          isLoading={isApplying}
          disabled={!canApply}
        >
          적용하기
        </Button>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        <p className="text-xs text-foreground/60">
          새 {FEATURE_NAMES.DAILY_TODO}와 {FEATURE_NAMES.ROUTINE}을 1개씩 추천해드려요. ↻로 다시
          받을 수 있어요.
        </p>

        {/* 데일리 투두 카드 */}
        <PreviewCard
          label={FEATURE_NAMES.DAILY_TODO}
          isLoading={isLoadingDaily}
          error={errorDaily}
          onRefresh={() => {
            void loadDaily(daily ? [daily.title] : []);
          }}
        >
          {daily && <p className="text-sm font-medium">{daily.title}</p>}
        </PreviewCard>

        {/* 루틴 카드 */}
        <PreviewCard
          label={FEATURE_NAMES.ROUTINE}
          isLoading={isLoadingRoutine}
          error={errorRoutine}
          onRefresh={() => {
            void loadRoutine(routine ? [routine.title] : []);
          }}
        >
          {routine && (
            <>
              <p className="text-sm font-medium">{routine.title}</p>
              <p className="mt-1 text-xs text-foreground/55">
                반복: {formatRepeat(routine.repeatUnit, routine.repeatValue)}
              </p>
            </>
          )}
        </PreviewCard>
      </div>
    </BottomSheet>
  );
}

interface PreviewCardProps {
  label: string;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  children?: React.ReactNode;
}

function PreviewCard({ label, isLoading, error, onRefresh, children }: PreviewCardProps) {
  return (
    <article className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-foreground/55">{label}</p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className={cn(
            "inline-flex min-h-[28px] items-center rounded-md border border-foreground/15 px-2 text-[11px] transition-colors hover:bg-foreground/5",
            "disabled:opacity-40"
          )}
          aria-label={`${label} 다시 추천`}
        >
          {isLoading ? "추천 중…" : "↻ 다시"}
        </button>
      </div>
      <div className="mt-2 min-h-[1.5rem]">
        {isLoading ? (
          <p className="text-sm text-foreground/50">추천을 만드는 중이에요…</p>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : (
          children
        )}
      </div>
    </article>
  );
}
