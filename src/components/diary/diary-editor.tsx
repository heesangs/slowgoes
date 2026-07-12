"use client";

// 일기 작성/편집 화면.
// 상단: SubPageHeader(뒤로가기 + 날짜 + 더보기 + 완료). 글로벌 헤더는 MainShell이 숨김.
// 본문: MarkdownEditor(TipTap).
// 컬러는 앱 블랙 계열 토큰만 사용 (하늘색 미사용).

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MoreActionsMenu } from "@/components/ui/more-actions-menu";
import { SubPageHeader } from "@/components/layout/sub-page-header";
import { useToast } from "@/components/ui/toast";
import { DIARY_ERRORS } from "@/lib/constants";
import type { Diary } from "@/types";
import { createDiaryAction, updateDiaryAction, deleteDiaryAction } from "@/app/(main)/diary/actions";
import { MarkdownEditor } from "./markdown-editor";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// "2026년 7월 12일 (일) 오후 9:02"
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = WEEKDAY_LABELS[date.getDay()];
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const isPM = hours >= 12;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const time = `${isPM ? "오후" : "오전"} ${hour12}:${String(minutes).padStart(2, "0")}`;
  return `${year}년 ${month}월 ${day}일 (${weekday}) ${time}`;
}

type DiaryEditorProps =
  | { mode: "create"; entry?: undefined }
  | { mode: "edit"; entry: Diary };

export function DiaryEditor({ mode, entry }: DiaryEditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  // 편집 모드는 기존 값으로 초기화
  const contentRef = useRef<string>(entry?.content ?? "");
  const plainTextRef = useRef<string>(entry?.plain_text ?? "");

  // 헤더 날짜: 편집은 작성일, 작성은 현재 시각(마운트 시점 고정)
  const [dateLabel] = useState(() => formatDateTime(entry?.created_at ?? new Date().toISOString()));

  function handleChange(html: string, text: string) {
    contentRef.current = html;
    plainTextRef.current = text;
  }

  function handleSave() {
    const plainText = plainTextRef.current.trim();
    if (!plainText) {
      toast(DIARY_ERRORS.CONTENT_REQUIRED, "error");
      return;
    }

    startTransition(async () => {
      const payload = { content: contentRef.current, plainText };
      const result =
        mode === "edit"
          ? await updateDiaryAction(entry.id, payload)
          : await createDiaryAction(payload);

      if (!result.success) {
        toast(result.error ?? DIARY_ERRORS.CREATE_FAILED, "error");
        return;
      }

      toast("일기를 저장했어요 ✨", "success");
      router.push("/diary");
      router.refresh();
    });
  }

  function handleDelete() {
    if (mode !== "edit") return;
    const confirmed = window.confirm("이 일기를 삭제할까요? 되돌릴 수 없어요.");
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteDiaryAction(entry.id);
      if (!result.success) {
        toast(result.error ?? DIARY_ERRORS.DELETE_FAILED, "error");
        return;
      }
      toast("일기를 삭제했어요.", "success");
      router.push("/diary");
      router.refresh();
    });
  }

  return (
    <>
      {/* 서브페이지 상단 네비 — 뒤로가기 + 날짜 + (더보기) + 완료 */}
      <SubPageHeader
        backHref="/diary"
        title={dateLabel}
        actions={
          <>
            {mode === "edit" && (
              <MoreActionsMenu
                ariaLabel="일기 관리"
                triggerClassName="border border-foreground/15"
                actions={[{ label: "삭제", onClick: handleDelete, variant: "danger" }]}
              />
            )}
            <Button variant="ghost" size="sm" onClick={handleSave} isLoading={isPending}>
              완료
            </Button>
          </>
        }
      />

      {/* 본문 에디터 */}
      <div className="mx-auto max-w-2xl px-4 py-4">
        <MarkdownEditor initialContent={entry?.content ?? ""} onChange={handleChange} />
      </div>
    </>
  );
}
