"use client";

// 일생 캘린더 ↔ 인생시계 (피그마 32636-19161 그리드 / 32820-19323 timE 다이얼).
//
// 그리드→시계 morph는 **'주' 키오브젝트 1개의 여정**이다 (100라인 동시 이동은 눈이
// 못 따라간다는 피드백으로 폐기). 좌드래그 **스크럽**(손가락 추종)으로 전반부 진행:
//   EXIT   : 그리드가 오른쪽부터 페이드(역방향과 대칭), 현재 주 사각형이 **원으로
//            morph**하며 왼쪽 끝으로 이동
//   TURN-UP: 좌측 끝에서 쿼터 아크로 상향 전환 (여기부터 궤적 라인)
//   RISE   : 좌측 가장자리를 따라 원 꼭대기 높이(cy−R)까지 상승
//   TURN   : 좌상단 쿼터 아크
//   RUN    : 우향 이동 → 상단 중앙(cx) — 원 최상단(0시)에서 접선이 수평이라
//            직선 이동이 끊김 없이 원호로 이어진다 (스크럽 핸드오프 지점)
// 릴리스(임계 이상) 시 자동 재생:
//   WRAP   : 시계방향 360° — 지나간 자리에 눈금 점이 찍힌다(산/남은 2톤 유지),
//            직선 궤적은 페이드 아웃
//   DIAL   : 라벨(100세/50세) → 시침 → 분침 → 초침 (timE 디자인, 중심점 없음)
//
// 진행도는 ref + rAF(리액트 상태는 phase 전환점만). 5200칸은 오프스크린 프리렌더.
// prefers-reduced-motion이면 즉시 전환.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { computeLifeClock } from "@/components/auth/onboarding/utils";
import { cn } from "@/lib/utils";

const COLS = 52; // 한 해의 주 수(근사) — 한 줄이 1년
const ROWS = 100; // 100세
const GAP = 1; // 칸 간격(px)
const PAD_LEFT = 22; // 좌측 나이 라벨 여백
const PAD_TOP = 16; // 상단 여백
const LABEL_STEP = 5; // 그리드 라벨 간격(5단위)
const MIN_CELL = 4; // 칸 최소 크기(px)
const CLOCK_TOP_GAP = 24; // 인생시계 상단 여백(px) — 캔버스 상단에서 다이얼 꼭대기까지

// 여정 타임라인 경계 (p ∈ [0,1]) — 키오브젝트 1개가 경로를 그리며 원을 만든다
const ST_EXIT = 0.2; // 그리드 우측 페이드 + 사각형→원 morph·좌측 이동
const ST_TURNUP = 0.26; // 좌측 끝 쿼터 아크(상향 전환, 궤적 시작)
const ST_RISE = 0.42; // 좌측 가장자리 상승(세로 궤적)
const ST_TURN = 0.48; // 좌상단 쿼터 아크
const ST_RUN = 0.58; // 상단 중앙까지 우향(가로 궤적) — 스크럽 핸드오프
const ST_WRAP = 0.86; // 시계방향 360° 링 완성
const CORNER_R = 14; // 방향 전환 쿼터 아크 반경(px)

// 궤적 잔상 — 펜에서 멀어질수록 옅어진다(길 전체는 남는다)
const TRAIL_STEPS = 200; // 경로 샘플 수 (세그먼트 ~2px)
const TRAIL_HEAD_ALPHA = 0.55; // 펜 바로 뒤 알파
const TRAIL_MIN_ALPHA = 0.04; // 출발점 쪽 하한 — 완전히 지워지지는 않는다
const TRAIL_FALLOFF = 1.6; // 클수록 머리 쪽에 진함이 몰린다
const WRAP_DOT_GAP = 5; // WRAP 구간 점 꼬리 간격(px)
const DUR_FORWARD = 2400; // 릴리스 후 잔여 자동 재생 (전체 기준 ms, 잔여 비율 비례)
const DUR_REVERSE = 2200; // 시계 → 그리드 역재생(ms)
const SWIPE_FIRE_PX = 40; // 시계→그리드 트리거 임계

// forward(그리드→시계) 스크럽
const FWD_FULL = 220; // p=ST_RUN에 해당하는 좌드래그 거리
const FWD_COMMIT = 0.22; // 릴리스 커밋 임계(p)

// 역방향(일생→주) 스크럽
const REVERSE_FULL = 120; // r=1.0에 해당하는 우드래그 거리
const REVERSE_COMMIT = 0.42; // 릴리스 커밋 임계

// 스크럽 화살표 손가락 추종 이동폭(px) — 1페이지와 동일한 이동감
const ARROW_TRAVEL = 56;

// #rrggbb → rgba(문자열) (캔버스 그라디언트 알파용)
function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// 라운드 사각형 경로 — 칸(주)은 전부 이 헬퍼를 거친다.
// roundRect는 Safari 16.4+ 라 폴백을 둔다(각진 사각형으로 그려질 뿐 레이아웃은 동일).
function roundRectPath(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  c.beginPath();
  if (typeof c.roundRect === "function") {
    c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  } else {
    c.rect(x, y, w, h);
  }
}

const CELL_R = 2; // 주 칸 라운드(px)
// 지나간 주 색 — 최근 RECENT_FADE주만 그라디언트로 진하고, 그 이전은 PAST_ALPHA 한 톤.
// (현재 1.0 → 1주전 0.84 → 2주전 0.68 → 3주전 0.51 → 4주전부터 0.35)
const PAST_ALPHA = 0.35;
const RECENT_FADE = 4;

// 다이얼 스펙 (timE): 침은 중심에서 간격을 두고 시작
const HAND_INNER = 0.18; // 침 시작 반지름 비율
const HOUR_OUTER = 0.48;
const MINUTE_OUTER = 0.68;
const SECOND_OUTER = 0.82;
const DIAL_LABELS = [3, 6, 9, 15, 18, 21]; // 12(하단)는 진한 점만

