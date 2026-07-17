"use client";

// IA v2 목표 3: 메인 헤더 하단에 마운트되는 버킷 스위처 + 새 장면 탐색 시트.
//
// 모든 (main) 화면에서 동일한 UX로 버킷을 전환할 수 있게 한다.
// 서버 layout에서 buckets / prefillProfile / cookieSelectedBucketId 를 받아온 뒤,
// 클라이언트에서 URL searchParams 까지 반영하여 활성 칩을 결정한다.
//
// 우선순위 (대시보드/액션 페이지 서버 컴포넌트와 동일):
//   1) URL ?bucket=
//   2) cookie last_viewed_bucket_id
//   3) buckets[0]
//
// `+` 칩 → ExploreNewSceneSheet (목표 3 신설).
//
// 노출 라우트:
// - /dashboard 등 버킷 컨텍스트가 의미 있는 라우트에서만 노출.
//   (IA v2 목표 5: /actions 폐기로 사실상 /dashboard 단일.)
// - /profile, /review 같은 글로벌 라우트에서는 숨김 — 버킷 전환의 결과 화면이 모호하기 때문.

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readLastViewedBucketCookie } from "@/hooks/use-track-last-viewed-bucket";
import { BucketSwitcher } from "@/components/navigation/bucket-switcher";
import { ExploreNewSceneSheet } from "@/components/dashboard/explore-new-scene-sheet";
import { useToast } from "@/components/ui/toast";
import type { Bucket, Gender, PaceType, PersonalityType } from "@/types";

interface MainNavBarProps {
  buckets: Pick<Bucket, "id" | "title">[];
  /** 서버 layout에서 cookie로부터 읽은 마지막 본 버킷 id */
  cookieSelectedBucketId: string | null;
  /** ExploreNewSceneSheet에서 OnboardingForm에 채워줄 프로필 (없으면 사용자가 직접 입력) */
  prefillProfile: {
    age: number;
    gender: Gender;
    personalityType: PersonalityType;
    paceType?: PaceType;
  } | null;
}

// 버킷 스위처를 노출할 라우트 — 그 외에는 null 반환으로 헤더 하단 공간을 줄임.
// IA v2 목표 5: /actions 폐기로 /dashboard 단일.
const BUCKET_SCOPED_PATHS = ["/dashboard"];

export function MainNavBar({
  buckets,
  cookieSelectedBucketId,
  prefillProfile,
}: MainNavBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [exploreOpen, setExploreOpen] = useState(false);

  const basePath = useMemo(() => {
    const match = BUCKET_SCOPED_PATHS.find((p) => pathname?.startsWith(p));
    return match ?? null;
  }, [pathname]);

  // 쿠키는 **클라이언트에서** 읽는다. 서버가 읽은 prop은 요청 시점에 박제되는데,
  // 버킷 전환이 shallow routing이라 레이아웃이 재렌더되지 않아 세션 내내 낡는다.
  // 그 낡은 값으로 해석하면 DashboardLoader(클라 쿠키 기준)와 서로 다른 버킷을 가리킨다.
  // prop은 SSR 첫 페인트 시드로만 쓰고(하이드레이션 불일치 방지), 마운트 후 실제 쿠키로 교체.
  const [clientCookieBucketId, setClientCookieBucketId] = useState<string | null>(null);
  useEffect(() => {
    setClientCookieBucketId(readLastViewedBucketCookie());
  }, [searchParams, buckets]);

  const effectiveCookieBucketId = clientCookieBucketId ?? cookieSelectedBucketId;

  // URL > cookie > buckets[0]
  const selectedBucketId = useMemo(() => {
    const urlBucket = searchParams.get("bucket");
    if (urlBucket && buckets.some((b) => b.id === urlBucket)) return urlBucket;
    if (effectiveCookieBucketId && buckets.some((b) => b.id === effectiveCookieBucketId)) {
      return effectiveCookieBucketId;
    }
    return buckets[0]?.id ?? null;
  }, [searchParams, buckets, effectiveCookieBucketId]);

  if (!basePath) return null;

  return (
    <>
      <div className="border-b border-foreground/10">
        <div className="mx-auto max-w-2xl">
          <BucketSwitcher
            buckets={buckets}
            selectedBucketId={selectedBucketId}
            basePath={basePath}
            onAddBucket={() => setExploreOpen(true)}
          />
        </div>
      </div>

      <ExploreNewSceneSheet
        open={exploreOpen}
        onClose={() => setExploreOpen(false)}
        prefillProfile={prefillProfile}
        onComplete={() => {
          setExploreOpen(false);
          router.refresh();
          toast("새로운 행동이 추가되었어요 ✨", "success");
        }}
      />
    </>
  );
}
