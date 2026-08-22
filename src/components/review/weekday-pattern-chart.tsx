// 요일별 완료 분포 차트 (최근 4주) — PR 24
//
// PDF "2.e. ... 요일별/시간대별 수행 패턴 등을 시각화된 그래프"
// 데이터: 최근 4주 action_logs를 요일별로 집계 (월~일).

import { cn } from "@/lib/utils";
import type { WeekdayCompletion } from "@/types";
import { Card } from "@/components/ui/card";

interface WeekdayPatternChartProps {
  data: WeekdayCompletion[];
}

export function WeekdayPatternChart({ data }: WeekdayPatternChartProps) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const top = [...data].sort((a, b) => b.count - a.count)[0];

  return (
    <Card as="section" padded>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-foreground/70">요일별 수행 패턴</p>
        <span className="text-[10px] text-foreground/50">최근 4주</span>
      </div>

      {/* 막대 차트 — 7개 세로 막대 */}
      <div className="flex h-32 items-end gap-2">
        {data.map((day) => {
          const ratio = day.count / max;
          const isTop = top && day.count > 0 && day.weekday === top.weekday;
          return (
            <div key={day.weekday} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-foreground/70">{day.count}</span>
              <div
                className="w-full rounded-t-sm bg-foreground/10 relative overflow-hidden"
                style={{ height: "100%" }}
              >
                <div
                  className={cn(
                    "absolute inset-x-0 bottom-0 transition-[height] duration-500",
                    isTop ? "bg-foreground" : "bg-foreground/40"
                  )}
                  style={{ height: `${Math.round(ratio * 100)}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-[11px]",
                  isTop ? "font-semibold text-foreground" : "text-foreground/70"
                )}
              >
                {day.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-foreground/70">
        {total === 0
          ? "최근 4주 완료 기록이 없어요."
          : top
            ? `${top.label}요일에 가장 많이 실행했어요 (${top.count}회)`
            : ""}
      </p>
    </Card>
  );
}
