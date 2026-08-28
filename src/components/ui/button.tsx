"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

// 버튼 4종 — Figma 컴포넌트(36902:44778 / 44821 / 44800 / 44791)를 옮긴 것.
// 각 4상태(Default / hover / press / disable)를 그대로 담는다.
//
//   fill     초록 면. 화면당 하나인 주 행동
//   outline  초록 테두리·글자. 주 행동과 나란히 놓는 보조(랜딩의 "회원가입")
//   line     회색 테두리. 중립 행동
//   text     테두리 없음. 가장 약한 행동
//
// Figma 스펙의 색이 이미 코드 토큰과 맞물린다 —
// outline 의 #067644 는 label-primary(Green/30)와 같은 값이다.
const variantStyles = {
  fill:
    "bg-primary-normal text-static-black hover:bg-primary-strong active:bg-primary-heavy " +
    "disabled:bg-interaction-disable disabled:text-label-disable",
  outline:
    "border-2 border-label-primary bg-background text-label-primary " +
    "hover:bg-background-alt active:bg-background-alt " +
    "disabled:border-interaction-disable disabled:bg-fill-alt disabled:text-label-disable",
  line:
    "border border-line-normal bg-transparent text-label-neutral " +
    "hover:bg-fill-alt active:bg-fill-normal " +
    "disabled:bg-interaction-disable disabled:text-label-disable",
  text:
    "bg-transparent text-label-neutral hover:bg-fill-alt active:bg-fill-normal " +
    "disabled:bg-interaction-disable disabled:text-label-disable",
} as const;

// 기본(md)은 48px — 인증 화면 Figma(37594:83755)의 버튼 높이다.
// 어느 크기든 44px 아래로 내려가지 않는다(모바일 터치 타겟 권장).
const sizeStyles = {
  sm: "px-3 text-sm min-h-[44px]",
  md: "px-4 text-sm min-h-[48px]",
  lg: "px-6 text-base min-h-[52px]",
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "fill", size = "md", isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // radius 4 · 라벨 Bold 는 Figma 스펙
          "inline-flex items-center justify-center gap-2 rounded font-bold transition-all cursor-pointer",
          "disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-label-normal/30",
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
