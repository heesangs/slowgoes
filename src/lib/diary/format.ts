// 일기 목록 렌더용 순수 헬퍼.
// plain_text(순수 텍스트)에서 제목/미리보기를 파생하고, 월별로 그룹핑한다.

import { formatWeekLabel, getWeekStart } from "@/lib/date/week";
import { formatDateString, parseDateString } from "@/lib/todos/repeat";
import type { DiaryListItem } from "@/types";

const TITLE_MAX = 60;
const PREVIEW_MAX = 120;

// 본문 첫 비어있지 않은 줄 = 제목 (Day One 방식)
export function deriveDiaryTitle(plainText: string): string {
  const firstLine = plainText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return "무제";
  return firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX)}…` : firstLine;
}

// 제목(첫 줄) 이후 나머지 텍스트 = 미리보기
export function derivePreview(plainText: string): string {
  const lines = plainText.split("\n").map((line) => line.trim());
  const firstIdx = lines.findIndex((line) => line.length > 0);
  if (firstIdx === -1) return "";

  const rest = lines
    .slice(firstIdx + 1)
    .filter((line) => line.length > 0)
    .join(" ")
    .trim();

  if (!rest) return "";
  return rest.length > PREVIEW_MAX ? `${rest.slice(0, PREVIEW_MAX)}…` : rest;
}

// DB 행 → 목록 아이템 변환
export function toDiaryListItem(row: {
  id: string;
  plain_text: string;
  created_at: string;
  week_start?: string | null;
  bucket_title?: string | null;
}): DiaryListItem {
  return {
    id: row.id,
    title: deriveDiaryTitle(row.plain_text),
    preview: derivePreview(row.plain_text),
    created_at: row.created_at,
    week_start: row.week_start ?? null,
    bucket_title: row.bucket_title ?? null,
  };
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export interface DiaryMonthGroup {
  /** 그룹 키 (예: "2026-07") */
  key: string;
  /** 표시 라벨 (예: "2026년 7월") */
  label: string;
  /** 월 안의 주 그룹 (최신 주 → 과거 주) */
  weeks: DiaryWeekGroup[];
}

export interface DiaryWeekGroup {
  /** 주 시작일 "YYYY-MM-DD" (일요일) */
  key: string;
  /** 표시 라벨 (예: "8월 2주") */
  label: string;
  items: DiaryDisplayItem[];
}

export interface DiaryDisplayItem extends DiaryListItem {
  /** 일 (1~31) */
  day: number;
  /** 요일 라벨 (일~토) */
  weekday: string;
  /** 시간 라벨 (예: "오후 8:28") */
  time: string;
  /** 주간 회고 여부 — 배지 표시용 */
  isWeekly: boolean;
}

function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const isPM = hours >= 12;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${isPM ? "오후" : "오전"} ${hour12}:${String(minutes).padStart(2, "0")}`;
}

// 최신순 목록을 월 → 주 2단으로 그룹핑 (입력은 created_at DESC 정렬 가정).
//
// 주 판정: 주간 회고는 week_start(대상 주), 일반 일기는 작성일이 속한 주.
//   그래야 "지난 주 회고를 이번 주에 썼어도" 그 주 묶음에 들어간다.
// 월 판정: **주 시작일의 월**을 쓴다(작성일의 월이 아니라).
//   달을 걸친 주(예: 7/26~8/1)를 작성일 기준으로 나누면 같은 주가 두 월 그룹으로
//   쪼개져 "8월" 밑에 "7월 5주"가 또 뜬다. 주를 통째로 한 달에 붙여 라벨을 일치시킨다.
export function groupDiariesByMonth(items: DiaryListItem[]): DiaryMonthGroup[] {
  const groups: DiaryMonthGroup[] = [];
  const monthIdxByKey = new Map<string, number>();

  for (const item of items) {
    const date = new Date(item.created_at);

    const displayItem: DiaryDisplayItem = {
      ...item,
      day: date.getDate(),
      weekday: WEEKDAY_LABELS[date.getDay()],
      time: formatTime(date),
      isWeekly: item.week_start != null,
    };

    // 주 키 — 회고면 대상 주, 아니면 작성일이 속한 주
    const weekKey = item.week_start ?? getWeekStart(formatDateString(date));
    const weekDate = parseDateString(weekKey);
    const year = weekDate.getFullYear();
    const month = weekDate.getMonth() + 1;
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;

    let monthIdx = monthIdxByKey.get(monthKey);
    if (monthIdx === undefined) {
      monthIdx = groups.length;
      monthIdxByKey.set(monthKey, monthIdx);
      groups.push({ key: monthKey, label: `${year}년 ${month}월`, weeks: [] });
    }

    const weeks = groups[monthIdx].weeks;
    const week = weeks.find((w) => w.key === weekKey);
    if (week) {
      week.items.push(displayItem);
    } else {
      weeks.push({ key: weekKey, label: formatWeekLabel(weekKey), items: [displayItem] });
    }
  }

  return groups;
}
