"use client";

// "한걸음 더" 시트 (PR 18 단순화)
//
// 진입점:
// - 실행계획 섹션 헤더 우측 "한걸음 더" 버튼 (대시보드)
// - 실행계획 카드 ⋮ → "추가" 메뉴
//
// 흐름 (2단계 — PR 12에선 3단계였으나 PR 18에서 기간 단계 자동 skip):
// 1) 모드 선택 — 데일리 투두 / 루틴
// 2) 입력 — EditWithAISheet (직접 입력 + AI 생성 버튼 + 저장)
//
// 데일리 투두는 무조건 stride_level="this_month"로 저장 (실행계획 카드 1개로 단순화).
// 루틴은 stride_level 컬럼 없음 (PR 19+에서 별도 time_slot 추가 예정).
//
// 안정성: AI 호출은 단일 type만 (구 "둘 다" 모드의 race 위험 제거).

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

interface NextStepSheetProps {
  open: boolean;
  onClose: () => void;
  bucketId: string | null;
  /** 적용 성공 후 부모 컴포넌트 리프레시 트리거 */
  onApplied: () => void;
  /**
   * 외부에서 prefill — 카드 ⋮ "추가" 클릭 시 prefill (현재 항상 this_month).
   * PR 18에서 stride_level이 단일 값으로 축소되어 사실상 의미 없어짐.
   * prop 시그니처는 호환성 유지 위해 남김.
   */
  defaultPeriod?: DailyTodoStrideLevel | null;
}

export function NextStepSheet({
  open,
  onClose,
  bucketId,
  onApplied,
  defaultPeriod: _defaultPeriod = null,
}: NextStepSheetProps) {
  const { toast } = useToast();

  // 단계 진행: mode 선택 → edit (기간 단계는 PR 18에서 자동 skip)
  const [mode, setMode] = useState<NextStepMode | null>(null);
  // 루틴 AI 추천 결과의 repeat 정보 (직접 입력일 땐 기본값 weekly/1)
  const [routineRepeat, setRoutineRepeat] = useState<{
    repeatUnit: "daily" | "weekly";
    repeatValue: number;
  } | null>(null);

  // 시트 열릴 때 / 닫힐 때 리셋
  useEffect(() => {
    if (open) {
      setMode(null);
      setRoutineRepeat(null);
    } else {
      setMode(null);
      setRoutineRepeat(null);
    }
  }, [open]);

  // 단계 판단 (mode 선택되면 바로 edit)
  const step: "mode" | "edit" = !mode ? "mode" : "edit";

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
    if (!bucketId || !mode) return;

    const payload =
      mode === "daily_todo"
        ? { daily: { title: value, strideLevel: "this_month" as const }, routine: null }
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

  // 단계 1 (모드 선택) 시트
  const stepSheet = (
    <BottomSheet open={open && step === "mode"} onClose={onClose} title="한걸음 더">
      <ModeSelectStep onSelect={(m) => setMode(m)} />
    </BottomSheet>
  );

  // 단계 2 — EditWithAISheet
  const editSheet =
    step === "edit" && mode ? (
      <EditWithAISheet
        open={open}
        onClose={onClose}
        title={
          mode === "daily_todo"
            ? `${FEATURE_NAMES.DAILY_TODO} 추가`
            : `${FEATURE_NAMES.ROUTINE} 추가`
        }
        description={
          mode === "daily_todo"
            ? `이번 달 ${FEATURE_NAMES.EXECUTION_PLAN} 카드에 추가될 행동입니다.`
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
}

function ModeSelectStep({ onSelect }: ModeSelectStepProps) {
  return (
    <div className="flex flex-col gap-3 py-1">
      <p className="text-sm text-foreground/70">무엇을 추가하시겠어요?</p>
      <ModeCard
        icon="📌"
        title={FEATURE_NAMES.DAILY_TODO}
        desc="이번 달에 한 번 실행할 작은 행동"
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
