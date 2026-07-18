"use client";

// 버킷 카드 (피그마 32633-19138) — 단일 버킷 중심 UI의 핵심.
//
// 앱의 목적은 여러 버킷을 병렬로 달성하는 게 아니라 **하나의 버킷에 집중해
// 행동력을 높이는 것** (CLAUDE.md Philosophy). 상단 버킷칩 스크롤을 대체한다.
//
// 구조: [버킷 라벨 / {타이틀}] + 우상단 ⋯(수정/삭제) + 하단 "나의 버킷 ▼"
// 카드 본문/"나의 버킷 ▼" 탭 → BucketListSheet(전환 + 새 버킷 추가)

import { useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { MoreActionsMenu } from "@/components/ui/more-actions-menu";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Bucket } from "@/types";

interface BucketCardProps {
  buckets: Pick<Bucket, "id" | "title">[];
  selectedBucket: Pick<Bucket, "id" | "title"> | null;
  /** ⋯ 수정 → 키보드 입력창(타이틀 프리필) */
  onEditTitle: () => void;
  /** ⋯ 삭제 → deleteBucketAction (구 캘린더 ⋮에서 이동) */
  onDelete: () => void;
  isDeleting?: boolean;
  /** 시트의 "새 버킷 추가" → ExploreNewSceneSheet */
  onAddBucket: () => void;
}

export function BucketCard({
  buckets,
  selectedBucket,
  onEditTitle,
  onDelete,
  isDeleting = false,
  onAddBucket,
}: BucketCardProps) {
  const [listOpen, setListOpen] = useState(false);

  // 버킷 전환 — shallow routing (구 BucketSwitcher.selectBucket 이식).
  // ?bucket= 만 바꾸면 useSearchParams가 동기화되어 RSC 왕복 없이 즉시 전환된다.
  function selectBucket(bucketId: string) {
    window.history.replaceState(null, "", `/dashboard?bucket=${bucketId}`);
    setListOpen(false);
  }

  return (
    <>
      <section className="rounded-xl border border-foreground/10 bg-foreground/[0.02]">
        {/* 본문 — 탭하면 버킷 리스트 시트 */}
        <div className="flex items-start justify-between gap-2 px-4 pt-4">
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
            aria-label={`${FEATURE_NAMES.BUCKET} 목록 열기`}
          >
            <span className="text-xs text-foreground/60">{FEATURE_NAMES.BUCKET}</span>
            <span className="text-base font-bold leading-snug">
              {selectedBucket?.title ?? `선택된 ${FEATURE_NAMES.BUCKET}이 없어요`}
            </span>
          </button>

          {selectedBucket && (
            <MoreActionsMenu
              ariaLabel={`${FEATURE_NAMES.BUCKET} 관리`}
              align="right"
              actions={[
                { label: "수정", onClick: onEditTitle },
                {
                  label: "삭제",
                  onClick: onDelete,
                  disabled: isDeleting,
                  variant: "danger",
                },
              ]}
            />
          )}
        </div>

        {/* 하단 "나의 버킷 ▼" */}
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="mt-3 flex w-full items-center gap-1 border-t border-foreground/10 px-4 py-2.5 text-xs text-foreground/50 transition-colors hover:bg-foreground/[0.03]"
        >
          나의 {FEATURE_NAMES.BUCKET}
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </section>

      {/* 버킷 리스트 시트 — 전환 + 새 버킷 추가 */}
      <BottomSheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={`나의 ${FEATURE_NAMES.BUCKET}`}
      >
        <ul className="flex flex-col gap-1">
          {buckets.map((bucket) => {
            const isCurrent = bucket.id === selectedBucket?.id;
            return (
              <li key={bucket.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!isCurrent) selectBucket(bucket.id);
                    else setListOpen(false);
                  }}
                  aria-current={isCurrent ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm transition-colors",
                    isCurrent
                      ? "bg-foreground font-semibold text-background"
                      : "hover:bg-foreground/5"
                  )}
                >
                  <span className="min-w-0 flex-1 break-words">{bucket.title}</span>
                  {isCurrent && (
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}

          {/* 새 버킷 추가 → ExploreNewSceneSheet */}
          <li>
            <button
              type="button"
              onClick={() => {
                setListOpen(false);
                onAddBucket();
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-foreground/25 px-3 py-3 text-left text-sm text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              <span aria-hidden>+</span> {FEATURE_NAMES.BUCKET} 추가
            </button>
          </li>
        </ul>
      </BottomSheet>
    </>
  );
}
