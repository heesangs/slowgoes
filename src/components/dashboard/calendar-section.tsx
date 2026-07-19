"use client";

// 캘린더 섹션 (Phase C) — 구 "나의 발걸음" 실행 영역을 캘린더 중심으로 재구성.
//
// 구조 (피그마 32455-984):
//   헤더: [이번달|M월 라벨] [이번달 발걸음 타이틀] [⋮ 수정/버킷삭제]
//   일~토 요일 행 + 날짜 그리드 (주 1행 ↔ 월 5~6행)
//   ─ 주↔월 전환: 하단 핸들 버튼 단일 진입점
//     (터치 드래그 전환은 날짜 탭과 제스처가 충돌해 제거됨 — 사용성 피드백)
//   날짜 탭 → 그 날짜의 할 일: "오늘/M월 D일"(진행중) / "완료" 상하 섹션 (탭 없음)
//
// 선택 날짜만 흑색 하이라이트(달성 도트 없음 — 기록은 하단 리스트로 확인).

import { useCallback, useMemo, useRef, useState } from "react";
import {
  clamp01,
  LifeCalendar,
  type LifeCellRect,
  type LifePhase,
} from "@/components/dashboard/life-calendar";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  formatDateString,
  formatRepeatLabel,
  getTodayDateString,
  parseDateString,
  WEEKDAY_SHORT_LABELS,
} from "@/lib/todos/repeat";
import type { StrideItem, TodoWithCompletion } from "@/types";

// "HH:MM:SS" → "HH:MM"
function formatTime(time: string | null): string | null {
  if (!time) return null;
  return time.slice(0, 5);
}

/** 선택 날짜가 속한 주 (일요일 시작, 7일) */
function buildWeekDates(selected: string): string[] {
  const base = parseDateString(selected);
  const start = new Date(base);
  start.setDate(base.getDate() - base.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return formatDateString(d);
  });
}

/** "M. n주" — 해당 주 라벨 (n = 월 내 주차, 일요일 시작 기준) */
function formatWeekOfMonth(dateStr: string): string {
  const d = parseDateString(dateStr);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const n = Math.ceil((d.getDate() + first.getDay()) / 7);
  return `${d.getMonth() + 1}. ${n}주`;
}

/** 선택 날짜가 속한 월 그리드 (일요일 시작, 6주 42칸 고정 — 높이 흔들림 방지) */
function buildMonthDates(selected: string): string[] {
  const base = parseDateString(selected);
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return formatDateString(d);
  });
}

interface CalendarSectionProps {
  /** 이번달 발걸음 (헤더 타이틀). 없으면 타이틀 영역 비움 */
  thisMonthStride: StrideItem | null;
  /** R3: 헤더 우측 ▼ → 지향점 시트 열기 (수정은 시트 내 카드 탭) */
  onOpenDirection: () => void;
  /** R4: 일생 캘린더용 나이 (life_clock_age). 없으면 토글 숨김 */
  age?: number | null;
  /** 선택 날짜의 할 일 (useTodos 결과) */
  todos: TodoWithCompletion[];
  isLoadingTodos?: boolean;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  onToggleTodo: (todoId: string) => void;
  /** R2: 텍스트 영역 탭 → 키보드 입력창으로 수정 (타이틀+반복) */
  onEditTodo: (todo: TodoWithCompletion) => void;
  /** R2: 좌측 스와이프 → 삭제 버튼 탭 (2단계 제스처라 confirm 없음) */
  onDeleteTodo: (todo: TodoWithCompletion) => void;
}

