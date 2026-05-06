// 실행계획 기간 카드 (오늘/이번 주/이번 달/이번 시즌)의
// 잔여 기간 + 진행도 계산 유틸 (PR 14)
//
// 정의:
// - today: 오늘 자정 직전까지. 잔여 일수 = 0. 진행도는 시간 기반 (00:00~24:00).
// - this_week: 월요일 00:00 ~ 다음 월요일 00:00. 잔여 = 일 단위.
// - this_month: 1일 00:00 ~ 다음 달 1일 00:00. 잔여 = 일 단위.
// - this_season: 분기 시작 ~ 다음 분기 시작 (Q1=1-3월, Q2=4-6월, Q3=7-9월, Q4=10-12월).
//
// 모든 함수는 순수 — Date 인자 받아 결정론적.

import type { DailyTodoStrideLevel } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

// 해당 날짜의 자정(00:00)으로 정규화한 새 Date 반환
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 이번 주 월요일 00:00
function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=일, 1=월, ..., 6=토
  const mondayDistance = (day + 6) % 7;
  d.setDate(d.getDate() - mondayDistance);
  return d;
}

// 이번 달 1일 00:00
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// 이번 분기 첫 달 1일 00:00 (분기: 0~2, 3~5, 6~8, 9~11)
function startOfSeason(date: Date): Date {
  const month = date.getMonth();
  const seasonStartMonth = Math.floor(month / 3) * 3;
  return new Date(date.getFullYear(), seasonStartMonth, 1);
}

interface PeriodRange {
  /** 기간 시작 (포함) */
  start: Date;
  /** 기간 종료 (제외) — 다음 기간의 시작 */
  end: Date;
}

function getPeriodRange(level: DailyTodoStrideLevel, now: Date): PeriodRange {
  switch (level) {
    case "today": {
      const start = startOfDay(now);
      const end = new Date(start.getTime() + DAY_MS);
      return { start, end };
    }
    case "this_week": {
      const start = startOfWeek(now);
      const end = new Date(start.getTime() + 7 * DAY_MS);
      return { start, end };
    }
    case "this_month": {
      const start = startOfMonth(now);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return { start, end };
    }
    case "this_season": {
      const start = startOfSeason(now);
      const end = new Date(start.getFullYear(), start.getMonth() + 3, 1);
      return { start, end };
    }
  }
}

/**
 * 진행도 0.0(시작 직후) ~ 1.0(종료 직전) — 게이지 바 채움 비율.
 * 기간 범위 밖이면 자동으로 0/1로 클램프.
 */
export function getPeriodProgress(level: DailyTodoStrideLevel, now: Date = new Date()): number {
  const { start, end } = getPeriodRange(level, now);
  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, elapsed / total));
}

/**
 * 사람이 읽기 좋은 잔여 기간 라벨.
 * - today: "오늘 안" (별도 일 카운트 없음)
 * - 그 외: "N일 남음" (총 잔여 일수 — 부분 일은 올림 처리해 한 번 더 기회 강조)
 *
 * 예: 일요일 23:00에 this_week 라벨 → "1일 남음" (월요일 00:00까지)
 */
export function getDaysLeftLabel(level: DailyTodoStrideLevel, now: Date = new Date()): string {
  if (level === "today") return "오늘 안";
  const { end } = getPeriodRange(level, now);
  const msLeft = end.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / DAY_MS));
  return `${daysLeft}일 남음`;
}
