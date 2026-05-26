"use client";

// IA v2 목표 4 — StepSheet (NextStepSheet + EditWithAISheet 통합)
//
// 왜: 기존엔 "한걸음 더" 진입 시 모드 선택 → (루틴이면) 시간대 선택 → EditWithAISheet 가 차례로 떠서
//   모달이 최대 3겹 쌓였고, 발걸음 카드 ⋮ 수정 경로와 컴포넌트가 분리되어 prop drilling이 많았다.
//   IA v2 명세에 따라 모든 흐름을 단일 BottomSheet (depth=1) 안에서 inline 으로 처리하도록 통합한다.
//
// 통합 후 진입 시나리오:
// - FAB 클릭            → initialMode="next-step",   editingStride=null,  defaultAIEnabled=false
// - 카드 ⋮ "추가"        → initialMode="next-step",   editingStride=null,  defaultAIEnabled=true
// - 카드 ⋮ "수정"        → initialMode="edit-with-ai", editingStride=item,  defaultAIEnabled=true
//
// 모드 전환 (segment): editingStride가 있을 때만 "AI와 수정" segment가 활성화된다.
//   진입 시 부모가 결정한 모드를 default 로 쓰되, 사용자가 시트 안에서 자유롭게 토글 가능.
// AI toggle: 텍스트 위 스위치로 켜고 끄며, OFF면 AI 생성 버튼이 숨겨진다 (직접 입력 폼).

import { useEffect, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  applyNextStepAction,
  generateNextStepPreviewAction,
  regenerateStrideItemAction,
  updateStrideItemAction,
} from "@/app/(main)/dashboard/actions";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
  DailyTodo,
  RoutineTimeSlot,
  RoutineWithCompletion,
  StrideItem,
} from "@/types";

export type StepSheetMode = "next-step" | "edit-with-ai";
type NextStepKind = "daily_todo" | "routine";

const TIME_SLOT_LABELS: Record<RoutineTimeSlot, string> = {
  morning: "아침",
  afternoon: "점심",
  evening: "저녁",
  night: "밤",
};

const TIME_SLOT_ORDER: RoutineTimeSlot[] = ["morning", "afternoon", "evening", "night"];

interface StepSheetProps {
  open: boolean;
  onClose: () => void;
  /** 진입점이 결정하는 초기 segment. editingStride가 있을 때 사용자가 사이드로 전환 가능. */
  initialMode: StepSheetMode;
  /** 현재 활성 버킷. null이면 "한걸음 더" 흐름은 빈 상태 가드를 보여준다. */
  bucketId: string | null;
  /** 저장 성공 후 부모 리프레시 트리거 (router.refresh 등). */
  onApplied: () => void;

  /** edit-with-ai 컨텍스트 — null이면 segment의 edit 옵션은 비활성. */
  editingStride?: StrideItem | null;
  /** 수정 모드: 과거 타이틀 picker (최근→과거). */
  editHistory?: string[];
  /** 수정 모드: 같은 단계의 데일리 투두 — 시트 하단 trash 영역. this_month에서만 의미. */
  editTodos?: DailyTodo[];
  /** 수정 모드: 같은 버킷의 루틴 — 시트 하단 trash 영역. this_month에서만 의미. */
  editRoutines?: RoutineWithCompletion[];
  onDeleteTodo?: (todoId: string) => Promise<void>;
  onDeactivateRoutine?: (routineId: string) => Promise<void>;

  /** AI toggle 초기값 (FAB=false, 그 외=true). 사용자가 시트 안에서 자유롭게 토글. */
  defaultAIEnabled?: boolean;
}

