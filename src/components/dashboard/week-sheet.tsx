"use client";

// 주간 시트 — 52주 캘린더의 셀을 탭하면 그 주의 기록이 카드 8장으로 펼쳐진다.
//
//   카드 1~7 : 일~토. 그 날 쓴 일기가 있으면 열고, 없으면 "기록 없음".
//              과거 날짜로 새 일기를 만들 수는 없다(created_at이 DB default라 백데이팅 불가)
//              → 빈 카드는 오늘에만 작성 링크를 건다.
//   카드 8   : 주간 회고. 있으면 열고, 없으면 #버킷을 달아 새로 쓴다.

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { fetchWeekDiariesAction } from "@/app/(main)/diary/actions";
import { buildWeekDates, formatWeekLabel, formatWeekRange } from "@/lib/date/week";
import { formatDateString, getTodayDateString, WEEKDAY_SHORT_LABELS } from "@/lib/todos/repeat";
import { cn } from "@/lib/utils";
import type { DiaryListItem } from "@/types";

interface WeekSheetProps {
  open: boolean;
  onClose: () => void;
  /** 주 시작일(일요일) "YYYY-MM-DD" — 셀 인덱스에서 역산한 값 */
  weekStart: string | null;
  /** 그리드 행 = 나이. 헤더에 "N세"로 표시 */
  age: number | null;
  /** 회고에 붙일 현재 버킷 */
  bucketId: string | null;
  bucketTitle: string | null;
}

export function WeekSheet({
  open,
  onClose,
  weekStart,
  age,
  bucketId,
  bucketTitle,
}: WeekSheetProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["diary", "week", weekStart],
    queryFn: () => fetchWeekDiariesAction(weekStart as string),
    enabled: open && !!weekStart,
  });

  if (!weekStart) return null;

  const dates = buildWeekDates(weekStart);
  const today = getTodayDateString();

  // 날짜별 일기 매핑 — 하루에 여러 개면 가장 이른 것 하나만 카드에 세운다
  const byDate = new Map<string, DiaryListItem>();
  for (const entry of data?.daily ?? []) {
    const key = formatDateString(new Date(entry.created_at));
    if (!byDate.has(key)) byDate.set(key, entry);
  }

  const weekly = data?.weekly ?? null;
  const reviewHref = weekly
    ? `/diary/${weekly.id}`
    : `/diary/new?week=${weekStart}${bucketId ? `&bucket=${bucketId}` : ""}${
        bucketTitle ? `&bucketTitle=${encodeURIComponent(bucketTitle)}` : ""
      }`;

  return (
    <BottomSheet open={open} onClose={onClose} size="large" title={formatWeekLabel(weekStart)}>
      <p className="mb-3 text-xs text-foreground/45">
        {age != null ? `${age}세 · ` : ""}
        {formatWeekRange(weekStart)}
      </p>

      <ul className="flex flex-col gap-2">
        {dates.map((dateStr, i) => {
          const entry = byDate.get(dateStr);
          const isToday = dateStr === today;
          const day = Number(dateStr.slice(8, 10));

          const inner = (
            <div
              className={cn(
                "flex gap-3 rounded-lg border px-3 py-2.5",
                entry ? "border-foreground/15" : "border-dashed border-foreground/10"
              )}
            >
              <div className="w-8 shrink-0 text-center">
                <div className="text-[11px] text-foreground/45">{WEEKDAY_SHORT_LABELS[i]}</div>
                <div
                  className={cn(
                    "text-base font-semibold leading-tight",
                    isToday ? "text-foreground" : "text-foreground/70"
                  )}
                >
                  {String(day).padStart(2, "0")}
                </div>
              </div>
              <div className="min-w-0 flex-1 self-center">
                {entry ? (
                  <>
                    <p className="truncate text-sm font-medium text-foreground">{entry.title}</p>
                    {entry.preview && (
                      <p className="mt-0.5 truncate text-xs text-foreground/55">{entry.preview}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-foreground/35">
                    {isToday ? "오늘 일기 쓰기" : "기록 없음"}
                  </p>
                )}
              </div>
            </div>
          );

          // 지난 날짜는 백데이팅이 안 되므로 링크를 걸지 않는다(오늘만 작성 유도)
          if (entry) {
            return (
              <li key={dateStr}>
                <Link href={`/diary/${entry.id}`}>{inner}</Link>
              </li>
            );
          }
          if (isToday) {
            return (
              <li key={dateStr}>
                <Link href="/diary/new">{inner}</Link>
              </li>
            );
          }
          return <li key={dateStr}>{inner}</li>;
        })}

        {/* 8번째 — 주간 회고 */}
        <li className="mt-1">
          <Link
            href={reviewHref}
            className="flex flex-col gap-1 rounded-lg border border-foreground/25 bg-foreground/[0.03] px-3 py-3"
          >
            <span className="text-[11px] font-medium text-foreground/45">
              주간 회고{bucketTitle ? ` · #${bucketTitle}` : ""}
            </span>
            {weekly ? (
              <>
                <span className="truncate text-sm font-semibold text-foreground">
                  {weekly.title}
                </span>
                {weekly.preview && (
                  <span className="truncate text-xs text-foreground/55">{weekly.preview}</span>
                )}
              </>
            ) : (
              <span className="text-sm font-semibold text-foreground">
                {isLoading ? "불러오는 중…" : "이번 주를 돌아보며 기록하기"}
              </span>
            )}
          </Link>
        </li>
      </ul>
    </BottomSheet>
  );
}
