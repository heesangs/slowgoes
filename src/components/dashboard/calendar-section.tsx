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

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LifeCalendar, type LifeCellRect } from "@/components/dashboard/life-calendar";
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

  // R4: 주/월 캘린더 ↔ 일생 캘린더 토글
  const [lifeMode, setLifeMode] = useState(false);
  const hasAge = typeof age === "number" && age > 0;

  // morph용 refs — 주 뷰 테두리(소스) ↔ 일생 캘린더 현재 칸(타겟)
  const weekBorderRef = useRef<HTMLDivElement | null>(null);
  const lifeCellRef = useRef<LifeCellRect | null>(null);
  const morphRef = useRef<HTMLDivElement | null>(null);
  // 토글 시 캡처한 소스 rect + 방향 (레이아웃 후 애니메이션 실행)
  const pendingMorph = useRef<{ from: DOMRect | LifeCellRect; dir: "to-life" | "to-cal" } | null>(null);

  // FLIP: from → to 사각형을 morph 오버레이로 애니메이션
  const runMorph = useCallback((from: { left: number; top: number; width: number; height: number }, to: { left: number; top: number; width: number; height: number }) => {
    const el = morphRef.current;
    if (!el || typeof el.animate !== "function") return;
    el.style.display = "block";
    const anim = el.animate(
      [
        { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: "10px" },
        { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: "2px" },
      ],
      { duration: 480, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
    );
    anim.onfinish = () => {
      el.style.display = "none";
    };
  }, []);

  // 일생 캘린더가 현재 칸 좌표를 올려주면 — 대기 중인 to-life morph 실행
  const handleLifeReady = useCallback(
    (rect: LifeCellRect) => {
      lifeCellRef.current = rect;
      const pending = pendingMorph.current;
      if (pending?.dir === "to-life" && "left" in pending.from && "width" in pending.from) {
        const src = pending.from as DOMRect;
        runMorph(
          { left: src.left, top: src.top, width: src.width, height: src.height },
          { left: rect.left, top: rect.top, width: rect.size, height: rect.size }
        );
        pendingMorph.current = null;
      }
    },
    [runMorph]
  );

  // 캘린더 → 일생: 주 뷰 테두리(소스) 캡처 후 전환 (타겟은 handleLifeReady에서)
  // 일생 → 캘린더: 현재 칸(소스) 캡처 후 전환, 주 테두리 마운트 뒤 애니메이션
  function handleToggleLife() {
    if (!lifeMode) {
      const border = weekBorderRef.current;
      pendingMorph.current = border
        ? { from: border.getBoundingClientRect(), dir: "to-life" }
        : null;
      setLifeMode(true);
    } else {
      const cell = lifeCellRef.current;
      pendingMorph.current = cell ? { from: cell, dir: "to-cal" } : null;
      setLifeMode(false);
    }
  }

  // to-cal: 주 뷰 테두리가 마운트된 뒤 현재 칸 → 테두리로 애니메이션
  useLayoutEffect(() => {
    if (lifeMode) return;
    const pending = pendingMorph.current;
    if (pending?.dir !== "to-cal") return;
    const border = weekBorderRef.current;
    const cell = pending.from as LifeCellRect;
    if (border && "size" in cell) {
      const b = border.getBoundingClientRect();
      runMorph(
        { left: cell.left, top: cell.top, width: cell.size, height: cell.size },
        { left: b.left, top: b.top, width: b.width, height: b.height }
      );
    }
    pendingMorph.current = null;
  }, [lifeMode, runMorph]);

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

  return (
    <section className="px-4 py-4">
      {/* 섹션 타이틀 행 — 타이틀은 항상 "주 캘린더", 우측에 토글 (일생 모드일 때 "일생보기" 라벨) */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground/70">{FEATURE_NAMES.CALENDAR}</p>
        {hasAge && (
          <div className="flex items-center gap-2">
            {lifeMode && <span className="text-xs text-foreground/50">일생보기</span>}
            <button
              type="button"
              role="switch"
              aria-checked={lifeMode}
              aria-label="일생 캘린더 전환"
              onClick={handleToggleLife}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                lifeMode ? "bg-foreground" : "bg-foreground/20"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-background transition-transform",
                  lifeMode ? "translate-x-4" : "translate-x-0.5"
                )}
              />
            </button>
          </div>
        )}
      </div>

      {/* 일생 모드에선 이번달 발걸음/날짜 그리드 대신 5200주 조망만 */}
      {lifeMode ? (
        <LifeCalendar age={age as number} animate onReady={handleLifeReady} />
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

      {/* 달력 그리드 — 주↔월 전환은 하단 핸들 버튼 */}
      <div>
        {/* 요일 행 (일~토) */}
        <div className="mt-2 grid grid-cols-7 text-center">
          {WEEKDAY_SHORT_LABELS.map((label) => (
            <span key={label} className="py-1 text-xs text-foreground/45">
              {label}
            </span>
          ))}
        </div>

        {/* 날짜 그리드 — 주 뷰(!expanded)일 때 라운드 테두리로 "한 주" 강조 (피그마 32636-19197).
            이 테두리가 일생 캘린더의 한 칸으로 morph */}
        <div
          ref={weekBorderRef}
          className={cn(
            "grid grid-cols-7 overflow-hidden transition-[max-height] duration-300",
            expanded
              ? "max-h-[19rem]"
              : "max-h-14 rounded-xl border border-foreground/40 px-0.5"
          )}
        >
          {dates.map((dateStr) => {
            const d = parseDateString(dateStr);
            const inMonth = d.getMonth() === selectedMonth;
            const isSelected = dateStr === selectedDate;
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onSelectDate(dateStr)}
                aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일 선택`}
                aria-current={isSelected ? "date" : undefined}
                className="flex items-center justify-center py-1.5"
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
      </>
      )}

      {/* morph 오버레이 — 주 뷰 테두리 ↔ 일생 캘린더 칸 (WAAP로 left/top/size 애니). 기본 숨김 */}
      <div
        ref={morphRef}
        aria-hidden
        style={{ display: "none" }}
        className="pointer-events-none fixed z-40 border-2 border-foreground/60"
      />
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

      {/* 앞: 행 본문 — Pointer 드래그로 좌측 이동 */}
      <div
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
