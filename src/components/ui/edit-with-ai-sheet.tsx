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

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
}: EditWithAISheetProps) {
  const [value, setValue] = useState(initialValue);
  const [isAILoading, setIsAILoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);

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
      </div>
    </BottomSheet>
  );
}
