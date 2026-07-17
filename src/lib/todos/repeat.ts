// 할 일 반복 규칙 유틸 (Phase B: 투두/루틴 통합)
//
// 요일 규약: 0=일 ~ 6=토 (JS getDay() = Postgres EXTRACT(DOW))
// 서버/클라이언트 공용 — 순수 함수만.

import type { Todo, TodoRepeatInput, TodoRepeatType } from "@/types";

export const WEEKDAY_SHORT_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export const WEEKDAYS_WEEKDAY = [1, 2, 3, 4, 5]; // 평일
export const WEEKDAYS_WEEKEND = [0, 6]; // 주말

/** "YYYY-MM-DD" → 로컬 자정 Date (TZ 어긋남 방지: 문자열 직접 파싱) */
export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 로컬 기준 오늘 "YYYY-MM-DD" */
export function getTodayDateString(): string {
  const now = new Date();
  return formatDateString(now);
}

export function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 반복 규칙 기준으로 해당 날짜에 이 할 일이 발생하는가 (반복 없는 할 일은 scheduled_date 당일만) */
export function occursOn(todo: Todo, dateStr: string): boolean {
  if (!todo.repeat_type) {
    return todo.scheduled_date === dateStr;
  }
  // 반복은 시작 기준일 이전엔 발생하지 않음
  if (dateStr < todo.scheduled_date) return false;

  const date = parseDateString(dateStr);
  switch (todo.repeat_type) {
    case "daily":
      return true;
    case "weekly":
      return (todo.repeat_weekdays ?? []).includes(date.getDay());
    case "monthly":
      return date.getDate() === todo.repeat_month_day;
    case "yearly":
      return (
        date.getMonth() + 1 === todo.repeat_month && date.getDate() === todo.repeat_month_day
      );
    default:
      return false;
  }
}

/** 행 우측 반복 라벨: "매일" / "매주 (월·수)" / "평일" / "주말" / "매월 17일" / "매년 7.17" */
export function formatRepeatLabel(todo: Pick<Todo, "repeat_type" | "repeat_weekdays" | "repeat_month_day" | "repeat_month">): string | null {
  if (!todo.repeat_type) return null;
  switch (todo.repeat_type) {
    case "daily":
      return "매일";
    case "weekly": {
      const days = [...(todo.repeat_weekdays ?? [])].sort((a, b) => a - b);
      if (days.length === 5 && WEEKDAYS_WEEKDAY.every((d) => days.includes(d))) return "평일";
      if (days.length === 2 && WEEKDAYS_WEEKEND.every((d) => days.includes(d))) return "주말";
      if (days.length === 7) return "매일";
      return `매주 (${days.map((d) => WEEKDAY_SHORT_LABELS[d]).join("·")})`;
    }
    case "monthly":
      return `매월 ${todo.repeat_month_day}일`;
    case "yearly":
      return `매년 ${todo.repeat_month}.${todo.repeat_month_day}`;
    default:
      return null;
  }
}

/** 반복 옵션 시트의 프리셋 7종 — 선택된 날짜(기본 오늘) 기준으로 라벨/값 동적 생성 */
export interface RepeatOption {
  key: string;
  label: string;
  /** null = 사용자 설정(요일 다중선택 UI로 진입) */
  input: TodoRepeatInput | null;
}

export function buildRepeatOptions(baseDateStr: string): RepeatOption[] {
  const base = parseDateString(baseDateStr);
  const dow = base.getDay();
  const day = base.getDate();
  const month = base.getMonth() + 1;

  return [
    { key: "daily", label: "매일", input: { type: "daily" } },
    {
      key: "weekly",
      label: `매주 (${WEEKDAY_SHORT_LABELS[dow]})`,
      input: { type: "weekly", weekdays: [dow] },
    },
    {
      key: "monthly",
      label: `매월 ${day}일`,
      input: { type: "monthly", monthDay: day },
    },
    {
      key: "yearly",
      label: `매년 ${month}.${day}`,
      input: { type: "yearly", month, monthDay: day },
    },
    {
      key: "weekday",
      label: "평일 (월~금)",
      input: { type: "weekly", weekdays: [...WEEKDAYS_WEEKDAY] },
    },
    {
      key: "weekend",
      label: "주말 (토·일)",
      input: { type: "weekly", weekdays: [...WEEKDAYS_WEEKEND] },
    },
    { key: "custom", label: "사용자 설정", input: null },
  ];
}

/** TodoRepeatInput → 라벨 (입력창 [반복] 버튼 표시용) */
export function formatRepeatInputLabel(input: TodoRepeatInput | null): string {
  if (!input) return "반복";
  return (
    formatRepeatLabel({
      repeat_type: input.type as TodoRepeatType,
      repeat_weekdays: input.weekdays ?? null,
      repeat_month_day: input.monthDay ?? null,
      repeat_month: input.month ?? null,
    }) ?? "반복"
  );
}
