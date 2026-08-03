// 일기 목록 렌더용 순수 헬퍼.
// plain_text(순수 텍스트)에서 제목/미리보기를 파생하고, 월별로 그룹핑한다.

import { formatWeekLabelInMonth, getWeekStart } from "@/lib/date/week";
import { formatDateString, parseDateString } from "@/lib/todos/repeat";
import type { DiaryListItem, DiaryWeekKind } from "@/types";

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
  week_kind?: DiaryWeekKind | null;
  bucket_title?: string | null;
}): DiaryListItem {
  return {
    id: row.id,
    title: deriveDiaryTitle(row.plain_text),
    preview: derivePreview(row.plain_text),
    created_at: row.created_at,
    week_start: row.week_start ?? null,
    // 구분자 도입 전 주간 기록은 전부 회고였다 (NULL → review)
    week_kind: row.week_kind ?? (row.week_start ? "review" : null),
    bucket_title: row.bucket_title ?? null,
  };
}

/**
 * TipTap 체크박스 개수 — 주간 목표 달성률("2/5 완료")용.
 * 저장 형식이 HTML이라 파싱 대신 속성을 센다. 체크 항목의 마크업은
 *   <ul data-type="taskList"><li data-checked="true">…
 * 이라 **data-checked를 가진 li가 곧 항목**이다(li에는 data-type이 없다).
 */
export function countTaskItems(html: string): { done: number; total: number } {
  const items = html.match(/data-checked="/g);
  const checked = html.match(/data-checked="true"/g);
  return { done: checked?.length ?? 0, total: items?.length ?? 0 };
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
  /** 주간 기록 여부 — 배지 표시용 */
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
// 주 판정: 주간 기록(목표·회고)은 week_start(대상 주), 일반 일기는 작성일이 속한 주.
//   그래야 "지난 주 회고를 이번 주에 썼어도" 그 주 묶음에 들어간다.
// 월 판정: 일반 일기는 **작성일의 월**, 주간 기록은 **대상 주 시작일의 월**.
//   달을 걸친 주(예: 7/26~8/1)는 일별 기록이 두 달로 갈리는데, 라벨을 그 달 기준으로
//   붙이므로(7월 5주 / 8월 1주) 같은 이름이 두 번 뜨지 않는다 — 31일과 1일이 한 덩어리로
//   묶여 있는 것보다 이쪽이 덜 헷갈린다는 피드백을 반영했다.
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

    // 주 키 — 주간 기록이면 대상 주, 아니면 작성일이 속한 주
    const weekKey = item.week_start ?? getWeekStart(formatDateString(date));
    // 월 키 — 주간 기록은 대상 주의 월(주 전체가 그 주의 기록이므로), 일반 일기는 작성일의 월
    const monthDate = item.week_start ? parseDateString(item.week_start) : date;
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth() + 1;
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
      weeks.push({
        key: weekKey,
        label: formatWeekLabelInMonth(weekKey, year, month),
        items: [displayItem],
      });
    }
  }

  return groups;
}
