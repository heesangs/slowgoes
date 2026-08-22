import { cn } from "@/lib/utils";

interface ErrorBoxProps extends React.HTMLAttributes<HTMLElement> {
  /** 한 줄 메시지면 p, 제목+상세면 div, 회고처럼 랜드마크가 필요하면 section */
  as?: "div" | "p" | "section";
}

/**
 * 에러 알림 박스.
 *
 * 그동안 같은 역할을 5가지 표현으로 그리고 있었고, 그중 `bg-red-50`·`border-red-200`
 * 계열은 **다크에서 흰 배경 그대로** 남아 글자가 묻혔다. 배경·테두리를 불투명 색이
 * 아니라 danger의 투명도로 깔면 어느 테마에서도 그 아래 배경 위에 얹힌다.
 */
export function ErrorBox({ as: Tag = "p", className, ...props }: ErrorBoxProps) {
  return (
    <Tag
      role="alert"
      className={cn(
        "rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger",
        className
      )}
      {...props}
    />
  );
}
