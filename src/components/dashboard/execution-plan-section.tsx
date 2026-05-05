"use client";

// 실행계획 섹션 — 발걸음 3섹션 중 세 번째
//
// 표시 내용: 이번 시즌 + 이번 달 + 이번 주 + 오늘 카드 (짧은 시간 지평)
// 카드 액션 (PR 9):
// - "↻ 다시" 버튼 → ⋮ 더보기 메뉴로 교체
// - 메뉴 액션:
//   - "수정" → EditWithAISheet 열기 (현재 타이틀 prefill, AI 생성 = 기존 regenerateStrideItemAction)
//   - "추가" → PR 12에서 한걸음 더 흐름과 연결 예정 (지금은 disabled)
//
// 본문 마지막에 발걸음 전체 다시 추천 버튼.
// PR 10에서 카드 본문에 투두 리스트 통합 예정.
// PR 14에서 잔여 기간 + 게이지 바 추가 예정.

import { Button } from "@/components/ui/button";
import { MoreActionsMenu } from "@/components/ui/more-actions-menu";
import { FEATURE_NAMES } from "@/lib/constants";
import type { StrideItem, StrideLevel } from "@/types";

interface ExecutionPlanSectionProps {
  items: StrideItem[];
  /** "수정" 클릭 → EditWithAISheet 진입 */
  onEditLevel: (item: StrideItem) => void;
  /** "추가" 클릭 → PR 12의 한걸음 더 흐름과 연결 예정 (선택, 미연결 시 메뉴 비활성) */
  onAddToLevel?: (item: StrideItem) => void;
  /** 발걸음 전체 다시 추천 */
  onRegenerateAll: () => void;
  /** 현재 AI 재생성 진행 중인 레벨 */
  regeneratingLevel: StrideLevel | null;
  /** 전체 재생성 진행 중 */
  isRegenAll: boolean;
}

export function ExecutionPlanSection({
  items,
  onEditLevel,
  onAddToLevel,
  onRegenerateAll,
  regeneratingLevel,
  isRegenAll,
}: ExecutionPlanSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-foreground/10 px-4 py-4">
      <p className="text-sm font-medium text-foreground/70">{FEATURE_NAMES.EXECUTION_PLAN}</p>

      <div className="mt-3 flex flex-col gap-2">
        {items.map((item, index) => {
          const busy = regeneratingLevel === item.level || isRegenAll;
          return (
            <article
              key={`execution-${item.level}-${index}`}
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
                    {
                      label: "추가",
                      onClick: () => onAddToLevel?.(item),
                      disabled: busy || !onAddToLevel,
                    },
                  ]}
                />
              </div>
              <p className="mt-1 text-sm">{item.action}</p>
              {/* PR 10에서 이 자리에 투두 리스트 추가 예정 */}
            </article>
          );
        })}
      </div>

      {/* 본문 가장 아래 — 발걸음 전체 다시 추천 */}
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
