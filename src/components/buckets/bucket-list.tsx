"use client";

// 버킷 리스트 + 인라인 수정 + 삭제 + 상세 진입.
// `/buckets` 페이지와 대시보드 바텀시트("버킷리스트 관리") 양쪽에서 재사용.
//
// 의도적으로 제외한 것:
// - "새 버킷 추가" 폼 — 진입 전 시트의 "버킷리스트 생성"이 그 역할을 담당
// - stride_scope 필터 — 그룹 헤더로 충분히 구분되며, 화면 단순화

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  deleteBucketAction,
  updateBucketAction,
} from "@/app/(main)/buckets/actions";
import { FEATURE_NAMES } from "@/lib/constants";
import type { Bucket, StrideScope, BucketStatus, LifeArea } from "@/types";

type BucketRow = Bucket & {
  life_area?: Pick<LifeArea, "id" | "name"> | null;
};

interface BucketListProps {
  initialBuckets: BucketRow[];
  lifeAreas: Pick<LifeArea, "id" | "name">[];
  fetchError?: string;
  /**
   * 변경 발생 시 외부 콘텍스트(e.g. 시트가 열린 대시보드)에 알림.
   * 시트가 닫힐 때 router.refresh() 등으로 활용 가능.
   */
  onChanged?: () => void;
  /**
   * 상세 링크를 누르면 호출 — 시트 모드에서 시트를 닫고 페이지로 이동시킬 때 사용.
   */
  onNavigateDetail?: () => void;
}

const STRIDE_SCOPE_ORDER: StrideScope[] = [
  "someday",
  "decade",
  "five_years",
  "this_year",
  "this_season",
  "this_month",
  "this_week",
  "today",
];

const STRIDE_SCOPE_OPTIONS: Array<{ value: StrideScope; label: string }> = [
  { value: "today", label: "오늘" },
  { value: "this_week", label: "이번 주" },
  { value: "this_month", label: "이번 달" },
  { value: "this_season", label: "이번 시즌" },
  { value: "this_year", label: "1년 안" },
  { value: "five_years", label: "5년 안" },
  { value: "decade", label: "10년 안" },
  { value: "someday", label: "언젠가" },
];

const STATUS_OPTIONS: Array<{ value: BucketStatus; label: string }> = [
  { value: "not_started", label: "시작 전" },
  { value: "in_progress", label: "진행 중" },
  { value: "completed", label: "완료" },
  { value: "paused", label: "보류" },
];

