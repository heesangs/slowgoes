"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FEATURE_NAMES } from "@/lib/constants";
import type { LifeSceneAnalysisResult, StrideItem } from "@/types";
import { formatRoutineRepeat, getStrideTone } from "./utils";

const ANALYSIS_HEADER_TITLE = "장면을 시간 위에 펼치고 있어요";

interface StepAnalysisProps {
  isAnalyzingLifeScene: boolean;
  lifeSceneAnalysis: LifeSceneAnalysisResult | null;
  displayStrides: StrideItem[];
  bucketTodos: StrideItem[];
  selectedDailyTodo: string;
  selectedRoutineTitles: string[];
  error: string | null;
  onSelectDailyTodo: (action: string) => void;
  onSelectRoutineTitle: (title: string) => void;
  onRetryAnalysis: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepAnalysis({
  isAnalyzingLifeScene,
  lifeSceneAnalysis,
  displayStrides,
  bucketTodos,
  selectedDailyTodo,
  selectedRoutineTitles,
  error,
  onSelectDailyTodo,
  onSelectRoutineTitle,
  onRetryAnalysis,
  onNext,
  onBack,
}: StepAnalysisProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold">{ANALYSIS_HEADER_TITLE}</h2>
        <p className="text-sm text-foreground/60">
          {FEATURE_NAMES.MY_STRIDES}과 {FEATURE_NAMES.DAILY_TODO}, {FEATURE_NAMES.ROUTINE}을 확인해보세요
        </p>
      </div>

      {isAnalyzingLifeScene && (
        <>
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg bg-foreground/[0.04] px-4 py-3 text-sm text-foreground/70"
          >
            AI가 {FEATURE_NAMES.MY_STRIDES}을 그리는 중이에요… 잠시만 기다려 주세요
          </div>
          <div className="flex animate-pulse flex-col gap-3">
            <div className="h-8 w-24 rounded-full bg-foreground/10" />
            <div className="h-5 w-2/3 rounded bg-foreground/10" />
            <div className="h-20 rounded-xl border border-foreground/10 bg-foreground/[0.12]" />
            <div className="h-20 rounded-xl border border-foreground/10 bg-foreground/[0.07]" />
            <div className="h-20 rounded-xl border border-foreground/10 bg-foreground/[0.03]" />
          </div>
        </>
      )}

      {!isAnalyzingLifeScene && lifeSceneAnalysis && (
        <>
          {/* PR 30: AI 공감 메시지(empathyMessage) 카드 제거 — 생성/저장/표시 전 라인에서 폐기.
              lifeArea 배지는 stridePlan 본문이 충분히 영역감을 전달하므로 함께 정리. */}

          {/* 나의 발걸음 (this_month 이상, 긴→짧은 순 — someday 먼저) */}
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{FEATURE_NAMES.MY_STRIDES}</h3>
            <div className="flex flex-col gap-3">
              {displayStrides.map((item, index) => (
                <div
                  key={`stride-${item.level}-${index}`}
                  className={cn("w-full rounded-xl border px-4 py-4 text-left", getStrideTone(item.level))}
                >
                  <p className="mb-1 text-xs font-medium text-foreground/60">{item.label}</p>
                  <p className="text-sm font-medium">{item.action}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 버킷을 위한 투두 (today/this_week — 라디오 선택) */}
          {bucketTodos.length > 0 && (
            <section className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold">{FEATURE_NAMES.BUCKET}을 위한 {FEATURE_NAMES.DAILY_TODO}</h3>
                <p className="text-xs text-foreground/60">
                  하나를 선택하면 이번 주 {FEATURE_NAMES.DAILY_TODO}가 됩니다.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {bucketTodos.map((item, index) => {
                  const isSelected = selectedDailyTodo === item.action;
                  return (
                    <button
                      key={`todo-${item.level}-${index}`}
                      type="button"
                      onClick={() => onSelectDailyTodo(item.action)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                        isSelected
                          ? "border-foreground bg-foreground text-background"
                          : "border-foreground/15 hover:bg-foreground/[0.04]"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          isSelected ? "border-background bg-background" : "border-foreground/30"
                        )}
                      >
                        {isSelected && <span className="h-2 w-2 rounded-full bg-foreground" />}
                      </span>
                      <div className="flex-1">
                        <p className={cn("mb-0.5 text-xs", isSelected ? "text-background/70" : "text-foreground/50")}>
                          {item.label}
                        </p>
                        <p className="text-sm font-medium">{item.action}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* 버킷을 위한 루틴 (라디오 선택) */}
          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold">{FEATURE_NAMES.BUCKET}을 위한 {FEATURE_NAMES.ROUTINE}</h3>
              <p className="text-xs text-foreground/60">
                하나를 선택하면 반복 {FEATURE_NAMES.ROUTINE}으로 등록됩니다.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {lifeSceneAnalysis.suggestedRoutines.map((routine) => {
                const selected = selectedRoutineTitles.includes(routine.title);
                return (
                  <button
                    key={routine.title}
                    type="button"
                    onClick={() => onSelectRoutineTitle(routine.title)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground/15 hover:bg-foreground/[0.04]"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        selected ? "border-background bg-background" : "border-foreground/30"
                      )}
                    >
                      {selected && <span className="h-2 w-2 rounded-full bg-foreground" />}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{routine.title}</p>
                      <p className={cn("mt-1 text-xs", selected ? "text-background/80" : "text-foreground/60")}>
                        반복: {formatRoutineRepeat(routine)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}

      {!isAnalyzingLifeScene && !lifeSceneAnalysis && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
          <p className="text-sm text-red-500">{error}</p>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRetryAnalysis}
            >
              다시 분석하기
            </Button>
          </div>
        </div>
      )}

      {error && lifeSceneAnalysis && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          className="flex-1"
          disabled={isAnalyzingLifeScene}
        >
          이전
        </Button>
        <Button
          type="button"
          onClick={onNext}
          className="flex-1"
          disabled={isAnalyzingLifeScene || (!selectedDailyTodo && selectedRoutineTitles.length === 0)}
        >
          {isAnalyzingLifeScene ? "분석 중..." : "다음"}
        </Button>
      </div>
    </div>
  );
}
