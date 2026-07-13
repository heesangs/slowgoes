"use client";

// 대시보드 로더 — React Query로 버킷별 데이터를 클라이언트 페칭.
// requestedBucketId = URL ?bucket= ?? 쿠키(last_viewed_bucket_id).
// 재방문/버킷 재선택 시 캐시 즉시 표시. profile 없으면(data===null) 온보딩으로.

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDashboard } from "@/hooks/use-dashboard";
import { DashboardContentV2 } from "./dashboard-content-v2";
import { LAST_VIEWED_BUCKET_COOKIE_NAME } from "@/hooks/use-track-last-viewed-bucket";

const SKELETON = "rounded bg-foreground/10";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4 pb-24 animate-pulse" aria-label="대시보드 로딩 중">
      {[0, 1, 2, 3].map((i) => (
        <section key={i} className="rounded-xl border border-foreground/10 px-4 py-4">
          <div className={`${SKELETON} h-3 w-20`} />
          <div className={`${SKELETON} mt-3 h-5 w-40`} />
          <div className={`${SKELETON} mt-3 h-4 w-full`} />
        </section>
      ))}
    </div>
  );
}

export function DashboardLoader() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlBucket = searchParams.get("bucket");
  const requestedBucketId = urlBucket ?? readCookie(LAST_VIEWED_BUCKET_COOKIE_NAME);

  const { data, isLoading, isError } = useDashboard(requestedBucketId);

  // 온보딩 미완(profile 없음) → 온보딩으로
  useEffect(() => {
    if (!isLoading && !isError && data === null) {
      router.replace("/onboarding");
    }
  }, [isLoading, isError, data, router]);

  if (isError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-600">
        대시보드를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
      </p>
    );
  }

  // 로딩 중 또는 온보딩 리다이렉트 대기
  if (isLoading || !data) {
    return <DashboardSkeleton />;
  }

  return <DashboardContentV2 data={data} />;
}
