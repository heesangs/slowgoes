"use client";

// 일생 캘린더 ↔ 인생시계 (피그마 32636-19161 그리드 / 32820-19323 timE 다이얼).
//
// 하나의 canvas에서 5200주(52×100)와 인생시계(100세=24시간)를 잇는 morph 타임라인:
//   A. 점→선     : 5200 도트가 100개의 라인으로 크로스페이드 (행=1년, '한 줄이 1년')
//   B. 좌측 수축  : 각 라인이 원둘레/100 길이로 짧아짐 (오른쪽이 비워짐)
//   C. 감기       : 맨 위 라인이 원호 끝으로 날아가 이어붙고, 아래 라인들이 위로 당겨짐
//                   → 산 시간(진회색)/남은 시간(연회색) 톤이 원호에 그대로 남는다
//   D. 시계 완성  : 링 → 테두리 점 24개·라벨 크로스페이드 → 중심점 → 시침 → 분침 → 초침
//                   (침은 중심과 간격을 두고 떠 있는 timE 디자인)
//
// 재생: 스와이프 트리거 — 그리드에서 왼쪽 스와이프 = 시계로(2.6s), 시계에서 오른쪽 = 그리드로.
// 진행도는 ref + rAF(리액트 상태는 phase 전환점만). 5200칸은 오프스크린 프리렌더로 프레임당
// draw call을 ~200개 수준으로 유지한다. prefers-reduced-motion이면 즉시 전환.

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

// 타임라인 경계 (p ∈ [0,1])
const ST_A = 0.15; // 점→선 크로스페이드 끝
const ST_B = 0.3; // 좌측 수축 끝
const ST_C = 0.78; // 감기 끝 (링 완성)
const DUR_FORWARD = 2600; // 그리드 → 시계(ms)
const DUR_REVERSE = 1800; // 시계 → 그리드(ms)
const SWIPE_FIRE_PX = 40; // 스와이프 발동 임계

// 다이얼 스펙 (timE): 침은 중심에서 간격을 두고 시작
const HAND_INNER = 0.18; // 침 시작 반지름 비율
const HOUR_OUTER = 0.48;
const MINUTE_OUTER = 0.68;
const SECOND_OUTER = 0.82;
const DIAL_LABELS = [3, 6, 9, 15, 18, 21]; // 12(하단)는 진한 점만

type Phase = "grid" | "toClock" | "clock" | "toGrid";

export interface LifeCellRect {
  /** 뷰포트 기준 현재 주 칸 사각형 */
  left: number;
  top: number;
  size: number;
}

interface LifeCalendarProps {
  /** 현재 나이 (life_clock_age). 지난 주 = floor(age × 52) */
  age: number;
  /** 진입 시 순차 채움 애니메이션 여부 */
  animate: boolean;
  /** 현재 주 칸의 화면 좌표 — 토글 morph 타겟용 (그리드 상태 레이아웃 후 1회) */
  onReady?: (rect: LifeCellRect) => void;
}

