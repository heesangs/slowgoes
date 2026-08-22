// 공통 유틸리티 함수

/**
 * 클래스명 조건부 결합
 */
export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

/**
 * 분 단위를 "X시간 Y분" 형식으로 변환
 * - 0 → "0분"
 * - 45 → "45분"
 * - 60 → "1시간"
 * - 90 → "1시간 30분"
 * - 음수/undefined/NaN → "0분"
 */
export function formatMinutes(minutes: number | undefined | null): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "0분";
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours}시간`;
  return `${hours}시간 ${remainingMinutes}분`;
}

/**
 * 이번 주 월요일 날짜를 "YYYY-MM-DD" 형식으로 반환
 */
export function getCurrentWeekStartDate(): string {
  const now = new Date();
  const day = now.getDay();
  const mondayDistance = (day + 6) % 7;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - mondayDistance);
  return monday.toISOString().slice(0, 10);
}
