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
//   WRAP   : 시계방향 360° 링(산/남은 2톤 유지), 직선 궤적은 페이드 아웃
//   DIAL   : 링 → 테두리 점·라벨 → 중심점 → 시침 → 분침 → 초침 (timE 디자인)
//
// 진행도는 ref + rAF(리액트 상태는 phase 전환점만). 5200칸은 오프스크린 프리렌더.
// prefers-reduced-motion이면 즉시 전환.

import { useCallback, useEffect, useRef, useState } from "react";
import { computeLifeClock } from "@/components/auth/onboarding/utils";
import { cn } from "@/lib/utils";

const COLS = 52; // 한 해의 주 수(근사) — 한 줄이 1년
const ROWS = 100; // 100세
const GAP = 1; // 칸 간격(px)
const PAD_LEFT = 22; // 좌측 나이 라벨 여백
const PAD_TOP = 16; // 상단 여백
const LABEL_STEP = 5; // 그리드 라벨 간격(5단위)
const MIN_CELL = 4; // 칸 최소 크기(px)

// 여정 타임라인 경계 (p ∈ [0,1]) — 키오브젝트 1개가 경로를 그리며 원을 만든다
const ST_EXIT = 0.2; // 그리드 우측 페이드 + 사각형→원 morph·좌측 이동
const ST_TURNUP = 0.26; // 좌측 끝 쿼터 아크(상향 전환, 궤적 시작)
const ST_RISE = 0.42; // 좌측 가장자리 상승(세로 궤적)
const ST_TURN = 0.48; // 좌상단 쿼터 아크
const ST_RUN = 0.58; // 상단 중앙까지 우향(가로 궤적) — 스크럽 핸드오프
const ST_WRAP = 0.86; // 시계방향 360° 링 완성
const CORNER_R = 14; // 방향 전환 쿼터 아크 반경(px)
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

interface LifeCalendarProps {
  /** 현재 나이 (life_clock_age) */
  age: number;
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
  const lineW = COLS * pitch; // 라인(1년) 전체 길이
  const cssWidth = PAD_LEFT + lineW;
  const cssHeight = PAD_TOP + ROWS * pitch;
  const cx = cssWidth / 2;
  const cy = cssHeight / 2;
  const R = Math.min((cssWidth - 70) / 2, cssHeight / 2 - 50);
  return { pitch, cell, lineW, cssWidth, cssHeight, cx, cy, R };
}

type Layout = ReturnType<typeof getLayout>;

