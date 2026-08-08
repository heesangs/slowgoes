// 테마 색 토큰과 <meta name="theme-color"> 동기화.
//
// theme-color는 홈 화면 앱(standalone)에서 **상태바 주변 색**을 정한다. 예전엔
// Next의 viewport.themeColor로 `prefers-color-scheme` 미디어 두 벌을 내보냈는데,
// 이 앱은 data-theme으로 OS와 무관하게 테마를 바꿀 수 있어서 OS=라이트 + 앱=다크면
// 상단만 흰 띠로 남았다. → media 없는 meta 하나를 두고 실제 테마에 맞춰 갱신한다.

/** globals.css의 --background와 같은 값 (여기가 바뀌면 globals.css도 함께) */
export const THEME_BG = { light: "#ffffff", dark: "#333333" } as const;

/** 지금 화면이 다크인지 — data-theme 우선, 없으면 OS 설정 */
export function isDarkTheme(): boolean {
  if (typeof document === "undefined") return false;
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** <meta name="theme-color">를 현재 테마 배경색으로 맞춘다 */
export function syncThemeColorMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  meta.setAttribute("content", isDarkTheme() ? THEME_BG.dark : THEME_BG.light);
}
