import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * 앱 표준 카드 표면.
 *
 * 이 조합(`rounded-xl border border-line-alt`)이 대시보드·회고·프로필의 기준선인데,
 * 예전엔 컴포넌트가 `onClick`조차 못 받아(props 스프레드·ref 없음) 클릭 가능한 카드가 많은
 * 화면에서는 쓸 수가 없었고, 결국 같은 클래스를 손으로 14곳에 반복하고 있었다.
 * → props를 그대로 넘기고, 시맨틱 태그를 고를 수 있게 한다.
 */
interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** 시맨틱 태그. 회고처럼 랜드마크가 필요한 곳은 section을 쓴다 */
  as?: "div" | "section" | "article";
  /**
   * 내부 여백(px-4 py-4)을 카드 자신이 갖는다.
   * CardHeader/CardContent로 영역을 나누는 카드는 이 값을 켜지 않는다.
   */
  padded?: boolean;
}

const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as: Tag = "div", padded = false, className, ...props },
  ref
) {
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn(
        "rounded-xl border border-line-alt bg-background-elevated",
        padded && "px-4 py-4",
        className
      )}
      {...props}
    />
  );
});

// 카드 헤더
function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("px-4 py-3 border-b border-line-alt", className)}>
      {children}
    </div>
  );
}

// 카드 콘텐츠
function CardContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("px-4 py-4", className)}>
      {children}
    </div>
  );
}

export { Card, CardHeader, CardContent };
export type { CardProps };
