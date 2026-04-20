"use client";

import { Button } from "@/components/ui/button";
import type { LifeSceneAnalysisResult } from "@/types";
import { formatRoutineRepeat } from "./utils";

interface StepConfirmProps {
  selectedSceneText: string;
  lifeSceneAnalysis: LifeSceneAnalysisResult | null;
  selectedDailyTodo: string;
  selectedRoutineTitles: string[];
  error: string | null;
  isLoading: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

export function StepConfirm({
  selectedSceneText,
  lifeSceneAnalysis,
  selectedDailyTodo,
  selectedRoutineTitles,
  error,
  isLoading,
  onBack,
  onSubmit,
}: StepConfirmProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold">선택한 한 걸음</h2>
        <p className="text-sm text-foreground/60">확정하면 대시보드에 오늘의 한 걸음으로 연결돼요</p>
      </div>

      <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-4">
        <p className="mb-1 text-xs text-foreground/50">삶의 장면</p>
        <p className="text-sm font-medium">{selectedSceneText}</p>
        {lifeSceneAnalysis?.lifeArea && (
          <p className="mt-1 text-xs text-foreground/50">영역: {lifeSceneAnalysis.lifeArea}</p>
        )}
      </div>

      <div className="rounded-xl border border-foreground/10 px-4 py-4">
        <p className="text-xs text-foreground/50">데일리투두</p>
        {selectedDailyTodo ? (
          <p className="mt-1 text-sm font-medium">{selectedDailyTodo}</p>
        ) : (
          <p className="mt-1 text-sm text-foreground/60">선택하지 않았어요.</p>
        )}
      </div>

      <div className="rounded-xl border border-foreground/10 px-4 py-4">
        <p className="text-xs text-foreground/50">루틴</p>
        {selectedRoutineTitles.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {lifeSceneAnalysis?.suggestedRoutines
              .filter((item) => selectedRoutineTitles.includes(item.title))
              .map((routine) => (
                <div
                  key={routine.title}
                  className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3"
                >
                  <p className="text-sm font-medium">{routine.title}</p>
                  <p className="mt-1 text-xs text-foreground/60">반복: {formatRoutineRepeat(routine)}</p>
                </div>
              ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-foreground/60">선택하지 않았어요.</p>
        )}
      </div>

      {error && <p className="text-center text-sm text-red-500">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
          이전
        </Button>
        <Button type="button" onClick={onSubmit} isLoading={isLoading} className="flex-1" disabled={isLoading}>
          확정하기
        </Button>
      </div>
    </div>
  );
}
