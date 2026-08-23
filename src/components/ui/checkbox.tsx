import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked: boolean;
  /** md=20px(할 일 목록, 타이틀 leading-5와 같은 높이) · sm=16px(시트 안 목록) */
  size?: "sm" | "md";
  className?: string;
}

/**
 * 체크 상자 — **모양만** 그린다. 클릭 처리는 감싸는 쪽 버튼이 갖는다.
 *
 * 두 호출부(할 일 목록·AI 제안 시트)가 모두 이미 자기 button/label 안에서
 * 이 상자를 그리고 있어서, input을 품은 컨트롤로 만들면 버튼 안에 버튼이
 * 생긴다. 그래서 시각 표현만 모으고 상호작용은 그대로 둔다.
 */
export function Checkbox({ checked, size = "md", className }: CheckboxProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded border transition-colors",
        size === "md" ? "h-5 w-5" : "h-4 w-4",
        checked
          ? "border-inverse-background bg-inverse-background text-inverse-label"
          : "border-foreground/30 bg-transparent",
        className
      )}
      aria-hidden
    >
      {checked && (
        <CheckIcon className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} strokeWidth={3} />
      )}
    </span>
  );
}
