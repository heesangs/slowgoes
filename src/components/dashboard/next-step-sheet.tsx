"use client";

// "한걸음 더" 시트 (PR 12 재편)
//
// 진입점:
// - 실행계획 섹션 헤더 우측 "한걸음 더" 버튼 (대시보드)
// - 실행계획 카드 ⋮ → "추가" 메뉴 (defaultPeriod prefill)
//
// 흐름 (3단계):
// 1) 모드 선택 — 데일리 투두 / 루틴 (구 "둘 다" 모드는 제거 — 매번 1개씩 추가가 더 명확)
// 2) 기간 선택 — 오늘 / 이번 주 / 이번 달 / 이번 시즌
//    - 데일리: stride_level로 저장됨 → 실행계획 카드에 표시
//    - 루틴: 현재는 AI 프롬프트 컨텍스트로만 사용 (DB 컬럼 없음, 향후 PR에서 통합 가능)
// 3) 입력 — EditWithAISheet (직접 입력 + AI 생성 버튼 + 저장)
//    - 외부 prefill: defaultPeriod가 들어오면 1단계만 필요 (모드만 선택)
//
// 안정성: AI 호출은 단일 type만 (구 "둘 다" 모드의 race 위험 제거)

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { EditWithAISheet } from "@/components/ui/edit-with-ai-sheet";
import { useToast } from "@/components/ui/toast";
import {
  applyNextStepAction,
  generateNextStepPreviewAction,
} from "@/app/(main)/dashboard/actions";
import { FEATURE_NAMES } from "@/lib/constants";
import type { DailyTodoStrideLevel } from "@/types";

type NextStepMode = "daily_todo" | "routine";

// PR 16: "이번 시즌"은 실행계획에서 이미 제외됐으므로 한걸음 더 흐름의 선택지에서도 제거.
// (DailyTodoStrideLevel union 자체는 PR 18에서 단순화 예정)
type SelectablePeriod = Exclude<DailyTodoStrideLevel, "this_season">;

const PERIOD_LABELS: Record<SelectablePeriod, string> = {
  today: "오늘",
  this_week: "이번 주",
  this_month: "이번 달",
};

const PERIOD_ORDER: SelectablePeriod[] = ["today", "this_week", "this_month"];

interface NextStepSheetProps {
  open: boolean;
  onClose: () => void;
  bucketId: string | null;
  /** 적용 성공 후 부모 컴포넌트 리프레시 트리거 */
  onApplied: () => void;
  /** 외부에서 prefill — 카드 ⋮ "추가" 클릭 시 카드의 stride_level로 자동 진입 */
  defaultPeriod?: DailyTodoStrideLevel | null;
}

