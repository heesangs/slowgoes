import { STRIDE_ORDER } from "@/lib/ai/analyze";
import type { SuggestedRoutine, StrideLevel } from "@/types";
import { CLOCK_HAND_ROTATION_CLASSES } from "./constants";

export function formatRoutineRepeat(routine: SuggestedRoutine) {
  if (routine.repeatUnit === "daily") {
    return routine.repeatValue <= 1 ? "매일" : `${routine.repeatValue}일마다`;
  }
  return routine.repeatValue <= 1 ? "매주" : `${routine.repeatValue}주마다`;
}

// 길수록 진하게 — someday가 가장 진한 톤
export function getStrideTone(level: StrideLevel) {
  const idx = STRIDE_ORDER.indexOf(level);
  if (idx >= 7) return "border-foreground/30 bg-foreground/[0.12]";
  if (idx >= 5) return "border-foreground/25 bg-foreground/[0.1]";
  if (idx >= 3) return "border-foreground/20 bg-foreground/[0.07]";
  if (idx >= 1) return "border-foreground/15 bg-foreground/[0.04]";
  return "border-foreground/10 bg-foreground/[0.02]";
}

export type LifeClockInfo = { label: string; handClassName: string };

export function computeLifeClock(age: number | null): LifeClockInfo | null {
  if (age === null || age < 0 || age > 100) return null;
  const totalHours = (age / 100) * 24;
  const hour24 = Math.floor(totalHours);
  const minute = Math.floor((totalHours - hour24) * 60);
  const meridiem = hour24 < 12 ? "오전" : "오후";
  const hour12Raw = hour24 % 12;
  const hour12 = hour12Raw === 0 ? 12 : hour12Raw;
  const label = `${meridiem} ${hour12}:${String(minute).padStart(2, "0")}`;
  const handIndex = Math.max(
    0,
    Math.min(
      CLOCK_HAND_ROTATION_CLASSES.length - 1,
      Math.floor((hour24 / 24) * CLOCK_HAND_ROTATION_CLASSES.length)
    )
  );
  return { label, handClassName: CLOCK_HAND_ROTATION_CLASSES[handIndex] };
}
