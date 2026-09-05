"use client";

// 계획 드롭다운 — 캘린더 상단(구 "캘린더" 타이틀 자리).
// 피그마 37847:43183(헤더 행) · 37847:43211(열림/닫힘) · 37847:43609(계획 카드).
//
// 구 DirectionSheet(바텀시트)를 대체한다. 발걸음은 캘린더가 무엇을 위한 달인지
// 말해주는 맥락이라, 화면을 덮는 시트보다 달력 바로 위에 펼쳐지는 편이 맞다.
//
// 주↔월 전환은 여기가 아니라 달력 아래 핸들·스와이프가 계속 담당한다 —
// 이 드롭다운은 계획 카드만 여닫는다.

import { useState } from "react";
import { ChevronDownIcon } from "@/components/ui/icons";
import { STRIDE_LABELS } from "@/lib/ai/analyze";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { StrideItem, StrideLevel } from "@/types";

interface PlanDropdownProps {
  /** 큰 지평 발걸음 (언젠가·올해안 등, 긴→짧은 순) */
  directionItems: StrideItem[];
  /** 해당 달 발걸음 (this_month). 없으면 그 카드만 뺀다 */
  monthStride: StrideItem | null;
  /** 해당 달 라벨 (예: "9월") — this_month 카드는 STRIDE_LABELS 대신 이걸 쓴다 */
  monthLabel: string;
  /** 카드 탭 → 키보드 입력창으로 수정 (부모가 입력창을 띄운다) */
  onEditStride: (item: StrideItem) => void;
  /** 카드 우측 슬롯 — 레벨별로 다르다(버킷 완료 / D-day / 다음 목표) */
  renderRightSlot?: (item: StrideItem) => React.ReactNode;
}

// 계획 카드 — 피그마 37847:43609.
// 카드 전체가 수정 버튼이고, 우측 슬롯은 그 위에 얹는다(버튼 중첩은 유효하지 않은 마크업).
function PlanCard({
  label,
  action,
  onEdit,
  rightSlot,
}: {
  label: string;
  action: string;
  onEdit: () => void;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="relative border-t border-line-normal pb-2 pt-4">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${label} 수정`}
        className="block w-full rounded text-left transition-colors hover:bg-fill-alt"
      >
        <span
          className={cn(
            "flex h-6 items-center text-sm text-label-assistive",
            // 우측 슬롯이 얹히는 자리를 비워둔다
            rightSlot ? "pr-24" : undefined
          )}
        >
          {label}
        </span>
        <span className="mt-1 block text-sm leading-normal text-label-alt">{action}</span>
      </button>
      {rightSlot && (
        <div className="absolute right-0 top-4 flex h-6 items-center">{rightSlot}</div>
      )}
    </div>
  );
}

export function PlanDropdown({
  directionItems,
  monthStride,
  monthLabel,
  onEditStride,
  renderRightSlot,
}: PlanDropdownProps) {
  // 기본은 닫힘 — 피그마 "모두닫힘"이 기본 상태다.
  const [open, setOpen] = useState(false);

  const cards: Array<{ key: string; label: string; item: StrideItem }> = [
    ...directionItems.map((item, index) => ({
      key: `dir-${item.level}-${index}`,
      // 저장된 레거시 label(예: 구 "1년 안")이 아니라 현재 STRIDE_LABELS 기준으로 표시
      label: STRIDE_LABELS[item.level as StrideLevel] ?? item.label,
      item,
    })),
    ...(monthStride
      ? [{ key: `month-${monthStride.level}`, label: monthLabel, item: monthStride }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-2 py-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded text-left transition-colors hover:bg-fill-alt"
      >
        <span className="min-w-0 flex-1 text-base text-label-neutral">
          {FEATURE_NAMES.PLAN}
        </span>
        <ChevronDownIcon
          className={cn(
            "h-4 w-4 shrink-0 text-label-neutral transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && cards.length > 0 && (
        // 바깥 굵은 선 → 카드 사이 얇은 선. 피그마의 Line/Normal/_Strong vs /Neutral.
        <div className="flex flex-col border-t border-line-strong">
          {cards.map(({ key, label, item }) => (
            <PlanCard
              key={key}
              label={label}
              action={item.action}
              onEdit={() => onEditStride(item)}
              rightSlot={renderRightSlot?.(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