function easeInOutCubic(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function clamp01(v: number): number {
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

export function LifeCalendar({ age, animate, onReady }: LifeCalendarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const progressRef = useRef(0); // 0=그리드, 1=시계
  const drawRef = useRef<((p: number, entryRows?: number) => void) | null>(null);
  const enteredRef = useRef(false); // 진입 채움 애니는 1회만

  const [phase, setPhase] = useState<Phase>("grid");

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

  const weeksLived = Math.max(0, Math.min(COLS * ROWS, Math.floor(age * COLS)));
  const currentIndex = Math.min(weeksLived, COLS * ROWS - 1);
  // 렌더용 시각 (effect 안에서는 age로 재계산 — 객체 identity로 인한 재실행 방지)
  const clock = computeLifeClock(age);

  // 테마 색상 (라이트/다크 공통 — canvas는 CSS 변수를 직접 못 쓰므로 읽어온다)
  const readColors = useCallback(() => {
    const styles = getComputedStyle(document.documentElement);
    const fg = styles.getPropertyValue("--foreground").trim() || "#333333";
    return { fg };
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
    const { fg } = readColors();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = L.cssWidth * dpr;
    canvas.height = L.cssHeight * dpr;
    canvas.style.width = `${L.cssWidth}px`;
    canvas.style.height = `${L.cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 행(1년) i의 "산 주" 비율 (0~1)
    const livedFrac = (row: number) =>
      clamp01((weeksLived - row * COLS) / COLS);
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
    }

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

    // 100개의 2톤 라인 (shrink: 0=전체 폭, 1=원둘레/100 길이)
    const arcLen = (2 * Math.PI * L.R) / ROWS;
    function drawLines(shrink: number, alpha: number) {
      const len = L.lineW + (arcLen - L.lineW) * shrink;
      const th = Math.max(2, L.cell * (1 - shrink));
      for (let i = 0; i < ROWS; i++) {
        const y = PAD_TOP + i * L.pitch + L.cell / 2 - th / 2;
        const frac = livedFrac(i);
        ctx.fillStyle = fg;
        if (frac > 0) {
          ctx.globalAlpha = 0.45 * alpha;
          ctx.fillRect(PAD_LEFT, y, len * frac, th);
        }
        if (frac < 1) {
          ctx.globalAlpha = 0.18 * alpha;
          ctx.fillRect(PAD_LEFT + len * frac, y, len * (1 - frac), th);
        }
      }
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

    // C단계: 컨베이어 감기 — 스택이 위로 당겨지고 맨 위 라인이 호 끝으로 날아간다
    function drawWrap(q: number) {
      const consumed = q * ROWS;
      const k = Math.floor(consumed);
      const f = consumed - k;

      // 이미 감긴 호
      drawRing(k * (360 / ROWS), 1);

      // 남은 스택 (k+1..): 소비량만큼 위로 이동한 짧은 스텁
      const th = 2;
      for (let i = k + 1; i < ROWS; i++) {
        const y = PAD_TOP + (i - consumed) * L.pitch + L.cell / 2 - th / 2;
        if (y > L.cssHeight) break;
        const frac = livedFrac(i);
        ctx.fillStyle = fg;
        if (frac > 0) {
          ctx.globalAlpha = 0.45;
          ctx.fillRect(PAD_LEFT, y, arcLen * frac, th);
        }
        if (frac < 1) {
          ctx.globalAlpha = 0.18;
          ctx.fillRect(PAD_LEFT + arcLen * frac, y, arcLen * (1 - frac), th);
        }
      }
      ctx.globalAlpha = 1;

      // 날아가는 라인 k: 스택 맨 위 → 호의 [k, k+1] 세그먼트(현으로 근사)
      if (k < ROWS) {
        const yTop = PAD_TOP + (k - consumed) * L.pitch + L.cell / 2;
        const a0 = k * (360 / ROWS);
        const a1 = (k + 1) * (360 / ROWS);
        const P0 = polar(L.R, a0);
        const P1 = polar(L.R, a1);
        const sx0 = PAD_LEFT, sy0 = yTop;
        const sx1 = PAD_LEFT + arcLen, sy1 = yTop;
        const e = easeInOutCubic(f);
        const x0 = sx0 + (P0.x - sx0) * e;
        const y0 = sy0 + (P0.y - sy0) * e;
        const x1 = sx1 + (P1.x - sx1) * e;
        const y1 = sy1 + (P1.y - sy1) * e;
        ctx.strokeStyle = fg;
        ctx.lineWidth = 2;
        ctx.globalAlpha = livedFrac(k) >= 0.5 ? 0.5 : 0.2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
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
      if (p < ST_A) {
        const t = p / ST_A;
        drawGrid(1 - t);
        drawLines(0, t);
      } else if (p < ST_B) {
        drawLines(easeInOutCubic((p - ST_A) / (ST_B - ST_A)), 1);
      } else if (p < ST_C) {
        drawWrap((p - ST_B) / (ST_C - ST_B));
      } else {
        drawDial((p - ST_C) / (1 - ST_C));
      }
    }
    drawRef.current = drawScene;

    // ── 초기 렌더 ──
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (progressRef.current === 0 && animate && !enteredRef.current) {
      // 진입 채움 애니 (행 단위 순차 — 1회만)
      enteredRef.current = true;
      let row = 0;
      const ROWS_PER_FRAME = 3;
      const step = () => {
        row += ROWS_PER_FRAME;
        drawScene(0, row);
        if (row < ROWS) rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    } else {
      drawScene(progressRef.current);
    }

    // 토글 morph 타겟 — 그리드 상태에서만 의미 (현재 주 칸 뷰포트 좌표)
    if (onReady && progressRef.current === 0) {
      const rect = canvas.getBoundingClientRect();
      const cur = cellXY(currentIndex);
      onReady({ left: rect.left + cur.x, top: rect.top + cur.y, size: L.cell });
    }

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [age, animate, weeksLived, currentIndex, onReady, readColors, width]);

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
    const dur = target === 1 ? DUR_FORWARD : DUR_REVERSE;
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

  // ── 스와이프 트리거 (터치+마우스, 가로 우세 시만 — 세로 스크롤 양보) ──
  const gesture = useRef<{ x: number; y: number; active: boolean; fired: boolean } | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    gesture.current = { x: e.clientX, y: e.clientY, active: true, fired: false };
  }
  function handlePointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g?.active || g.fired) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
      g.active = false; // 세로 스크롤에 양보
      return;
    }
    if (Math.abs(dx) >= SWIPE_FIRE_PX && Math.abs(dx) > Math.abs(dy)) {
      g.fired = true;
      if (phase === "grid" && dx < 0) play(1);
      else if (phase === "clock" && dx > 0) play(0);
    }
  }
  function handlePointerEnd() {
    if (gesture.current) gesture.current.active = false;
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
