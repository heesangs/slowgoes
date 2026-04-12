"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  createBucketAction,
  deleteBucketAction,
  updateBucketAction,
} from "@/app/(main)/buckets/actions";
import type { Bucket, StrideScope, BucketStatus, LifeArea } from "@/types";

type BucketRow = Bucket & {
  life_area?: Pick<LifeArea, "id" | "name"> | null;
};

interface BucketsPageContentProps {
  initialBuckets: BucketRow[];
  lifeAreas: Pick<LifeArea, "id" | "name">[];
  fetchError?: string;
}

type StrideScopeFilter = "all" | StrideScope;

// 긴 → 짧은 순서로 그룹 표시 (기존 UX 유지)
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
  const matched = STRIDE_SCOPE_OPTIONS.find((option) => option.value === value);
  return matched?.label ?? value;
}

function statusLabel(value: BucketStatus) {
  const matched = STATUS_OPTIONS.find((option) => option.value === value);
  return matched?.label ?? value;
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

export function BucketsPageContent({
  initialBuckets,
  lifeAreas,
  fetchError,
}: BucketsPageContentProps) {
  const { toast } = useToast();
  const [buckets, setBuckets] = useState<BucketRow[]>(initialBuckets);
  const [filter, setFilter] = useState<StrideScopeFilter>("all");

  const [title, setTitle] = useState("");
  const [lifeAreaId, setLifeAreaId] = useState("");
  const [strideScope, setStrideScope] = useState<StrideScope>("this_season");
  const [status, setStatus] = useState<BucketStatus>("not_started");
  const [isCreating, setIsCreating] = useState(false);

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

  const filteredBuckets = useMemo(() => {
    if (filter === "all") return buckets;
    return buckets.filter((bucket) => bucket.stride_scope === filter);
  }, [buckets, filter]);

  const groupedBuckets = useMemo(() => {
    return STRIDE_SCOPE_ORDER.map((scopeValue) => ({
      strideScope: scopeValue,
      items: filteredBuckets.filter((bucket) => bucket.stride_scope === scopeValue),
    }));
  }, [filteredBuckets]);

  const hasBuckets = filteredBuckets.length > 0;

  async function handleCreate() {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      toast("버킷 제목을 입력해주세요.", "error");
      return;
    }

    setIsCreating(true);
    try {
      const result = await createBucketAction({
        title: normalizedTitle,
        lifeAreaId: lifeAreaId || null,
        strideScope,
        status,
      });

      if (!result.success || !result.data) {
        toast(result.error ?? "버킷 생성에 실패했습니다.", "error");
        return;
      }

      setBuckets((prev) => [result.data!, ...prev]);
      setTitle("");
      setLifeAreaId("");
      setStrideScope("this_season");
      setStatus("not_started");
      toast("버킷을 추가했습니다.", "success");
    } finally {
      setIsCreating(false);
    }
  }

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

      setBuckets((prev) => prev.map((item) => (item.id === bucketId ? result.data! : item)));
      cancelEdit();
      toast("버킷을 수정했습니다.", "success");
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
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">버킷 관리</h1>
        <p className="text-sm text-foreground/60 mt-1">
          나의 보폭별로 삶의 장면을 정리하고, 상태를 관리하세요.
        </p>
      </div>

      <section className="rounded-xl border border-foreground/10 p-4 flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground/80">새 버킷 추가</p>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="예: 부모님과 봄 여행 가기"
          className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={lifeAreaId}
            onChange={(event) => setLifeAreaId(event.target.value)}
            className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
          >
            <option value="">삶의 영역 없음</option>
            {lifeAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>

          <select
            value={strideScope}
            onChange={(event) => setStrideScope(event.target.value as StrideScope)}
            className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
          >
            {STRIDE_SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as BucketStatus)}
            className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <Button onClick={handleCreate} isLoading={isCreating} className="w-full sm:w-fit">
          버킷 추가
        </Button>
      </section>

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1.5 text-sm min-h-[44px] transition-colors ${
            filter === "all"
              ? "bg-foreground text-background"
              : "border border-foreground/20 text-foreground/80 hover:bg-foreground/5"
          }`}
        >
          전체
        </button>
        {STRIDE_SCOPE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-full px-3 py-1.5 text-sm min-h-[44px] transition-colors ${
              filter === option.value
                ? "bg-foreground text-background"
                : "border border-foreground/20 text-foreground/80 hover:bg-foreground/5"
            }`}
          >
            {option.label}
          </button>
        ))}
      </section>

      {!hasBuckets && (
        <div className="rounded-lg border border-dashed border-foreground/20 px-4 py-6 text-sm text-foreground/70 text-center">
          조건에 맞는 버킷이 아직 없습니다.
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
                          <option value="">삶의 영역 없음</option>
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
                          {bucket.life_area?.name ?? "삶의 영역 없음"}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <Link
                          href={`/buckets/${bucket.id}`}
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