export type LifePhase = "grid" | "toClock" | "clock" | "toGrid";

export interface LifeCellRect {
  /** 뷰포트 기준 현재 주 칸 사각형 */
  left: number;
  top: number;
  size: number;
}

/**
 * 외부(하단 탭)에서 전환을 시작하기 위한 명령형 핸들.
 * 제스처가 부르는 것과 **같은 함수**를 노출한다 — 연출이 갈리지 않게.
 */
export interface LifeCalendarHandle {
  /** 그리드(0) ↔ 시계(1) 재생. 제스처 릴리스 커밋과 동일 경로 */
  play: (target: 0 | 1) => void;
  /** 현재 주 칸의 뷰포트 사각형 — 일생→주 비행의 출발점 */
  getCellRect: () => LifeCellRect | null;
}

interface LifeCalendarProps {
  /** 현재 나이 (life_clock_age) */
  age: number;
  /** 시계 문구의 호칭 (display_name). 없으면 호칭 없이 표시 */
  userName?: string | null;
  /** 올해 경과 주차(0~51) — 현재 주 칸 = age×52 + weekOfYear (실제 현재 주 열에 위치) */
  weekOfYear?: number;
  /** 진입 시 순차 채움 애니메이션 여부 */
  animate: boolean;
  /** 현재 주 칸의 화면 좌표 — 주→일생 오버레이 비행 타겟 (그리드 상태 레이아웃 후 1회) */
  onReady?: (rect: LifeCellRect) => void;
  /** 페이저 역방향 스크럽: grid 우드래그 진행 통지(캔버스 연출은 내부에서, dx>0) */
  onReverseDrag?: (dx: number) => void;
  /** 역방향 커밋 — 확대된 현재 주 셀(키오브젝트) 뷰포트 사각형을 부모로 전달 */
  onReverseCommit?: (rect: LifeCellRect) => void;
  /** 역방향 취소(스냅백) */
  onReverseCancel?: () => void;
  /** 페이저 점 인덱스용 — 내부 phase 변경 통지 */
  onPhaseChange?: (phase: LifePhase) => void;
  /** 그리드 채움 시작 지연(ms) — 주→일생 오버레이 비행과 타이밍 동기화용 */
  entryDelayMs?: number;
  /**
   * 주 셀 탭 — 드래그가 아닌 짧은 탭일 때만. 미래 주(index > 현재)는 발화하지 않는다.
   * rect는 뷰포트 기준(그 자리에서 확대 연출을 이어가려는 부모용).
   */
  onCellTap?: (payload: { index: number; rect: LifeCellRect }) => void;
  /**
   * 루트 래퍼 클래스 (기본 "mt-3").
   * 제스처 핸들러가 이 래퍼에 붙으므로, 여백을 마진 대신 패딩으로 흡수하도록
   * 넘기면 그만큼 스와이프 가능한 영역이 넓어진다(래퍼 밖 마진은 히트 대상이 아니다).
   */
  className?: string;
}

