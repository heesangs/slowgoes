"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  createChapterAction,
  deleteChapterAction,
  decomposeBucketAction,
  updateChapterAction,
} from "@/app/(main)/buckets/actions";
import { FEATURE_NAMES } from "@/lib/constants";
import type {
  Bucket,
  BucketDecompositionSuggestion,
  BucketStatus,
  StrideScope,
  Chapter,
  ChapterStatus,
  LifeArea,
} from "@/types";

type BucketRow = Bucket & {
  life_area?: Pick<LifeArea, "id" | "name"> | null;
};

interface BucketDetailContentProps {
  bucket: BucketRow;
  initialChapters: Chapter[];
  fetchError?: string;
}

const CHAPTER_STATUS_OPTIONS: Array<{ value: ChapterStatus; label: string }> = [
  { value: "active", label: "진행 중" },
  { value: "completed", label: "완료" },
  { value: "paused", label: "보류" },
];

function strideScopeLabel(value: StrideScope) {
  switch (value) {
    case "today": return "오늘";
    case "this_week": return "이번 주";
    case "this_month": return "이번 달";
    case "this_season": return "이번 시즌";
    case "this_year": return "1년 안";
    case "five_years": return "5년 안";
    case "decade": return "10년 안";
    case "someday": return "언젠가";
    default: return value;
  }
}

function bucketStatusLabel(value: BucketStatus) {
  if (value === "not_started") return "시작 전";
  if (value === "in_progress") return "진행 중";
  if (value === "completed") return "완료";
  return "보류";
}

function chapterStatusLabel(value: ChapterStatus) {
  const matched = CHAPTER_STATUS_OPTIONS.find((item) => item.value === value);
  return matched?.label ?? value;
}

function shortDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function periodLabel(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return "기간 미설정";
  return `${shortDate(startDate)} ~ ${shortDate(endDate)}`;
}

