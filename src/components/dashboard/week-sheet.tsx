"use client";

// 주간 시트 — 52주 캘린더의 셀을 탭하면 **이번 주**의 기록이 카드 9장으로 열린다.
// 다른 주는 헤더의 ‹ › 또는 제목 탭(최근 주 목록)으로 이동한다(미래로는 가지 않는다).
//
//   카드 0   : 주간 목표(맨 위). 한 주를 여는 기록 — AI가 체크박스 목록을 제안해 채울 수 있다.
//              달성률("2/5 완료")은 본문의 체크박스를 세서 서버가 실어 준다.
//   카드 1~7 : 일~토. 그 날 쓴 일기가 있으면 열고, 없으면 "기록 없음".
//              과거 날짜로 새 일기를 만들 수는 없다(created_at이 DB default라 백데이팅 불가)
//              → 빈 카드는 오늘에만 작성 링크를 건다.
//   카드 8   : 주간 회고(맨 아래). 있으면 열고, 없으면 #버킷을 달아 새로 쓴다.
//
// 카드에서 일기로 나갈 때 ?from=week&week=... 를 실어 보낸다 →
// 상세에서 뒤로가기하면 대시보드가 이 주 시트를 다시 연다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { fetchWeekDiariesAction } from "@/app/(main)/diary/actions";
import { preloadMarkdownEditor } from "@/components/diary/markdown-editor-lazy";
import { buildWeekDates, formatWeekLabel, formatWeekRange, getWeekStart } from "@/lib/date/week";
import {
  formatDateString,
  getTodayDateString,
  parseDateString,
  WEEKDAY_SHORT_LABELS,
} from "@/lib/todos/repeat";
import { cn } from "@/lib/utils";
import type { DiaryListItem } from "@/types";

/** 제목 탭 시 펼쳐지는 최근 주 목록 길이 */
const RECENT_WEEKS = 12;

interface WeekSheetProps {
  open: boolean;
  onClose: () => void;
  /** 열릴 때의 주 시작일(일요일). 이후 이동은 시트가 자체 관리한다 */
  initialWeekStart: string | null;
  /** 목표·회고에 붙일 현재 버킷 */
  bucketId: string | null;
  bucketTitle: string | null;
}

/** weekStart에 주 단위 오프셋을 더한다 */
function shiftWeek(weekStart: string, weeks: number): string {
  const d = parseDateString(weekStart);
  d.setDate(d.getDate() + weeks * 7);
  return formatDateString(d);
}

