"use client";

import type { Bucket } from "@/types";

interface BucketSelectProps {
  existingBuckets: Array<Pick<Bucket, "id" | "title" | "stride_scope" | "status" | "created_at">>;
  onSelectBucket: (bucket: Pick<Bucket, "id" | "title">) => void;
  onNewBucket: () => void;
}

export function BucketSelect({ existingBuckets, onSelectBucket, onNewBucket }: BucketSelectProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold">어떤 버킷에 추가할까요?</h2>
        <p className="text-sm text-foreground/60">기존 버킷에 행동을 추가하거나, 새로운 장면을 탐색해보세요</p>
      </div>

      <div className="flex flex-col gap-2">
        {existingBuckets.map((bucket) => (
          <button
            key={bucket.id}
            type="button"
            onClick={() => onSelectBucket(bucket)}
            className="w-full rounded-xl border border-foreground/15 bg-foreground/[0.02] px-4 py-4 text-left transition-colors hover:bg-foreground/[0.06]"
          >
            <p className="text-sm font-medium">{bucket.title}</p>
            <p className="mt-1 text-xs text-foreground/55">
              {bucket.status === "in_progress" ? "진행 중" : bucket.status === "completed" ? "완료" : "시작 전"}
            </p>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onNewBucket}
        className="w-full rounded-xl border border-dashed border-foreground/25 px-4 py-4 text-center text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/[0.04]"
      >
        ✨ 새로운 장면 탐색하기
      </button>
    </div>
  );
}
