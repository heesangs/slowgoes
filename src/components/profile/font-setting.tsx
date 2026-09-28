"use client";

// 글꼴 설정 — 선택지는 src/lib/constants/fonts.ts 의 FONT_OPTIONS 를 그대로 따른다.
//
// 기본은 시스템 글꼴이다. 기기의 글자 크기·굵기 접근성 설정을 그대로 따르고
// 웹폰트를 받지 않아 첫 화면이 빠르다. 다른 글꼴은 고른 사람만 받는다.
//
// ThemeSetting 과 같은 구조 — localStorage 'font' + <html data-font>.
// (초기 적용은 layout.tsx 의 FOUC 방지 스크립트가 담당. 없으면 첫 프레임이 시스템 글꼴로
//  그려진 뒤 고른 글꼴로 바뀌며 본문이 한 번 출렁인다.)

import { useEffect, useState } from "react";
import { SegmentControl } from "@/components/ui/segment-control";
import {
  DEFAULT_FONT,
  FONT_OPTIONS,
  FONT_STORAGE_KEY,
  isFontId,
  type FontId,
} from "@/lib/constants/fonts";

const OPTIONS = FONT_OPTIONS.map((option) => ({ value: option.id, label: option.label }));

function applyFont(font: FontId) {
  try {
    const el = document.documentElement;
    if (font === DEFAULT_FONT) {
      // 기본값은 저장하지 않는다 — 나중에 기본 글꼴이 바뀌어도 따라온다
      localStorage.removeItem(FONT_STORAGE_KEY);
      el.removeAttribute("data-font");
    } else {
      localStorage.setItem(FONT_STORAGE_KEY, font);
      el.setAttribute("data-font", font);
    }
  } catch {
    // localStorage 접근 불가 시 무시
  }
}

export function FontSetting() {
  // 서버/클라이언트 hydration 일치를 위해 마운트 후 실제 값으로 초기화
  const [font, setFont] = useState<FontId>(DEFAULT_FONT);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FONT_STORAGE_KEY);
      // 모르는 값(없어진 글꼴)은 기본으로 — FOUC 스크립트와 같은 판단
      setFont(isFontId(stored) ? stored : DEFAULT_FONT);
    } catch {
      setFont(DEFAULT_FONT);
    }
  }, []);

  function handleChange(next: FontId) {
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
