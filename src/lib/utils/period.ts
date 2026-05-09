// 실행계획 기간 카드(이번 달)의
// 잔여 기간 + 진행도 계산 유틸 (PR 14, PR 18에서 단순화)
//
// 정의:
// - this_month: 1일 00:00 ~ 다음 달 1일 00:00. 잔여 = 일 단위.
//
// PR 18 이전엔 today/this_week/this_season도 지원했으나,
// 실행계획이 이번 달 카드 1개로 축소되며 함께 단순화.
//
// 모든 함수는 순수 — Date 인자 받아 결정론적.

import type { DailyTodoStrideLevel } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

interface PeriodRange {
  /** 기간 시작 (포함) */
  start: Date;
  /** 기간 종료 (제외) — 다음 기간의 시작 */
  end: Date;
}

function getPeriodRange(_level: DailyTodoStrideLevel, now: Date): PeriodRange {
  // 현재는 this_month 한 가지 — 1일 00:00 ~ 다음 달 1일 00:00
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return { start, end };
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
 * 예: 5월 27일 → "5일 남음" (6월 1일까지)
 */
export function getDaysLeftLabel(level: DailyTodoStrideLevel, now: Date = new Date()): string {
  const { end } = getPeriodRange(level, now);
  const msLeft = end.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / DAY_MS));
  return `${daysLeft}일 남음`;
}
