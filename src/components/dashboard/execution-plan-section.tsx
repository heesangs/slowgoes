"use client";

// 실행계획 섹션 — 발걸음 3섹션 중 세 번째 (PR 8 신설)
//
// 표시 내용: 이번 시즌 + 이번 달 + 이번 주 + 오늘 카드 (짧은 시간 지평)
// 카드 액션: PR 8에서는 기존 "↻ 다시" 버튼 유지. PR 9에서 ⋮ 메뉴로 교체.
// PR 10에서 카드 본문에 투두 리스트 통합 예정.
// PR 14에서 잔여 기간 + 게이지 바 추가 예정.
//
// 본문 마지막에 발걸음 전체 다시 추천 버튼 (구 StrideSection의 푸터 흡수).

import { Button } from "@/components/ui/button";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { StrideItem, StrideLevel } from "@/types";

interface ExecutionPlanSectionProps {
  items: StrideItem[];
  onRegenerateLevel: (level: StrideLevel) => void;
  onRegenerateAll: () => void;
  isRegenAll: boolean;
  regeneratingLevel: StrideLevel | null;
}

export function ExecutionPlanSection({
  items,
  onRegenerateLevel,
  onRegenerateAll,
  isRegenAll,
  regeneratingLevel,
}: ExecutionPlanSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-foreground/10 px-4 py-4">
      <p className="text-sm font-medium text-foreground/70">{FEATURE_NAMES.EXECUTION_PLAN}</p>

      <div className="mt-3 flex flex-col gap-2">
        {items.map((item, index) => {
          const isRegenThis = regeneratingLevel === item.level;
          return (
            <article
              key={`execution-${item.level}-${index}`}
              className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-foreground/55">{item.label}</p>
                <button
                  type="button"
                  onClick={() => onRegenerateLevel(item.level)}
                  disabled={isRegenThis || isRegenAll}
                  className={cn(
                    "inline-flex min-h-[28px] items-center rounded-md border border-foreground/15 px-2 text-[11px] transition-colors hover:bg-foreground/5",
                    "disabled:opacity-40"
                  )}
                  aria-label={`${item.label} 단계 다시 추천`}
                >
                  {isRegenThis ? "추천 중…" : "↻ 다시"}
                </button>
              </div>
              <p className="mt-1 text-sm">{item.action}</p>
              {/* PR 10에서 이 자리에 투두 리스트 추가 예정 */}
            </article>
          );
        })}
      </div>

      {/* 본문 가장 아래 — 발걸음 전체 다시 추천 (구 StrideSection 푸터에서 이동) */}
      <Button
        type="button"
        variant="secondary"
        className="mt-3 w-full"
        onClick={onRegenerateAll}
        isLoading={isRegenAll}
        disabled={isRegenAll || regeneratingLevel !== null}
      >
        ↻ {FEATURE_NAMES.MY_STRIDES} 전체 다시 추천
      </Button>
    </section>
  );
}
