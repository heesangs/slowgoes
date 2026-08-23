"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

// 버튼 variant별 스타일
const variantStyles = {
  primary:
    "bg-inverse-background text-inverse-label hover:opacity-90 active:opacity-80",
  secondary:
    "bg-transparent border border-line-normal text-label-normal hover:bg-fill-alt active:bg-fill-normal",
  ghost:
    "bg-transparent text-label-normal hover:bg-fill-alt active:bg-fill-normal",
} as const;

// 버튼 크기별 스타일
const sizeStyles = {
  sm: "px-3 py-2 text-sm min-h-[44px]",
  md: "px-4 py-2 text-base min-h-[44px]",
  lg: "px-6 py-3 text-lg min-h-[52px]",
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-label-normal/30",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {children}
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
export type { ButtonProps };