export function CalendarSection({
  thisMonthStride,
  onOpenDirection,
  age,
  todos,
  isLoadingTodos = false,
  selectedDate,
  onSelectDate,
  onToggleTodo,
  onEditTodo,
  onDeleteTodo,
}: CalendarSectionProps) {
  // 주 ↔ 월 확장 상태 (전환은 핸들 버튼 단일 — 드래그 제스처는 날짜 탭과 충돌해 제거)
  const [expanded, setExpanded] = useState(false);

  // ── 3단 스크럽 페이저: 주 캘린더 ↔ 일생 캘린더 ↔ 인생시계 ──
  // 주↔일생은 손가락을 따라오는 스크럽(progress 0=주, 1=일생 그리드).
  //   주→일생: 끄는 만큼 날짜가 오른쪽(토)부터 흐려지고 화살표가 왼쪽으로,
  //            좌측에 "M.n주" 박스가 완성 → 릴리스 임계 이상이면 그리드 칸으로 비행.
  //   일생→주: LifeCalendar가 grid 우드래그 dx를 포워딩 → 박스가 칸에서 주 위치로 추종.
  // 일생↔시계는 LifeCalendar 내부 morph.
  const [view, setView] = useState<"week" | "life">("week");
  const [lifePhase, setLifePhase] = useState<LifePhase>("grid");
  const [progress, setProgressState] = useState(0); // 0=주, 1=일생
  const [dragging, setDragging] = useState(false); // 추종 중(트랜지션 없음)
  const [showArrow, setShowArrow] = useState(false); // 화살표(프레스/드래그 한정)
  const hasAge = typeof age === "number" && age > 0;

  const COLLAPSED_W = 72; // "M. n주" 박스 폭(px)
  const DRAG_FULL = 130; // progress 1.0에 해당하는 드래그 거리
  const COMMIT = 0.4; // 릴리스 커밋 임계
  const FLIGHT_MS = 620; // 박스 ↔ 칸 비행
  const SNAP_MS = 240; // 릴리스 스냅
  const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

  const progressRef = useRef(0);
  const setProgress = useCallback((p: number) => {
    progressRef.current = p;
    setProgressState(p);
  }, []);

  const weekBorderRef = useRef<HTMLDivElement | null>(null); // 주 테두리 (박스 rect 소스)
  const lifeCellRef = useRef<LifeCellRect | null>(null); // 일생 그리드 현재 칸 좌표
  const weekSlotRef = useRef<{ left: number; top: number; height: number } | null>(null); // 주 박스 위치(역방향 타겟)
  const morphRef = useRef<HTMLDivElement | null>(null); // 비행/스크럽 오버레이
  const morphLabelRef = useRef<HTMLSpanElement | null>(null);
  const pendingFlight = useRef<{ left: number; top: number; width: number; height: number } | null>(null);

  const prefersReduced = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 오버레이를 특정 사각형에 즉시 배치(스크럽 추종용)
  const placeOverlay = useCallback((r: { left: number; top: number; width: number; height: number }, labelOpacity: number) => {
    const el = morphRef.current;
    if (!el) return;
    el.style.display = "flex";
    el.style.left = `${r.left}px`;
    el.style.top = `${r.top}px`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
    if (morphLabelRef.current) morphLabelRef.current.style.opacity = String(labelOpacity);
  }, []);

  // 오버레이 비행: from → to (WAAPI, 릴리스/커밋 시). 라벨은 fadeLabel 방향 페이드
  const flyOverlay = useCallback(
    (
      from: { left: number; top: number; width: number; height: number },
      to: { left: number; top: number; width: number; height: number },
      fadeLabel: "out" | "in",
      onFinish: () => void
    ) => {
      const el = morphRef.current;
      if (!el || typeof el.animate !== "function") {
        onFinish();
        return;
      }
      el.style.display = "flex";
      const anim = el.animate(
        [
          { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: "10px" },
          { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: "3px" },
        ],
        { duration: FLIGHT_MS, easing: EASE, fill: "forwards" }
      );
      morphLabelRef.current?.animate(
        fadeLabel === "out"
          ? [{ opacity: 1 }, { opacity: 0, offset: 0.6 }, { opacity: 0 }]
          : [{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }],
        { duration: FLIGHT_MS, fill: "forwards" }
      );
      anim.onfinish = () => {
        el.style.display = "none";
        onFinish();
      };
    },
    [FLIGHT_MS, EASE]
  );

  // 주 박스(좌측 응축 셀) 화면 사각형 — 현재 주 테두리 기준
  function weekBoxRect() {
    const b = weekBorderRef.current?.getBoundingClientRect();
    if (!b) return null;
    return { left: b.left, top: b.top, width: COLLAPSED_W, height: b.height };
  }

  // 주 → 일생 커밋: 박스 rect 캡처 → 일생 마운트 → onReady에서 칸으로 비행
  const commitToLife = useCallback(() => {
    setDragging(false);
    setProgress(1); // 박스 완성(트랜지션)
    const box = weekBoxRect();
    weekSlotRef.current = box ? { left: box.left, top: box.top, height: box.height } : null;
    window.setTimeout(() => {
      pendingFlight.current = box;
      setView("life");
    }, SNAP_MS);
  }, [setProgress]);

  // 일생 캘린더가 현재 칸 좌표를 올려주면 — 대기 중인 forward 비행 실행
  const handleLifeReady = useCallback(
    (rect: LifeCellRect) => {
      lifeCellRef.current = rect;
      const from = pendingFlight.current;
      if (from) {
        pendingFlight.current = null;
        flyOverlay(from, { left: rect.left, top: rect.top, width: rect.size, height: rect.size }, "out", () => {});
      }
    },
    [flyOverlay]
  );

  // 일생 → 주 커밋: 오버레이를 주 박스 위치로 안착 → 주 마운트(숨김→페이드인)
  const commitToWeek = useCallback(() => {
    setDragging(false);
    const slot = weekSlotRef.current;
    const cell = lifeCellRef.current;
    const to = slot ? { left: slot.left, top: slot.top, width: COLLAPSED_W, height: slot.height } : null;
    const from = cell ? { left: cell.left, top: cell.top, width: cell.size, height: cell.size } : null;
    // 주 뷰를 progress=1(테두리·날짜 숨김)로 마운트 → 다음 프레임에 0으로 페이드인
    setView("week");
    setProgress(1);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setProgress(0);
      })
    );
    if (from && to) {
      flyOverlay(from, to, "in", () => {});
    }
  }, [flyOverlay, setProgress]);

  // 일생 그리드 우드래그 포워딩 (역방향 스크럽) — progress 1→0
  const handleGridDrag = useCallback(
    (dx: number) => {
      if (prefersReduced()) return;
      const cell = lifeCellRef.current;
      const slot = weekSlotRef.current;
      const p = 1 - clamp01(dx / DRAG_FULL);
      setDragging(true);
      setProgress(p);
      // 오버레이가 칸(p=1)↔주 박스(p=0)를 추종
      if (cell && slot) {
        const lerp = (a: number, b: number) => a + (b - a) * (1 - p);
        placeOverlay(
          {
            left: lerp(cell.left, slot.left),
            top: lerp(cell.top, slot.top),
            width: lerp(cell.size, COLLAPSED_W),
            height: lerp(cell.size, slot.height),
          },
          1 - p // 주에 가까울수록 라벨 진하게
        );
      }
    },
    [placeOverlay, setProgress]
  );
  const handleGridDragEnd = useCallback(
    (dx: number) => {
      if (prefersReduced()) {
        setView("week");
        setProgress(0);
        return;
      }
      const p = 1 - clamp01(dx / DRAG_FULL);
      if (p <= 1 - COMMIT) {
        commitToWeek();
      } else {
        // 스냅백 — 오버레이 칸으로 복귀 후 숨김, 일생 유지
        setDragging(false);
        setProgress(1);
        const el = morphRef.current;
        if (el) el.style.display = "none";
      }
    },
    [commitToWeek, setProgress]
  );

  // ── 주 뷰 스크럽 제스처 (달력 영역 + 아래 여백. 투두 행은 제외) ──
  const fwd = useRef<{ x: number; y: number; active: boolean; capturing: boolean } | null>(null);
  function handleZonePointerDown(e: React.PointerEvent) {
    if (view !== "week" || expanded || !hasAge) return;
    if ((e.target as HTMLElement).closest("[data-todo-swipe]")) return; // 투두 좌스와이프 삭제 우선
    fwd.current = { x: e.clientX, y: e.clientY, active: true, capturing: false };
  }
  function handleZonePointerMove(e: React.PointerEvent) {
    const g = fwd.current;
    if (!g?.active) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.capturing) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        g.active = false; // 세로 스크롤 양보
        return;
      }
      if (dx < -8 && Math.abs(dx) > Math.abs(dy)) {
        g.capturing = true;
        setDragging(true);
        setShowArrow(true);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* 합성 포인터 등에선 무시 */
        }
      } else {
        return;
      }
    }
    setProgress(clamp01(-dx / DRAG_FULL));
  }
  function handleZonePointerEnd() {
    const g = fwd.current;
    fwd.current = null;
    setShowArrow(false);
    if (!g?.capturing) return;
    if (progressRef.current >= COMMIT) commitToLife();
    else {
      setDragging(false);
      setProgress(0); // 스냅백(트랜지션)
    }
  }

  // 페이지네이션 점 — 주=0, 일생 그리드=1, 시계=2 (스크럽 중간은 progress로 판단)
  const dotIndex =
    view === "life"
      ? lifePhase === "toClock" || lifePhase === "clock"
        ? 2
        : 1
      : progress >= 0.5
        ? 1
        : 0;

  const today = getTodayDateString();
  const selected = parseDateString(selectedDate);
  const selectedMonth = selected.getMonth();

  const dates = useMemo(
    () => (expanded ? buildMonthDates(selectedDate) : buildWeekDates(selectedDate)),
    [expanded, selectedDate]
  );

  const activeTodos = todos.filter((t) => !t.is_completed);
  const completedTodos = todos.filter((t) => t.is_completed);

  const isToday = selectedDate === today;
  const dateLabel = isToday
    ? "오늘"
    : `${selected.getMonth() + 1}월 ${selected.getDate()}일`;
  // 헤더 라벨: 선택 날짜가 현재 달이면 "이번달", 다른 달이면 "M월" (주/월 뷰 공통)
  const todayDate = parseDateString(today);
  const isCurrentMonth =
    selected.getFullYear() === todayDate.getFullYear() &&
    selected.getMonth() === todayDate.getMonth();
  const headerLabel = isCurrentMonth ? "이번달" : `${selected.getMonth() + 1}월`;

  // 스크럽 진행도 → 인라인 스타일 값
  const dateOpacity = (col: number) => 1 - clamp01((progress - (6 - col) * 0.11) / 0.34);
  // 박스 라벨은 좌측 날짜가 충분히 흐려진 뒤 등장(겹침 최소화)
  const boxOpacity = clamp01((progress - 0.6) / 0.3);
  const borderAlpha = 0.4 * (1 - clamp01(progress / 0.9));
  const arrowOpacity = (showArrow ? 1 : 0) * (1 - clamp01(progress / 0.7));
  const ARROW_TRAVEL = 56;
  const collapsing = progress > 0.5; // 응축 진행 — 날짜 탭 차단

  return (
    <section
      // 하단 스페이서가 뷰포트 바닥까지 닿도록 최소 높이 확보 → 캘린더 아래 여백도 스와이프 존
      className="flex min-h-[calc(100dvh-10rem)] flex-col px-4 py-4"
      style={{ touchAction: "pan-y" }}
      onPointerDown={handleZonePointerDown}
      onPointerMove={handleZonePointerMove}
      onPointerUp={handleZonePointerEnd}
      onPointerCancel={handleZonePointerEnd}
    >
      {/* 섹션 타이틀 행 — 우측: 페이지네이션 점 3개 (주 → 일생 → 시계) */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground/70">{FEATURE_NAMES.CALENDAR}</p>
        {hasAge && (
          <div className="flex items-center gap-1.5" role="tablist" aria-label="캘린더 화면 위치">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                role="tab"
                aria-selected={i === dotIndex}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === dotIndex ? "w-3 bg-foreground" : "w-1.5 bg-foreground/25"
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* 일생 뷰에선 이번달 발걸음/날짜 그리드 대신 5200주 조망만 */}
      {view === "life" ? (
        <LifeCalendar
          age={age as number}
          animate
          entryDelayMs={FLIGHT_MS - 200}
          onReady={handleLifeReady}
          onGridDrag={handleGridDrag}
          onGridDragEnd={handleGridDragEnd}
          onPhaseChange={setLifePhase}
        />
      ) : (
      <>
      {/* 헤더: 주/월 라벨 + 이번달 발걸음(왼쪽 정렬) + 우측 ▼ → 지향점 시트
          — 달력을 펼치면(월 뷰) 말줄임 없이 전체 표시 */}
      <div
        className={cn(
          "mt-3 flex gap-2 border-b border-foreground/10 pb-2",
          expanded ? "items-start" : "items-center"
        )}
      >
        <p className="shrink-0 text-sm font-semibold">{headerLabel}</p>
        <p
          className={cn(
            "min-w-0 flex-1 text-xs leading-relaxed text-foreground/55",
            !expanded && "truncate"
          )}
        >
          {thisMonthStride?.action ?? ""}
        </p>
        {/* ▼ 지향점 시트 열기 — 작은 아래꺽쇠 (피그마) */}
        <button
          type="button"
          onClick={onOpenDirection}
          aria-label={`${FEATURE_NAMES.DIRECTION} 열기`}
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground/70"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* 달력 그리드 — 스와이프 스크럽은 섹션 전체가 담당(투두 행 제외) */}
      <div>
        {/* 요일 행 (일~토) */}
        <div className="mt-2 grid grid-cols-7 text-center">
          {WEEKDAY_SHORT_LABELS.map((label) => (
            <span key={label} className="py-1 text-xs text-foreground/45">
              {label}
            </span>
          ))}
        </div>

        {/* 날짜 그리드 — 라운드 테두리로 "한 주" 강조 (피그마 32636-19197).
            스크럽 시 날짜가 오른쪽(토)부터 흐려지고 테두리 페이드아웃 → 좌측 "M.n주" 박스 완성 */}
        <div
          ref={weekBorderRef}
          className={cn(
            "relative grid grid-cols-7 overflow-hidden transition-[max-height] duration-300",
            expanded ? "max-h-[19rem]" : "max-h-14 rounded-xl border px-0.5"
          )}
          style={expanded ? undefined : { borderColor: `color-mix(in srgb, var(--foreground) ${borderAlpha * 100}%, transparent)` }}
        >
          {dates.map((dateStr, i) => {
            const d = parseDateString(dateStr);
            const inMonth = d.getMonth() === selectedMonth;
            const isSelected = dateStr === selectedDate;
            const col = i % 7;
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onSelectDate(dateStr)}
                aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일 선택`}
                aria-current={isSelected ? "date" : undefined}
                className={cn(
                  "flex items-center justify-center py-1.5",
                  !dragging && "transition-opacity duration-200",
                  collapsing && "pointer-events-none"
                )}
                // 복원(일생→주)은 왼쪽부터 stagger — 드래그 중엔 트랜지션 없음(즉시 추종)
                style={{
                  opacity: expanded ? 1 : dateOpacity(col),
                  transitionDelay: dragging ? "0ms" : `${col * 30}ms`,
                }}
              >
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors",
                    isSelected
                      ? "bg-foreground font-semibold text-background"
                      : cn(
                          "hover:bg-foreground/5",
                          expanded && !inMonth ? "text-foreground/30" : "text-foreground"
                        )
                  )}
                >
                  {d.getDate()}
                </span>
              </button>
            );
          })}

          {/* 화살표(←) — 프레스/드래그 중에만. 우측(토 자리) → 왼쪽으로 이동하며 페이드 */}
          {!expanded && (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 right-1 flex items-center text-foreground/60",
                !dragging && "transition-opacity duration-150"
              )}
              style={{ opacity: arrowOpacity, transform: `translateX(${-progress * ARROW_TRAVEL}px)` }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M5 12l6-6M5 12l6 6" />
              </svg>
            </span>
          )}

          {/* "M. n주" 박스 라벨 — 좌측 앵커, 스크럽 진행 시 페이드인 (비행은 오버레이가 이어받음) */}
          {!expanded && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center text-xs font-medium"
              style={{ width: COLLAPSED_W, opacity: boxOpacity }}
            >
              {formatWeekOfMonth(selectedDate)}
            </span>
          )}
        </div>

        {/* 주↔월 전환 핸들 (데스크톱 클릭용 · 모바일은 드래그) */}
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-label={expanded ? "주 달력으로 접기" : "월 달력으로 펼치기"}
          aria-expanded={expanded}
          className="mt-1 flex w-full items-center justify-center rounded-md py-1 text-foreground/30 transition-colors hover:bg-foreground/5 hover:text-foreground/60"
        >
          <svg
            className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* 선택 날짜의 할 일 — 진행중/완료 상하 구분 (탭 없음) */}
      {isLoadingTodos ? (
        <div className="mt-3 flex flex-col gap-2 animate-pulse" aria-label="할 일 로딩 중">
          <div className="h-3 w-10 rounded bg-foreground/10" />
          <div className="h-10 w-full rounded-lg bg-foreground/10" />
          <div className="h-10 w-full rounded-lg bg-foreground/10" />
        </div>
      ) : (
        <>
          {activeTodos.length === 0 && completedTodos.length === 0 && (
            <p className="mt-4 text-center text-xs text-foreground/45">
              {dateLabel}의 할 일이 없어요.
            </p>
          )}

          {activeTodos.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-foreground/55">{dateLabel}</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {activeTodos.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    onToggle={onToggleTodo}
                    onEdit={onEditTodo}
                    onDelete={onDeleteTodo}
                  />
                ))}
              </ul>
            </div>
          )}

          {completedTodos.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-foreground/55">완료</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {completedTodos.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    onToggle={onToggleTodo}
                    onEdit={onEditTodo}
                    onDelete={onDeleteTodo}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* 아래 여백 — 이곳을 스와이프해도 페이저(주→일생)가 발동한다 */}
      <div className="flex-1" aria-hidden />
      </>
      )}

      {/* 비행 오버레이 — "M. n주" 응축 셀이 주 위치 ↔ 일생 그리드 칸을 오간다 (WAAPI). 기본 숨김 */}
      <div
        ref={morphRef}
        aria-hidden
        style={{ display: "none" }}
        className="pointer-events-none fixed z-40 items-center justify-center overflow-hidden rounded-lg border border-foreground/40 bg-background"
      >
        <span ref={morphLabelRef} className="whitespace-nowrap text-xs font-medium">
          {formatWeekOfMonth(selectedDate)}
        </span>
      </div>
    </section>
  );
}

// 할 일 행 (R2) — 체크박스 · 타이틀(탭=수정) · 시간·🔁반복
// 좌측 스와이프(터치/마우스 드래그 공통, Pointer Events) → 삭제 버튼 노출 → 탭 삭제.
// 스와이프 + 버튼 탭의 2단계 제스처라 confirm 창은 두지 않는다.

const DELETE_REVEAL_PX = 72;
const DRAG_START_THRESHOLD = 8;

function TodoRow({
  todo,
  onToggle,
  onEdit,
  onDelete,
}: {
  todo: TodoWithCompletion;
  onToggle: (todoId: string) => void;
  onEdit: (todo: TodoWithCompletion) => void;
  onDelete: (todo: TodoWithCompletion) => void;
}) {
  const repeatLabel = formatRepeatLabel(todo);
  const time = formatTime(todo.scheduled_time);
  const isCompleted = todo.is_completed;

  // 스와이프 상태 — offsetX: 0(닫힘) ~ -DELETE_REVEAL_PX(열림)
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    startX: number;
    startY: number;
    base: number;
    active: boolean;
    moved: boolean;
  } | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    gesture.current = {
      startX: e.clientX,
      startY: e.clientY,
      base: offsetX,
      active: true,
      moved: false,
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g?.active) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (!dragging) {
      // 가로 이동이 우세할 때만 스와이프 시작 (세로 스크롤과 간섭 방지)
      if (Math.abs(dx) > DRAG_START_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        setDragging(true);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else if (Math.abs(dy) > DRAG_START_THRESHOLD) {
        g.active = false; // 세로 스크롤에 양보
      }
      return;
    }

    g.moved = true;
    setOffsetX(Math.max(-DELETE_REVEAL_PX, Math.min(0, g.base + dx)));
  }

  function handlePointerEnd() {
    const g = gesture.current;
    if (g?.active && dragging) {
      // 절반 이상 밀렸으면 열림으로 스냅
      setOffsetX((x) => (x < -DELETE_REVEAL_PX / 2 ? -DELETE_REVEAL_PX : 0));
    }
    setDragging(false);
    if (g) g.active = false;
  }

  // 스와이프 직후의 클릭은 무시 (제스처와 탭 충돌 방지)
  function guardClick(action: () => void) {
    return () => {
      const g = gesture.current;
      if (g?.moved) {
        g.moved = false;
        return;
      }
      if (offsetX !== 0) {
        setOffsetX(0); // 열림 상태에서 본문 탭 = 닫기
        return;
      }
      action();
    };
  }

  return (
    <li className="relative overflow-hidden rounded-lg">
      {/* 뒤: 삭제 버튼 — 스와이프로 노출 */}
      <button
        type="button"
        onClick={() => onDelete(todo)}
        aria-label={`${todo.title} 삭제`}
        tabIndex={offsetX === 0 ? -1 : 0}
        // 닫혀 있을 땐 완전히 숨겨 라운드 코너 틈으로 빨간색이 비치지 않게 한다
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 text-xs font-medium text-white"
        style={{ width: DELETE_REVEAL_PX, opacity: offsetX < 0 ? 1 : 0 }}
      >
        삭제
      </button>

      {/* 앞: 행 본문 — Pointer 드래그로 좌측 이동. data-todo-swipe: 페이저 스와이프 존에서 제외 */}
      <div
        data-todo-swipe
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={cn(
          // 배경은 불투명해야 뒤의 삭제 버튼이 비치지 않는다.
          // color-mix로 foreground 4% 틴트를 background에 섞어 불투명 색을 만든다(라이트/다크 공통).
          "flex touch-pan-y items-start gap-1 rounded-lg bg-[color-mix(in_srgb,var(--foreground)_4%,var(--background))] px-2 py-1.5",
          !dragging && "transition-transform duration-200"
        )}
        // 완료 상태는 체크박스+취소선 텍스트로 표현(행 전체 opacity는 삭제 버튼이 비쳐서 제거)
        style={{ transform: `translateX(${offsetX}px)` }}
      >
        <button
          type="button"
          onClick={guardClick(() => onToggle(todo.id))}
          aria-pressed={isCompleted}
          aria-label={`${todo.title} ${isCompleted ? "완료 취소" : "완료"}`}
          className="shrink-0 rounded-md p-1 hover:bg-foreground/5"
        >
          <span
            className={cn(
              "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
              isCompleted
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/30 bg-transparent"
            )}
            aria-hidden
          >
            {isCompleted && (
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </span>
        </button>

        {/* 타이틀 — 탭하면 키보드 입력창으로 수정 */}
        <button
          type="button"
          onClick={guardClick(() => onEdit(todo))}
          aria-label={`${todo.title} 수정`}
          className={cn(
            "min-w-0 flex-1 break-words py-0.5 text-left text-sm leading-snug",
            isCompleted && "text-foreground/45 line-through"
          )}
        >
          {todo.title}
        </button>

        {(time || repeatLabel) && (
          <span className="mt-1 flex shrink-0 items-center gap-1 text-[10px] text-foreground/40">
            {time && <span>{time}</span>}
            {repeatLabel && <span>🔁 {repeatLabel}</span>}
          </span>
        )}
      </div>
    </li>
  );
}
