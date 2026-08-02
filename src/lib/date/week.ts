// 주(week) 계산 유틸 — **일요일 시작** 규약.
//
// 대시보드 주 캘린더가 일요일 시작이므로 여기에 맞춘다. (lib/utils.ts의
// getCurrentWeekStartDate는 월요일 시작이지만 회고 통계 전용이라 그대로 둔다.)
// 날짜 문자열 파싱/포맷은 로컬 자정 기준인 repeat.ts 것을 재사용한다 — toISOString을
// 쓰면 UTC로 밀려 하루가 어긋난다.

import { formatDateString, parseDateString } from "@/lib/todos/repeat";

/** 그 날짜가 속한 주의 시작일(일요일) — "YYYY-MM-DD" */
export function getWeekStart(dateStr: string): string {
  const base = parseDateString(dateStr);
  const start = new Date(base);
  start.setDate(base.getDate() - base.getDay());
  return formatDateString(start);
}

/** 주 시작일부터 7일 — 일~토 "YYYY-MM-DD" 배열 */
export function buildWeekDates(weekStart: string): string[] {
  const start = parseDateString(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return formatDateString(d);
  });
}

/** "8월 2주" — 월 내 주차(일요일 시작 기준) */
export function formatWeekLabel(weekStart: string): string {
  const d = parseDateString(weekStart);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const n = Math.ceil((d.getDate() + first.getDay()) / 7);
  return `${d.getMonth() + 1}월 ${n}주`;
}

/** "8.2 ~ 8.8" — 시트 헤더에서 어느 주인지 명시할 때 */
export function formatWeekRange(weekStart: string): string {
  const start = parseDateString(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.getMonth() + 1}.${start.getDate()} ~ ${end.getMonth() + 1}.${end.getDate()}`;
}
