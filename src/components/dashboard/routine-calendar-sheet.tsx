"use client";

// 루틴 달성 캘린더 시트 (PR 22)
//
// PDF "2.d. 루틴의 달성기록 확인 - 캘린더뷰를 활용해 내가 달성한 날짜를 직관적으로 확인한다."
//
// 진입점: 대시보드 카드/한걸음 상세의 루틴 본문 클릭 (체크박스는 별도 토글)
// 데이터: routine_completions where routine_id + completion_date in [month_start, month_end]
// 표시: 7x6 월별 그리드. 완료일 = 채워진 동그라미.
//
// 인터랙션:
//   - 좌/우 화살표로 월 이동
//   - 캘린더 자체는 read-only (토글은 카드 체크박스에서)

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useToast } from "@/components/ui/toast";
import { getRoutineCompletionsForMonthAction } from "@/app/(main)/dashboard/actions";
import { cn } from "@/lib/utils";

interface RoutineCalendarSheetProps {
  open: boolean;
  onClose: () => void;
  routineId: string | null;
  routineTitle: string | null;
}

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

// 해당 월의 첫째 날부터 마지막 날까지 일자 배열 (월 시작 위치 패딩 포함)
function getMonthGrid(year: number, monthIndex: number): Array<{ date: number; dateStr: string } | null> {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  // 월요일 = 0, 일요일 = 6 (한국 기준)
  const firstWeekday = (firstDay.getDay() + 6) % 7;

  const grid: Array<{ date: number; dateStr: string } | null> = [];
  // 앞 패딩
  for (let i = 0; i < firstWeekday; i++) grid.push(null);
  // 일자
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    grid.push({ date: d, dateStr });
  }
  // 뒤 패딩 (7의 배수까지)
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

function isSameDayString(dateStr: string): boolean {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return dateStr === todayStr;
}

export function RoutineCalendarSheet({
  open,
  onClose,
  routineId,
  routineTitle,
}: RoutineCalendarSheetProps) {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth()); // 0-11
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // 시트 닫힐 때 / 다른 루틴으로 변경 시 현재 월로 리셋
  useEffect(() => {
    if (open) {
      setYear(new Date().getFullYear());
      setMonthIndex(new Date().getMonth());
    }
  }, [open, routineId]);

  // 월 변경 시 데이터 fetch
  useEffect(() => {
    if (!open || !routineId) return;

    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      const result = await getRoutineCompletionsForMonthAction(
        routineId,
        year,
        monthIndex + 1
      );
      if (cancelled) return;
      if (result.success && result.dates) {
        setCompletedDates(new Set(result.dates));
      } else {
        toast(result.error ?? "달성 기록을 불러오지 못했어요.", "error");
        setCompletedDates(new Set());
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, routineId, year, monthIndex, toast]);

  function handlePrevMonth() {
    if (monthIndex === 0) {
      setYear((y) => y - 1);
      setMonthIndex(11);
    } else {
      setMonthIndex((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (monthIndex === 11) {
      setYear((y) => y + 1);
      setMonthIndex(0);
    } else {
      setMonthIndex((m) => m + 1);
    }
  }

  const grid = getMonthGrid(year, monthIndex);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={routineTitle ? `${routineTitle} 달성 기록` : "달성 기록"}
    >
      <div className="flex flex-col gap-3 py-1">
        {/* 월 이동 헤더 */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="이전 달"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            ←
          </button>
          <p className="text-sm font-semibold">
            {year}년 {monthIndex + 1}월
          </p>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="다음 달"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            →
          </button>
        </div>

        {/* 요일 헤더 (월~일) */}
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-foreground/50">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>

        {/* 일자 그리드 */}
        <div className="grid grid-cols-7 gap-1">
          {grid.map((cell, idx) => {
            if (!cell) {
              return <div key={`pad-${idx}`} className="aspect-square" />;
            }
            const isCompleted = completedDates.has(cell.dateStr);
            const isToday = isSameDayString(cell.dateStr);
            return (
              <div
                key={cell.dateStr}
                className={cn(
                  "aspect-square flex items-center justify-center rounded-md text-xs transition-colors",
                  isCompleted
                    ? "bg-foreground text-background font-semibold"
                    : "text-foreground/65",
                  isToday && !isCompleted && "ring-1 ring-foreground/30"
                )}
              >
                {cell.date}
              </div>
            );
          })}
        </div>

        {/* 통계 요약 */}
        <p className="text-xs text-foreground/55">
          {isLoading
            ? "기록을 불러오는 중…"
            : `이 달 ${completedDates.size}회 달성`}
        </p>
      </div>
    </BottomSheet>
  );
}
