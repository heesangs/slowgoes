"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchBucketReportAction } from "@/app/(main)/dashboard/actions";

/** 완료 리포트 한 건 (/buckets/[id]) */
export function useBucketReport(bucketId: string) {
  return useQuery({
    queryKey: ["buckets", "report", bucketId],
    queryFn: () => fetchBucketReportAction(bucketId),
    enabled: !!bucketId,
  });
}