export function BucketDetailContent({
  bucket,
  initialChapters,
  fetchError,
}: BucketDetailContentProps) {
  const { toast } = useToast();

  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ChapterStatus>("active");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<ChapterStatus>("active");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<BucketDecompositionSuggestion[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [applyingSuggestionIndex, setApplyingSuggestionIndex] = useState<number | null>(null);

  useEffect(() => {
    if (fetchError) {
      toast(fetchError, "error");
    }
  }, [fetchError, toast]);

  async function handleCreate() {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      toast("챕터 제목을 입력해주세요.", "error");
      return;
    }

    setIsCreating(true);
    try {
      const result = await createChapterAction(bucket.id, {
        title: normalizedTitle,
        description: description.trim() || null,
        status,
        startDate: startDate || null,
        endDate: endDate || null,
      });

      if (!result.success || !result.data) {
        toast(result.error ?? "챕터 생성에 실패했습니다.", "error");
        return;
      }

      setChapters((prev) => [result.data!, ...prev]);
      setTitle("");
      setDescription("");
      setStatus("active");
      setStartDate("");
      setEndDate("");
      toast("챕터를 추가했습니다.", "success");
    } finally {
      setIsCreating(false);
    }
  }

  function startEdit(chapter: Chapter) {
    setEditingId(chapter.id);
    setEditTitle(chapter.title);
    setEditDescription(chapter.description ?? "");
    setEditStatus(chapter.status);
    setEditStartDate(chapter.start_date ?? "");
    setEditEndDate(chapter.end_date ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    setEditStatus("active");
    setEditStartDate("");
    setEditEndDate("");
  }

  async function handleSave(chapterId: string) {
    const normalizedTitle = editTitle.trim();
    if (!normalizedTitle) {
      toast("챕터 제목을 입력해주세요.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateChapterAction(bucket.id, chapterId, {
        title: normalizedTitle,
        description: editDescription.trim() || null,
        status: editStatus,
        startDate: editStartDate || null,
        endDate: editEndDate || null,
      });

      if (!result.success || !result.data) {
        toast(result.error ?? "챕터 수정에 실패했습니다.", "error");
        return;
      }

      setChapters((prev) => prev.map((item) => (item.id === chapterId ? result.data! : item)));
      cancelEdit();
      toast("챕터를 수정했습니다.", "success");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(chapterId: string) {
    setDeletingId(chapterId);
    try {
      const result = await deleteChapterAction(bucket.id, chapterId);
      if (!result.success) {
        toast(result.error ?? "챕터 삭제에 실패했습니다.", "error");
        return;
      }

      setChapters((prev) => prev.filter((item) => item.id !== chapterId));
      if (editingId === chapterId) {
        cancelEdit();
      }
      toast("챕터를 삭제했습니다.", "success");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleGenerateSuggestions() {
    setIsGeneratingSuggestions(true);
    try {
      const result = await decomposeBucketAction(bucket.id);
      if (!result.success || !result.data) {
        toast(result.error ?? "AI 제안을 불러오지 못했습니다.", "error");
        return;
      }

      setAiSuggestions(result.data);
      toast("AI 챕터 제안을 준비했어요.", "success");
    } finally {
      setIsGeneratingSuggestions(false);
    }
  }

  async function handleApplySuggestion(suggestion: BucketDecompositionSuggestion, index: number) {
    setApplyingSuggestionIndex(index);
    try {
      const description = `${suggestion.chapterDescription} 첫 행동: ${suggestion.firstAction}`;
      const result = await createChapterAction(bucket.id, {
        title: suggestion.chapterTitle,
        description,
        status: "active",
        startDate: null,
        endDate: null,
      });

      if (!result.success || !result.data) {
        toast(result.error ?? "챕터 추가에 실패했습니다.", "error");
        return;
      }

      setChapters((prev) => [result.data!, ...prev]);
      setAiSuggestions((prev) => prev.filter((_, suggestionIndex) => suggestionIndex !== index));
      toast("AI 제안으로 챕터를 추가했습니다.", "success");
    } finally {
      setApplyingSuggestionIndex(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/buckets"
        className="inline-flex items-center gap-1 text-sm text-foreground/60 hover:text-foreground/80 transition-colors min-h-[44px]"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 12L6 8L10 4" />
        </svg>
        버킷 목록
      </Link>

      <section className="rounded-xl border border-foreground/10 p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{bucket.title}</h1>
          <p className="text-sm text-foreground/60">
            {FEATURE_NAMES.LIFE_AREA}: {bucket.life_area?.name ?? "미연결"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-foreground/20 px-2 py-1">
            {strideScopeLabel(bucket.stride_scope)}
          </span>
          <span className="rounded-full border border-foreground/20 px-2 py-1">
            {bucketStatusLabel(bucket.status)}
          </span>
          <span className="rounded-full border border-foreground/20 px-2 py-1">
            생성일 {shortDate(bucket.created_at)}
          </span>
        </div>

        <Link
          href={`/dashboard?bucket=${bucket.id}`}
          className="inline-flex items-center justify-center rounded-lg border border-foreground/20 px-4 py-2 text-sm font-medium min-h-[44px] hover:bg-foreground/5 transition-colors w-full sm:w-fit"
        >
          이 버킷으로 한 걸음 만들기
        </Link>
      </section>

      <section className="rounded-xl border border-foreground/10 p-4 flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground/80">새 챕터 추가</p>

        <Button
          variant="secondary"
          onClick={handleGenerateSuggestions}
          isLoading={isGeneratingSuggestions}
          className="w-full sm:w-fit"
        >
          AI로 챕터 제안 받기
        </Button>

        {aiSuggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            {aiSuggestions.map((suggestion, index) => (
              <div
                key={`${suggestion.chapterTitle}-${index}`}
                className="rounded-lg border border-foreground/15 p-3 flex flex-col gap-2"
              >
                <p className="text-sm font-semibold">{suggestion.chapterTitle}</p>
                <p className="text-xs text-foreground/70">{suggestion.chapterDescription}</p>
                <p className="text-xs text-foreground/80">
                  첫 행동: <span className="font-medium">{suggestion.firstAction}</span>
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  isLoading={applyingSuggestionIndex === index}
                  onClick={() => handleApplySuggestion(suggestion, index)}
                  className="w-full sm:w-fit"
                >
                  이 제안으로 챕터 추가
                </Button>
              </div>
            ))}
          </div>
        )}

        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="예: 이번 시즌, 러닝 5km 습관 만들기"
          className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />

        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="챕터 설명 (선택)"
          rows={3}
          className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-y"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ChapterStatus)}
            className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
          >
            {CHAPTER_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />

          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        <Button onClick={handleCreate} isLoading={isCreating} className="w-full sm:w-fit">
          챕터 추가
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground/60">
          연결된 챕터 ({chapters.length})
        </h2>

        {chapters.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/20 px-4 py-6 text-sm text-foreground/70 text-center">
            아직 연결된 챕터가 없습니다.
          </div>
        ) : (
          chapters.map((chapter) => {
            const isEditing = editingId === chapter.id;
            const isDeleting = deletingId === chapter.id;

            return (
              <article
                key={chapter.id}
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

                    <textarea
                      value={editDescription}
                      onChange={(event) => setEditDescription(event.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-y"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={editStatus}
                        onChange={(event) => setEditStatus(event.target.value as ChapterStatus)}
                        className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
                      >
                        {CHAPTER_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      <input
                        type="date"
                        value={editStartDate}
                        onChange={(event) => setEditStartDate(event.target.value)}
                        className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
                      />

                      <input
                        type="date"
                        value={editEndDate}
                        onChange={(event) => setEditEndDate(event.target.value)}
                        className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        isLoading={isSaving}
                        onClick={() => handleSave(chapter.id)}
                      >
                        저장
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isSaving}
                        onClick={cancelEdit}
                      >
                        취소
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      <p className="text-base font-semibold">{chapter.title}</p>
                      <p className="text-sm text-foreground/60">
                        {chapter.description?.trim() || "설명 없음"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-foreground/20 px-2 py-1">
                        {chapterStatusLabel(chapter.status)}
                      </span>
                      <span className="rounded-full border border-foreground/20 px-2 py-1">
                        {periodLabel(chapter.start_date, chapter.end_date)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard?bucket=${bucket.id}`}
                        className="inline-flex items-center justify-center rounded-lg border border-foreground/20 px-3 py-2 text-sm min-h-[44px] hover:bg-foreground/5 transition-colors"
                      >
                        한 걸음 만들기
                      </Link>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => startEdit(chapter)}
                      >
                        수정
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleDelete(chapter.id)}
                        isLoading={isDeleting}
                      >
                        삭제
                      </Button>
                    </div>
                  </>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