export function WeekSheet({
  open,
  onClose,
  initialWeekStart,
  bucketId,
  bucketTitle,
}: WeekSheetProps) {
  // 열린 뒤의 주 이동은 시트가 스스로 관리한다.
  // 부모가 다른 주로 열 때의 동기화는 effect가 아니라 key 리마운트로 처리한다
  // (호출부에서 key={weekStart} — effect 내 setState 회피).
  const [weekStart, setWeekStart] = useState<string | null>(initialWeekStart);
  const [listOpen, setListOpen] = useState(false);
  const queryClient = useQueryClient();

  const today = getTodayDateString();
  const thisWeek = getWeekStart(today);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["diary", "week", weekStart],
    queryFn: () => fetchWeekDiariesAction(weekStart as string),
    enabled: open && !!weekStart,
    // 주를 옮겨도 이전 주 카드를 그대로 두고 조용히 갱신한다.
    // (없으면 화살표를 누르는 순간 콜드 키가 되어 카드가 통째로 비었다가 채워진다)
    placeholderData: keepPreviousData,
  });

  // 시트가 열리면 일기 에디터 청크(TipTap)를 미리 받아 둔다 —
  // 여기서 카드를 누르면 곧장 작성 화면이므로, 그 사이에 받아 두면 진입이 즉시가 된다.
  useEffect(() => {
    if (open) preloadMarkdownEditor();
  }, [open]);

  // 앞뒤 주를 미리 받아 둔다 — 화살표 이동이 캐시 히트라 즉시 열린다.
  // 시트는 열 때마다 key로 리마운트되므로, 프리페치 결과는 컴포넌트가 아니라
  // 쿼리 캐시(staleTime 60초)에 남겨 다음 열림에서도 재사용된다.
  useEffect(() => {
    if (!open || !weekStart) return;
    const neighbors = [shiftWeek(weekStart, -1), shiftWeek(weekStart, 1)].filter(
      (w) => w <= thisWeek // 미래 주는 이동할 수 없으니 받지 않는다
    );
    for (const w of neighbors) {
      void queryClient.prefetchQuery({
        queryKey: ["diary", "week", w],
        queryFn: () => fetchWeekDiariesAction(w),
      });
    }
  }, [open, weekStart, thisWeek, queryClient]);

  if (!weekStart) return null;

  const dates = buildWeekDates(weekStart);
  // 이번 주가 상한 — 미래로는 이동하지 않는다
  const canGoNext = weekStart < thisWeek;

  const recentWeeks = Array.from({ length: RECENT_WEEKS }, (_, i) => shiftWeek(thisWeek, -i));

  // 날짜별 일기 매핑 — 하루에 여러 개면 가장 이른 것 하나만 카드에 세운다
  const byDate = new Map<string, DiaryListItem>();
  for (const entry of data?.daily ?? []) {
    const key = formatDateString(new Date(entry.created_at));
    if (!byDate.has(key)) byDate.set(key, entry);
  }

  // 상세에서 뒤로가기하면 이 주 시트로 돌아오게 하는 꼬리표.
  // 복귀용은 backWeek — week은 "주간 회고 대상 주"라 의미가 다르다.
  // (오늘 일기 카드에 week을 붙이면 일반 일기가 회고로 저장돼 버린다)
  const backQs = `?from=week&backWeek=${weekStart}`;

  // 새 주간 기록 작성 링크 — kind로 목표/회고를 가른다.
  // week=대상 주, backWeek=복귀할 주 (같은 값이어도 의미가 달라 분리해 둔다)
  const newWeeklyHref = (kind: "goal" | "review") =>
    `/diary/new?week=${weekStart}&kind=${kind}${bucketId ? `&bucket=${bucketId}` : ""}${
      bucketTitle ? `&bucketTitle=${encodeURIComponent(bucketTitle)}` : ""
    }&from=week&backWeek=${weekStart}`;

  const goal = data?.goal ?? null;
  const goalHref = goal ? `/diary/${goal.id}${backQs}` : newWeeklyHref("goal");

  const weekly = data?.weekly ?? null;
  const reviewHref = weekly ? `/diary/${weekly.id}${backQs}` : newWeeklyHref("review");

  return (
    <BottomSheet open={open} onClose={onClose} size="large" hideHeader>
      {/* 헤더 — ‹ [8월 2주 ▾] › + 날짜 범위 */}
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
            aria-label="이전 주"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/5"
          >
            <ChevronIcon className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setListOpen((prev) => !prev)}
            aria-expanded={listOpen}
            className="inline-flex min-w-0 items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-foreground/5"
          >
            <span className="truncate text-base font-semibold">{formatWeekLabel(weekStart)}</span>
            <ChevronIcon className={cn("h-3.5 w-3.5 shrink-0 -rotate-90 text-foreground/45", listOpen && "rotate-90")} />
          </button>

          <button
            type="button"
            onClick={() => canGoNext && setWeekStart(shiftWeek(weekStart, 1))}
            disabled={!canGoNext}
            aria-label="다음 주"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/5 disabled:opacity-25 disabled:hover:bg-transparent"
          >
            <ChevronIcon className="h-4 w-4 rotate-180" />
          </button>
        </div>
        {/* 갱신 중은 날짜 범위를 살짝 흐리게만 — 카드를 비우지 않는다 */}
        <p
          className={cn(
            "mt-0.5 text-center text-xs text-foreground/45 transition-opacity",
            isFetching && "opacity-40"
          )}
        >
          {formatWeekRange(weekStart)}
        </p>
      </div>

      {/* 최근 주 목록 — 제목 탭으로 펼침 */}
      {listOpen && (
        <ul className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-foreground/10">
          {recentWeeks.map((w) => (
            <li key={w}>
              <button
                type="button"
                onClick={() => {
                  setWeekStart(w);
                  setListOpen(false);
                }}
                className={cn(
                  "flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-foreground/5",
                  w === weekStart && "bg-foreground/[0.06]"
                )}
              >
                <span className={cn("text-sm", w === weekStart ? "font-semibold" : "text-foreground/75")}>
                  {formatWeekLabel(w)}
                </span>
                <span className="shrink-0 text-[11px] text-foreground/40">{formatWeekRange(w)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul className="flex flex-col gap-2">
        {/* 맨 위 — 주간 목표. 한 주를 여는 기록이라 일별 카드보다 앞에 둔다 */}
        <li className="mb-1">
          <Link
            href={goalHref}
            className="flex flex-col gap-1 rounded-lg border border-foreground/25 bg-foreground/[0.03] px-3 py-3"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-medium text-foreground/45">
                주간 목표{bucketTitle ? ` · #${bucketTitle}` : ""}
              </span>
              {goal && goal.total > 0 && (
                <span className="shrink-0 text-[11px] font-medium text-foreground/60">
                  {goal.done}/{goal.total} 완료
                </span>
              )}
            </span>
            {goal ? (
              <>
                <span className="truncate text-sm font-semibold text-foreground">{goal.title}</span>
                {goal.preview && (
                  <span className="truncate text-xs text-foreground/55">{goal.preview}</span>
                )}
              </>
            ) : (
              <span className="text-sm font-semibold text-foreground">
                {isLoading ? "불러오는 중…" : "이번 주에 할 일을 정해보기"}
              </span>
            )}
          </Link>
        </li>

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
                <Link href={`/diary/${entry.id}${backQs}`}>{inner}</Link>
              </li>
            );
          }
          if (isToday) {
            return (
              <li key={dateStr}>
                <Link href={`/diary/new${backQs}`}>{inner}</Link>
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
                {isLoading ? "불러오는 중…" : "이 주를 돌아보며 기록하기"}
              </span>
            )}
          </Link>
        </li>
      </ul>
    </BottomSheet>
  );
}

/** ‹ 모양 — rotate로 방향을 만든다 */
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
    </svg>
  );
}
