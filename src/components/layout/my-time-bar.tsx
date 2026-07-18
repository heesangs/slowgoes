"use client";

// 상단 네비 "나의 시간" 바 (피그마 32615-19100) + 드롭다운 인생시계 (32615-18962).
//
// 접힘: [나의 시간] ─────────── [AM : 10:04 ⌄]
// 펼침: 24시간 아날로그 다이얼(상단 100세=24시, 시·분·초 3침) +
//       "— 100세 시대에 —" + "24시간으로 보면 {이름}님은 오전 10시 04분 입니다."
//
// 인생시계: (age/100)×24h — 정수 나이도 초가 살아있다 (예: 42세 = 10:04:48).
// 초는 다이얼의 연한 회색 초침으로 시각화한다 (텍스트는 피그마대로 분까지).

import { useState } from "react";
import { cn } from "@/lib/utils";
import { computeLifeClock } from "@/components/auth/onboarding/utils";
import { FEATURE_NAMES } from "@/lib/constants";

interface MyTimeBarProps {
  age: number;
  displayName: string;
}

export function MyTimeBar({ age, displayName }: MyTimeBarProps) {
  const [expanded, setExpanded] = useState(false);
  const clock = computeLifeClock(age);

  if (!clock) return null;

  const compactLabel = `${clock.hour24 < 12 ? "AM" : "PM"} : ${clock.hour12}:${String(clock.minute).padStart(2, "0")}`;
  const captionTime = `${clock.meridiem} ${clock.hour12}시 ${String(clock.minute).padStart(2, "0")}분`;

  return (
    <div className="border-b border-foreground/10">
      {/* 접힘 바 — 전체가 토글 버튼 */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label={`${FEATURE_NAMES.MY_CLOCK} ${expanded ? "접기" : "펼치기"}`}
        className="flex w-full items-center justify-between px-4 py-2.5 transition-colors hover:bg-foreground/[0.03]"
      >
        <span className="text-sm text-foreground/80">{FEATURE_NAMES.MY_CLOCK}</span>
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {compactLabel}
          <svg
            className={cn("h-3.5 w-3.5 text-foreground/50 transition-transform", expanded && "rotate-180")}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* 펼침 — 인생시계 다이얼 + 캡션 (아코디언) */}
      <div
        className={cn(
          "overflow-hidden transition-[max-height] duration-300",
          expanded ? "max-h-[30rem]" : "max-h-0"
        )}
      >
        <div className="flex flex-col items-center gap-5 px-4 pb-6 pt-2">
          <LifeClockFace hour24={clock.hour24} minute={clock.minute} second={clock.second} />

          <p className="flex items-center gap-2 text-xs text-foreground/45">
            <span aria-hidden>──</span>
            <span>
              <strong className="font-semibold text-foreground/70">100세</strong> 시대에
            </span>
            <span aria-hidden>──</span>
          </p>

          <p className="text-center text-base text-foreground/70">
            24시간으로 보면 <strong className="font-bold text-foreground">{displayName}님</strong>은
            <br />
            <strong className="font-bold text-foreground">{captionTime}</strong> 입니다.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── 24시간 인생시계 다이얼 (피그마 32615-18962) ──
// 상단 = 24시(100세). 시침(굵/짧) · 분침(가늘/김) · 초침(가장 김, 연한 회색).

const DIAL_LABELS: Array<{ hour: number; text: string }> = [
  { hour: 3, text: "3" },
  { hour: 6, text: "6" },
  { hour: 9, text: "9" },
  { hour: 12, text: "12" },
  { hour: 15, text: "15" },
  { hour: 18, text: "18" },
  { hour: 21, text: "21" },
];

function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  // 0° = 12시 방향(상단), 시계방향
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function LifeClockFace({
  hour24,
  minute,
  second,
}: {
  hour24: number;
  minute: number;
  second: number;
}) {
  const C = 110; // 중심
  const hourAngle = ((hour24 + minute / 60) / 24) * 360;
  const minuteAngle = ((minute + second / 60) / 60) * 360;
  const secondAngle = (second / 60) * 360;

  const hourTip = polar(C, C, 42, hourAngle);
  const minuteTip = polar(C, C, 62, minuteAngle);
  const secondTip = polar(C, C, 72, secondAngle);

  return (
    <svg
      viewBox="0 0 220 220"
      className="h-56 w-56"
      role="img"
      aria-label={`인생시계 ${hour24}시 ${minute}분 ${second}초`}
    >
      {/* 24시간 틱 도트 — 0시(상단)·12시(하단)는 진하게 */}
      {Array.from({ length: 24 }, (_, h) => {
        const pos = polar(C, C, 88, (h / 24) * 360);
        const emphasized = h === 0 || h === 12;
        return (
          <circle
            key={h}
            cx={pos.x}
            cy={pos.y}
            r={emphasized ? 2.5 : 1.8}
            className={emphasized ? "fill-foreground" : "fill-foreground/25"}
          />
        );
      })}

      {/* 상단 "100세" (=24시) */}
      {(() => {
        const pos = polar(C, C, 72, 0);
        return (
          <text
            x={pos.x}
            y={pos.y + 4}
            textAnchor="middle"
            className="fill-foreground text-[11px] font-medium"
          >
            100세
          </text>
        );
      })()}

      {/* 시각 라벨 3/6/9/12/15/18/21 */}
      {DIAL_LABELS.map(({ hour, text }) => {
        const pos = polar(C, C, 72, (hour / 24) * 360);
        return (
          <text
            key={hour}
            x={pos.x}
            y={pos.y + 4}
            textAnchor="middle"
            className="fill-foreground/40 text-[11px]"
          >
            {text}
          </text>
        );
      })}

      {/* 초침 — 가장 길고 연한 회색 (초 정보 시각화) */}
      <line
        x1={C}
        y1={C}
        x2={secondTip.x}
        y2={secondTip.y}
        strokeWidth={1.5}
        strokeLinecap="round"
        className="stroke-foreground/25"
      />
      {/* 분침 — 가늘고 긴 검정 */}
      <line
        x1={C}
        y1={C}
        x2={minuteTip.x}
        y2={minuteTip.y}
        strokeWidth={2}
        strokeLinecap="round"
        className="stroke-foreground"
      />
      {/* 시침 — 굵고 짧은 검정 */}
      <line
        x1={C}
        y1={C}
        x2={hourTip.x}
        y2={hourTip.y}
        strokeWidth={5}
        strokeLinecap="round"
        className="stroke-foreground"
      />
      {/* 중심축 */}
      <circle cx={C} cy={C} r={3.5} className="fill-foreground" />
    </svg>
  );
}