export function NextStepSheet({
  open,
  onClose,
  bucketId,
  onApplied,
  defaultPeriod = null,
}: NextStepSheetProps) {
  const { toast } = useToast();

  // 단계 진행: mode 선택 → period 선택 → edit
  const [mode, setMode] = useState<NextStepMode | null>(null);
  const [period, setPeriod] = useState<SelectablePeriod | null>(null);
  // PR 16: 기존 카드에 stride_level="this_season" 데이터가 남아있을 수 있어
  // defaultPeriod가 this_season이면 null로 fallback (사용자가 직접 선택하도록).
  const safeDefaultPeriod: SelectablePeriod | null =
    defaultPeriod && defaultPeriod !== "this_season" ? defaultPeriod : null;
  // 루틴 AI 추천 결과의 repeat 정보 (직접 입력일 땐 기본값 weekly/1)
  const [routineRepeat, setRoutineRepeat] = useState<{
    repeatUnit: "daily" | "weekly";
    repeatValue: number;
  } | null>(null);

  // 시트 열릴 때 prefill 적용 / 닫힐 때 리셋
  useEffect(() => {
    if (open) {
      setPeriod(safeDefaultPeriod);
      setMode(null);
      setRoutineRepeat(null);
    } else {
      setMode(null);
      setPeriod(null);
      setRoutineRepeat(null);
    }
  }, [open, safeDefaultPeriod]);

  // 현재 단계 판단
  const step: "mode" | "period" | "edit" = !mode
    ? "mode"
    : !period
      ? "period"
      : "edit";

  // EditWithAISheet의 AI 생성 버튼 → preview action 호출 → textfield에 채움
  async function handleAIGenerate(): Promise<string> {
    if (!bucketId || !mode) {
      throw new Error("AI 생성에 필요한 정보가 부족합니다.");
    }
    const result = await generateNextStepPreviewAction(bucketId, mode, []);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "AI 추천에 실패했어요.");
    }
    if (result.data.type === "routine") {
      setRoutineRepeat({
        repeatUnit: result.data.repeatUnit,
        repeatValue: result.data.repeatValue,
      });
    }
    return result.data.title;
  }

  // EditWithAISheet 저장 → applyNextStepAction
  async function handleConfirm(value: string) {
    if (!bucketId || !mode || !period) return;

    const payload =
      mode === "daily_todo"
        ? { daily: { title: value, strideLevel: period }, routine: null }
        : {
            daily: null,
            routine: {
              title: value,
              repeatUnit: routineRepeat?.repeatUnit ?? ("weekly" as const),
              repeatValue: routineRepeat?.repeatValue ?? 1,
            },
          };

    const result = await applyNextStepAction(bucketId, payload);
    if (!result.success) {
      toast(result.error ?? "적용에 실패했어요.", "error");
      return;
    }
    const label = mode === "daily_todo" ? FEATURE_NAMES.DAILY_TODO : FEATURE_NAMES.ROUTINE;
    toast(`${label}을(를) 추가했어요.`, "success");
    onApplied();
    onClose();
  }

  // 단계 1·2 (모드/기간 선택) 시트
  const stepSheet = (
    <BottomSheet open={open && step !== "edit"} onClose={onClose} title="한걸음 더">
      {step === "mode" && (
        <ModeSelectStep
          onSelect={(m) => setMode(m)}
          isPeriodPrefilled={safeDefaultPeriod !== null}
          periodLabel={safeDefaultPeriod ? PERIOD_LABELS[safeDefaultPeriod] : null}
        />
      )}
      {step === "period" && mode && (
        <PeriodSelectStep
          mode={mode}
          onBack={() => setMode(null)}
          onSelect={(p) => setPeriod(p)}
        />
      )}
    </BottomSheet>
  );

  // 단계 3 — EditWithAISheet
  const editSheet =
    step === "edit" && mode && period ? (
      <EditWithAISheet
        open={open}
        onClose={onClose}
        title={
          mode === "daily_todo"
            ? `${PERIOD_LABELS[period]} ${FEATURE_NAMES.DAILY_TODO} 추가`
            : `${FEATURE_NAMES.ROUTINE} 추가`
        }
        description={
          mode === "daily_todo"
            ? `${PERIOD_LABELS[period]} 카드에 추가될 행동입니다.`
            : "직접 입력하거나 AI로 추천받을 수 있어요."
        }
        placeholder={
          mode === "daily_todo"
            ? "예: 5분 산책하기"
            : "예: 매일 아침 물 한 잔"
        }
        onConfirm={(value) => {
          void handleConfirm(value);
        }}
        onAIGenerate={handleAIGenerate}
        confirmLabel="추가하기"
      />
    ) : null;

  return (
    <>
      {stepSheet}
      {editSheet}
    </>
  );
}

// ─── 모드 선택 ───────────────────────────────────────────

interface ModeSelectStepProps {
  onSelect: (mode: NextStepMode) => void;
  isPeriodPrefilled: boolean;
  periodLabel: string | null;
}

function ModeSelectStep({ onSelect, isPeriodPrefilled, periodLabel }: ModeSelectStepProps) {
  return (
    <div className="flex flex-col gap-3 py-1">
      <p className="text-sm text-foreground/70">
        {isPeriodPrefilled && periodLabel
          ? `${periodLabel}에 무엇을 추가하시겠어요?`
          : "무엇을 추가하시겠어요?"}
      </p>
      <ModeCard
        icon="📌"
        title={FEATURE_NAMES.DAILY_TODO}
        desc="이번 주에 한 번 실행할 작은 행동"
        onClick={() => onSelect("daily_todo")}
      />
      <ModeCard
        icon="🔁"
        title={FEATURE_NAMES.ROUTINE}
        desc="매일 또는 매주 반복할 행동"
        onClick={() => onSelect("routine")}
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

// ─── 기간 선택 ───────────────────────────────────────────

interface PeriodSelectStepProps {
  mode: NextStepMode;
  onBack: () => void;
  onSelect: (period: SelectablePeriod) => void;
}

function PeriodSelectStep({ mode, onBack, onSelect }: PeriodSelectStepProps) {
  const modeLabel = mode === "daily_todo" ? FEATURE_NAMES.DAILY_TODO : FEATURE_NAMES.ROUTINE;
  return (
    <div className="flex flex-col gap-3 py-1">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1 text-xs text-foreground/60 transition-colors hover:text-foreground"
      >
        <span aria-hidden>←</span>
        <span>다른 종류 선택</span>
      </button>

      <p className="text-sm text-foreground/70">{modeLabel}을(를) 언제로 잡으시겠어요?</p>

      <div className="flex flex-col gap-2">
        {PERIOD_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onSelect(p)}
            className="rounded-lg border border-foreground/10 px-4 py-3 text-left text-sm transition-colors hover:bg-foreground/[0.04]"
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  );
}
