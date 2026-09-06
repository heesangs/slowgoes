// 일생 캘린더(52열 × 100행)의 날짜 ↔ 셀 매핑.
//
// 행 = 나이, 열 = 그 해의 몇째 주. 인덱스 = age * 52 + weekOfYear.
//
// ⚠️ 여기서 쓰는 주차 규칙은 **캘린더가 현재 주를 찍는 규칙과 반드시 같아야 한다** —
//    1월 1일부터 고정 7일 블록, 0~51 클램프(calendar-section 의 weekOfYear).
//    규칙이 어긋나면 구간 끝과 "오늘 칸"이 한 칸씩 밀린다.
//    (역방향 계산 index → 날짜는 과거에 실제로 한 주 어긋나 제거됐다.
//     calendar-section 의 handleCellTap 주석 참고. 여기는 정방향만 한다.)

export const LIFE_COLS = 52;
export const LIFE_ROWS = 100;

const WEEK_MS = 7 * 86400000;

/**
 * 그 해의 몇째 주(0~51). 1월 1일부터 고정 7일 블록.
 * 연말 1~2일은 51열에 흡수된다 — 캘린더의 현재 주 계산과 같은 클램프다.
 */
export function weekOfYear(date: Date): number {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const weeks = Math.floor((date.getTime() - jan1.getTime()) / WEEK_MS);
  return Math.max(0, Math.min(LIFE_COLS - 1, weeks));
}

/**
 * 날짜 → 셀 인덱스. 범위 밖(태어나기 전 / 100살 이후)이면 null.
 *
 * 생년월일이 없어 나이는 `현재 나이 - 지난 햇수`로 근사한다 — 그리드 자체가
 * profiles.life_clock_age 하나로 서 있으므로 같은 가정을 쓴다.
 */
export function cellIndexForDate(date: Date, ageNow: number, today: Date): number | null {
  if (!Number.isFinite(ageNow)) return null;
  const ageAt = Math.floor(ageNow) - (today.getFullYear() - date.getFullYear());
  if (ageAt < 0 || ageAt >= LIFE_ROWS) return null;
  return ageAt * LIFE_COLS + weekOfYear(date);
}

/** 캘린더에 그릴 색 구간 — from~to 는 셀 인덱스(둘 다 포함) */
export interface LifeSpan {
  bucketId: string;
  colorIndex: number;
  from: number;
  to: number;
  /** 진행 중이면 true — 현재 주 칸이 심장박동처럼 뛴다(다음 PR) */
  ongoing: boolean;
}

interface SpanInput {
  id: string;
  created_at: string;
  completed_at: string | null;
  status: string;
}

/**
 * 버킷들 → 캘린더 색 구간.
 *
 * 시작(created_at)부터 완료(completed_at)까지, 진행 중이면 오늘까지 칠한다.
 * 여러 버킷을 동시에 굴린 기간은 구간이 겹치고, 그 겹침을 블렌드 모드가 섞는다.
 */
export function buildLifeSpans(
  buckets: SpanInput[],
  colorByBucket: Map<string, number>,
  ageNow: number,
  today: Date = new Date()
): LifeSpan[] {
  const todayIndex = cellIndexForDate(today, ageNow, today);
  const spans: LifeSpan[] = [];

  for (const bucket of buckets) {
    const start = new Date(bucket.created_at);
    if (Number.isNaN(start.getTime())) continue;

    const ongoing = bucket.status !== "completed";
    const end = ongoing
      ? today
      : bucket.completed_at
        ? new Date(bucket.completed_at)
        : today;
    if (Number.isNaN(end.getTime())) continue;

    const from = cellIndexForDate(start, ageNow, today);
    const to = cellIndexForDate(end, ageNow, today);
    if (from == null || to == null) continue;

    spans.push({
      bucketId: bucket.id,
      colorIndex: colorByBucket.get(bucket.id) ?? 1,
      from: Math.min(from, to),
      // 진행 중이면 오늘 칸을 넘지 않게 — created_at 이 미래인 이상 데이터 방어
      to: Math.min(Math.max(from, to), todayIndex ?? Math.max(from, to)),
      ongoing,
    });
  }

  return spans;
}