export function StepSheet({
  open,
  onClose,
  initialMode,
  bucketId,
  onApplied,
  editingStride = null,
  editHistory,
  editTodos,
  editRoutines,
  onDeleteTodo,
  onDeactivateRoutine,
  defaultAIEnabled = true,
}: StepSheetProps) {
  const { toast } = useToast();

  const canEdit = editingStride !== null;

  // ── 시트 전역 상태 ─────────────────────────────────────────
  const [mode, setMode] = useState<StepSheetMode>(initialMode);
  const [aiEnabled, setAIEnabled] = useState(defaultAIEnabled);
  const [textValue, setTextValue] = useState("");
  const [aiError, setAIError] = useState<string | null>(null);
  const [isAILoading, setIsAILoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // ── next-step 전용 상태 ─────────────────────────────────────
  const [kind, setKind] = useState<NextStepKind | null>(null);
  const [timeSlot, setTimeSlot] = useState<RoutineTimeSlot | null>(null);
  // 루틴 AI 추천 결과의 repeat 정보 (직접 입력일 땐 기본값 weekly/1)
  const [routineRepeat, setRoutineRepeat] = useState<{
    repeatUnit: "daily" | "weekly";
    repeatValue: number;
  } | null>(null);

  // ── 삭제 영역 상태 (PR 37) ─────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startDelete] = useTransition();

  // 열릴 때마다 진입점 기준으로 리셋.
  // 왜: 닫힌 뒤 다시 열 때 이전 입력값이 남아 있으면 진입점 의도와 어긋날 수 있다.
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setAIEnabled(defaultAIEnabled);
      setKind(null);
      setTimeSlot(null);
      setRoutineRepeat(null);
      setAIError(null);
      setTextValue(
        initialMode === "edit-with-ai" ? (editingStride?.action ?? "") : ""
      );
    }
  }, [open, initialMode, defaultAIEnabled, editingStride]);

  // segment 전환 시: 텍스트/하위 선택을 모드에 맞게 재설정.
  // 왜: 모드가 바뀌면 의미가 달라지므로 잔존 상태로 인한 혼선을 막는다.
  function handleModeSwitch(next: StepSheetMode) {
    if (next === mode) return;
    if (next === "edit-with-ai" && !canEdit) return;
    setMode(next);
    setAIError(null);
    if (next === "next-step") {
      setTextValue("");
      setKind(null);
      setTimeSlot(null);
      setRoutineRepeat(null);
    } else {
      setTextValue(editingStride?.action ?? "");
    }
  }

  // ── AI 생성 (모드별 분기) ──────────────────────────────────
  async function handleAIGenerate() {
    setAIError(null);
    setIsAILoading(true);
    try {
      if (mode === "next-step") {
        if (!bucketId) throw new Error("먼저 장면을 선택해 주세요.");
        if (!kind) throw new Error("데일리 투두 또는 루틴을 먼저 선택해 주세요.");
        const result = await generateNextStepPreviewAction(bucketId, kind, []);
        if (!result.success || !result.data) {
          throw new Error(result.error ?? "AI 추천에 실패했어요.");
        }
        if (result.data.type === "routine") {
          setRoutineRepeat({
            repeatUnit: result.data.repeatUnit,
            repeatValue: result.data.repeatValue,
          });
        }
        setTextValue(result.data.title);
      } else {
        if (!bucketId || !editingStride) {
          throw new Error("수정 대상이 없습니다.");
        }
        const result = await regenerateStrideItemAction(
          bucketId,
          editingStride.level
        );
        if (!result.success || !result.item) {
          throw new Error(result.error ?? "AI 추천에 실패했어요.");
        }
        setTextValue(result.item.action);
      }
    } catch (error) {
      setAIError(error instanceof Error ? error.message : "AI 생성에 실패했어요.");
    } finally {
      setIsAILoading(false);
    }
  }

  // ── 저장 (모드별 분기) ─────────────────────────────────────
  async function handleConfirm() {
    const trimmed = textValue.trim();
    if (!trimmed) return;
    setIsConfirming(true);
    try {
      if (mode === "next-step") {
        if (!bucketId || !kind) return;
        if (kind === "routine" && !timeSlot) return;
        const payload =
          kind === "daily_todo"
            ? {
                daily: { title: trimmed, strideLevel: "this_month" as const },
                routine: null,
              }
            : {
                daily: null,
                routine: {
                  title: trimmed,
                  repeatUnit: routineRepeat?.repeatUnit ?? ("weekly" as const),
                  repeatValue: routineRepeat?.repeatValue ?? 1,
                  timeSlot,
                },
              };
        const result = await applyNextStepAction(bucketId, payload);
        if (!result.success) {
          toast(result.error ?? "적용에 실패했어요.", "error");
          return;
        }
        const label =
          kind === "daily_todo" ? FEATURE_NAMES.DAILY_TODO : FEATURE_NAMES.ROUTINE;
        toast(`${label}을(를) 추가했어요.`, "success");
        onApplied();
        onClose();
      } else {
        if (!bucketId || !editingStride) return;
        const result = await updateStrideItemAction(
          bucketId,
          editingStride.level,
          trimmed
        );
        if (!result.success) {
          toast(result.error ?? "수정에 실패했어요.", "error");
          return;
        }
        toast(`${editingStride.label} 단계를 수정했어요.`, "success");
        onApplied();
        onClose();
      }
    } finally {
      setIsConfirming(false);
    }
  }

  // 빈 상태 가드 — IA v2 목표 1과 동일하게, 버킷이 없으면 next-step 흐름을 안내로 대체.
  // 왜: 새 장면 추가 진입점은 헤더 BucketSwitcher의 + 칩으로 일원화돼 있다.
  const showEmptyGuard = mode === "next-step" && bucketId == null;

  // 저장 버튼 활성 조건 — 모드별로 다름.
  const canConfirm =
    !isAILoading &&
    !isConfirming &&
    textValue.trim().length > 0 &&
    (mode === "edit-with-ai"
      ? !!editingStride
      : !!kind && (kind === "daily_todo" || !!timeSlot));

  // 삭제 영역 표시 여부 (edit-with-ai + this_month 한정)
  const showTodos =
    mode === "edit-with-ai" &&
    editingStride?.level === "this_month" &&
    !!editTodos &&
    editTodos.length > 0 &&
    !!onDeleteTodo;
  const showRoutines =
    mode === "edit-with-ai" &&
    editingStride?.level === "this_month" &&
    !!editRoutines &&
    editRoutines.length > 0 &&
    !!onDeactivateRoutine;
  const showDeletionSection = showTodos || showRoutines;

  // 시트 타이틀 — 모드 + 현재 상태에 따라 동적
  const sheetTitle =
    mode === "edit-with-ai" && editingStride
      ? `${editingStride.label} 단계 수정`
      : FEATURE_NAMES.STEP_MORE;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={sheetTitle}
      footer={
        showEmptyGuard ? undefined : (
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              void handleConfirm();
            }}
            isLoading={isConfirming}
            disabled={!canConfirm}
          >
            {mode === "edit-with-ai" ? "저장" : "추가하기"}
          </Button>
        )
      }
    >
      {showEmptyGuard ? (
        <EmptyBucketGuard onClose={onClose} />
      ) : (
        <div className="flex flex-col gap-3">
          {/* segment control — 모드 전환. editingStride 없으면 edit 옵션 비활성. */}
          <ModeSegment
            mode={mode}
            canEdit={canEdit}
            onChange={handleModeSwitch}
          />

          {mode === "next-step" ? (
            <NextStepBody
              kind={kind}
              onKindChange={(k) => {
                setKind(k);
                // 종류가 바뀌면 텍스트와 루틴 메타 리셋 — 의미가 달라지기 때문.
                setTextValue("");
                setRoutineRepeat(null);
                if (k !== "routine") setTimeSlot(null);
              }}
              timeSlot={timeSlot}
              onTimeSlotChange={setTimeSlot}
            />
          ) : (
            editingStride && (
              <p className="text-xs text-foreground/60">
                지금 이 단계의 행동을 한 문장으로 다시 정의해 보세요.
              </p>
            )
          )}

          {/* 본문 텍스트 — 두 모드 공통.
              왜: 모달 depth=1 통합의 핵심 — 모든 입력을 같은 시트에서 처리. */}
          <textarea
            value={textValue}
            onChange={(event) => {
              setTextValue(event.target.value);
              if (aiError) setAIError(null);
            }}
            placeholder={
              mode === "edit-with-ai"
                ? "이 단계의 행동을 한 문장으로 적어주세요"
                : kind === "daily_todo"
                  ? "예: 5분 산책하기"
                  : kind === "routine"
                    ? "예: 매일 물 한 잔"
                    : "직접 입력하거나 AI 생성을 누르세요"
            }
            rows={4}
            className={cn(
              "w-full resize-none rounded-lg border border-foreground/15 bg-background px-3 py-2.5 text-sm leading-relaxed",
              "focus:outline-none focus:ring-2 focus:ring-foreground/20",
              "disabled:opacity-50"
            )}
            disabled={isAILoading || isConfirming}
          />

          {/* AI toggle + 생성 버튼 — 함께 그룹. OFF면 직접 입력 폼만 남는다. */}
          <AIToggleAndButton
            enabled={aiEnabled}
            onToggle={(next) => {
              setAIEnabled(next);
              if (!next && aiError) setAIError(null);
            }}
            onGenerate={() => {
              void handleAIGenerate();
            }}
            disabled={
              isAILoading ||
              isConfirming ||
              (mode === "next-step" && !kind) ||
              (mode === "edit-with-ai" && !editingStride)
            }
            isLoading={isAILoading}
          />

          {aiError && <p className="text-xs text-red-500">{aiError}</p>}

          {/* 수정 모드: 과거 타이틀 picker (PR 15) */}
          {mode === "edit-with-ai" && editHistory && editHistory.length > 0 && (
            <div className="mt-1 flex flex-col gap-1.5">
              <p className="text-xs text-foreground/60">예전 추천</p>
              <ul className="flex flex-col gap-1">
                {editHistory.slice(0, 5).map((past, index) => (
                  <li key={`hist-${index}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setTextValue(past);
                        if (aiError) setAIError(null);
                      }}
                      disabled={isAILoading || isConfirming}
                      className={cn(
                        "w-full rounded-md border border-foreground/10 bg-foreground/[0.02] px-2.5 py-1.5 text-left text-xs text-foreground/70 transition-colors",
                        "hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
                      )}
                    >
                      {past}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 수정 모드 + this_month: 삭제 영역 (PR 37) */}
          {showDeletionSection && (
            <div className="mt-2 flex flex-col gap-3 border-t border-foreground/10 pt-3">
              {showTodos && (
                <DeletionList
                  label={`이 단계의 ${FEATURE_NAMES.DAILY_TODO}`}
                  items={editTodos!.map((t) => ({ id: t.id, title: t.title }))}
                  deletingId={deletingId}
                  disabled={isAILoading || isConfirming}
                  confirmMsg={(title) =>
                    `"${title}" ${FEATURE_NAMES.DAILY_TODO}을 삭제할까요?`
                  }
                  onDelete={(id) => {
                    startDelete(async () => {
                      setDeletingId(id);
                      try {
                        await onDeleteTodo!(id);
                      } finally {
                        setDeletingId(null);
                      }
                    });
                  }}
                />
              )}
              {showRoutines && (
                <DeletionList
                  label={`이 ${FEATURE_NAMES.BUCKET}의 ${FEATURE_NAMES.ROUTINE}`}
                  items={editRoutines!.map((r) => ({ id: r.id, title: r.title }))}
                  deletingId={deletingId}
                  disabled={isAILoading || isConfirming}
                  confirmMsg={(title) =>
                    `"${title}" ${FEATURE_NAMES.ROUTINE}을 비활성화할까요?\n과거 달성 기록은 보존돼요.`
                  }
                  onDelete={(id) => {
                    startDelete(async () => {
                      setDeletingId(id);
                      try {
                        await onDeactivateRoutine!(id);
                      } finally {
                        setDeletingId(null);
                      }
                    });
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

// ─── 빈 상태 가드 ───────────────────────────────────────────

function EmptyBucketGuard({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3 py-1">
      <p className="text-sm text-foreground/70">
        아직 {FEATURE_NAMES.BUCKET}이 없어요. 먼저 상단의{" "}
        <span className="font-semibold text-foreground">＋</span> 버튼으로 새 장면을
        추가해주세요.
      </p>
      <p className="text-xs text-foreground/50">
        {FEATURE_NAMES.BUCKET}이 생기면 여기서 {FEATURE_NAMES.DAILY_TODO}와{" "}
        {FEATURE_NAMES.ROUTINE}을 한 걸음씩 더할 수 있어요.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-2 inline-flex items-center justify-center rounded-lg border border-foreground/10 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.04]"
      >
        닫기
      </button>
    </div>
  );
}

// ─── Segment control ───────────────────────────────────────

interface ModeSegmentProps {
  mode: StepSheetMode;
  canEdit: boolean;
  onChange: (mode: StepSheetMode) => void;
}

function ModeSegment({ mode, canEdit, onChange }: ModeSegmentProps) {
  // canEdit=false 일 때도 segment를 노출 — 사용자가 모드의 존재를 인지하도록.
  // 왜: 인지 가능 + 비활성 상태가 "수정할 항목 없음"을 가장 분명하게 알린다.
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-lg bg-foreground/[0.05] p-1"
      role="tablist"
    >
      <SegmentButton
        active={mode === "next-step"}
        onClick={() => onChange("next-step")}
        label={FEATURE_NAMES.STEP_MORE}
      />
      <SegmentButton
        active={mode === "edit-with-ai"}
        onClick={() => onChange("edit-with-ai")}
        label="AI와 수정"
        disabled={!canEdit}
        hint={!canEdit ? "발걸음 카드의 ⋮ 메뉴에서 수정 진입" : undefined}
      />
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  label,
  disabled,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={cn(
        "min-h-[32px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-foreground/55 hover:text-foreground/80",
        disabled && "cursor-not-allowed opacity-40 hover:text-foreground/55"
      )}
    >
      {label}
    </button>
  );
}

// ─── AI toggle + generate button ───────────────────────────

interface AIToggleAndButtonProps {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  onGenerate: () => void;
  disabled: boolean;
  isLoading: boolean;
}

function AIToggleAndButton({
  enabled,
  onToggle,
  onGenerate,
  disabled,
  isLoading,
}: AIToggleAndButtonProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center justify-between gap-2 rounded-md border border-foreground/10 px-3 py-2">
        <span className="text-xs text-foreground/70">
          ✨ AI 생성 사용
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onToggle(event.target.checked)}
          className="h-4 w-4 cursor-pointer accent-foreground"
        />
      </label>
      {enabled && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={onGenerate}
          isLoading={isLoading}
          disabled={disabled}
        >
          ✨ AI 생성
        </Button>
      )}
    </div>
  );
}

// ─── Next-step 본문: 종류 + 시간대 선택 (inline) ─────────────

interface NextStepBodyProps {
  kind: NextStepKind | null;
  onKindChange: (kind: NextStepKind) => void;
  timeSlot: RoutineTimeSlot | null;
  onTimeSlotChange: (slot: RoutineTimeSlot) => void;
}

function NextStepBody({
  kind,
  onKindChange,
  timeSlot,
  onTimeSlotChange,
}: NextStepBodyProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-foreground/60">무엇을 추가하시겠어요?</p>
        <div className="grid grid-cols-2 gap-2">
          <KindChip
            active={kind === "daily_todo"}
            onClick={() => onKindChange("daily_todo")}
            icon="📌"
            title={FEATURE_NAMES.DAILY_TODO}
            desc="이번 달 1회"
          />
          <KindChip
            active={kind === "routine"}
            onClick={() => onKindChange("routine")}
            icon="🔁"
            title={FEATURE_NAMES.ROUTINE}
            desc="반복 행동"
          />
        </div>
      </div>

      {kind === "routine" && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-foreground/60">언제 실천하실 건가요?</p>
          <div className="grid grid-cols-4 gap-2">
            {TIME_SLOT_ORDER.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => onTimeSlotChange(slot)}
                className={cn(
                  "rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                  timeSlot === slot
                    ? "border-foreground bg-foreground/[0.08] text-foreground"
                    : "border-foreground/10 text-foreground/65 hover:bg-foreground/[0.04]"
                )}
              >
                {TIME_SLOT_LABELS[slot]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KindChip({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-foreground bg-foreground/[0.06]"
          : "border-foreground/10 hover:bg-foreground/[0.04]"
      )}
    >
      <span className="text-lg leading-none" aria-hidden>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-[11px] text-foreground/55">{desc}</p>
      </div>
    </button>
  );
}

// ─── 삭제 영역 공용 (PR 37 동일) ───────────────────────────

interface DeletionListProps {
  label: string;
  items: Array<{ id: string; title: string }>;
  deletingId: string | null;
  disabled: boolean;
  confirmMsg: (title: string) => string;
  onDelete: (id: string) => void;
}

function DeletionList({
  label,
  items,
  deletingId,
  disabled,
  confirmMsg,
  onDelete,
}: DeletionListProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-foreground/60">{label}</p>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const isBusy = deletingId === item.id;
          return (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-md border border-foreground/10 bg-foreground/[0.02] px-2.5 py-1.5"
            >
              <span className="flex-1 truncate text-xs text-foreground/80">
                {item.title}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    !window.confirm(confirmMsg(item.title))
                  ) {
                    return;
                  }
                  onDelete(item.id);
                }}
                disabled={disabled || isBusy}
                aria-label={`${item.title} 삭제`}
                aria-busy={isBusy}
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-foreground/40 transition-colors hover:bg-red-500/10 hover:text-red-500",
                  "disabled:cursor-not-allowed disabled:opacity-40"
                )}
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
