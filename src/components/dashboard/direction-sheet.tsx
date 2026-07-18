"use client";

// 지향점 시트 (R3) — 캘린더 헤더의 ▼로 진입. 구 DirectionSection을 흡수.
//
// 구성: 언젠가 · 올해안 (큰 지평) → 구분선 → 해당 달(예: 7월) 강조 카드.
// 카드를 누르면 바로 키보드 입력창으로 수정(⋯ 메뉴 제거 — 탭 = 수정).
// 해당 달 발걸음이 AI 투두 생성의 직접 근거라 시각적으로 강조한다.

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { STRIDE_LABELS } from "@/lib/ai/analyze";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { StrideItem } from "@/types";

interface DirectionSheetProps {
  open: boolean;
  onClose: () => void;
  /** 큰 지평 발걸음 (언젠가·올해안, 긴→짧은 순) */
  directionItems: StrideItem[];
  /** 해당 달 발걸음 (this_month) — 없으면 강조 카드 숨김 */
  monthStride: StrideItem | null;
  /** 해당 달 라벨 (예: "7월") — this_month 카드에 STRIDE_LABELS 대신 표시 */
  monthLabel: string;
  /** 카드 탭 → 키보드 입력창으로 수정. dashboard-content-v2가 입력창을 띄움 */
  onEditStride: (item: StrideItem) => void;
}

// 지향점 카드 — 탭하면 바로 수정 진입
function StrideCard({
  label,
  action,
  emphasized,
  onClick,
}: {
  label: string;
  action: string;
  emphasized?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} 수정`}
      className={cn(
        "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
        emphasized
          ? "border-foreground/25 bg-foreground/[0.05] hover:bg-foreground/[0.08]"
          : "border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]"
      )}
    >
      <p className={cn("text-xs font-medium", emphasized ? "text-foreground/70" : "text-foreground/55")}>
        {label}
      </p>
      <p className="mt-1 text-sm leading-snug">{action}</p>
    </button>
  );
}

export function DirectionSheet({
  open,
  onClose,
  directionItems,
  monthStride,
  monthLabel,
  onEditStride,
}: DirectionSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={FEATURE_NAMES.DIRECTION}>
      <div className="flex flex-col gap-2">
        {directionItems.map((item, index) => (
          <StrideCard
            key={`dir-${item.level}-${index}`}
            // 저장된 label(예: 구 "1년 안")이 아니라 현재 STRIDE_LABELS 기준으로 표시(라벨 전역 변경 반영)
            label={STRIDE_LABELS[item.level]}
            action={item.action}
            onClick={() => onEditStride(item)}
          />
        ))}

        {monthStride && (
          <>
            {/* 구분선 — 큰 지평(언젠가·올해안)과 해당 달을 나눠 강조 */}
            <div className="my-1 border-t border-foreground/10" />
            <StrideCard
              label={monthLabel}
              action={monthStride.action}
              emphasized
              onClick={() => onEditStride(monthStride)}
            />
          </>
        )}
      </div>
    </BottomSheet>
  );
}
