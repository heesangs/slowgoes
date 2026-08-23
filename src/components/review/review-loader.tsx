"use client";

// 회고 로더 — React Query로 클라이언트 페칭. 재방문 즉시 표시.
// ReviewPageContent는 순수 프레젠테이션이라 그대로 재사용(props 주입).

import { useReview } from "@/hooks/use-review";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { ReviewPageContent } from "./review-page-content";
import { Card } from "@/components/ui/card";
import { ErrorBox } from "@/components/ui/error-box";

const SKELETON = "rounded bg-fill-normal";

function ReviewSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse" aria-label="회고 로딩 중">
      <div className={`${SKELETON} h-6 w-40`} />
      {[0, 1, 2].map((i) => (
        <Card as="section" padded key={i}>
          <div className={`${SKELETON} h-4 w-24`} />
          <div className={`${SKELETON} mt-3 h-16 w-full`} />
        </Card>
      ))}
    </div>
  );
}

export function ReviewLoader() {
  const { data, isLoading, isError } = useReview();
  const showSkeleton = useDelayedFlag(isLoading || !data);

  if (isError) {
    return (
      <ErrorBox className="py-4">
        회고를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
      </ErrorBox>
    );
  }

  if (isLoading || !data) {
    return showSkeleton ? <ReviewSkeleton /> : null;
  }

  return (
    <ReviewPageContent
      displayName={data.displayName}
      data={data.reviewData}
      lifeBalance={data.lifeBalance}
    />
  );
}
