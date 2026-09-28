// 글꼴 선택지 — 프로필 → 글꼴.
//
// **글꼴을 추가할 때 고칠 곳은 세 군데뿐이다:**
//   1) 여기 FONT_OPTIONS 에 { id, label } 한 줄
//   2) globals.css 에 :root[data-font="<id>"] { --app-font: … } 한 블록
//   3) (웹폰트라면) layout.tsx 에서 next/font 로 불러와 <html> className 에 variable 추가
// FOUC 스크립트와 설정 UI 는 이 목록을 그대로 따르므로 손댈 필요가 없다.
//
// label 은 **실제 글꼴 이름**을 쓴다. "기본" 같은 역할 이름은 글꼴이 늘어나면
// 무엇을 가리키는지 알 수 없게 된다. 시스템 글꼴만 예외로 "시스템"이다 —
// 기기마다 실제 글꼴이 달라서(Apple SD Gothic Neo / 맑은 고딕 / Roboto …) 이름 하나로 못 부른다.

export const FONT_OPTIONS = [
  { id: "system", label: "시스템" },
  { id: "gmarket-sans", label: "Gmarket Sans" },
] as const;

export type FontId = (typeof FONT_OPTIONS)[number]["id"];

/**
 * 아무것도 고르지 않았을 때의 글꼴.
 * 시스템 글꼴은 기기의 글자 크기·굵기 접근성 설정을 그대로 따르고, 웹폰트를 받지 않아
 * 첫 화면이 빠르다. 그래서 기본값으로 둔다.
 */
export const DEFAULT_FONT: FontId = "system";

/** localStorage 키 — layout.tsx FOUC 스크립트와 같은 값이어야 한다 */
export const FONT_STORAGE_KEY = "font";

export function isFontId(value: unknown): value is FontId {
  return FONT_OPTIONS.some((option) => option.id === value);
}
