"use client";

// 화면 테마 설정 — 라이트 / 다크 / 시스템(OS 설정 추종).
//
// localStorage 'theme'에 저장하고 <html data-theme>로 즉시 반영.
// (초기 적용은 layout.tsx의 FOUC 방지 스크립트가 담당.)

import { useEffect, useState } from "react";
import { SegmentControl } from "@/components/ui/segment-control";

type ThemePref = "light" | "dark" | "system";

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
  { value: "system", label: "시스템" },
];

function applyTheme(theme: ThemePref) {
  try {
    const el = document.documentElement;
    if (theme === "system") {
      localStorage.removeItem("theme");
      el.removeAttribute("data-theme");
    } else {
      localStorage.setItem("theme", theme);
      el.setAttribute("data-theme", theme);
    }
  } catch {
    // localStorage 접근 불가 시 무시
  }
}

export function ThemeSetting() {
  // 서버/클라이언트 hydration 일치를 위해 마운트 후 실제 값으로 초기화
  const [theme, setTheme] = useState<ThemePref>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("theme");
      setTheme(stored === "light" || stored === "dark" ? stored : "system");
    } catch {
      setTheme("system");
    }
  }, []);

  function handleChange(next: ThemePref) {
    setTheme(next);
    applyTheme(next);
  }

  return <SegmentControl options={OPTIONS} value={theme} onChange={handleChange} />;
}
