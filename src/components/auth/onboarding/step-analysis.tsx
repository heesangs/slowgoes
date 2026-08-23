"use client";

import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/ui/error-box";
import { cn } from "@/lib/utils";
import { FEATURE_NAMES } from "@/lib/constants";
import type { LifeSceneAnalysisResult, StrideItem } from "@/types";
import { getStrideTone } from "./utils";

// 진행 중과 완료의 문구를 갈라 이 화면이 "로딩"이 아니라 **결과**로 읽히게 한다.
const HEADER_ANALYZING = "장면을 시간 위에 펼치고 있어요";
const HEADER_DONE = "이렇게 펼쳐봤어요";

interface StepAnalysisProps {
  isAnalyzingLifeScene: boolean;
  lifeSceneAnalysis: LifeSceneAnalysisResult | null;
  displayStrides: StrideItem[];
  bucketTodos: StrideItem[];
  /** 결과 화면에서 무엇을 펼친 것인지 되짚어 준다 */
  selectedSceneText: string;
  selectedDailyTodo: string;
  error: string | null;
  onSelectDailyTodo: (action: string) => void;
  onRetryAnalysis: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepAnalysis({
  isAnalyzingLifeScene,
  lifeSceneAnalysis,
  displayStrides,
  bucketTodos,
  selectedSceneText,
  selectedDailyTodo,
  error,
  onSelectDailyTodo,
  onRetryAnalysis,
  onNext,
  onBack,
}: StepAnalysisProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-base font-semibold">
          {isAnalyzingLifeScene ? HEADER_ANALYZING : HEADER_DONE}
        </h2>
        {isAnalyzingLifeScene ? (
          <p className="text-sm text-label-alt">
            {FEATURE_NAMES.MY_STRIDES}과 {FEATURE_NAMES.DAILY_TODO}를 확인해보세요
          </p>
        ) : (
          selectedSceneText && (
            <p className="text-sm text-label-alt">
              &ldquo;{selectedSceneText}&rdquo;를 시간 위에 펼친 결과예요
            </p>
          )
        )}
      </div>

      {isAnalyzingLifeScene && (
        <>
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg bg-fill-alt px-4 py-3 text-sm text-label-alt"
          >
            AI가 {FEATURE_NAMES.MY_STRIDES}을 그리는 중이에요… 잠시만 기다려 주세요
          </div>
          <div className="flex animate-pulse flex-col gap-3">
            <div className="h-8 w-24 rounded-full bg-fill-normal" />
            <div className="h-5 w-2/3 rounded bg-fill-normal" />
            <div className="h-20 rounded-xl border border-line-alt bg-fill-strong" />
            <div className="h-20 rounded-xl border border-line-alt bg-fill-normal" />
            <div className="h-20 rounded-xl border border-line-alt bg-fill-alt" />
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
                  <p className="mb-1 text-xs font-medium text-label-alt">{item.label}</p>
                  <p className="text-sm font-medium">{item.action}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 버킷을 위한 투두 (today/this_week — 라디오 선택).
              하나는 반드시 골라야 다음으로 갈 수 있으므로 비어 있어도 섹션을 감추지 않는다 —
              감추면 왜 진행이 안 되는지 알 수 없는 화면이 된다. */}
          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold">{FEATURE_NAMES.BUCKET}을 위한 {FEATURE_NAMES.DAILY_TODO}</h3>
              <p className="text-xs text-label-alt">
                하나를 선택하면 이번 주 {FEATURE_NAMES.DAILY_TODO}가 됩니다.
              </p>
            </div>
            {bucketTodos.length > 0 ? (
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
                          ? "border-inverse-background bg-inverse-background text-inverse-label"
                          : "border-line-normal hover:bg-fill-alt"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          isSelected ? "border-background bg-background" : "border-line-strong"
                        )}
                      >
                        {isSelected && <span className="h-2 w-2 rounded-full bg-inverse-background" />}
                      </span>
                      <div className="flex-1">
                        <p className={cn("mb-0.5 text-xs", isSelected ? "text-background/70" : "text-label-alt")}>
                          {item.label}
                        </p>
                        <p className="text-sm font-medium">{item.action}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg bg-fill-alt px-3 py-3">
                <p className="text-xs leading-relaxed text-label-alt">
                  고를 만한 짧은 걸음이 나오지 않았어요.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onRetryAnalysis}
                  className="mt-2 w-full"
                >
                  다시 분석하기
                </Button>
              </div>
            )}
          </section>

        </>
      )}

      {!isAnalyzingLifeScene && !lifeSceneAnalysis && error && (
        <ErrorBox as="div">
          <p>{error}</p>
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
        </ErrorBox>
      )}

      {error && lifeSceneAnalysis && <p className="text-sm text-danger">{error}</p>}

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
          disabled={isAnalyzingLifeScene || !selectedDailyTodo}
        >
          {isAnalyzingLifeScene ? "분석 중..." : "다음"}
        </Button>
      </div>
    </div>
  );
}
