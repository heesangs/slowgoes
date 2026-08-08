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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clamp01,
  LifeCalendar,
  type LifeCalendarHandle,
  type LifeCellRect,
  type LifePhase,
} from "@/components/dashboard/life-calendar";
import { WeekSheet } from "@/components/dashboard/week-sheet";
import { FEATURE_NAMES } from "@/lib/constants";
import { getWeekStart } from "@/lib/date/week";
import type { CalendarView } from "@/lib/dashboard/calendar-view";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { RepeatIcon } from "@/components/ui/icons";
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
  /** 인생시계 문구의 호칭 (display_name) */
  userName?: string | null;
  /** 선택 날짜의 할 일 (useTodos 결과) */
  todos: TodoWithCompletion[];
  isLoadingTodos?: boolean;
  /** 할 일 조회 실패 — 빈 상태로 위장하지 않고 실패를 밝힌다 */
  isTodosError?: boolean;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  onToggleTodo: (todoId: string) => void;
  /** R2: 텍스트 영역 탭 → 키보드 입력창으로 수정 (타이틀+반복) */
  onEditTodo: (todo: TodoWithCompletion) => void;
  /** R2: 좌측 스와이프 → 삭제 버튼 탭 (2단계 제스처라 confirm 없음) */
  onDeleteTodo: (todo: TodoWithCompletion) => void;
  /** 주간 회고에 붙일 현재 버킷 (52주 셀 탭 → 주간 시트) */
  bucketId?: string | null;
  bucketTitle?: string | null;
  /** 하단 탭이 요청한 뷰(URL ?view=). 값이 바뀌면 그 뷰로 전환한다 */
  requestedView?: CalendarView;
  /** 제스처/탭으로 뷰가 실제로 바뀌었을 때 — 부모가 URL을 맞춘다 */
  onViewChange?: (view: CalendarView) => void;
  /** ?week= 로 진입했을 때 열어둘 주 (일기 상세에서 뒤로가기 복귀) */
  initialWeekSheet?: string | null;
  /** 그 시트를 닫을 때 — 부모가 URL을 정리한다 */
  onCloseWeekSheet?: () => void;
}

