"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  // 값 지움 버튼 콜백 — 전달 시 값이 있을 때 x 버튼 표시
  onClear?: () => void;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, onClear, value, ...props }, ref) => {
    // x 버튼 표시 조건: onClear가 있고 값이 비어있지 않을 때
    const showClear = !!onClear && !!value;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-foreground/70">
            {label}
          </label>
        )}
        {/* 인풋 + x 버튼 감싸는 relative 컨테이너 */}
        <div className="relative">
          <input
            ref={ref}
            id={id}
            value={value}
            className={cn(
              "w-full rounded-lg border bg-transparent px-4 py-3 text-base min-h-[44px] transition-colors",
              "placeholder:text-foreground/40",
              "focus:outline-none focus:ring-2 focus:ring-foreground/20",
              error
                ? "border-red-500 focus:ring-red-500/20"
                : "border-foreground/20",
              showClear && "pr-10",
              className
            )}
            {...props}
          />
          {/* 값 지움 버튼 */}
          {showClear && (
            <button
              type="button"
              onClick={onClear}
              aria-label="입력값 지우기"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded-full text-foreground/40 hover:text-foreground/70 hover:bg-foreground/10 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1 1L11 11M11 1L1 11"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
export type { InputProps };
