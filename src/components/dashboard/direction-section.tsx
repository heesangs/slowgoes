"use client";

// 지향점 섹션 — 발걸음 3섹션 중 두 번째
//
// 표시 내용: 언젠가 + 1년 안 카드 (큰 시간 지평)
// 카드 액션 (PR 9):
// - "↻ 다시" 버튼 → ⋮ 더보기 메뉴로 교체
// - 메뉴 액션:
//   - "수정" → EditWithAISheet 열기 (현재 타이틀 prefill, AI 생성 = 기존 regenerateStrideItemAction)

import { MoreActionsMenu } from "@/components/ui/more-actions-menu";
import { FEATURE_NAMES } from "@/lib/constants";
import type { StrideItem, StrideLevel } from "@/types";

interface DirectionSectionProps {
  items: StrideItem[];
  /** "수정" 클릭 → EditWithAISheet 진입. dashboard-content-v2가 시트를 띄움. */
  onEditLevel: (item: StrideItem) => void;
  /** 현재 AI 재생성 진행 중인 레벨 (수정 버튼 disable용) */
  regeneratingLevel: StrideLevel | null;
  /** 전체 재생성 진행 중 (수정 버튼 disable용) */
  isRegenAll: boolean;
}

export function DirectionSection({
  items,
  onEditLevel,
  regeneratingLevel,
  isRegenAll,
}: DirectionSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-foreground/10 px-4 py-4">
      <p className="text-sm font-medium text-foreground/70">{FEATURE_NAMES.DIRECTION}</p>

      <div className="mt-3 flex flex-col gap-2">
        {items.map((item, index) => {
          const busy = regeneratingLevel === item.level || isRegenAll;
          return (
            <article
              key={`direction-${item.level}-${index}`}
              className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-foreground/55">{item.label}</p>
                <MoreActionsMenu
                  ariaLabel={`${item.label} 더보기`}
                  actions={[
                    {
                      label: "수정",
                      onClick: () => onEditLevel(item),
                      disabled: busy,
                    },
                  ]}
                />
              </div>
              <p className="mt-1 text-sm">{item.action}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