export function CalendarSection({
  thisMonthStride,
  onOpenDirection,
  age,
  userName = null,
  todos,
  isLoadingTodos = false,
  isTodosError = false,
  selectedDate,
  onSelectDate,
  onToggleTodo,
  onEditTodo,
  onDeleteTodo,
  bucketId = null,
  bucketTitle = null,
  requestedView = "week",
  onViewChange,
  initialWeekSheet = null,
  onCloseWeekSheet,
}: CalendarSectionProps) {
  // 주 ↔ 월 확장 상태 (전환은 핸들 버튼 단일 — 드래그 제스처는 날짜 탭과 충돌해 제거)
  const [expanded, setExpanded] = useState(false);

  // 52주 셀 탭 → 그 주의 기록 시트 (시트 상태는 이 컴포넌트가 소유 — BucketBar 패턴).
  // ?week= 로 복귀한 경우 그 주로 열어둔 채 시작한다.
  const [weekSheetStart, setWeekSheetStart] = useState<string | null>(initialWeekSheet);
  // 닫는 동안에도 시트가 내용을 그려야 슬라이드 아웃이 보인다 → 마지막으로 연 주를 붙잡아 둔다.
  // (weekSheetStart를 그대로 넘기면 닫는 순간 내용이 사라져 시트가 즉시 언마운트된다)
  const [lastWeekSheet, setLastWeekSheet] = useState<string | null>(initialWeekSheet);
  // 열 때마다 새로 마운트해 시트 내부의 주 이동 상태를 초기화한다.
  // key를 weekSheetStart로 두면 닫는 순간 key가 바뀌어 아웃 애니메이션이 잘린다.
  const [sheetSeq, setSheetSeq] = useState(0);

  const openWeekSheet = useCallback((week: string) => {
    setLastWeekSheet(week);
    setWeekSheetStart(week);
    setSheetSeq((n) => n + 1);
  }, []);

  // ── 3단 스크럽 페이저: 주 캘린더 ↔ 일생 캘린더 ↔ 인생시계 ──
  // 주↔일생은 손가락을 따라오는 스크럽(progress 0=주, 1=일생 그리드).
  //   주→일생: 끄는 만큼 날짜가 오른쪽(토)부터 흐려지고 화살표가 왼쪽으로,
  //            좌측에 "M.n주" 박스가 완성 → 릴리스 임계 이상이면 그리드 칸으로 비행.
  //   일생→주: LifeCalendar가 grid 우드래그 dx를 포워딩 → 박스가 칸에서 주 위치로 추종.
  // 일생↔시계는 LifeCalendar 내부 morph.
  const [view, setView] = useState<"week" | "life">("week");
  const [lifePhase, setLifePhase] = useState<LifePhase>("grid");
  // 전환 오케스트레이션은 콜백 체인(비행 onFinish, phase 통지)에서 돌아가므로
  // stale closure를 피하려고 현재 뷰/페이즈를 ref로도 들고 있는다.
  const viewRef = useRef<"week" | "life">("week");
  const phaseRef = useRef<LifePhase>("grid");
  const applyView = useCallback((v: "week" | "life") => {
    viewRef.current = v;
    setView(v);
  }, []);

  // 전환 한 단계가 끝날 때마다 올리는 신호 — settle()이 이걸 보고 다음 단계를 잇는다.
  // 콜백이 서로를 참조하는 순환(비행 onFinish ↔ settle)을 상태로 끊는다.
  const [settleSignal, setSettleSignal] = useState(0);
  const transitioningRef = useRef(false);
  const signalSettle = useCallback(() => {
    transitioningRef.current = false;
    setSettleSignal((n) => n + 1);
  }, []);
  const [progress, setProgressState] = useState(0); // 0=주, 1=일생
  const [dragging, setDragging] = useState(false); // 추종 중(트랜지션 없음)
  // 역방향(일생→주) 비행 중 — 응축 박스를 숨겨 오버레이만 보이게 한다
  const [reverseLanding, setReverseLanding] = useState(false);
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

  // 오버레이 색 타입 — forward는 fill("7.4주"), reverse는 border(라벨 없음)
  const styleOverlay = useCallback((variant: "fill" | "border") => {
    const el = morphRef.current;
    const label = morphLabelRef.current;
    if (!el) return;
    if (variant === "fill") {
      el.style.background = "var(--foreground)";
      el.style.border = "none";
      if (label) label.style.color = "var(--background)";
    } else {
      el.style.background = "var(--background)";
      el.style.border = "1px solid color-mix(in srgb, var(--foreground) 55%, transparent)";
      if (label) label.style.color = "var(--foreground)";
    }
  }, []);

  // 오버레이 비행: from → to (WAAPI, 커밋 시). variant=색타입, label=페이드 방향("none"=숨김)
  const flyOverlay = useCallback(
    (
      from: { left: number; top: number; width: number; height: number },
      to: { left: number; top: number; width: number; height: number },
      opts: { variant: "fill" | "border"; label: "out" | "in" | "none"; onFinish?: () => void }
    ) => {
      const el = morphRef.current;
      if (!el || typeof el.animate !== "function") {
        opts.onFinish?.();
        return;
      }
      styleOverlay(opts.variant);
      el.style.display = "flex";
      const anim = el.animate(
        [
          { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: "10px" },
          { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: "3px" },
        ],
        { duration: FLIGHT_MS, easing: EASE, fill: "forwards" }
      );
      if (opts.label === "none") {
        if (morphLabelRef.current) morphLabelRef.current.style.opacity = "0";
      } else {
        morphLabelRef.current?.animate(
          opts.label === "out"
            ? [{ opacity: 1 }, { opacity: 0, offset: 0.6 }, { opacity: 0 }]
            : [{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }],
          { duration: FLIGHT_MS, fill: "forwards" }
        );
      }
      anim.onfinish = () => {
        el.style.display = "none";
        opts.onFinish?.();
      };
    },
    [FLIGHT_MS, EASE, styleOverlay]
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
      applyView("life");
    }, SNAP_MS);
  }, [setProgress, applyView]);

  // 일생 캘린더가 현재 칸 좌표를 올려주면 — 대기 중인 forward 비행 실행
  const handleLifeReady = useCallback(
    (rect: LifeCellRect) => {
      lifeCellRef.current = rect;
      const from = pendingFlight.current;
      if (from) {
        pendingFlight.current = null;
        flyOverlay(
          from,
          { left: rect.left, top: rect.top, width: rect.size, height: rect.size },
          { variant: "fill", label: "out", onFinish: signalSettle }
        );
      }
    },
    [flyOverlay, signalSettle]
  );

  // 일생 → 주 커밋: LifeCalendar가 올려준 확대 키오브젝트(테두리)를 주 위치로 동일 크기 비행 →
  // 도착 시 오버레이 숨김 + 주가 가로로 펼쳐짐(progress 1→0). "7.4주" 라벨 미표시.
  const handleReverseCommit = useCallback(
    (cellRect: LifeCellRect) => {
      const slot = weekSlotRef.current;
      const from = { left: cellRect.left, top: cellRect.top, width: cellRect.size, height: cellRect.size };
      const to = slot
        ? { left: slot.left, top: slot.top, width: cellRect.size, height: cellRect.size }
        : from;
      applyView("week");
      setProgress(1); // 주 뷰를 응축 상태로 마운트
      setReverseLanding(true); // 응축 박스를 숨김 — 비행 중엔 오버레이만 보이게
      flyOverlay(from, to, {
        variant: "border",
        label: "none",
        onFinish: () => {
          // 오버레이가 착지한 자리에 응축 박스를 드러낸 뒤, 다음 프레임에 펼친다
          setReverseLanding(false);
          requestAnimationFrame(() => requestAnimationFrame(() => setProgress(0))); // 펼침
          signalSettle(); // 다음 단계(주→시계 체이닝) 또는 부모 통지
        },
      });
    },
    [flyOverlay, setProgress, applyView, signalSettle]
  );
  // 역방향 취소 — 캔버스 스냅백은 LifeCalendar가 처리, 부모는 일생 유지
  const handleReverseCancel = useCallback(() => {}, []);

  // ── 하단 탭 → 뷰 전환 ──
  // 제스처와 **같은 함수**를 부른다(commitToLife / play / handleReverseCommit).
  // 연출을 따로 만들지 않으므로 탭으로 가든 밀어서 가든 화면이 동일하다.
  //
  // 인접 단계만 직접 전환할 수 있어서(주↔일생, 일생↔시계) 주↔시계는 2단 체이닝이다.
  // 각 전환의 "안정 지점"(비행 완료, phase가 clock/grid 도달)에서 settle()이
  // 다음 단계를 잇거나, 더 갈 곳이 없으면 부모에게 현재 뷰를 통지한다.
  const lifeRef = useRef<LifeCalendarHandle | null>(null);
  const pendingTargetRef = useRef<CalendarView | null>(null);
  // 부모(URL)와 마지막으로 합의된 뷰 — URL↔상태가 서로를 되돌리는 싸움을 막는다.
  // 초기값은 **실제 시작 뷰("week")**. requestedView로 두면 ?view=clock 으로 바로 들어왔을 때
  // "이미 도달했다"고 판단해 전환을 건너뛴다(화면은 주 캘린더인데 URL만 clock).
  const appliedViewRef = useRef<CalendarView>("week");

  // 지금 "도착해 있는" 뷰. 재생 중(toClock/toGrid)이면 null —
  // 그 사이 settle이 다음 단계를 시작해 버리면 중간 애니메이션이 잘린다
  // (시계→주에서 역재생 2.2초가 통째로 날아갔다).
  const readView = useCallback((): CalendarView | null => {
    if (viewRef.current !== "life") return "week";
    if (phaseRef.current === "clock") return "clock";
    if (phaseRef.current === "grid") return "life";
    return null;
  }, []);

  // 일생 → 주 (탭 경로). 제스처는 확대된 셀 사각형을 넘겨주지만 탭엔 그 단계가 없어
  // 칸 크기 그대로 비행한다. 주 뷰를 한 번도 마운트한 적이 없으면(URL 직접 진입)
  // 착지 위치를 모르므로 비행을 건너뛴다.
  const reverseToWeek = useCallback(() => {
    const rect = lifeRef.current?.getCellRect() ?? lifeCellRef.current;
    if (!rect || !weekSlotRef.current) {
      applyView("week");
      setProgress(0);
      signalSettle();
      return;
    }
    handleReverseCommit(rect);
  }, [applyView, setProgress, handleReverseCommit, signalSettle]);

  const settle = useCallback(() => {
    const cur = readView();
    if (cur === null) return; // 재생 중 — 끝나면 phase 통지가 신호를 준다
    const target = pendingTargetRef.current;
    if (target && target !== cur) {
      if (transitioningRef.current) return; // 이미 한 단계가 재생 중 — 끝나면 신호가 온다
      transitioningRef.current = true;
      if (cur === "week") commitToLife();
      else if (cur === "life") {
        if (target === "clock") lifeRef.current?.play(1);
        else reverseToWeek();
      } else {
        lifeRef.current?.play(0); // clock → life (목표가 week이면 다음 settle에서 이어간다)
      }
      return;
    }
    transitioningRef.current = false;
    pendingTargetRef.current = null;
    if (appliedViewRef.current !== cur) {
      appliedViewRef.current = cur;
      onViewChange?.(cur);
    }
  }, [readView, commitToLife, reverseToWeek, onViewChange]);
  // 신호가 오면 다음 단계를 잇는다. settle은 멱등이라(목표=현재면 통지만) 재실행이 안전하다.
  useEffect(() => {
    if (settleSignal === 0) return;
    // 다음 프레임에 — 직전 전환의 커밋과 같은 프레임에서 상태를 또 바꾸면 애니메이션이 튄다.
    // **cleanup으로 취소하지 않는다**: settle은 부모가 넘긴 onViewChange에 의존해
    // 렌더마다 재생성되는데, 그때마다 cleanup이 돌면 예약한 프레임이 매번 취소돼
    // 전환이 영영 시작되지 않는다. settle은 멱등이라 여러 번 불려도 안전하다.
    requestAnimationFrame(() => settle());
  }, [settleSignal, settle]);

  // LifeCalendar phase 통지 — 전환이 끝난 지점(clock/grid)에서만 다음 단계를 잇는다
  const handlePhaseChange = useCallback((p: LifePhase) => {
    phaseRef.current = p;
    setLifePhase(p);
    if (p === "clock" || p === "grid") signalSettle();
  }, [signalSettle]);

  // URL(하단 탭)이 요청한 뷰로 이동. 애니메이션 중 setState가 겹치지 않게 다음 프레임에.
  useEffect(() => {
    if (requestedView === appliedViewRef.current) return;
    appliedViewRef.current = requestedView;
    pendingTargetRef.current = requestedView;
    requestAnimationFrame(() => signalSettle());
  }, [requestedView, signalSettle]);

  // 셀을 어디 탭하든 **이번 주**를 연다. 주 이동은 시트 헤더의 ‹ › 로 한다.
  //
  // 예전엔 셀 인덱스를 날짜로 역산했는데, 그리드 열(1/1부터 고정 7일 블록)과
  // 일기의 주(일요일 시작)가 다른 좌표계라 현재 주 셀조차 한 주 어긋났다.
  // (2026-08-02 기준: 30열 → 역산 7/26 vs 실제 주 8/2) 그 탓에 오늘 일기가
  // 시트에서 사라지고 회고가 지난 주에 붙는 문제가 있었다. 역산을 없애 해소한다.
  const handleCellTap = useCallback(() => {
    openWeekSheet(getWeekStart(getTodayDateString()));
  }, [openWeekSheet]);

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


  const today = getTodayDateString();
  const selected = parseDateString(selectedDate);
  const selectedMonth = selected.getMonth();

  const dates = useMemo(
    () => (expanded ? buildMonthDates(selectedDate) : buildWeekDates(selectedDate)),
    [expanded, selectedDate]
  );

  const activeTodos = todos.filter((t) => !t.is_completed);
  const completedTodos = todos.filter((t) => t.is_completed);
  const showTodosSkeleton = useDelayedFlag(isLoadingTodos);
  // 빈 상태가 300ms 이상 지속될 때만 문구를 낸다
  const showEmptyTodos = useDelayedFlag(
    !isLoadingTodos && !isTodosError && activeTodos.length === 0 && completedTodos.length === 0
  );

  const isToday = selectedDate === today;
  const dateLabel = isToday
    ? "오늘"
    : `${selected.getMonth() + 1}월 ${selected.getDate()}일`;
  // 헤더 라벨: 항상 선택 날짜의 월을 그대로 — "이번달"은 몇 월인지 바로 안 읽힌다
  const headerLabel = `${selected.getMonth() + 1}월`;

  // 올해 경과 주차(0~51) → 일생 그리드의 현재 주 열 (착지 위치 정정)
  const weekOfYear = (() => {
    const t = parseDateString(today);
    const jan1 = new Date(t.getFullYear(), 0, 1);
    return Math.max(0, Math.min(51, Math.floor((t.getTime() - jan1.getTime()) / (7 * 86400000))));
  })();

  // 페이지별 타이틀 — 1페이지 "캘린더" / 2페이지 "1년 52주" / 3페이지 "100년/24시"
  const pageTitle =
    view === "life"
      ? lifePhase === "toClock" || lifePhase === "clock"
        ? "100년/24시"
        : "1년 52주"
      : FEATURE_NAMES.CALENDAR;

  // 스크럽 진행도 → 인라인 스타일 값 (피그마 34265:41826 순방향 / 34266:42703 역방향)
  //   ① 날짜가 오른쪽(토)부터 stagger로 소멸
  //   ② 컨테이너가 우→좌로 응축하면서 배경이 투명→회색→검정으로 차오른다
  //   ③ 응축이 충분히 진행되면 "M.n주" 라벨이 나타난다
  const dateOpacity = (col: number) => 1 - clamp01((progress - (6 - col) * 0.055) / 0.16);
  // 응축 진행도 — 날짜가 어느 정도 사라진 뒤(0.3) 시작해 1.0에서 COLLAPSED_W가 된다
  const collapseT = clamp01((progress - 0.3) / 0.7);
  // 배경 채움은 응축과 함께 (연회색 → 진회색 → 검정)
  const fillPct = Math.round(collapseT * 100);
  // 라벨은 배경이 충분히 어두워진 뒤 등장 — 흰 글씨가 회색 위에서 읽히는 시점
  const boxOpacity = clamp01((progress - 0.55) / 0.3);
  const borderAlpha = 0.4 * (1 - clamp01(progress / 0.9));
  // 화살표: 더 강하게(JSX 크기·색) + 거의 끝까지 잔존
  const arrowOpacity = (showArrow ? 1 : 0) * (1 - clamp01((progress - 0.78) / 0.22));
  const ARROW_TRAVEL = 76;
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
        <p className="text-sm font-medium text-foreground/70">{pageTitle}</p>
      </div>

      {/* 일생 뷰에선 이번달 발걸음/날짜 그리드 대신 5200주 조망만 */}
      {view === "life" ? (
        <LifeCalendar
          ref={lifeRef}
          age={age as number}
          userName={userName}
          weekOfYear={weekOfYear}
          animate
          // 제스처 데드존 제거: 섹션 상단(타이틀 행·py-4)을 음수 마진으로 덮고 같은 양의
          // 패딩으로 되밀어 히트 영역만 넓힌다. flex-1로 캔버스 아래 여백까지 포함 →
          // 52주 화면 어디서 밀어도 주 캘린더로 돌아온다. (렌더 위치는 그대로)
          className="-mt-9 flex-1 pt-9"
          entryDelayMs={FLIGHT_MS - 200}
          onReady={handleLifeReady}
          onReverseCommit={handleReverseCommit}
          onReverseCancel={handleReverseCancel}
          onPhaseChange={handlePhaseChange}
          onCellTap={handleCellTap}
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
        <div className="relative">
        {/* 응축 박스 — 스크럽하면 우→좌로 좁아지며 배경이 차오른다(피그마 3~5단계).
            날짜 그리드와 분리된 레이어라 날짜는 제자리에서 페이드되고 박스만 줄어든다.
            역방향 착지 전에는 숨긴다 — 안 그러면 오버레이가 도착하기도 전에
            목적지에 검은 박스가 앉아 있는 게 보인다. */}
        {!expanded && (
          <div
            ref={weekBorderRef}
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 rounded-xl border",
              !dragging && "transition-[width,background-color,opacity] duration-200"
            )}
            style={{
              width: `calc(100% * ${1 - collapseT} + ${COLLAPSED_W}px * ${collapseT})`,
              background: `color-mix(in srgb, var(--foreground) ${fillPct}%, transparent)`,
              borderColor: `color-mix(in srgb, var(--foreground) ${borderAlpha * 100}%, transparent)`,
              opacity: reverseLanding ? 0 : 1,
            }}
          />
        )}

        <div
          className={cn(
            "relative grid grid-cols-7 overflow-hidden transition-[max-height] duration-300",
            expanded ? "max-h-[19rem]" : "max-h-14 px-0.5"
          )}
        >
          {dates.map((dateStr, i) => {
            const d = parseDateString(dateStr);
            const inMonth = d.getMonth() === selectedMonth;
            const isSelected = dateStr === selectedDate;
            const isTodayCell = dateStr === today;
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
                          // 오늘 날짜는 테두리로 강조(선택 날짜는 fill 우선)
                          isTodayCell && "border border-foreground font-semibold",
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

          {/* 화살표(←) — 프레스/드래그 중에만. 더 강하게(크고 진하게)·오래 잔존. 우측(토 자리)→왼쪽 이동 */}
          {!expanded && (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 right-1 flex items-center text-foreground",
                !dragging && "transition-opacity duration-150"
              )}
              style={{ opacity: arrowOpacity, transform: `translateX(${-progress * ARROW_TRAVEL}px)` }}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M5 12l6-6M5 12l6 6" />
              </svg>
            </span>
          )}

          {/* "M. n주" 라벨 — 응축 박스 안(좌측). 박스가 배경을 담당하므로 글자만 얹는다.
              비행은 오버레이가 이어받는다. */}
          {!expanded && (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center text-xs font-medium",
                !dragging && "transition-opacity duration-200"
              )}
              style={{
                width: COLLAPSED_W,
                opacity: reverseLanding ? 0 : boxOpacity,
                color: "var(--background)",
              }}
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
        // 300ms 안에 끝나면 스켈레톤도 그리지 않는다(깜빡임 방지 — 앱 공통 정책)
        showTodosSkeleton ? (
          <div className="mt-3 flex flex-col gap-2 animate-pulse" aria-label="할 일 로딩 중">
            <div className="h-3 w-10 rounded bg-foreground/10" />
            <div className="h-10 w-full rounded-lg bg-foreground/10" />
            <div className="h-10 w-full rounded-lg bg-foreground/10" />
          </div>
        ) : null
      ) : isTodosError ? (
        <p className="mt-4 text-center text-xs text-foreground/45">
          할 일을 불러오지 못했어요.
        </p>
      ) : (
        <>
          {/* 빈 상태도 지연 표시 — 데이터가 곧 도착하는 상황에서 "없어요"가 스치면
              실제로 없는 것처럼 읽힌다. isLoading이 잠깐 false인 순간에 대한 방어. */}
          {activeTodos.length === 0 && completedTodos.length === 0 && showEmptyTodos && (
            <p className="mt-4 text-center text-xs text-foreground/45">
              {dateLabel}의 할 일이 없어요.
            </p>
          )}

          {activeTodos.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-foreground/55">{dateLabel}</p>
              <ul className="mt-1.5 flex flex-col gap-2">
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
              <ul className="mt-1.5 flex flex-col gap-2">
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

      {/* 비행 오버레이 — 색(fill/border)은 styleOverlay가 인라인 지정. 기본 숨김 */}
      <div
        ref={morphRef}
        aria-hidden
        style={{ display: "none" }}
        className="pointer-events-none fixed z-40 items-center justify-center overflow-hidden rounded-lg"
      >
        <span ref={morphLabelRef} className="whitespace-nowrap text-xs font-medium">
          {formatWeekOfMonth(selectedDate)}
        </span>
      </div>

      {/* 주간 시트 — 52주 셀 탭으로 열린다 (그 주 일기 7장 + 주간 회고) */}
      <WeekSheet
        key={sheetSeq}
        open={weekSheetStart !== null}
        onClose={() => {
          setWeekSheetStart(null);
          onCloseWeekSheet?.();
        }}
        initialWeekStart={lastWeekSheet}
        bucketId={bucketId}
        bucketTitle={bucketTitle}
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

      {/* 앞: 행 본문 — Pointer 드래그로 좌측 이동. data-todo-swipe: 페이저 스와이프 존에서 제외 */}
      <div
        data-todo-swipe
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={cn(
          // 카드 틴트·테두리 없음(피그마 32449:634). 다만 배경은 불투명해야 뒤의 삭제 버튼이
          // 비치지 않으므로 페이지 배경색을 그대로 깔아 시각적으로만 투명하게 만든다.
          "touch-pan-y rounded-lg bg-background px-2",
          !dragging && "transition-transform duration-200"
        )}
        // 완료 상태는 체크박스+취소선 텍스트로 표현(행 전체 opacity는 삭제 버튼이 비쳐서 제거)
        style={{ transform: `translateX(${offsetX}px)` }}
      >
        {/* 1행 — 20px 라인. 체크박스·메타를 h-5 items-center로 고정해
            타이틀이 2줄 이상으로 늘어나도 항상 "첫 줄" 중앙에 정렬된다. */}
        <div className="flex items-start gap-1">
          <button
            type="button"
            onClick={guardClick(() => onToggle(todo.id))}
            aria-pressed={isCompleted}
            aria-label={`${todo.title} ${isCompleted ? "완료 취소" : "완료"}`}
            // 상자는 20×20 — 타이틀 한 줄(leading-5)과 같은 높이라 2줄 이상이 돼도
            // 체크박스가 첫 줄 중앙에 선다. after 의사요소로 터치 타겟을 더 넓히되
            // 오른쪽으로는 넓히지 않아 타이틀 탭(수정)을 가로채지 않는다.
            className="relative flex h-5 w-5 shrink-0 items-center justify-center after:absolute after:-inset-y-2 after:-left-2 after:right-0 after:content-['']"
          >
            <span
              className={cn(
                "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                isCompleted
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/30 bg-transparent"
              )}
              aria-hidden
            >
              {isCompleted && (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
          </button>

          {/* 타이틀 — 탭하면 키보드 입력창으로 수정. leading-5로 한 줄 = 20px */}
          <button
            type="button"
            onClick={guardClick(() => onEdit(todo))}
            aria-label={`${todo.title} 수정`}
            className={cn(
              "min-w-0 flex-1 break-words text-left text-sm leading-5",
              isCompleted && "text-foreground/45 line-through"
            )}
          >
            {todo.title}
          </button>

          {(time || repeatLabel) && (
            <span className="flex h-5 shrink-0 items-center gap-1 text-[10px] text-foreground/40">
              {time && <span>{time}</span>}
              {repeatLabel && (
                <>
                  <RepeatIcon className="h-4 w-4" />
                  <span className="sr-only">{repeatLabel}</span>
                </>
              )}
            </span>
          )}
        </div>

        {/* 2행 — 세부정보 한 줄. pl-6(24px)로 타이틀과 좌측을 맞춘다(체크박스 20 + gap 4) */}
        {todo.detail && (
          <p className="mt-1 line-clamp-1 pl-6 text-xs leading-4 text-foreground/45">
            {todo.detail}
          </p>
        )}
      </div>
    </li>
  );
}
