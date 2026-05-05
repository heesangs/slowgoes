"use client";

// 더보기 메뉴 — ⋮ 트리거 버튼 + 팝오버 dropdown
//
// 사용 시나리오 (PR 7 신설, PR 9에서 활용):
// - 발걸음 카드 우측 상단 ⋮ → 클릭 → 작은 메뉴 dropdown
// - 메뉴 액션: 수정, 추가 등 (호출부가 actions prop으로 전달)
//
// 인터랙션:
// - 트리거 클릭 → 메뉴 열림
// - 외부 클릭 → 닫힘
// - ESC → 닫힘
// - 액션 클릭 → onClick 실행 후 자동으로 메뉴 닫힘
//
// 사용자 결정 ② "팝오버 dropdown" 형태.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface MoreActionItem {
  label: string;
  /** 액션 클릭 시 호출. 호출 후 메뉴는 자동으로 닫힘. */
  onClick: () => void;
  /** 비활성 처리 — 회색조 + 클릭 무시 */
  disabled?: boolean;
  /** 위험 액션 (삭제 등) — 빨간색 강조 */
  variant?: "default" | "danger";
}

interface MoreActionsMenuProps {
  actions: MoreActionItem[];
  /** 메뉴 정렬 방향 — 카드 우측에 트리거가 있을 땐 "right" */
  align?: "left" | "right";
  /** 트리거 버튼 aria-label (스크린 리더용) */
  ariaLabel?: string;
  /** 트리거 버튼 추가 클래스 */
  triggerClassName?: string;
}

export function MoreActionsMenu({
  actions,
  align = "right",
  ariaLabel = "더보기",
  triggerClassName,
}: MoreActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 + ESC 닫기
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
          triggerClassName
        )}
      >
        {/* 세로 점 3개 (⋮) */}
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-30 mt-1 min-w-[120px] overflow-hidden rounded-lg border border-foreground/10 bg-background shadow-lg",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {actions.map((action, index) => (
            <button
              key={`${action.label}-${index}`}
              type="button"
              role="menuitem"
              onClick={() => {
                if (action.disabled) return;
                action.onClick();
                setOpen(false);
              }}
              disabled={action.disabled}
              className={cn(
                "flex w-full items-center px-3 py-2 text-left text-sm transition-colors",
                "hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
                action.variant === "danger" && "text-red-500 hover:bg-red-50"
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
