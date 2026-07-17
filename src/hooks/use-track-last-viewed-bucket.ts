"use client";

// PR 31: 사용자가 현재 보고 있는 버킷 ID를 cookie에 기록.
//
// 동기: 로고(/dashboard 정적 링크) 클릭 시 쿼리가 없어지면
//   대시보드 페이지가 buckets[0] (최신 created_at)을 fallback으로 선택해
//   "마지막으로 본 버킷"이 유지되지 않는 문제 해결.
//
// 흐름: 대시보드/한걸음 상세 페이지에서 selectedBucketId가 결정되면 이 훅이
//   client-side에서 document.cookie에 last_viewed_bucket_id 갱신.
//   다음 요청부터 서버 컴포넌트가 cookies()로 읽어 우선순위에 활용.
//
// 우선순위 (서버 측, dashboard/page.tsx / actions/page.tsx):
//   1) URL searchParams.bucket (사용자가 명시적으로 선택한 버킷)
//   2) cookie.last_viewed_bucket_id (마지막으로 본 버킷, 존재 검증 후)
//   3) buckets[0]?.id (fallback)

import { useEffect } from "react";

const COOKIE_NAME = "last_viewed_bucket_id";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30일

export function useTrackLastViewedBucket(bucketId: string | null) {
  useEffect(() => {
    if (!bucketId) return;
    if (typeof document === "undefined") return;
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(bucketId)}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`;
  }, [bucketId]);
}

// 클라이언트에서 쿠키를 직접 읽는다 (SSR에선 null).
//
// 왜 필요한가: 서버가 읽은 값(prop)은 **요청 시점에 박제**된다. 쿠키는 렌더 후
// 클라이언트가 쓰고(useTrackLastViewedBucket), 버킷 전환이 shallow routing이라
// 레이아웃이 재렌더되지 않으므로 서버 prop은 세션 내내 낡는다.
// → 소비자들이 이 함수로 같은 값을 읽어야 해석이 갈리지 않는다.
export function readLastViewedBucketCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export const LAST_VIEWED_BUCKET_COOKIE_NAME = COOKIE_NAME;
