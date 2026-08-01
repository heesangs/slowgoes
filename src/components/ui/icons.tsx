// 앱 공통 인라인 SVG 아이콘.
//
// Figma(TXgvKYZbbJEhSlW39FaSqv)에서 export한 벡터를 currentColor 기반으로 옮겼다.
// currentColor라 부모의 색을 그대로 따르므로 라이트/다크(및 --kai-* 입력창 서피스)
// 어디에 놓아도 별도 처리 없이 보인다. 크기는 호출부가 className(h-*/w-*)으로 정한다.

interface IconProps {
  className?: string;
}

/** 반복 — 순환 화살표 2개 (Figma 34242:41290) */
export function RepeatIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      aria-hidden
    >
      <path d="M3.86601 11.3137C1.78321 9.23092 1.78321 5.85404 3.86601 3.77125C5.7193 1.91796 8.59718 1.71374 10.6763 3.15859M3.86601 9.01387V11.3137L1.50899 10.3709" />
      <path d="M12.3512 4.71402C14.434 6.79682 14.434 10.1737 12.3512 12.2565C10.5559 14.0518 7.79916 14.2996 5.73843 13M12.3512 7.01387V4.71402L14.7082 5.65683" />
    </svg>
  );
}