export function LifeCalendar({
  age,
  weekOfYear = 0,
  animate,
  onReady,
  onReverseDrag,
  onReverseCommit,
  onReverseCancel,
  onPhaseChange,
  entryDelayMs = 0,
}: LifeCalendarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const progressRef = useRef(0); // 0=그리드, 1=시계
  const drawRef = useRef<((p: number, entryRows?: number) => void) | null>(null);
  const drawExitRef = useRef<((r: number) => void) | null>(null); // 역방향 캔버스 연출
  const geomRef = useRef<{ curX: number; curY: number; cell: number; pitch: number } | null>(null); // 현재 칸 지오메트리
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
      y: PAD_TOP + Math.floor(index / COLS) * L.pitch,
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
        rest.x.strokeRect(x + 0.5, y + 0.5, L.cell, L.cell);
      }
      rest.x.globalAlpha = 0.4;
      rest.x.fillStyle = fg;
      rest.x.font = "7px sans-serif";
      rest.x.textBaseline = "middle";
      rest.x.textAlign = "right";
      for (let r = LABEL_STEP; r <= ROWS; r += LABEL_STEP) {
        rest.x.fillText(String(r), PAD_LEFT - 4, PAD_TOP + (r - 1) * L.pitch + L.cell / 2);
      }
      rest.x.globalAlpha = 1;
    }

    // 레이어 2: 산 주 채움 + 현재 주 강조
    const lived = makeLayer();
    if (lived.x) {
      lived.x.fillStyle = fg;
      lived.x.globalAlpha = 0.35;
      for (let i = 0; i < weeksLived; i++) {
        if (i === currentIndex) continue;
        const { x, y } = cellXY(i);
        lived.x.fillRect(x, y, L.cell, L.cell);
      }
      lived.x.globalAlpha = 1;
      const cur = cellXY(currentIndex);
      lived.x.fillRect(cur.x, cur.y, L.cell, L.cell);
      // 현재 주 강조 링 — 셀에서 2px 간격 + 2px 라인
      lived.x.strokeStyle = fg;
      lived.x.lineWidth = 2;
      lived.x.strokeRect(cur.x - 3, cur.y - 3, L.cell + 6, L.cell + 6);
    }

    // 역방향 커밋용 지오메트리(현재 칸)
    const curCell = cellXY(currentIndex);
    geomRef.current = { curX: curCell.x, curY: curCell.y, cell: L.cell, pitch: L.pitch };

    // ── 그리기 프리미티브 ──

    // 그리드 (entryRows: 진입 채움 애니 — 위에서부터 몇 행까지 lived를 보일지)
    function drawGrid(alpha: number, entryRows: number = ROWS) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(rest.c, 0, 0, L.cssWidth, L.cssHeight);
      const clipH = Math.min(L.cssHeight, PAD_TOP + entryRows * L.pitch);
      ctx.drawImage(
        lived.c,
        0, 0, L.cssWidth * dpr, clipH * dpr,
        0, 0, L.cssWidth, clipH
      );
      ctx.globalAlpha = 1;
    }

    // 감긴 원호 (0..segs년) — 산/남은 톤 분할. alphaMul은 D단계 페이드용
    const livedAngle = (weeksLived / (COLS * ROWS)) * 360;
    function drawRing(sweepDeg: number, alphaMul: number) {
      if (sweepDeg <= 0) return;
      ctx.lineWidth = 2;
      ctx.strokeStyle = fg;
      const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
      const darkEnd = Math.min(sweepDeg, livedAngle);
      if (darkEnd > 0) {
        ctx.globalAlpha = 0.5 * alphaMul;
        ctx.beginPath();
        ctx.arc(L.cx, L.cy, L.R, toRad(0), toRad(darkEnd));
        ctx.stroke();
      }
      if (sweepDeg > livedAngle) {
        ctx.globalAlpha = 0.2 * alphaMul;
        ctx.beginPath();
        ctx.arc(L.cx, L.cy, L.R, toRad(livedAngle), toRad(sweepDeg));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ── 키오브젝트 여정 경로 (EXIT → TURN-UP → RISE → TURN → RUN → WRAP) ──
    // 좌측 세로축 x, 상단 가로축 y(=원 꼭대기). 원 최상단에서 접선이 수평이라
    // RUN 직선이 WRAP 원호로 끊김 없이 이어진다.
    const keyR = Math.max(7, 1.5 * L.pitch); // 키오브젝트(원) 반지름
    const xL = PAD_LEFT + keyR; // 좌측 세로 경로 x (원이 잘리지 않게 반지름만큼 안쪽)
    const yT = L.cy - L.R; // 상단 가로 경로 y = 원 꼭대기
    const kStart = { x: curCell.x + L.cell / 2, y: curCell.y + L.cell / 2 }; // 현재 주 칸 중심
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

    // 지나간 궤적(2px) — TURN-UP부터 시작 (EXIT 좌향 이동은 궤적 없음)
    function drawTrail(p: number, alpha: number) {
      if (p <= ST_EXIT || alpha <= 0) return;
      ctx.strokeStyle = fg;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.45 * alpha;
      ctx.beginPath();
      // 좌하단 아크
      const a1 = 90 + 90 * clamp01((p - ST_EXIT) / (ST_TURNUP - ST_EXIT));
      ctx.arc(C1.x, C1.y, CORNER_R, rcDeg(90), rcDeg(a1));
      ctx.stroke();
      // 세로 상승
      if (p > ST_TURNUP) {
        const pen = penAt(Math.min(p, ST_RISE));
        ctx.beginPath();
        ctx.moveTo(xL, C1.y);
        ctx.lineTo(xL, Math.min(p, ST_RISE) === ST_RISE ? C2.y : pen.y);
        ctx.stroke();
      }
      // 좌상단 아크
      if (p > ST_RISE) {
        const a2 = 180 + 90 * clamp01((p - ST_RISE) / (ST_TURN - ST_RISE));
        ctx.beginPath();
        ctx.arc(C2.x, C2.y, CORNER_R, rcDeg(180), rcDeg(a2));
        ctx.stroke();
      }
      // 가로 이동
      if (p > ST_TURN) {
        const pen = penAt(Math.min(p, ST_RUN));
        ctx.beginPath();
        ctx.moveTo(C2.x, yT);
        ctx.lineTo(pen.x, yT);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // 키오브젝트(펜) — EXIT 동안 사각형→원 morph + 크기 전환, 이후 원
    function drawPen(pos: { x: number; y: number }, morph: number, alpha: number) {
      if (alpha <= 0) return;
      ctx.fillStyle = fg;
      ctx.globalAlpha = alpha;
      const half = (L.cell / 2) * (1 - morph) + keyR * morph;
      const radius = half * morph; // 0=사각형 → half=완전한 원
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(pos.x - half, pos.y - half, half * 2, half * 2, radius);
      } else {
        ctx.arc(pos.x, pos.y, half, 0, Math.PI * 2);
      }
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

      // WRAP: 상단 중앙에서 접선 연속으로 시계방향 링. 직선 궤적은 전반부 페이드 아웃
      const w = clamp01((p - ST_RUN) / (ST_WRAP - ST_RUN));
      const sweep = 360 * easeInOutCubic(w);
      drawTrail(ST_RUN, 1 - clamp01(w / 0.4));
      drawRing(sweep, 1);
      const penPos = polar(L.R, sweep);
      drawPen(penPos, 1, 1 - clamp01((sweep - 330) / 30)); // 완성 직전 페이드
    }

    // D단계: 링 → 시계 (점 테두리·라벨 → 중심점 → 시침 → 분침 → 초침)
    function drawDial(d: number) {
      const chrome = clamp01(d / 0.3); // 테두리 점 + 라벨 페이드인
      drawRing(360, 1 - chrome); // 링은 점 테두리로 녹아든다

      // 테두리 점 24개 — 0시(상단)·12시(하단)만 진하게
      ctx.fillStyle = fg;
      for (let h = 0; h < 24; h++) {
        const pos = polar(L.R, (h / 24) * 360);
        const emphasized = h === 0 || h === 12;
        ctx.globalAlpha = (emphasized ? 1 : 0.25) * chrome;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, emphasized ? 2 : 1.25, 0, Math.PI * 2);
        ctx.fill();
      }

      // 라벨 — 상단 100세 + 3·6·9·15·18·21
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "11px sans-serif";
      ctx.globalAlpha = chrome;
      const top = polar(L.R * 0.82, 0);
      ctx.fillText("100세", top.x, top.y);
      ctx.globalAlpha = 0.4 * chrome;
      for (const h of DIAL_LABELS) {
        const pos = polar(L.R * 0.82, (h / 24) * 360);
        ctx.fillText(String(h), pos.x, pos.y);
      }
      ctx.globalAlpha = 1;

      // 중심점 pop-in
      const dot = clamp01((d - 0.15) / 0.15);
      if (dot > 0) {
        ctx.globalAlpha = dot;
        ctx.beginPath();
        ctx.arc(L.cx, L.cy, 2.5 * dot, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

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
      const cy0 = curCell.y + L.cell / 2;
      const side = L.cell + (3 * L.pitch - L.cell) * easeInOutCubic(r);
      ctx.fillStyle = fg;
      ctx.globalAlpha = 1;
      ctx.fillRect(cx0 - side / 2, cy0 - side / 2, side, side);
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
  } | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      active: true,
      fired: false,
      forwarding: false,
      fwdScrub: false,
    };
  }
  function handlePointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g?.active) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;

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
        const cy0 = geom.curY + geom.cell / 2;
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

  const showGridChrome = phase === "grid"; // '한 줄이 1년' + 스와이프 힌트
  const showClockChrome = phase === "clock" && !!clock; // 메시지 + 복귀 힌트

  const message = clock
    ? `당신의 인생시간은 ${clock.meridiem} ${clock.hour12}시 ${String(clock.minute).padStart(2, "0")}분입니다.`
    : "";

  return (
    <div
      ref={wrapRef}
      className="relative mt-3"
      style={{ touchAction: "pan-y" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {/* 상단 캡션 행 — 좌: 스와이프 힌트 / 우: '한 줄이 1년' (그리드 상태에서만) */}
      <div
        className={cn(
          "mb-1 flex items-center justify-between text-[10px] text-foreground/40 transition-opacity",
          showGridChrome ? "opacity-100" : "opacity-0"
        )}
        aria-hidden={!showGridChrome}
      >
        <span className="text-foreground/35">← 밀어서 인생시계 보기</span>
        <span>한 줄이 1년</span>
      </div>

      <canvas
        ref={canvasRef}
        aria-label={
          phase === "clock"
            ? `인생시계 — ${message}`
            : `일생 캘린더 — ${weeksLived}주 지남`
        }
      />

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

      {/* 인생시계 메시지 — 글자 하나하나 stagger (다이얼 아래 오버레이) */}
      {showClockChrome && (
        <div
          className="pointer-events-none absolute inset-x-0 flex flex-col items-center gap-3 px-4 text-center"
          style={{ top: messageTop }}
        >
          <p className="text-sm text-foreground/80">
            {[...message].map((ch, i) => (
              <span
                key={i}
                className="inline-block animate-[char-rise_0.45s_ease_both]"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                {ch === " " ? " " : ch}
              </span>
            ))}
          </p>
          <span
            className="text-[10px] text-foreground/35 animate-[char-rise_0.45s_ease_both]"
            style={{ animationDelay: `${message.length * 45 + 300}ms` }}
          >
            주 단위로 보기 →
          </span>
        </div>
      )}
    </div>
  );
}
