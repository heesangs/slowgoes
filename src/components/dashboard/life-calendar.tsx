"use client";

// 일생 캘린더 (R4) — 피그마 32636-19161.
//
// 가로 52주 × 세로 100세 = 5200칸. 한 칸 = 인생의 한 주.
// - 지난 주(= floor(age × 52)칸): 회색으로 채움 — 진입 시 위→아래 행 단위 순차 애니메이션.
// - 남은 주: 테두리만 있는 빈 칸.
// - 현재 주: 강조(accent) 칸.
//
// 5200개 DOM 노드를 피하려 canvas 단일 렌더. 행 단위 애니(100프레임)로 "빠르게 차오르는" 효과.
// 현재 주 칸의 화면 좌표를 onReady로 올려보내 상위(CalendarSection)의 morph 타겟으로 쓴다.

import { useCallback, useEffect, useRef } from "react";

const COLS = 52; // 한 해의 주 수(근사)
const ROWS = 100; // 100세
const CELL = 5; // 칸 한 변(px)
const GAP = 1; // 칸 간격(px)
const PITCH = CELL + GAP; // 6
const PAD_LEFT = 22; // 좌측 나이 라벨 여백
const PAD_TOP = 16; // 상단 주 라벨 여백
const LABEL_STEP = 5; // 라벨 표기 간격(5단위)

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
  /** 현재 주 칸의 화면 좌표 — morph 타겟용 (레이아웃 후 1회) */
  onReady?: (rect: LifeCellRect) => void;
}

export function LifeCalendar({ age, animate, onReady }: LifeCalendarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const weeksLived = Math.max(0, Math.min(COLS * ROWS, Math.floor(age * COLS)));
  const currentIndex = Math.min(weeksLived, COLS * ROWS - 1);

  // 테마 색상 읽기 (라이트/다크 공통)
  const readColors = useCallback(() => {
    const styles = getComputedStyle(document.documentElement);
    const fg = styles.getPropertyValue("--foreground").trim() || "#333333";
    const bg = styles.getPropertyValue("--background").trim() || "#ffffff";
    return { fg, bg };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    // 비-null로 좁혀 중첩 함수 클로저에서도 타입 유지
    const ctx = context;

    const { fg } = readColors();
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = PAD_LEFT + COLS * PITCH;
    const cssHeight = PAD_TOP + ROWS * PITCH;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.scale(dpr, dpr);

    const cellXY = (index: number) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      return { x: PAD_LEFT + col * PITCH, y: PAD_TOP + row * PITCH };
    };

    // 헬퍼 색 (foreground를 rgba로 못 섞으므로 globalAlpha 사용)
    function drawRemainingAndLabels() {
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // 남은 주 — 테두리만
      ctx.strokeStyle = fg;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 1;
      for (let i = weeksLived; i < COLS * ROWS; i++) {
        if (i === currentIndex) continue; // 현재 칸은 아래서 강조
        const { x, y } = cellXY(i);
        ctx.strokeRect(x + 0.5, y + 0.5, CELL, CELL);
      }
      ctx.globalAlpha = 1;

      // 라벨 (5단위)
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.4;
      ctx.font = "7px sans-serif";
      ctx.textBaseline = "middle";
      // 좌측 나이
      ctx.textAlign = "right";
      for (let r = LABEL_STEP; r <= ROWS; r += LABEL_STEP) {
        const y = PAD_TOP + (r - 1) * PITCH + CELL / 2;
        ctx.fillText(String(r), PAD_LEFT - 4, y);
      }
      // 상단 주
      ctx.textAlign = "center";
      for (let c = LABEL_STEP; c <= COLS; c += LABEL_STEP) {
        const x = PAD_LEFT + (c - 1) * PITCH + CELL / 2;
        ctx.fillText(String(c), x, PAD_TOP - 7);
      }
      ctx.globalAlpha = 1;
    }

    function drawLivedRow(row: number) {
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.35;
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col;
        if (i >= weeksLived || i === currentIndex) continue;
        const x = PAD_LEFT + col * PITCH;
        const y = PAD_TOP + row * PITCH;
        ctx.fillRect(x, y, CELL, CELL);
      }
      ctx.globalAlpha = 1;
    }

    function drawCurrentCell() {
      const { x, y } = cellXY(currentIndex);
      ctx.fillStyle = fg;
      ctx.globalAlpha = 1;
      ctx.fillRect(x, y, CELL, CELL);
    }

    const lastLivedRow = Math.floor((weeksLived - 1) / COLS);

    drawRemainingAndLabels();

    if (!animate) {
      for (let row = 0; row <= lastLivedRow; row++) drawLivedRow(row);
      drawCurrentCell();
    } else {
      // 행 단위 순차 채움 (프레임당 여러 행 — "빠르게 차오르는")
      let row = 0;
      const ROWS_PER_FRAME = 3;
      const step = () => {
        for (let k = 0; k < ROWS_PER_FRAME && row <= lastLivedRow; k++, row++) {
          drawLivedRow(row);
        }
        if (row <= lastLivedRow) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          drawCurrentCell();
        }
      };
      rafRef.current = requestAnimationFrame(step);
    }

    // morph 타겟 — 현재 칸의 뷰포트 좌표
    if (onReady) {
      const rect = canvas.getBoundingClientRect();
      const { x, y } = cellXY(currentIndex);
      onReady({ left: rect.left + x, top: rect.top + y, size: CELL });
    }

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [age, animate, weeksLived, currentIndex, onReady, readColors]);

  return (
    <div className="mt-3 overflow-x-auto">
      <p className="mb-1 pl-[22px] text-[10px] text-foreground/40">Week of the Year →</p>
      <canvas ref={canvasRef} aria-label={`일생 캘린더 — ${weeksLived}주 지남`} />
    </div>
  );
}
