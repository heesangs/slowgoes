"use client";

// 반복 옵션 시트 — 입력창 [반복] 버튼에서 진입.
//
// 프리셋 7종(선택 날짜 기준 라벨 동적 생성) + 사용자 설정(요일 다중선택).
// 반복을 선택하면 할 일이 "루틴"이 된다 (Phase B: 투두/루틴 통합).

import { useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildRepeatOptions,
  WEEKDAY_SHORT_LABELS,
} from "@/lib/todos/repeat";
import type { TodoRepeatInput } from "@/types";

interface RepeatOptionsSheetProps {
  open: boolean;
  onClose: () => void;
  /** 기준 날짜 (기본 오늘) — "매주 (금)" 등 라벨 계산에 사용 */
  baseDate: string;
  /** 현재 선택된 반복 (하이라이트용) */
  selected: TodoRepeatInput | null;
  /** 선택 확정 (null = 반복 없음) */
  onSelect: (repeat: TodoRepeatInput | null) => void;
}

export function RepeatOptionsSheet({
  open,
  onClose,
  baseDate,
  selected,
  onSelect,
}: RepeatOptionsSheetProps) {
  // 사용자 설정 모드 (요일 다중선택)
  const [customMode, setCustomMode] = useState(false);
  const [customWeekdays, setCustomWeekdays] = useState<number[]>([]);

  const options = buildRepeatOptions(baseDate);

  function handlePick(input: TodoRepeatInput | null) {
    onSelect(input);
    setCustomMode(false);
    onClose();
  }

  function toggleWeekday(day: number) {
    setCustomWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        setCustomMode(false);
        onClose();
      }}
      title="반복"
    >
      {!customMode ? (
        <ul className="flex flex-col">
          {/* 반복 없음 (해제) */}
          <li>
            <OptionRow
              label="반복 없음"
              active={selected === null}
              onClick={() => handlePick(null)}
            />
          </li>
          {options.map((option) => (
            <li key={option.key}>
              <OptionRow
                label={option.label}
                active={
                  option.input !== null &&
                  selected !== null &&
                  JSON.stringify(option.input) === JSON.stringify(selected)
                }
                onClick={() => {
                  if (option.input === null) {
                    // 사용자 설정 → 요일 선택 UI
                    setCustomWeekdays(selected?.weekdays ?? []);
                    setCustomMode(true);
                    return;
                  }
                  handlePick(option.input);
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground/60">반복할 요일을 선택하세요</p>
          <div className="flex justify-between gap-1">
            {WEEKDAY_SHORT_LABELS.map((label, day) => {
              const active = customWeekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleWeekday(day)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm transition-colors",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 text-foreground hover:bg-foreground/5"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <Button
            onClick={() => {
              if (customWeekdays.length === 0) return;
              handlePick({ type: "weekly", weekdays: [...customWeekdays].sort((a, b) => a - b) });
            }}
            disabled={customWeekdays.length === 0}
          >
            확인
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}

function OptionRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm transition-colors hover:bg-foreground/5",
        active && "font-semibold"
      )}
    >
      {label}
      {active && (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}