function easeInOutCubic(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** 폭에서 파생되는 전체 지오메트리 (그리드 + 다이얼) */
function getLayout(width: number) {
  const pitch = Math.max(MIN_CELL + GAP, Math.floor((width - PAD_LEFT) / COLS));
  const cell = pitch - GAP;
  // 주 칸은 정사각이 아니라 **가로보다 1px 낮다**(예: 5×4). 100줄이라 세로 1px 차이가
  // 캔버스 높이 100px을 줄인다 — 화면 안에 담기게 하려는 의도.
  const cellH = Math.max(MIN_CELL - 1, cell - 1);
  const pitchY = cellH + GAP;
  const lineW = COLS * pitch; // 라인(1년) 전체 길이
  const cssWidth = PAD_LEFT + lineW;
  // 캔버스 높이는 100줄 그리드 기준 — 시계는 이보다 훨씬 작다(지름이 높이의 40%대).
  const cssHeight = PAD_TOP + ROWS * pitchY;
  const cx = cssWidth / 2;
  // 반지름은 폭에서만 정한다. 예전엔 `Math.min(폭항, cssHeight/2 - 50)`이었는데
  // 높이항은 실제 뷰포트에서 한 번도 선택되지 않는 죽은 조건이었다.
  const R = (cssWidth - 70) / 2;
  // 시계 세로 위치: 캔버스 정중앙(cssHeight/2)이면 그리드용 높이 한가운데라
  // 위아래로 각각 캔버스의 ~28%씩 빈 공간이 생겨 "가운데 떠 있는" 느낌이 났다.
  // → 상단 기준으로 올린다. cy - R = PAD_TOP + CLOCK_TOP_GAP 이 산식으로 보장된다.
  // (cy는 다이얼뿐 아니라 여정 경로의 상단 가로선 yT = cy - R 도 파생시키므로
  //  이 값만 바꾸면 전환 모션도 함께 올라가고 12시 접선 연속성은 그대로 유지된다.)
  const cy = PAD_TOP + CLOCK_TOP_GAP + R;
  return { pitch, cell, pitchY, cellH, lineW, cssWidth, cssHeight, cx, cy, R };
}

type Layout = ReturnType<typeof getLayout>;

export const LifeCalendar = forwardRef<LifeCalendarHandle, LifeCalendarProps>(function LifeCalendar(
  {
    age,
    userName,
    weekOfYear = 0,
    animate,
    onReady,
    onReverseDrag,
    onReverseCommit,
    onReverseCancel,
    onPhaseChange,
    entryDelayMs = 0,
    className,
    onCellTap,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const progressRef = useRef(0); // 0=그리드, 1=시계
  const drawRef = useRef<((p: number, entryRows?: number) => void) | null>(null);
  const drawExitRef = useRef<((r: number) => void) | null>(null); // 역방향 캔버스 연출
  const geomRef = useRef<{ curX: number; curY: number; cell: number; cellH: number; pitch: number } | null>(null); // 현재 칸 지오메트리
  const reverseRRef = useRef(0); // 현재 역방향 진행도
  const enteredRef = useRef(false); // 진입 채움 애니는 1회만
  const [reverseArrow, setReverseArrow] = useState(false); // 좌측 화살표(역방향)
  const [forwardArrow, setForwardArrow] = useState(false); // 우측 화살표(시계로 스크럽)
  const revArrowRef = useRef<HTMLSpanElement | null>(null); // 역방향 화살표 이동(손가락 추종)
  const fwdArrowRef = useRef<HTMLSpanElement | null>(null); // 여정 화살표 이동(손가락 추종)

  const [phase, setPhase] = useState<LifePhase>("grid");

  // 페이저 점 인덱스용 — phase 변경을 부모에 통지
  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  // 컨테이너 폭 → 셀 크기 반응형 (52열이 가로 스크롤 없이 다 보이게)
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 현재 주 = 나이×52 + 올해 경과 주차 → 실제 현재 주 열에 위치
  const weeksLived = Math.max(
    0,
    Math.min(COLS * ROWS, Math.floor(age) * COLS + Math.max(0, Math.min(COLS - 1, weekOfYear)))
  );
  const currentIndex = Math.min(weeksLived, COLS * ROWS - 1);
  // 렌더용 시각 (effect 안에서는 age로 재계산 — 객체 identity로 인한 재실행 방지)
  const clock = computeLifeClock(age);

  // 테마 색상 (라이트/다크 공통 — canvas는 CSS 변수를 직접 못 쓰므로 읽어온다)
  const readColors = useCallback(() => {
    const styles = getComputedStyle(document.documentElement);
    const fg = styles.getPropertyValue("--foreground").trim() || "#333333";
    const bg = styles.getPropertyValue("--background").trim() || "#ffffff";
    return { fg, bg };
  }, []);

  // ── 메인 셋업: 레이아웃/오프스크린 구성 + drawScene 정의 ──
  useEffect(() => {
    if (width <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context; // 비-null 좁힘 (중첩 클로저용)

    const L: Layout = getLayout(width);
    const { fg, bg } = readColors();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = L.cssWidth * dpr;
    canvas.height = L.cssHeight * dpr;
    canvas.style.width = `${L.cssWidth}px`;
    canvas.style.height = `${L.cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 시각 각도 (인생시계) — 상단이 0시, 시계방향. age로 재계산 (객체 dep 회피)
    const c = computeLifeClock(age);
    const hourAngle = c ? ((c.hour24 + c.minute / 60) / 24) * 360 : 0;
    const minuteAngle = c ? ((c.minute + c.second / 60) / 60) * 360 : 0;
    const secondAngle = c ? (c.second / 60) * 360 : 0;
    const polar = (radius: number, angleDeg: number) => {
      const rad = ((angleDeg - 90) * Math.PI) / 180;
      return { x: L.cx + radius * Math.cos(rad), y: L.cy + radius * Math.sin(rad) };
    };

    // ── 오프스크린 프리렌더 (그리드 정적 레이어 2장) ──
    const makeLayer = () => {
      const c = document.createElement("canvas");
      c.width = L.cssWidth * dpr;
      c.height = L.cssHeight * dpr;
      const x = c.getContext("2d");
      if (x) x.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { c, x };
    };
    const cellXY = (index: number) => ({
      x: PAD_LEFT + (index % COLS) * L.pitch,
      y: PAD_TOP + Math.floor(index / COLS) * L.pitchY,
    });

    // 레이어 1: 남은 주 테두리 + 나이 라벨
    const rest = makeLayer();
    if (rest.x) {
      rest.x.strokeStyle = fg;
      rest.x.globalAlpha = 0.25;
      rest.x.lineWidth = 1;
      for (let i = weeksLived; i < COLS * ROWS; i++) {
        if (i === currentIndex) continue;
        const { x, y } = cellXY(i);
        roundRectPath(rest.x, x + 0.5, y + 0.5, L.cell, L.cellH, CELL_R);
        rest.x.stroke();
      }
      rest.x.globalAlpha = 0.4;
      rest.x.fillStyle = fg;
      rest.x.font = "7px sans-serif";
      rest.x.textBaseline = "middle";
      rest.x.textAlign = "right";
      for (let r = LABEL_STEP; r <= ROWS; r += LABEL_STEP) {
        rest.x.fillText(String(r), PAD_LEFT - 4, PAD_TOP + (r - 1) * L.pitchY + L.cellH / 2);
      }
      rest.x.globalAlpha = 1;
    }

    // 레이어 2: 산 주 채움 + 현재 주 강조.
    // 최근일수록 진하다 — 현재 주(1.0)에서 RECENT_FADE주에 걸쳐 옅어지다가
    // 그보다 오래된 주는 전부 PAST_ALPHA로 평평해진다(옛 기록은 한 톤).
    const lived = makeLayer();
    if (lived.x) {
      lived.x.fillStyle = fg;
      for (let i = 0; i < weeksLived; i++) {
        if (i === currentIndex) continue;
        const weeksAgo = currentIndex - i;
        lived.x.globalAlpha =
          weeksAgo >= RECENT_FADE
            ? PAST_ALPHA
            : PAST_ALPHA + (1 - PAST_ALPHA) * (1 - weeksAgo / RECENT_FADE);
        const { x, y } = cellXY(i);
        roundRectPath(lived.x, x, y, L.cell, L.cellH, CELL_R);
        lived.x.fill();
      }
      lived.x.globalAlpha = 1;
      const cur = cellXY(currentIndex);
      roundRectPath(lived.x, cur.x, cur.y, L.cell, L.cellH, CELL_R);
      lived.x.fill();
      // 현재 주 강조 링 — 셀에서 2px 간격 + 2px 라인.
      // 칸보다 3px 바깥이므로 반경도 그만큼 키워 곡률을 맞춘다.
      lived.x.strokeStyle = fg;
      lived.x.lineWidth = 2;
      roundRectPath(lived.x, cur.x - 3, cur.y - 3, L.cell + 6, L.cellH + 6, CELL_R + 3);
      lived.x.stroke();
    }

    // 역방향 커밋용 지오메트리(현재 칸)
    const curCell = cellXY(currentIndex);
    geomRef.current = { curX: curCell.x, curY: curCell.y, cell: L.cell, cellH: L.cellH, pitch: L.pitch };

    // ── 그리기 프리미티브 ──

    // 그리드 (entryRows: 진입 채움 애니 — 위에서부터 몇 행까지 lived를 보일지)
    function drawGrid(alpha: number, entryRows: number = ROWS) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(rest.c, 0, 0, L.cssWidth, L.cssHeight);
      const clipH = Math.min(L.cssHeight, PAD_TOP + entryRows * L.pitchY);
      ctx.drawImage(
        lived.c,
        0, 0, L.cssWidth * dpr, clipH * dpr,
        0, 0, L.cssWidth, clipH
      );
      ctx.globalAlpha = 1;
    }

    // ── 둘레는 선이 아니라 점 ──
    // 원이 지나간 자리에 15°마다 눈금 점이 하나씩 찍히고, 한 바퀴 돌면 그게 곧
    // 시계 테두리가 된다(링을 그렸다가 점으로 바꾸던 중간 단계를 없앴다).
    const livedAngle = (weeksLived / (COLS * ROWS)) * 360;

    // 링이 쓰던 산/남은 2톤을 점이 이어받는다. 0시·12시는 항상 강조.
    function tickAlpha(h: number): number {
      if (h === 0 || h === 12) return 1;
      return (h / 24) * 360 <= livedAngle ? 0.45 : 0.2;
    }

    function drawTicks(sweepDeg: number, alphaMul: number) {
      if (alphaMul <= 0) return;
      ctx.fillStyle = fg;
      for (let h = 0; h < 24; h++) {
        const a = (h / 24) * 360;
        if (a > sweepDeg) continue;
        const pos = polar(L.R, a);
        // 막 지나간 눈금은 살짝 부풀었다 제자리로 — "찍히는" 느낌
        const settle = clamp01((sweepDeg - a) / 12);
        const r = (h === 0 || h === 12 ? 2 : 1.25) * (1 + 0.8 * (1 - settle));
        ctx.globalAlpha = tickAlpha(h) * alphaMul;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 눈금 사이 — 펜 뒤로 남는 점 꼬리. 직선 궤적과 같은 거리 페이드를 쓴다.
    function drawWrapTail(sweepDeg: number, alphaMul: number) {
      const arcLen = (sweepDeg / 360) * 2 * Math.PI * L.R;
      if (arcLen < WRAP_DOT_GAP || alphaMul <= 0) return;
      ctx.fillStyle = fg;
      const count = Math.floor(arcLen / WRAP_DOT_GAP);
      for (let i = 1; i <= count; i++) {
        const back = i * WRAP_DOT_GAP;
        const behind = back / arcLen; // 0=펜 근처, 1=시작점
        const pos = polar(L.R, sweepDeg - (back / (2 * Math.PI * L.R)) * 360);
        ctx.globalAlpha =
          alphaMul * Math.max(TRAIL_MIN_ALPHA, TRAIL_HEAD_ALPHA * Math.pow(1 - behind, TRAIL_FALLOFF));
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ── 키오브젝트 여정 경로 (EXIT → TURN-UP → RISE → TURN → RUN → WRAP) ──
    // 좌측 세로축 x, 상단 가로축 y(=원 꼭대기). 원 최상단에서 접선이 수평이라
    // RUN 직선이 WRAP 원호로 끊김 없이 이어진다.
    const keyR = Math.max(3.5, 0.75 * L.pitch); // 키오브젝트(원) 반지름 — 칸보다 조금 큰 정도
    const xL = PAD_LEFT + keyR; // 좌측 세로 경로 x (원이 잘리지 않게 반지름만큼 안쪽)
    const yT = L.cy - L.R; // 상단 가로 경로 y = 원 꼭대기
    const kStart = { x: curCell.x + L.cell / 2, y: curCell.y + L.cellH / 2 }; // 현재 주 칸 중심
    const rcDeg = (a: number) => (a * Math.PI) / 180;
    // 쿼터 아크 포인트: 중심 C, 반지름 r, 각도 a(도) — canvas 기준(0=+x, 90=+y↓)
    const arcPt = (C: { x: number; y: number }, r: number, a: number) => ({
      x: C.x + r * Math.cos(rcDeg(a)),
      y: C.y + r * Math.sin(rcDeg(a)),
    });
    const C1 = { x: xL + CORNER_R, y: kStart.y - CORNER_R }; // 좌하단 전환(좌향→상향)
    const C2 = { x: xL + CORNER_R, y: yT + CORNER_R }; // 좌상단 전환(상향→우향)

    // p(0..ST_RUN) → 펜 중심 좌표
    function penAt(p: number): { x: number; y: number } {
      if (p <= ST_EXIT) {
        const t = easeInOutCubic(clamp01(p / ST_EXIT));
        return { x: kStart.x + (C1.x - kStart.x) * t, y: kStart.y };
      }
      if (p <= ST_TURNUP) {
        const t = clamp01((p - ST_EXIT) / (ST_TURNUP - ST_EXIT));
        return arcPt(C1, CORNER_R, 90 + 90 * t); // (xL+rc, y0) → (xL, y0-rc)
      }
      if (p <= ST_RISE) {
        const t = easeInOutCubic(clamp01((p - ST_TURNUP) / (ST_RISE - ST_TURNUP)));
        const y0 = C1.y;
        const y1 = C2.y;
        return { x: xL, y: y0 + (y1 - y0) * t };
      }
      if (p <= ST_TURN) {
        const t = clamp01((p - ST_RISE) / (ST_TURN - ST_RISE));
        return arcPt(C2, CORNER_R, 180 + 90 * t); // (xL, yT+rc) → (xL+rc, yT)
      }
      const t = easeInOutCubic(clamp01((p - ST_TURN) / (ST_RUN - ST_TURN)));
      return { x: C2.x + (L.cx - C2.x) * t, y: yT };
    }

    // 지나간 궤적(2px) — 경로(penAt)를 조밀하게 샘플한 폴리라인.
    //
    // 왜 구간별 stroke가 아니라 샘플링인가: 아크·직선을 각각 그리면 접합부가 두 번
    // 칠해져 **꺾이는 지점만 진해졌다**. 짧은 선분을 butt cap으로 이어 그리면 겹침이
    // 없다(곡률 구간의 틈은 세그먼트가 촘촘해 눈에 띄지 않는다).
    // 알파는 펜에서 뒤로 떨어진 거리로 정한다 — 원 근처가 진하고 뒤로 갈수록 옅어져
    // "지나간 자리"로 읽힌다. 출발점(p=0)부터 샘플하므로 좌향 이동 구간에도 궤적이 남고,
    // 역재생(시계→그리드)은 같은 산식이 뒤집혀 적용된다.
    function drawTrail(p: number, alpha: number) {
      const pEnd = Math.min(p, ST_RUN);
      if (pEnd <= 0 || alpha <= 0) return;

      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= TRAIL_STEPS; i++) pts.push(penAt((pEnd * i) / TRAIL_STEPS));

      const segLen: number[] = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        segLen.push(d);
        total += d;
      }
      if (total < 1) return;

      ctx.strokeStyle = fg;
      ctx.lineWidth = 2;
      ctx.lineCap = "butt";
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        acc += segLen[i - 1];
        const behind = (total - acc) / total; // 0=펜 바로 뒤, 1=출발점
        ctx.globalAlpha =
          alpha * Math.max(TRAIL_MIN_ALPHA, TRAIL_HEAD_ALPHA * Math.pow(1 - behind, TRAIL_FALLOFF));
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
    }

    // 키오브젝트(펜) — EXIT 동안 사각형→원 morph + 크기 전환, 이후 원
    function drawPen(pos: { x: number; y: number }, morph: number, alpha: number) {
      if (alpha <= 0) return;
      ctx.fillStyle = fg;
      ctx.globalAlpha = alpha;
      const half = (L.cell / 2) * (1 - morph) + keyR * morph;
      // 그리드 칸과 같은 라운드(2px)에서 출발해 완전한 원(half)까지 — 0에서 시작하면
      // 칸이 각져 보여 morph 첫 프레임이 튄다
      const radius = CELL_R + (half - CELL_R) * morph;
      roundRectPath(ctx, pos.x - half, pos.y - half, half * 2, half * 2, radius);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 여정 합성 (0 < p < ST_WRAP: 스크럽 구간+링) — DIAL은 drawScene에서
    function drawJourney(p: number) {
      // 그리드: EXIT 동안 오른쪽부터 페이드(역방향 drawExit와 대칭), 이후 소멸
      const ex = clamp01(p / ST_EXIT);
      if (ex < 1) {
        drawGrid(1);
        const grad = ctx.createLinearGradient(0, 0, L.cssWidth, 0);
        grad.addColorStop(0, hexToRgba(bg, clamp01(ex * 2 - 1)));
        grad.addColorStop(1, hexToRgba(bg, clamp01(ex * 2)));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, L.cssWidth, L.cssHeight);
      }

      if (p <= ST_RUN) {
        // 스크럽 구간: 궤적 + 펜
        drawTrail(p, 1);
        drawPen(penAt(p), clamp01(p / ST_EXIT), 1);
        return;
      }

      // WRAP: 상단 중앙에서 접선 연속으로 시계방향 한 바퀴. 직선 궤적은 전반부 페이드 아웃
      const w = clamp01((p - ST_RUN) / (ST_WRAP - ST_RUN));
      const sweep = 360 * easeInOutCubic(w);
      drawTrail(ST_RUN, 1 - clamp01(w / 0.4));
      drawWrapTail(sweep, 1);
      drawTicks(sweep, 1);
      const penPos = polar(L.R, sweep);
      drawPen(penPos, 1, 1 - clamp01((sweep - 330) / 30)); // 완성 직전 페이드
    }

    // D단계: 링 → 시계 (점 테두리·라벨 → 중심점 → 시침 → 분침 → 초침)
    function drawDial(d: number) {
      const chrome = clamp01(d / 0.3); // 라벨 페이드인
      // 테두리 점은 WRAP에서 이미 다 찍혔다 — 같은 알파로 이어받아 전환 점프가 없다
      drawTicks(360, 1);

      // 라벨 — 위아래로 100세(0시)·50세(12시) + 3·6·9·15·18·21.
      // 24시간이 100년이므로 반 바퀴가 곧 50세다.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "11px sans-serif";
      ctx.globalAlpha = chrome;
      const top = polar(L.R * 0.82, 0);
      ctx.fillText("100세", top.x, top.y);
      const bottom = polar(L.R * 0.82, 180);
      ctx.fillText("50세", bottom.x, bottom.y);
      ctx.globalAlpha = 0.4 * chrome;
      for (const h of DIAL_LABELS) {
        const pos = polar(L.R * 0.82, (h / 24) * 360);
        ctx.fillText(String(h), pos.x, pos.y);
      }
      ctx.globalAlpha = 1;

      // 중심점은 두지 않는다 — 침이 HAND_INNER(0.18R)에서 시작해 가운데가 비어도
      // 형태가 유지되고, 비워 두는 편이 일반 시계와 구분된다.

      // 침 — 중심과 간격(HAND_INNER)을 두고 안→밖으로 grow (timE 디자인)
      function drawHand(t: number, angle: number, outer: number, widthPx: number, alpha: number) {
        if (t <= 0) return;
        const r0 = L.R * HAND_INNER;
        const r1 = r0 + (L.R * outer - r0) * easeInOutCubic(t);
        const p0 = polar(r0, angle);
        const p1 = polar(r1, angle);
        ctx.strokeStyle = fg;
        ctx.lineWidth = widthPx;
        ctx.lineCap = "round";
        ctx.globalAlpha = alpha * t;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      drawHand(clamp01((d - 0.3) / 0.25), hourAngle, HOUR_OUTER, 4, 1);
      drawHand(clamp01((d - 0.5) / 0.25), minuteAngle, MINUTE_OUTER, 2, 0.7);
      drawHand(clamp01((d - 0.7) / 0.25), secondAngle, SECOND_OUTER, 1.5, 0.3);
    }

    // ── 타임라인 합성 ──
    function drawScene(p: number, entryRows: number = ROWS) {
      ctx.clearRect(0, 0, L.cssWidth, L.cssHeight);
      if (p <= 0) {
        drawGrid(1, entryRows);
        return;
      }
      if (p < ST_WRAP) {
        drawJourney(p);
      } else {
        drawDial((p - ST_WRAP) / (1 - ST_WRAP));
      }
    }
    drawRef.current = drawScene;

    // ── 역방향(일생→주) 연출: 그리드 왼쪽부터 페이드 + 현재 주 셀 1→3×3 확대 ──
    function drawExit(r: number) {
      ctx.clearRect(0, 0, L.cssWidth, L.cssHeight);
      drawGrid(1); // 전체 그리드
      // 왼쪽부터 페이드 — 배경색 좌→우 그라디언트(좌측 알파 선행)
      const grad = ctx.createLinearGradient(0, 0, L.cssWidth, 0);
      grad.addColorStop(0, hexToRgba(bg, clamp01(r * 1.7)));
      grad.addColorStop(1, hexToRgba(bg, clamp01(r * 1.7 - 1)));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, L.cssWidth, L.cssHeight);
      // 현재 주 셀(키오브젝트) 확대 — 셀 중심 기준 1 → ~3×3
      const cx0 = curCell.x + L.cell / 2;
      const cy0 = curCell.y + L.cellH / 2;
      const side = L.cell + (3 * L.pitch - L.cell) * easeInOutCubic(r);
      ctx.fillStyle = fg;
      ctx.globalAlpha = 1;
      // 라운드도 확대 비율만큼 — 커지면서 각져 보이지 않게
      roundRectPath(ctx, cx0 - side / 2, cy0 - side / 2, side, side, (CELL_R * side) / L.cell);
      ctx.fill();
    }
    drawExitRef.current = drawExit;

    // ── 초기 렌더 ──
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    let entryTimer: ReturnType<typeof setTimeout> | null = null;
    if (progressRef.current === 0 && animate && !enteredRef.current) {
      // 진입 채움 애니 (행 단위 순차 — 1회만).
      // entryDelayMs 동안은 빈 그리드(라벨+남은 주만) 상태 → 오버레이 비행과 동기화
      enteredRef.current = true;
      let row = 0;
      const ROWS_PER_FRAME = 3;
      const step = () => {
        row += ROWS_PER_FRAME;
        drawScene(0, row);
        if (row < ROWS) rafRef.current = requestAnimationFrame(step);
      };
      drawScene(0, 0);
      if (entryDelayMs > 0) {
        entryTimer = setTimeout(() => {
          rafRef.current = requestAnimationFrame(step);
        }, entryDelayMs);
      } else {
        rafRef.current = requestAnimationFrame(step);
      }
    } else {
      drawScene(progressRef.current);
    }

    // 오버레이 비행 타겟 — 그리드 상태에서만 의미 (현재 주 칸 뷰포트 좌표)
    if (onReady && progressRef.current === 0) {
      const rect = canvas.getBoundingClientRect();
      const cur = cellXY(currentIndex);
      onReady({ left: rect.left + cur.x, top: rect.top + cur.y, size: L.cell });
    }

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (entryTimer != null) clearTimeout(entryTimer);
    };
  }, [age, animate, weeksLived, currentIndex, onReady, readColors, width, entryDelayMs]);

  // ── 재생기: 그리드(0) ↔ 시계(1) ──
  const play = useCallback((target: 0 | 1) => {
    const draw = drawRef.current;
    if (!draw) return;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      progressRef.current = target;
      draw(target);
      setPhase(target === 1 ? "clock" : "grid");
      return;
    }

    setPhase(target === 1 ? "toClock" : "toGrid");
    const from = progressRef.current;
    // 스크럽 도중 릴리스 등 중간 지점에서 시작하면 잔여 비율만큼만 재생
    const dur =
      (target === 1 ? DUR_FORWARD : DUR_REVERSE) * Math.max(0.15, Math.abs(target - from));
    const t0 = performance.now();
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / dur);
      progressRef.current = from + (target - from) * easeInOutCubic(u);
      draw(progressRef.current);
      if (u < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPhase(target === 1 ? "clock" : "grid");
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // 현재 주 칸의 뷰포트 사각형 — 하단 탭으로 일생→주를 누를 때 비행 출발점이 된다.
  // 제스처 경로는 우드래그 진행도만큼 셀을 확대해서 넘기지만(drawExit), 탭에는
  // 확대 단계가 없으므로 칸 크기 그대로 준다.
  const getCellRect = useCallback((): LifeCellRect | null => {
    const canvas = canvasRef.current;
    const geom = geomRef.current;
    if (!canvas || !geom) return null;
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left + geom.curX, top: rect.top + geom.curY, size: geom.cell };
  }, []);

  useImperativeHandle(ref, () => ({ play, getCellRect }), [play, getCellRect]);

  // ── 스와이프 (터치+마우스, 가로 우세 시만 — 세로 스크롤 양보) ──
  // grid: 좌드래그 = 시계로 **스크럽**(여정 전반부 손가락 추종) / 우드래그 = 주 복귀 스크럽
  // clock: 우드래그 = 그리드로(트리거)
  const gesture = useRef<{
    x: number;
    y: number;
    active: boolean;
    fired: boolean;
    forwarding: boolean; // 우드래그: 주 복귀 스크럽 중
    fwdScrub: boolean; // 좌드래그: 시계로 여정 스크럽 중
    moved: boolean; // 임계 이상 움직였는가 — 탭/드래그 구분 (TodoRow guardClick과 같은 방식)
    t: number; // 시작 시각 — 길게 누른 뒤 뗀 것은 탭으로 보지 않는다
  } | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      active: true,
      fired: false,
      forwarding: false,
      fwdScrub: false,
      moved: false,
      t: performance.now(),
    };
  }
  function handlePointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g?.active) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    // 스크럽 캡처 임계(8px)와 같은 값 — 캡처된 제스처는 항상 moved가 서고,
    // 세로 스크롤로 양보된 경우에도 서서 스크롤 끝의 오탭을 막는다.
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) g.moved = true;

    // 이미 역방향 스크럽 중이면 캔버스를 손가락 따라 갱신
    if (g.forwarding) {
      const r = clamp01(dx / REVERSE_FULL);
      reverseRRef.current = r;
      drawExitRef.current?.(r);
      if (revArrowRef.current) revArrowRef.current.style.transform = `translateX(${r * ARROW_TRAVEL}px)`;
      onReverseDrag?.(dx);
      return;
    }
    // 시계로 여정 스크럽 중 — p(0..ST_RUN) 추종
    if (g.fwdScrub) {
      const p = clamp01(-dx / FWD_FULL) * ST_RUN;
      progressRef.current = p;
      drawRef.current?.(p);
      if (fwdArrowRef.current) fwdArrowRef.current.style.transform = `translateX(${-(p / ST_RUN) * ARROW_TRAVEL}px)`;
      return;
    }
    if (g.fired) return;

    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
      g.active = false; // 세로 스크롤에 양보
      return;
    }
    // grid에서 우드래그 시작 → 역방향(주 복귀) 스크럽
    if (phase === "grid" && dx > 8 && dx > Math.abs(dy)) {
      g.forwarding = true;
      // 진입 채움 등 진행 중인 rAF가 캔버스를 덮어쓰지 않도록 중단
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      setReverseArrow(true);
      const r = clamp01(dx / REVERSE_FULL);
      reverseRRef.current = r;
      drawExitRef.current?.(r);
      if (revArrowRef.current) revArrowRef.current.style.transform = `translateX(${r * ARROW_TRAVEL}px)`;
      onReverseDrag?.(dx);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* 합성 포인터 등에선 무시 */
      }
      return;
    }
    // grid에서 좌드래그 시작 → 시계로 여정 스크럽 (구 트리거 대체)
    if (phase === "grid" && dx < -8 && Math.abs(dx) > Math.abs(dy)) {
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        g.fired = true;
        play(1); // reduced: 즉시 전환
        return;
      }
      g.fwdScrub = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      setForwardArrow(true);
      setPhase("toClock"); // 페이저 점 3 강조
      progressRef.current = clamp01(-dx / FWD_FULL) * ST_RUN;
      drawRef.current?.(progressRef.current);
      if (fwdArrowRef.current)
        fwdArrowRef.current.style.transform = `translateX(${-(progressRef.current / ST_RUN) * ARROW_TRAVEL}px)`;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* 합성 포인터 등에선 무시 */
      }
      return;
    }
    if (Math.abs(dx) >= SWIPE_FIRE_PX && Math.abs(dx) > Math.abs(dy)) {
      g.fired = true;
      if (phase === "clock" && dx > 0) play(0);
    }
  }
  function handlePointerEnd(e: React.PointerEvent) {
    const g = gesture.current;
    if (gesture.current) gesture.current.active = false;
    if (!g) return;

    // 여정 스크럽 릴리스 — 임계 이상이면 잔여(링+다이얼) 자동 재생, 미만이면 스냅백
    if (g.fwdScrub) {
      setForwardArrow(false);
      if (fwdArrowRef.current) fwdArrowRef.current.style.transform = "translateX(0)"; // 페이드 하에 원위치
      const p = clamp01(-(e.clientX - g.x) / FWD_FULL) * ST_RUN;
      progressRef.current = p;
      if (p >= FWD_COMMIT) {
        play(1);
      } else {
        const from = p;
        const t0 = performance.now();
        const tick = (now: number) => {
          const u = Math.min(1, (now - t0) / 220);
          const pp = from * (1 - u);
          progressRef.current = pp;
          drawRef.current?.(pp);
          if (u < 1) {
            rafRef.current = requestAnimationFrame(tick);
          } else {
            progressRef.current = 0;
            drawRef.current?.(0);
            setPhase("grid");
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      }
      return;
    }

    // ── 탭(주 셀 선택) ── 스크럽이 아니었던 릴리스만 여기까지 온다.
    // 캔버스 좌표로 역산해 셀 인덱스를 구하고 부모에 올린다(미래 주는 무시).
    if (
      !g.forwarding &&
      !g.moved &&
      !g.fired &&
      phase === "grid" &&
      e.type === "pointerup" &&
      performance.now() - g.t < 500 &&
      onCellTap
    ) {
      const canvas = canvasRef.current;
      if (canvas && width > 0) {
        const L = getLayout(width);
        // 래퍼가 아니라 캔버스 rect 기준 — 래퍼는 -mt-9 pt-9로 넓혀져 있다.
        // CSS px = 레이아웃 px라 DPR 보정은 필요 없다.
        const rect = canvas.getBoundingClientRect();
        const col = Math.floor((e.clientX - rect.left - PAD_LEFT) / L.pitch);
        const row = Math.floor((e.clientY - rect.top - PAD_TOP) / L.pitchY);
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
          // 어느 셀이든 부모가 "이번 주"를 연다 — 미래/과거를 가릴 이유가 없다.
          // (셀 위치를 날짜로 역산하지 않으므로 index는 참고용으로만 넘긴다)
          const index = row * COLS + col;
          const cellLeft = rect.left + PAD_LEFT + col * L.pitch;
          const cellTop = rect.top + PAD_TOP + row * L.pitchY;
          onCellTap({ index, rect: { left: cellLeft, top: cellTop, size: L.cell } });
          return;
        }
      }
    }

    if (!g.forwarding) return;
    setReverseArrow(false);
    if (revArrowRef.current) revArrowRef.current.style.transform = "translateX(0)"; // 페이드 하에 원위치
    const r = clamp01((e.clientX - g.x) / REVERSE_FULL);
    if (r >= REVERSE_COMMIT) {
      // 확대된 현재 주 셀(키오브젝트) 뷰포트 사각형을 부모에 전달 → 주로 비행
      const canvas = canvasRef.current;
      const geom = geomRef.current;
      if (canvas && geom) {
        const rect = canvas.getBoundingClientRect();
        const cx0 = geom.curX + geom.cell / 2;
        const cy0 = geom.curY + geom.cellH / 2;
        const side = geom.cell + (3 * geom.pitch - geom.cell) * r;
        onReverseCommit?.({ left: rect.left + cx0 - side / 2, top: rect.top + cy0 - side / 2, size: side });
      } else {
        onReverseCommit?.({ left: 0, top: 0, size: 0 });
      }
    } else {
      // 스냅백 — r → 0 애니메이션 후 정상 그리드
      onReverseCancel?.();
      const from = reverseRRef.current;
      const t0 = performance.now();
      const tick = (now: number) => {
        const u = Math.min(1, (now - t0) / 200);
        const rr = from * (1 - u);
        reverseRRef.current = rr;
        if (rr <= 0.001) {
          drawRef.current?.(0);
        } else {
          drawExitRef.current?.(rr);
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  }

  // 메시지 오버레이 위치 (다이얼 아래) — draw와 동일한 레이아웃 산식
  const layout = width > 0 ? getLayout(width) : null;
  const messageTop = layout ? layout.cy + layout.R + 20 : 0;

  const showClockChrome = phase === "clock" && !!clock; // 시계 완성 후 메시지

  // "24시간으로 보면 OO님은 오전 10시 04분입니다." (이름이 없으면 호칭 없이)
  // "24시간으로 보면 OOO님은" / "Am 10시 04분입니다." — 두 줄로 끊어 보여준다.
  // 오전/오후 대신 Am/Pm. computeLifeClock의 label은 대시보드 "나의 시간"이 쓰므로 건드리지 않고
  // 여기서만 파생한다.
  const messageLines = clock
    ? [
        `24시간으로 보면 ${userName ? `${userName}님은` : "당신은"}`,
        `${clock.hour24 < 12 ? "Am" : "Pm"} ${clock.hour12}시 ${String(clock.minute).padStart(2, "0")}분입니다.`,
      ]
    : [];
  const message = messageLines.join(" "); // aria-label용(한 줄)

  return (
    <div
      ref={wrapRef}
      className={cn("relative", className ?? "mt-3")}
      style={{ touchAction: "pan-y" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {/* 캔버스 + 캔버스 좌표계를 쓰는 오버레이.
          relative 컨테이너로 감싸 absolute 자식의 원점을 캔버스 좌상단에 맞춘다 —
          래퍼에 직접 걸면 캡션 행·상단 패딩만큼 어긋난다. */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          aria-label={
            phase === "clock"
              ? `인생시계 — ${message}`
              : `일생 캘린더 — ${weeksLived}주 지남`
          }
        />

        {/* 인생시계 메시지 — 글자 하나하나 stagger (다이얼 아래 오버레이) */}
        {showClockChrome && (
          <div
            className="pointer-events-none absolute inset-x-0 flex flex-col items-center gap-3 px-4 text-center"
            style={{ top: messageTop }}
          >
            <p className="text-lg font-medium leading-snug text-foreground/85">
              {messageLines.map((line, lineIdx) => {
                // 줄이 바뀌어도 stagger 지연은 이어진다
                const offset = messageLines
                  .slice(0, lineIdx)
                  .reduce((n, prev) => n + prev.length, 0);
                return (
                  <span key={lineIdx} className="block">
                    {[...line].map((ch, i) => (
                      <span
                        key={i}
                        className="inline-block animate-[char-rise_0.45s_ease_both]"
                        style={{ animationDelay: `${(offset + i) * 45}ms` }}
                      >
                        {/* 글자마다 inline-block이라 보통 공백은 무너진다 → nbsp */}
                        {ch === " " ? "\u00A0" : ch}
                      </span>
                    ))}
                  </span>
                );
              })}
            </p>
          </div>
        )}
      </div>

      {/* 역방향(주 복귀) 화살표(→) — 우드래그(프레스) 중에만, 좌측 상단.
          1페이지와 동일한 모양·색(strokeWidth 2.5, 풀 강도) + 손가락 따라 우측 이동(transform은 imperative) */}
      <span
        ref={revArrowRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1 top-16 text-foreground transition-opacity duration-150",
          reverseArrow ? "opacity-100" : "opacity-0"
        )}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M19 12l-6-6M19 12l-6 6" />
        </svg>
      </span>

      {/* 시계로 스크럽 화살표(←) — 좌드래그(프레스) 중에만, 우측 상단 (역방향과 대칭).
          1페이지와 동일한 path·색 + 손가락 따라 좌측 이동 */}
      <span
        ref={fwdArrowRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-1 top-16 text-foreground transition-opacity duration-150",
          forwardArrow ? "opacity-100" : "opacity-0"
        )}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M5 12l6-6M5 12l6 6" />
        </svg>
      </span>
    </div>
  );
});
