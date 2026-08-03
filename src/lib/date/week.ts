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

/**
 * "8월 1주" — **그 달 기준**으로 본 주차.
 *
 * 달을 걸친 주(예: 7/26~8/1)를 일기 목록에서 월별로 나눠 보여줄 때 쓴다.
 * 주 시작일이 그 달보다 앞서면 그 달 1일로 **클램프**해 주차를 센다:
 *   7/26 시작 주를 7월에서 보면 "7월 5주", 8월에서 보면(8/1) "8월 1주".
 * 한 주를 통째로 한 달에 몰아 붙이던 formatWeekLabel과 달리, 두 달에 걸쳐
 * 각각 그 달의 이름으로 부른다(라벨이 달라 중복으로 보이지 않는다).
 */
export function formatWeekLabelInMonth(weekStart: string, year: number, month: number): string {
  const start = parseDateString(weekStart);
  const monthFirst = new Date(year, month - 1, 1);
  // 주가 이 달보다 앞서 시작했으면 이 달의 1일부터 센다
  const anchor = start < monthFirst ? monthFirst : start;
  const n = Math.ceil((anchor.getDate() + monthFirst.getDay()) / 7);
  return `${month}월 ${n}주`;
}

/** "8.2 ~ 8.8" — 시트 헤더에서 어느 주인지 명시할 때 */
export function formatWeekRange(weekStart: string): string {
  const start = parseDateString(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.getMonth() + 1}.${start.getDate()} ~ ${end.getMonth() + 1}.${end.getDate()}`;
}
