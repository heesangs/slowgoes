// 앱 공통 인라인 SVG 아이콘.
//
// Figma(TXgvKYZbbJEhSlW39FaSqv)에서 export한 벡터를 currentColor 기반으로 옮겼다.
// currentColor라 부모의 색을 그대로 따르므로 라이트/다크(및 --kai-* 입력창 서피스)
// 어디에 놓아도 별도 처리 없이 보인다. 크기는 호출부가 className(h-*/w-*)으로 정한다.

import { cn } from "@/lib/utils";

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

/** 세부정보 추가 — 텍스트 3줄 (Figma 34242:41292) */
export function DetailIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="10" height="1" />
      <rect x="3" y="7" width="10" height="1" />
      <rect x="3" y="11" width="6" height="1" />
    </svg>
  );
}

/** AI — 글자 아웃라인 (Figma 34242:41296). 폰트에 기대지 않도록 벡터로 고정 */
export function AiIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M2.85938 13H1.25977L4.81445 3.10156H6.55078L10.1191 13H8.51953L7.61719 10.3887H3.76172L2.85938 13ZM4.19922 9.13086H7.17969L5.7168 4.90625H5.64844L4.19922 9.13086ZM13.0839 3.10156V13H11.58V3.10156H13.0839Z" />
    </svg>
  );
}

/** 전송 — 위쪽 화살표 */
export function SendIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

// ── 네비게이션 아이콘 (Heroicons 24 outline) ──
// 바텀 네비와 헤더가 공유한다. currentColor라 활성/비활성은 부모 색으로 표현.

/**
 * 체크 마크 — 완료·선택 표시. strokeWidth는 호출부가 정한다(작을수록 두껍게 보여야 해서).
 * 예전엔 같은 path가 calendar-section·ai-suggestions-sheet·bucket-bar·repeat-options-sheet에
 * 각각 인라인돼 있었다.
 */
export function CheckIcon({ className, strokeWidth = 3 }: IconProps & { strokeWidth?: number }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

/** 아래 꺽쇠 — 펼침/선택 어포던스. 같은 path가 4곳에 인라인돼 있었다. */
export function ChevronDownIcon({ className, strokeWidth = 2 }: IconProps & { strokeWidth?: number }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/** 일기 — 펼친 책 */
export function DiaryIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
      />
    </svg>
  );
}

/** 회고 — 말풍선 */
export function ReviewIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 9.75h6.75m-6.75 3h4.5M3.75 6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25v8.25A2.25 2.25 0 0118 17.25H10.5l-3.75 2.25v-2.25H6A2.25 2.25 0 013.75 15V6.75z"
      />
    </svg>
  );
}

/** 프로필 — 사람 실루엣 */
export function ProfileIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
      />
    </svg>
  );
}

/**
 * 진행 중 스피너 — 원형 링.
 *
 * 회전(등속)과 호 길이 신축(ease-in-out)을 겹쳐, 한 바퀴 안에서 빨라졌다 느려지는
 * 가속감을 만든다. 화살촉이 있으면 "돌아가는 화살표"(=새로고침)로 읽히므로 쓰지 않는다.
 * 애니메이션을 컴포넌트가 직접 갖는다 — 호출부에 animate-spin을 붙이지 말 것.
 * r=6 → 둘레 2πr ≈ 37.7 이라 dasharray 총합을 38로 잡는다(globals.css: spinner-dash).
 */
export function SpinnerIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("animate-[spinner-rotate_1.4s_linear_infinite]", className)}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      {/* 바탕 링 — 궤도가 보여야 회전이 읽힌다 */}
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth={1.5} className="opacity-25" />
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        className="animate-[spinner-dash_1.4s_ease-in-out_infinite]"
      />
    </svg>
  );
}

// ── 캘린더 3단 탭 아이콘 (1주 / 1년 / 1생) ──
// 시간 스케일을 도형 개수로 표현한다 — 칸 1개(한 주) → 칸 4개(한 해) → 원(한 생).
// active면 면(fill), 아니면 라인(stroke). 두 변형이 같은 도형·좌표를 써야
// 탭을 오갈 때 모양이 흔들리지 않는다.

interface TabIconProps extends IconProps {
  /** 활성 탭은 면으로 채운다 */
  active?: boolean;
}

/** 1주 — 네모 1개 */
export function WeekTabIcon({ className, active }: TabIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <rect x="5" y="5" width="14" height="14" rx="3" />
    </svg>
  );
}

/** 1년 — 작은 네모 4개(2열 2행) */
export function YearTabIcon({ className, active }: TabIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13" y="4.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="4.5" y="13" width="6.5" height="6.5" rx="1.5" />
      <rect x="13" y="13" width="6.5" height="6.5" rx="1.5" />
    </svg>
  );
}

/** 1생 — 동그라미 1개 */
export function LifeTabIcon({ className, active }: TabIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}
