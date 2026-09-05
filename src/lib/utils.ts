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

/**
 * 앞 낱말의 받침 유무에 맞는 조사를 고른다 (조사만 반환).
 *   josa("첫 여자친구 만들기", "을", "를")  → "를"
 *   josa("소개팅어플 가입", "을", "를")     → "을"
 *
 * 사용자 입력(버킷 이름 등)을 문장에 끼워 넣을 때 필요하다. 따옴표로 감싸는 경우가
 * 많아 낱말이 아니라 조사만 돌려준다 — `'{title}'{josa(title,"을","를")} 완료할까요?`
 *
 * 한글이 아닌 글자로 끝나면(영문·숫자·이모지) 판별할 수 없으므로 받침 있는 쪽을
 * 쓴다 — "slowgoes을"이 어색하긴 해도, 잘못 고른 조사가 오탈자처럼 읽히는 것보단 낫다.
 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.trim().slice(-1).charCodeAt(0);
  // 한글 음절 영역(가~힣)이 아니면 판별 불가
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return withFinal;
  // (코드 - 0xAC00) % 28 === 0 이면 종성(받침) 없음
  return (code - 0xac00) % 28 === 0 ? withoutFinal : withFinal;
}
