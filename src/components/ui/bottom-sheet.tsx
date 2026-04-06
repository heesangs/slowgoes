"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "default" | "large"; // default=60vh, large=85vh
}

export function BottomSheet({ open, onClose, title, children, footer, size = "default" }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="바텀시트 닫기"
      />

      <section
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute inset-x-0 bottom-0 mx-auto w-full max-w-2xl rounded-t-2xl border border-foreground/10 bg-background px-4 pb-4 pt-3 shadow-2xl"
        )}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-foreground/20" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">{title ?? "상세"}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[36px] items-center rounded-md border border-foreground/20 px-2.5 text-xs transition-colors hover:bg-foreground/5"
          >
            닫기
          </button>
        </div>

        <div className={cn("overflow-y-auto pb-2", size === "large" ? "max-h-[85vh]" : "max-h-[60vh]")}>{children}</div>
        {footer ? <div className="mt-3">{footer}</div> : null}
      </section>
    </div>
  );
}
