// 캘린더 3단 뷰 — 하단 탭과 대시보드가 공유하는 표현.
//
// 뷰 상태는 CalendarSection 안에 살지만 탭은 레이아웃(MainShell)에 있어서, 둘을
// 잇는 채널이 필요하다. URL 쿼리로 표현한다 — ?week= 가 이미 같은 방식이다.
//   week  = 주 캘린더(기본)
//   life  = 1년 52주 그리드
//   clock = 100년 24시 인생시계

export type CalendarView = "week" | "life" | "clock";

export const CALENDAR_VIEW_PARAM = "view";
export const DEFAULT_CALENDAR_VIEW: CalendarView = "week";

const ALL: readonly CalendarView[] = ["week", "life", "clock"];

/** ?view= 값 파싱 — 모르는 값이면 기본(주 캘린더) */
export function parseCalendarView(raw: string | null | undefined): CalendarView {
  return ALL.includes(raw as CalendarView) ? (raw as CalendarView) : DEFAULT_CALENDAR_VIEW;
}

/** 탭 링크 — 기본 뷰는 쿼리를 붙이지 않아 URL을 깨끗하게 둔다 */
export function calendarViewHref(view: CalendarView): string {
  return view === DEFAULT_CALENDAR_VIEW
    ? "/dashboard"
    : `/dashboard?${CALENDAR_VIEW_PARAM}=${view}`;
}
