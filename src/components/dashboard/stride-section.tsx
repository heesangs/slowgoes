"use client";

// 메인 대시보드 — 현재 버킷 + 나의 발걸음 카드 (아코디언)
//
// 책임 (DEVELOPER.md "14c. Main Dashboard Design Principles" 참조):
// - 단일 출처: 버킷 정보를 메인에서 한 곳(여기)에만 노출
// - 얕은 인터랙션 깊이: 발걸음 상세를 별도 시트가 아닌 메인 인라인 아코디언으로
// - 섹션 책임 분리: 발걸음(시간 지평)만 표시. 데일리 투두/루틴 인터랙션은 "오늘의 한걸음" 섹션 담당

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FEATURE_NAMES } from "@/lib/constants";
import { partitionStrides } from "@/lib/ai/analyze";
import { cn } from "@/lib/utils";
import type { StrideItem, StrideLevel, StridePlan } from "@/types";

interface StrideSectionProps {
  bucketTitle: string | null;
  stridePlan: StridePlan | null;
  /** 버킷 추가/탐색 시트를 여는 핸들러 */
  onAddBucket: () => void;
  /** 발걸음 전체 다시 추천 */
  onRegenerateAll: () => void;
  /** 발걸음 단건 다시 추천 */
  onRegenerateLevel: (level: StrideLevel) => void;
  /** "한걸음 더" 시트 열기 — 1개 데일리 + 1개 루틴 미리보기 */
  onOpenNextStep: () => void;
  /** 진행 상태 */
  isRegenAll: boolean;
  regeneratingLevel: StrideLevel | null;
  /** "한걸음 더" 시트를 열 수 있는 조건 (선택된 버킷 존재) */
  canOpenNextStep: boolean;
  /** 초기 펼침 상태 (기본 false). 필요 시 외부에서 강제 가능 */
  defaultOpen?: boolean;
}

export function StrideSection({
  bucketTitle,
  stridePlan,
  onAddBucket,
  onRegenerateAll,
  onRegenerateLevel,
  onOpenNextStep,
  isRegenAll,
  regeneratingLevel,
  canOpenNextStep,
  defaultOpen = false,
}: StrideSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const partitioned = stridePlan ? partitionStrides(stridePlan.strides ?? []) : null;
  const hasContent = !!stridePlan && partitioned !== null;
  const allItems: StrideItem[] = partitioned
    ? [...partitioned.displayStrides, ...partitioned.bucketTodos]
    : [];

  return (
    <section className="rounded-xl border border-foreground/10 px-4 py-4">
      {/* 헤더: 현재 버킷 + 액션 버튼들 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-foreground/60">현재 {FEATURE_NAMES.BUCKET}</p>
          <p className="mt-0.5 truncate text-base font-semibold">
            {bucketTitle ?? `선택된 ${FEATURE_NAMES.BUCKET}이 없어요`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {hasContent && (
            <button
              type="button"
              onClick={onRegenerateAll}
              disabled={isRegenAll || regeneratingLevel !== null}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-foreground/15 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-40"
              aria-label={`${FEATURE_NAMES.MY_STRIDES} 전체 다시 추천`}
              title={`${FEATURE_NAMES.MY_STRIDES} 전체 다시 추천`}
            >
              {isRegenAll ? "…" : "↻"}
            </button>
          )}
          <button
            type="button"
            onClick={onAddBucket}
            className="inline-flex h-9 items-center rounded-md border border-foreground/20 px-2.5 text-xs font-medium transition-colors hover:bg-foreground/5"
          >
            + {FEATURE_NAMES.BUCKET}
          </button>
        </div>
      </div>

      {/* 아코디언 토글 — 발걸음이 있을 때만 노출 */}
      {hasContent && (
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls="stride-section-body"
          className="mt-3 inline-flex items-center gap-1 text-xs text-foreground/60 transition-colors hover:text-foreground"
        >
          <span>{FEATURE_NAMES.MY_STRIDES}</span>
          <span aria-hidden className="text-[10px]">
            {isOpen ? "▲" : "▼"}
          </span>
        </button>
      )}

      {/* 빈 상태 */}
      {!hasContent && (
        <p className="mt-3 text-sm text-foreground/60">
          아직 {FEATURE_NAMES.MY_STRIDES}이 없어요. + {FEATURE_NAMES.BUCKET} 버튼으로
          새 장면을 탐색해보세요.
        </p>
      )}

      {/* 본문: 발걸음 상세 (펼쳤을 때) */}
      {hasContent && isOpen && (
        <div id="stride-section-body" className="mt-4 flex flex-col gap-3">
          {stridePlan?.empathy_message && (
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2.5">
              <p className="text-sm leading-relaxed">{stridePlan.empathy_message}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {allItems.map((item, index) => {
              const isRegenThis = regeneratingLevel === item.level;
              return (
                <article
                  key={`stride-${item.level}-${index}`}
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

          {/* 푸터: 한걸음 더 — 새 데일리/루틴 1개씩 미리보기 시트 */}
          <Button
            type="button"
            className="w-full"
            onClick={onOpenNextStep}
            disabled={!canOpenNextStep}
          >
            한걸음 더
          </Button>
        </div>
      )}
    </section>
  );
}
