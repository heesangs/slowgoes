"use client";

// 지향점 섹션 — 발걸음 3섹션 중 두 번째 (PR 8 신설)
//
// 표시 내용: 언젠가 + 1년 안 카드 (큰 시간 지평)
// 카드 액션: PR 8에서는 기존 "↻ 다시" 버튼 유지. PR 9에서 ⋮ 메뉴로 교체.

import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { StrideItem, StrideLevel } from "@/types";

interface DirectionSectionProps {
  items: StrideItem[];
  onRegenerateLevel: (level: StrideLevel) => void;
  isRegenAll: boolean;
  regeneratingLevel: StrideLevel | null;
}

export function DirectionSection({
  items,
  onRegenerateLevel,
  isRegenAll,
  regeneratingLevel,
}: DirectionSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-foreground/10 px-4 py-4">
      <p className="text-sm font-medium text-foreground/70">{FEATURE_NAMES.DIRECTION}</p>

      <div className="mt-3 flex flex-col gap-2">
        {items.map((item, index) => {
          const isRegenThis = regeneratingLevel === item.level;
          return (
            <article
              key={`direction-${item.level}-${index}`}
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
            </article>
          );
        })}
      </div>
    </section>
  );
}