function strideScopeLabel(value: StrideScope) {
  return STRIDE_SCOPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function statusLabel(value: BucketStatus) {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function BucketList({
  initialBuckets,
  lifeAreas,
  fetchError,
  onChanged,
  onNavigateDetail,
}: BucketListProps) {
  const { toast } = useToast();
  const [buckets, setBuckets] = useState<BucketRow[]>(initialBuckets);

  // 외부 데이터 갱신 시 동기화 (시트 재오픈 등)
  useEffect(() => {
    setBuckets(initialBuckets);
  }, [initialBuckets]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editLifeAreaId, setEditLifeAreaId] = useState("");
  const [editStrideScope, setEditStrideScope] = useState<StrideScope>("this_season");
  const [editStatus, setEditStatus] = useState<BucketStatus>("not_started");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (fetchError) {
      toast(fetchError, "error");
    }
  }, [fetchError, toast]);

  const groupedBuckets = useMemo(() => {
    return STRIDE_SCOPE_ORDER.map((scopeValue) => ({
      strideScope: scopeValue,
      items: buckets.filter((bucket) => bucket.stride_scope === scopeValue),
    }));
  }, [buckets]);

  const hasBuckets = buckets.length > 0;

  function startEdit(bucket: BucketRow) {
    setEditingId(bucket.id);
    setEditTitle(bucket.title);
    setEditLifeAreaId(bucket.life_area_id ?? "");
    setEditStrideScope(bucket.stride_scope);
    setEditStatus(bucket.status);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditLifeAreaId("");
    setEditStrideScope("this_season");
    setEditStatus("not_started");
  }

  async function handleSave(bucketId: string) {
    const normalizedTitle = editTitle.trim();
    if (!normalizedTitle) {
      toast("버킷 제목을 입력해주세요.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateBucketAction(bucketId, {
        title: normalizedTitle,
        lifeAreaId: editLifeAreaId || null,
        strideScope: editStrideScope,
        status: editStatus,
      });

      if (!result.success || !result.data) {
        toast(result.error ?? "버킷 수정에 실패했습니다.", "error");
        return;
      }

      setBuckets((prev) =>
        prev.map((item) => (item.id === bucketId ? result.data! : item))
      );
      cancelEdit();
      toast("버킷을 수정했습니다.", "success");
      onChanged?.();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(bucketId: string) {
    setDeletingId(bucketId);
    try {
      const result = await deleteBucketAction(bucketId);
      if (!result.success) {
        toast(result.error ?? "버킷 삭제에 실패했습니다.", "error");
        return;
      }
      setBuckets((prev) => prev.filter((item) => item.id !== bucketId));
      if (editingId === bucketId) {
        cancelEdit();
      }
      toast("버킷을 삭제했습니다.", "success");
      onChanged?.();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {!hasBuckets && (
        <div className="rounded-lg border border-dashed border-foreground/20 px-4 py-6 text-sm text-foreground/70 text-center">
          아직 만들어진 버킷이 없어요.
        </div>
      )}

      {groupedBuckets.map((group) => {
        if (group.items.length === 0) return null;

        return (
          <section key={group.strideScope} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground/60">
              {strideScopeLabel(group.strideScope)} ({group.items.length})
            </h2>

            {group.items.map((bucket) => {
              const isEditing = editingId === bucket.id;
              const isDeleting = deletingId === bucket.id;

              return (
                <article
                  key={bucket.id}
                  className="rounded-xl border border-foreground/10 p-4 flex flex-col gap-3"
                >
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                        className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select
                          value={editLifeAreaId}
                          onChange={(event) => setEditLifeAreaId(event.target.value)}
                          className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
                        >
                          <option value="">{FEATURE_NAMES.LIFE_AREA} 없음</option>
                          {lifeAreas.map((area) => (
                            <option key={area.id} value={area.id}>
                              {area.name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={editStrideScope}
                          onChange={(event) => setEditStrideScope(event.target.value as StrideScope)}
                          className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
                        >
                          {STRIDE_SCOPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={editStatus}
                          onChange={(event) => setEditStatus(event.target.value as BucketStatus)}
                          className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          isLoading={isSaving}
                          onClick={() => handleSave(bucket.id)}
                        >
                          저장
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={cancelEdit}
                          disabled={isSaving}
                        >
                          취소
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1">
                        <p className="text-base font-semibold">{bucket.title}</p>
                        <p className="text-xs text-foreground/60">
                          생성일 {shortDate(bucket.created_at)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-foreground/20 px-2 py-1">
                          {strideScopeLabel(bucket.stride_scope)}
                        </span>
                        <span className="rounded-full border border-foreground/20 px-2 py-1">
                          {statusLabel(bucket.status)}
                        </span>
                        <span className="rounded-full border border-foreground/20 px-2 py-1">
                          {bucket.life_area?.name ?? `${FEATURE_NAMES.LIFE_AREA} 없음`}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <Link
                          href={`/buckets/${bucket.id}`}
                          onClick={() => onNavigateDetail?.()}
                          className="inline-flex items-center justify-center rounded-lg border border-foreground/20 px-3 py-2 text-sm min-h-[44px] hover:bg-foreground/5 transition-colors"
                        >
                          상세
                        </Link>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => startEdit(bucket)}
                        >
                          수정
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleDelete(bucket.id)}
                          isLoading={isDeleting}
                        >
                          삭제
                        </Button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
