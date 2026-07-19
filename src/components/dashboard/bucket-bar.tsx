"use client";

// 버킷 상단바 (피그마 32821:19432) — 구 BucketCard를 슬림 바로 승격.
//
// 구 '나의 시간' 바 자리(헤더 바로 아래)에 flush로 붙는다:
//   [버킷(라벨)  {타이틀}(볼드) ───────── ▼]  + 하단 보더
// 탭 → BucketListSheet(전환 + 새 버킷 추가 + 편집 모드).
//
// 편집 모드: 시트 헤더의 "닫기" 대신 "편집" 토글 —
//   켜면 각 행에 [수정]·[삭제]가 노출된다 (구 카드 ⋯ 메뉴를 시트로 이동).
//   닫기는 배경 탭/ESC로 가능.

import { useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Bucket } from "@/types";

type BucketItem = Pick<Bucket, "id" | "title">;

interface BucketBarProps {
  buckets: BucketItem[];
  selectedBucket: BucketItem | null;
  /** 편집 모드 [수정] → 키보드 입력창(해당 버킷 타이틀 프리필) */
  onEditTitle: (bucket: BucketItem) => void;
  /** 편집 모드 [삭제] → confirm 후 deleteBucketAction */
  onDelete: (bucket: BucketItem) => void;
  isDeleting?: boolean;
  /** "+ 버킷 추가" → ExploreNewSceneSheet */
  onAddBucket: () => void;
}

export function BucketBar({
  buckets,
  selectedBucket,
  onEditTitle,
  onDelete,
  isDeleting = false,
  onAddBucket,
}: BucketBarProps) {
  const [listOpen, setListOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // 버킷 전환 — shallow routing (?bucket=만 교체 → RSC 왕복 없이 즉시 전환)
  function selectBucket(bucketId: string) {
    window.history.replaceState(null, "", `/dashboard?bucket=${bucketId}`);
    closeSheet();
  }

  function closeSheet() {
    setListOpen(false);
    setEditMode(false); // 다음 오픈은 항상 일반 모드부터
  }

  return (
    <>
      {/* 슬림 바 — 헤더 바로 아래 flush. 전체가 시트 오픈 버튼 */}
      <button
        type="button"
        onClick={() => setListOpen(true)}
        aria-label={`${FEATURE_NAMES.BUCKET} 목록 열기`}
        className="flex w-full items-center gap-2 border-b border-foreground/10 px-4 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]"
      >
        <span className="shrink-0 text-xs text-foreground/50">{FEATURE_NAMES.BUCKET}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {selectedBucket?.title ?? `선택된 ${FEATURE_NAMES.BUCKET}이 없어요`}
        </span>
        <svg
          className="h-3.5 w-3.5 shrink-0 text-foreground/50"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 버킷 리스트 시트 — 전환 + 추가 + 편집(수정/삭제) */}
      <BottomSheet
        open={listOpen}
        onClose={closeSheet}
        title={`나의 ${FEATURE_NAMES.BUCKET}`}
        headerAction={
          <button
            type="button"
            onClick={() => setEditMode((prev) => !prev)}
            aria-pressed={editMode}
            className={cn(
              "inline-flex min-h-[36px] items-center rounded-md border px-2.5 text-xs transition-colors",
              editMode
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/20 hover:bg-foreground/5"
            )}
          >
            {editMode ? "완료" : "편집"}
          </button>
        }
      >
        <ul className="flex flex-col gap-1">
          {buckets.map((bucket) => {
            const isCurrent = bucket.id === selectedBucket?.id;

            if (editMode) {
              // 편집 모드: 행 탭 없음 — [수정]·[삭제] 액션만
              return (
                <li
                  key={bucket.id}
                  className="flex items-center gap-2 rounded-lg border border-foreground/10 px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1 break-words text-sm">
                    {bucket.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      closeSheet();
                      onEditTitle(bucket);
                    }}
                    className="shrink-0 rounded-md border border-foreground/20 px-2 py-1 text-xs transition-colors hover:bg-foreground/5"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(bucket)}
                    disabled={isDeleting}
                    className="shrink-0 rounded-md border border-red-300/60 px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </li>
              );
            }

            return (
              <li key={bucket.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!isCurrent) selectBucket(bucket.id);
                    else closeSheet();
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

          {/* 새 버킷 추가 → ExploreNewSceneSheet (일반 모드에서만) */}
          {!editMode && (
            <li>
              <button
                type="button"
                onClick={() => {
                  closeSheet();
                  onAddBucket();
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-foreground/25 px-3 py-3 text-left text-sm text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                <span aria-hidden>+</span> {FEATURE_NAMES.BUCKET} 추가
              </button>
            </li>
          )}
        </ul>
      </BottomSheet>
    </>
  );
}
