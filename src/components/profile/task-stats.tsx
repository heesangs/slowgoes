"use client";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { FEATURE_NAMES } from "@/lib/constants";
import type { TaskStats } from "@/types";

interface TaskStatsSectionProps {
  stats: TaskStats;
}

export function TaskStatsSection({ stats }: TaskStatsSectionProps) {
  const totalItems = stats.totalDailyTodos + stats.totalRoutines;

  if (totalItems === 0) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">나의 통계</h2>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-2 py-8">
          <p className="text-center text-sm text-foreground/60">
            아직 {FEATURE_NAMES.DAILY_TODO}와 {FEATURE_NAMES.ROUTINE}이 없어요.
            <br />
            대시보드에서 {FEATURE_NAMES.BUCKET}을 추가하면 통계가 채워집니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  const completionRate =
    totalItems > 0
      ? Math.round((stats.totalActionsCompleted / Math.max(totalItems, 1)) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">나의 통계</h2>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="flex flex-col items-center py-4">
            <span className="text-2xl font-bold">{stats.totalDailyTodos}</span>
            <span className="text-xs text-foreground/60">{FEATURE_NAMES.DAILY_TODO}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center py-4">
            <span className="text-2xl font-bold">{stats.totalRoutines}</span>
            <span className="text-xs text-foreground/60">{FEATURE_NAMES.ROUTINE}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center py-4">
            <span className="text-2xl font-bold">{stats.totalActionsCompleted}</span>
            <span className="text-xs text-foreground/60">누적 완료 행동</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center py-4">
            <span className="text-2xl font-bold">{stats.completedInLast14Days}</span>
            <span className="text-xs text-foreground/60">최근 14일 완료</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 py-4">
          <p className="text-sm text-foreground/80">
            이번 주 {FEATURE_NAMES.ROUTINE} 완료 <span className="font-semibold">{stats.completedRoutinesThisWeek}개</span>
          </p>
          <div className="h-3 w-full rounded-full bg-foreground/10">
            <div
              className="h-3 rounded-full bg-foreground transition-all"
              style={{
                width: `${stats.totalRoutines > 0 ? Math.round((stats.completedRoutinesThisWeek / stats.totalRoutines) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="text-right text-xs text-foreground/50">
            {stats.totalRoutines > 0
              ? `${Math.round((stats.completedRoutinesThisWeek / stats.totalRoutines) * 100)}%`
              : "0%"}
          </p>
          <p className="text-xs text-foreground/55">실행 완료율(참고): {completionRate}%</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1 py-4">
          <p className="text-sm text-foreground/80">
            완료된 {FEATURE_NAMES.DAILY_TODO} <span className="font-semibold">{stats.completedDailyTodos}개</span>
          </p>
          <p className="text-xs text-foreground/55">
            전체 {FEATURE_NAMES.DAILY_TODO} {stats.totalDailyTodos}개 중 완료 비율을 추적합니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
