"use client";

import { useEffect, useState } from "react";

// 지연 플래그 — active(예: isLoading)가 연속 delayMs(기본 300ms) 유지될 때만 true.
//
// 용도: 빠른 로딩(<300ms)에서는 스켈레톤을 아예 렌더하지 않아 깜빡임을 없앤다.
// active가 임계값 전에 false가 되면 true가 되지 않고, 다시 false로 리셋된다.
export function useDelayedFlag(active: boolean, delayMs = 300): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return shown;
}
