// 버킷 색 (Figma bucket_list_color 37959:45112) — 앞에서부터 1~7.
//
// 색 자체는 globals.css 의 --bucket-1..7 이 정본이다. 여기는 "어느 버킷이 몇 번인가"만 정한다.
//
// **파생 규칙이 한 곳에만 있어야 하는 이유**: 캘린더는 서버에서 받은 목록으로,
// 버킷 시트는 클라이언트 상태로 색을 그린다. 두 곳이 다른 답을 내면 같은 버킷이
// 화면마다 다른 색으로 보인다.

export const BUCKET_COLOR_COUNT = 7;

/** 1~7. globals.css 의 --bucket-N 과 같은 번호 */
export type BucketColorIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** 색 이름 — 팔레트의 접근성 라벨에 쓴다(Figma 배리언트 이름) */
export const BUCKET_COLOR_NAMES: Record<BucketColorIndex, string> = {
  1: "테라코타",
  2: "웜 오렌지",
  3: "머스터드",
  4: "올리브",
  5: "코른플라워",
  6: "슬레이트",
  7: "더스티 퍼플",
};

export const BUCKET_COLOR_INDEXES: BucketColorIndex[] = [1, 2, 3, 4, 5, 6, 7];

/** CSS 변수 이름 — 캔버스가 getComputedStyle 로 읽어 갈 때 쓴다 */
export function bucketColorVar(index: BucketColorIndex): string {
  return `--bucket-${index}`;
}

function isColorIndex(value: unknown): value is BucketColorIndex {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}

/**
 * 버킷의 실제 색 번호.
 *
 * 직접 고른 값(color_index)이 있으면 그것, 없으면 **등록 순서**에서 파생한다.
 * order 는 그 사용자의 버킷을 created_at 오름차순으로 세운 0-based 위치다.
 * 8번째 버킷은 다시 1번 색으로 돈다 — 색이 일곱뿐이라 언젠가는 겹치고,
 * 그때 구간이 겹쳐도 블렌딩이 받아 준다.
 */
export function resolveBucketColorIndex(
  colorIndex: number | null | undefined,
  order: number
): BucketColorIndex {
  if (isColorIndex(colorIndex)) return colorIndex;
  const safeOrder = Number.isFinite(order) && order >= 0 ? Math.floor(order) : 0;
  return ((safeOrder % BUCKET_COLOR_COUNT) + 1) as BucketColorIndex;
}

/**
 * 목록 전체의 색을 한 번에 푼다 — 개별 호출로 흩어지면 order 기준이 갈린다.
 * 입력 순서와 무관하게 **created_at 오름차순(먼저 만든 것이 0번)**으로 세운다.
 */
export function resolveBucketColors<
  T extends { id: string; created_at: string; color_index?: number | null },
>(buckets: T[]): Map<string, BucketColorIndex> {
  const ordered = [...buckets].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const map = new Map<string, BucketColorIndex>();
  ordered.forEach((bucket, order) => {
    map.set(bucket.id, resolveBucketColorIndex(bucket.color_index, order));
  });
  return map;
}
