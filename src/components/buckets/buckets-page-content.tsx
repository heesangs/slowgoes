"use client";

// /buckets 페이지 콘텐츠 — 단순한 버킷 리스트 뷰.
// "새 버킷 추가" 폼과 stride_scope 필터는 제거됨.
// (생성은 대시보드 진입 시트의 "버킷리스트 생성" 플로우가 담당)

import { FEATURE_NAMES } from "@/lib/constants";
import { BucketList } from "@/components/buckets/bucket-list";
import type { Bucket, LifeArea } from "@/types";

type BucketRow = Bucket & {
  life_area?: Pick<LifeArea, "id" | "name"> | null;
};

interface BucketsPageContentProps {
  initialBuckets: BucketRow[];
  lifeAreas: Pick<LifeArea, "id" | "name">[];
  fetchError?: string;
}

export function BucketsPageContent({
  initialBuckets,
  lifeAreas,
  fetchError,
}: BucketsPageContentProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-foreground/60">
          {FEATURE_NAMES.MY_STRIDES}별로 {FEATURE_NAMES.BUCKET}을 정리하고, 상태를 관리하세요.
        </p>
      </div>

      <BucketList
        initialBuckets={initialBuckets}
        lifeAreas={lifeAreas}
        fetchError={fetchError}
      />
    </div>
  );
}
