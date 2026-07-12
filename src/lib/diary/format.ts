// 일기 목록 렌더용 순수 헬퍼.
// plain_text(순수 텍스트)에서 제목/미리보기를 파생하고, 월별로 그룹핑한다.

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
}): DiaryListItem {
  return {
    id: row.id,
    title: deriveDiaryTitle(row.plain_text),
    preview: derivePreview(row.plain_text),
    created_at: row.created_at,
  };
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export interface DiaryMonthGroup {
  /** 그룹 키 (예: "2026-07") */
  key: string;
  /** 표시 라벨 (예: "2026년 7월") */
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
}

function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const isPM = hours >= 12;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${isPM ? "오후" : "오전"} ${hour12}:${String(minutes).padStart(2, "0")}`;
}

// 최신순 목록을 월별로 그룹핑 (입력은 created_at DESC 정렬 가정)
export function groupDiariesByMonth(items: DiaryListItem[]): DiaryMonthGroup[] {
  const groups: DiaryMonthGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items) {
    const date = new Date(item.created_at);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;

    const displayItem: DiaryDisplayItem = {
      ...item,
      day: date.getDate(),
      weekday: WEEKDAY_LABELS[date.getDay()],
      time: formatTime(date),
    };

    const existingIdx = indexByKey.get(key);
    if (existingIdx === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({ key, label: `${year}년 ${month}월`, items: [displayItem] });
    } else {
      groups[existingIdx].items.push(displayItem);
    }
  }

  return groups;
}
