"use client";

// 공통 수정 컴포넌트 — 텍스트필드 + 확인 버튼 + AI 생성 버튼
//
// 사용 시나리오 (PR 7 신설, PR 9~12에서 활용):
// - 발걸음 카드의 ⋮ 더보기 → "수정" 클릭 시 카드 타이틀 prefill해서 노출
// - "한걸음 더" 시트의 마지막 단계 (모드/기간 선택 후) — 직접 입력 또는 AI 생성
//
// 핵심 동작:
// 1) 텍스트필드에 사용자가 직접 입력 가능 (initialValue로 prefill 지원)
// 2) "AI 생성" 버튼 → onAIGenerate() 호출 → 결과를 textfield에 채움
// 3) 사용자가 결과를 추가 수정 가능
// 4) "확인" 버튼 → onConfirm(value) 호출
//
// BottomSheet 기반 (모바일 친화 + 키보드 호환). 사용자 결정 ① 참조.

import { useEffect, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DailyTodo, RoutineWithCompletion } from "@/types";

interface EditWithAISheetProps {
  open: boolean;
  onClose: () => void;
  /** 시트 헤더 제목 (예: "오늘 한 걸음 수정", "이번 주에 추가") */
  title: string;
  /** 텍스트필드 prefill 값 — 카드 수정 시 기존 타이틀을 넣음. 빈 문자열이면 신규 입력. */
  initialValue?: string;
  /** 확인 버튼 클릭 시 호출. 비동기 가능 (저장 중 로딩 표시). */
  onConfirm: (value: string) => void | Promise<void>;
  /** AI 생성 버튼 클릭 시 호출. 결과 문자열을 textfield에 채움. 미제공 시 AI 버튼 숨김. */
  onAIGenerate?: () => Promise<string>;
  /** 텍스트필드 placeholder — 입력 가이드 문구 */
  placeholder?: string;
  /** 확인 버튼 라벨 (기본 "확인") */
  confirmLabel?: string;
  /** AI 생성 버튼 라벨 (기본 "✨ AI 생성") */
  aiButtonLabel?: string;
  /** 시트 헤더 아래 보조 설명 */
  description?: string;
  /**
   * PR 15: 과거 타이틀 picker (선택). 최근 → 과거 순서로 전달.
   * 시트는 최대 5개까지 표시하고 클릭 시 textfield를 해당 값으로 채움.
   * (저장 안 함 — 사용자가 추가 수정 후 "확인" 클릭해야 적용)
   */
  history?: string[];
  /**
   * PR 37: 시트 하단에 노출할 데일리투두 리스트. 각 항목 우측 trash로 삭제.
   * 미전달 또는 빈 배열이면 섹션 숨김.
   */
  todos?: DailyTodo[];
  /** PR 37: 시트 하단에 노출할 루틴 리스트. 각 항목 우측 trash로 비활성화(soft delete). */
  routines?: RoutineWithCompletion[];
  /** PR 37: 데일리투두 trash 클릭 시 호출 — 부모가 서버 액션 + refresh 처리 */
  onDeleteTodo?: (todoId: string) => Promise<void>;
  /** PR 37: 루틴 trash 클릭 시 호출 — 부모가 비활성화 액션 + refresh 처리 */
  onDeactivateRoutine?: (routineId: string) => Promise<void>;
}

export function EditWithAISheet({
  open,
  onClose,
  title,
  initialValue = "",
  onConfirm,
  onAIGenerate,
  placeholder = "직접 입력하거나 AI 생성을 누르세요",
  confirmLabel = "확인",
  aiButtonLabel = "✨ AI 생성",
  description,
  history,
  todos,
  routines,
  onDeleteTodo,
  onDeactivateRoutine,
}: EditWithAISheetProps) {
  const [value, setValue] = useState(initialValue);
  const [isAILoading, setIsAILoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  // PR 37: 삭제 진행 상태 — 항목별 ID 추적해 trash 아이콘 disable
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startDelete] = useTransition();

  // PR 37: 삭제 가능 여부
  const showTodos = Boolean(todos && todos.length > 0 && onDeleteTodo);
  const showRoutines = Boolean(routines && routines.length > 0 && onDeactivateRoutine);
  const showDeletionSection = showTodos || showRoutines;

  // 시트 열릴 때마다 prefill 값으로 리셋
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setAIError(null);
    }
  }, [open, initialValue]);

  async function handleAIGenerate() {
    if (!onAIGenerate) return;
    setIsAILoading(true);
    setAIError(null);
    try {
      const result = await onAIGenerate();
      setValue(result);
    } catch (error) {
      setAIError(error instanceof Error ? error.message : "AI 생성에 실패했어요.");
    } finally {
      setIsAILoading(false);
    }
  }

  async function handleConfirm() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setIsConfirming(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setIsConfirming(false);
    }
  }

  const canConfirm = value.trim().length > 0 && !isAILoading && !isConfirming;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            void handleConfirm();
          }}
          isLoading={isConfirming}
          disabled={!canConfirm}
        >
          {confirmLabel}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {description && (
          <p className="text-xs text-foreground/60">{description}</p>
        )}

        <textarea
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (aiError) setAIError(null);
          }}
          placeholder={placeholder}
          rows={4}
          className={cn(
            "w-full resize-none rounded-lg border border-foreground/15 bg-background px-3 py-2.5 text-sm leading-relaxed",
            "focus:outline-none focus:ring-2 focus:ring-foreground/20",
            "disabled:opacity-50"
          )}
          disabled={isAILoading || isConfirming}
        />

        {onAIGenerate && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => {
              void handleAIGenerate();
            }}
            isLoading={isAILoading}
            disabled={isAILoading || isConfirming}
          >
            {aiButtonLabel}
          </Button>
        )}

        {aiError && (
          <p className="text-xs text-red-500">{aiError}</p>
        )}

        {/* PR 15: 과거 타이틀 picker — 최근 5개 */}
        {history && history.length > 0 && (
          <div className="mt-1 flex flex-col gap-1.5">
            <p className="text-xs text-foreground/60">예전 추천</p>
            <ul className="flex flex-col gap-1">
              {history.slice(0, 5).map((past, index) => (
                <li key={`hist-${index}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setValue(past);
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

        {/* PR 37: 삭제 영역 — 현재 카드와 묶인 데일리투두 + 루틴 정리 */}
        {showDeletionSection && (
          <div className="mt-2 flex flex-col gap-3 border-t border-foreground/10 pt-3">
            {showTodos && (
              <DeletionList
                label={`이 단계의 ${FEATURE_NAMES.DAILY_TODO}`}
                items={todos!.map((t) => ({ id: t.id, title: t.title }))}
                deletingId={deletingId}
                disabled={isAILoading || isConfirming}
                confirmMsg={(title) => `"${title}" ${FEATURE_NAMES.DAILY_TODO}을 삭제할까요?`}
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
                items={routines!.map((r) => ({ id: r.id, title: r.title }))}
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
    </BottomSheet>
  );
}

// PR 37: 시트 내부 공용 — 라벨 + 항목 리스트 + trash 아이콘
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
              <span className="flex-1 truncate text-xs text-foreground/80">{item.title}</span>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined" && !window.confirm(confirmMsg(item.title))) {
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
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
