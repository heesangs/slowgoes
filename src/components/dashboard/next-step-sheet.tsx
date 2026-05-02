"use client";

// "한걸음 더" 시트 — "오늘의 한걸음" 섹션 헤더의 한걸음 더 버튼에서 진입.
//
// 흐름 (DEVELOPER.md "14c. Main Dashboard Design Principles"):
// 1) 진입 시 모드 선택 — "데일리 투두만 / 루틴만 / 둘 다 받기"
//    사용자 의도(보통 1개만 추가)와 시스템 동작 단위를 일치 (3번 "세분화된 통제").
// 2) 모드 선택 후 해당 type만 자동 미리보기 (DB 저장 X).
// 3) 각 항목 옆 ↻ 부분 새로고침 — 해당 항목만 다시 추천.
// 4) "적용하기" 버튼을 누를 때만 daily_todos / routines 테이블에 INSERT.
//
// 안정성 메모 (Issue 1):
// - "둘 다" 모드에서도 daily/routine을 *순차* 호출한다.
//   동시 호출은 supabase auth 토큰 refresh race를 유발해 간헐적
//   인증 실패("튕김")의 핫스팟이 될 수 있음.

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

type NextStepMode = "daily_only" | "routine_only" | "both";

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

  // null = 모드 선택 화면
  const [mode, setMode] = useState<NextStepMode | null>(null);

  const [daily, setDaily] = useState<SingleNextStepDailyResult | null>(null);
  const [routine, setRoutine] = useState<SingleNextStepRoutineResult | null>(null);
  const [isLoadingDaily, setIsLoadingDaily] = useState(false);
  const [isLoadingRoutine, setIsLoadingRoutine] = useState(false);
  const [errorDaily, setErrorDaily] = useState<string | null>(null);
  const [errorRoutine, setErrorRoutine] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // 시트가 닫힐 때 상태 초기화 (다음 진입 시 항상 모드 선택부터)
  useEffect(() => {
    if (!open) {
      setMode(null);
      setDaily(null);
      setRoutine(null);
      setErrorDaily(null);
      setErrorRoutine(null);
    }
  }, [open]);

  // 모드 결정 후 자동 미리보기 — 둘 다 모드는 *순차* 호출 (race 차단)
  useEffect(() => {
    if (!open || !bucketId || !mode) return;

    let cancelled = false;
    void (async () => {
      if (mode === "daily_only" || mode === "both") {
        await loadDaily([]);
        if (cancelled) return;
      }
      if (mode === "routine_only" || mode === "both") {
        await loadRoutine([]);
      }
    })();

    return () => {
      cancelled = true;
    };
    // 의도적으로 mode 변경 시에만 — 이후 ↻ 버튼이 재호출 담당
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bucketId, mode]);

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
    if (!bucketId || !mode) return;

    const includeDaily = mode === "daily_only" || mode === "both";
    const includeRoutine = mode === "routine_only" || mode === "both";

    const payload = {
      daily: includeDaily && daily ? { title: daily.title } : null,
      routine:
        includeRoutine && routine
          ? {
              title: routine.title,
              repeatUnit: routine.repeatUnit,
              repeatValue: routine.repeatValue,
            }
          : null,
    };

    if (!payload.daily && !payload.routine) {
      toast("적용할 항목이 없어요.", "error");
      return;
    }

    setIsApplying(true);
    const result = await applyNextStepAction(bucketId, payload);
    setIsApplying(false);

    if (!result.success) {
      toast(result.error ?? "적용에 실패했어요.", "error");
      return;
    }

    const added = result.data;
    const parts: string[] = [];
    if ((added?.addedDailyTodos ?? 0) > 0) {
      parts.push(`${FEATURE_NAMES.DAILY_TODO} ${added!.addedDailyTodos}개`);
    }
    if ((added?.addedRoutines ?? 0) > 0) {
      parts.push(`${FEATURE_NAMES.ROUTINE} ${added!.addedRoutines}개`);
    }
    toast(`${parts.join(" · ") || "항목"}를 추가했어요.`, "success");
    onApplied();
    onClose();
  }

  const isModeSelectStep = mode === null;

  // 적용 가능 조건
  const canApply =
    !!mode &&
    !isApplying &&
    !isLoadingDaily &&
    !isLoadingRoutine &&
    ((mode === "daily_only" && daily !== null) ||
      (mode === "routine_only" && routine !== null) ||
      (mode === "both" && (daily !== null || routine !== null)));

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="한걸음 더"
      footer={
        isModeSelectStep ? null : (
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
        )
      }
    >
      {isModeSelectStep ? (
        <ModeSelectStep onSelect={(m) => setMode(m)} />
      ) : (
        <PreviewStep
          mode={mode}
          daily={daily}
          routine={routine}
          isLoadingDaily={isLoadingDaily}
          isLoadingRoutine={isLoadingRoutine}
          errorDaily={errorDaily}
          errorRoutine={errorRoutine}
          onBack={() => {
            setMode(null);
            setDaily(null);
            setRoutine(null);
            setErrorDaily(null);
            setErrorRoutine(null);
          }}
          onRefreshDaily={() => {
            void loadDaily(daily ? [daily.title] : []);
          }}
          onRefreshRoutine={() => {
            void loadRoutine(routine ? [routine.title] : []);
          }}
        />
      )}
    </BottomSheet>
  );
}

