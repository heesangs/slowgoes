"use client";

// 글꼴 설정 — 브랜드(Gmarket Sans) / 시스템.
//
// 브랜드 글꼴은 자형이 기하학적이라 한글 본문이 오래 읽히면 피로하다는 취향이 있고,
// 시스템 글꼴은 기기 설정(글자 크기·굵기 접근성 설정)을 그대로 따른다. 고를 수 있게 둔다.
//
// ThemeSetting과 같은 구조 — localStorage 'font' + <html data-font>.
// (초기 적용은 layout.tsx의 FOUC 방지 스크립트가 담당. 없으면 첫 프레임이 브랜드 글꼴로
//  깜빡인 뒤 시스템으로 바뀐다.)

import { useEffect, useState } from "react";
import { SegmentControl } from "@/components/ui/segment-control";

type FontPref = "brand" | "system";

const OPTIONS: { value: FontPref; label: string }[] = [
  { value: "brand", label: "기본" },
  { value: "system", label: "시스템" },
];

function applyFont(font: FontPref) {
  try {
    const el = document.documentElement;
    if (font === "system") {
      localStorage.setItem("font", "system");
      el.setAttribute("data-font", "system");
    } else {
      // 기본값은 저장하지 않는다 — 나중에 브랜드 글꼴이 바뀌어도 따라온다
      localStorage.removeItem("font");
      el.removeAttribute("data-font");
    }
  } catch {
    // localStorage 접근 불가 시 무시
  }
}

export function FontSetting() {
  // 서버/클라이언트 hydration 일치를 위해 마운트 후 실제 값으로 초기화
  const [font, setFont] = useState<FontPref>("brand");

  useEffect(() => {
    try {
      setFont(localStorage.getItem("font") === "system" ? "system" : "brand");
    } catch {
      setFont("brand");
    }
  }, []);

  function handleChange(next: FontPref) {
    setFont(next);
    applyFont(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <SegmentControl options={OPTIONS} value={font} onChange={handleChange} />
      <p className="text-xs text-label-alt">
        시스템 글꼴은 기기의 글자 크기·굵기 설정을 그대로 따릅니다.
      </p>
    </div>
  );
}
