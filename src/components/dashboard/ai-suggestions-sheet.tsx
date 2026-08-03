"use client";

// AI 제안 선택 시트 (R2) — 체크박스 리스트 → 선택한 것만 반영.
//
// 두 곳에서 쓴다 (문구만 prop으로 갈아끼운다):
//   대시보드  [AI] → generateTodoSuggestionsAction → 선택 후 addTodosAction으로 등록
//   주간 목표 [AI 목표] → generateWeeklyGoalsAction → 선택 후 일기 본문에 체크박스로 삽입
// 기본 전체 선택 — 마찰을 최소화 (해제도 한 탭).

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AiSuggestionsSheetProps {
  open: boolean;
  onClose: () => void;
  /** AI가 제안한 타이틀 */
  suggestions: string[];
  /** 선택 등록 — 선택된 타이틀 배열 */
  onRegister: (titles: string[]) => void;
  isRegistering?: boolean;
  /** 시트 제목 (기본: 투두 추천) */
  title?: string;
  /** 안내 문구 (기본: 투두 추천) */
  description?: string;
  /** 확인 버튼 문구 — (n) => "3개 등록" 형태. 기본은 등록 */
  confirmLabel?: (count: number) => string;
  /** 처리 중 버튼 문구 */
  busyLabel?: string;
}

export function AiSuggestionsSheet({
  open,
  onClose,
  suggestions,
  onRegister,
  isRegistering = false,
  title = "AI 추천",
  description = "등록할 항목을 선택하세요. 어설퍼도 시작할 수 있는 70점짜리 행동이면 충분해요.",
  confirmLabel = (count) => `${count}개 등록`,
  busyLabel = "등록 중...",
}: AiSuggestionsSheetProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  // 새 제안이 열릴 때마다 전체 선택으로 초기화
  useEffect(() => {
    if (open) {
      setChecked(new Set(suggestions.map((_, i) => i)));
    }
  }, [open, suggestions]);

  function toggle(index: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const selectedTitles = suggestions.filter((_, i) => checked.has(i));

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <p className="mb-3 text-xs text-foreground/50">{description}</p>

      <ul className="flex flex-col gap-1.5">
        {suggestions.map((suggestion, index) => {
          const isChecked = checked.has(index);
          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => toggle(index)}
                aria-pressed={isChecked}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg border px-3 py-3 text-left text-sm transition-colors",
                  isChecked
                    ? "border-foreground/40 bg-foreground/[0.05]"
                    : "border-foreground/10 hover:bg-foreground/[0.03]"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    isChecked
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/30 bg-transparent"
                  )}
                  aria-hidden
                >
                  {isChecked && (
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1 break-words leading-snug">{suggestion}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <Button
        onClick={() => onRegister(selectedTitles)}
        disabled={selectedTitles.length === 0 || isRegistering}
        className="mt-4 w-full"
      >
        {isRegistering ? busyLabel : confirmLabel(selectedTitles.length)}
      </Button>
    </BottomSheet>
  );
}
