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

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

  // URL > cookie > buckets[0]
  const selectedBucketId = useMemo(() => {
    const urlBucket = searchParams.get("bucket");
    if (urlBucket && buckets.some((b) => b.id === urlBucket)) return urlBucket;
    if (cookieSelectedBucketId && buckets.some((b) => b.id === cookieSelectedBucketId)) {
      return cookieSelectedBucketId;
    }
    return buckets[0]?.id ?? null;
  }, [searchParams, buckets, cookieSelectedBucketId]);

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
