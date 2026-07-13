"use client";

// 일기 편집 로더 — React Query로 단건을 클라이언트 페칭.
// 재방문 시 캐시 즉시 표시. 로딩 중 스켈레톤, 없으면 목록으로.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDiaryEntry } from "@/hooks/use-diary";
import { DiaryEditor } from "./diary-editor";

const SKELETON = "rounded bg-foreground/10";

function EditorSkeleton() {
  return (
    <div className="animate-pulse" aria-label="일기 로딩 중">
      <div className="sticky top-0 z-20 border-b border-foreground/10 bg-background px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`${SKELETON} h-6 w-6`} />
            <div className={`${SKELETON} h-4 w-24`} />
          </div>
          <div className={`${SKELETON} h-7 w-12`} />
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-4">
        <div className="flex flex-col gap-2">
          <div className={`${SKELETON} h-4 w-1/2`} />
          <div className={`${SKELETON} h-4 w-11/12`} />
          <div className={`${SKELETON} h-4 w-4/5`} />
          <div className={`${SKELETON} h-4 w-3/4`} />
        </div>
      </div>
    </div>
  );
}

export function DiaryEditorLoader({ id }: { id: string }) {
  const router = useRouter();
  const { data: entry, isLoading, isError } = useDiaryEntry(id);

  // 로드 완료했는데 항목이 없으면 목록으로
  useEffect(() => {
    if (!isLoading && !isError && entry === null) {
      router.replace("/diary");
    }
  }, [isLoading, isError, entry, router]);

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center">
        <p className="text-sm text-foreground/60">일기를 불러오지 못했습니다.</p>
      </div>
    );
  }

  if (isLoading || !entry) {
    return <EditorSkeleton />;
  }

  return <DiaryEditor mode="edit" entry={entry} />;
}