// ─── 모드 선택 단계 ───────────────────────────────────────────

interface ModeSelectStepProps {
  onSelect: (mode: NextStepMode) => void;
}

function ModeSelectStep({ onSelect }: ModeSelectStepProps) {
  return (
    <div className="flex flex-col gap-3 py-1">
      <p className="text-sm text-foreground/70">무엇을 더 받고 싶으세요?</p>
      <ModeCard
        icon="📌"
        title={`${FEATURE_NAMES.DAILY_TODO}만`}
        desc="이번 주에 한 번 실행할 작은 행동"
        onClick={() => onSelect("daily_only")}
      />
      <ModeCard
        icon="🔁"
        title={`${FEATURE_NAMES.ROUTINE}만`}
        desc="매일 또는 매주 반복할 행동"
        onClick={() => onSelect("routine_only")}
      />
      <ModeCard
        icon="✨"
        title="둘 다 받기"
        desc={`${FEATURE_NAMES.DAILY_TODO}와 ${FEATURE_NAMES.ROUTINE}을 함께 받아요`}
        onClick={() => onSelect("both")}
      />
    </div>
  );
}

interface ModeCardProps {
  icon: string;
  title: string;
  desc: string;
  onClick: () => void;
}

function ModeCard({ icon, title, desc, onClick }: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl border border-foreground/10 px-4 py-4 text-left transition-colors hover:bg-foreground/[0.04]"
    >
      <span className="text-2xl" aria-hidden>
        {icon}
      </span>
      <div className="flex-1">
        <p className="text-base font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-foreground/60">{desc}</p>
      </div>
    </button>
  );
}

// ─── 미리보기 단계 ───────────────────────────────────────────

interface PreviewStepProps {
  mode: NextStepMode;
  daily: SingleNextStepDailyResult | null;
  routine: SingleNextStepRoutineResult | null;
  isLoadingDaily: boolean;
  isLoadingRoutine: boolean;
  errorDaily: string | null;
  errorRoutine: string | null;
  onBack: () => void;
  onRefreshDaily: () => void;
  onRefreshRoutine: () => void;
}

function PreviewStep({
  mode,
  daily,
  routine,
  isLoadingDaily,
  isLoadingRoutine,
  errorDaily,
  errorRoutine,
  onBack,
  onRefreshDaily,
  onRefreshRoutine,
}: PreviewStepProps) {
  const showDaily = mode === "daily_only" || mode === "both";
  const showRoutine = mode === "routine_only" || mode === "both";

  return (
    <div className="flex flex-col gap-3 py-1">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1 text-xs text-foreground/60 transition-colors hover:text-foreground"
      >
        <span aria-hidden>←</span>
        <span>다른 종류 받기</span>
      </button>

      <p className="text-xs text-foreground/60">
        ↻로 마음에 드는 추천이 나올 때까지 다시 받을 수 있어요.
      </p>

      {showDaily && (
        <PreviewCard
          label={FEATURE_NAMES.DAILY_TODO}
          isLoading={isLoadingDaily}
          error={errorDaily}
          onRefresh={onRefreshDaily}
        >
          {daily && <p className="text-sm font-medium">{daily.title}</p>}
        </PreviewCard>
      )}

      {showRoutine && (
        <PreviewCard
          label={FEATURE_NAMES.ROUTINE}
          isLoading={isLoadingRoutine}
          error={errorRoutine}
          onRefresh={onRefreshRoutine}
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
      )}
    </div>
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
