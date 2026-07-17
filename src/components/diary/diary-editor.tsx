"use client";

// 일기 작성/편집 화면.
// 상단: SubPageHeader(뒤로가기 + 날짜 + 더보기 + 완료). 글로벌 헤더는 MainShell이 숨김.
// 본문: MarkdownEditor(TipTap).
// 컬러는 앱 블랙 계열 토큰만 사용 (하늘색 미사용).

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MoreActionsMenu } from "@/components/ui/more-actions-menu";
import { SubPageHeader } from "@/components/layout/sub-page-header";
import { useToast } from "@/components/ui/toast";
import { DIARY_ERRORS } from "@/lib/constants";
import type { Diary, DiaryListItem } from "@/types";
import { deriveDiaryTitle, derivePreview, toDiaryListItem } from "@/lib/diary/format";
import { saveDiaryDraft, clearDiaryDraft } from "@/lib/diary/draft";
import { saveDiaryAction, deleteDiaryAction } from "@/app/(main)/diary/actions";
import { MarkdownEditor } from "./markdown-editor";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// "26.7.13 (월)" — 시간은 목록에 있으므로 생략
function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  const yy = date.getFullYear() % 100;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = WEEKDAY_LABELS[date.getDay()];
  return `${yy}.${month}.${day} (${weekday})`;
}

type DiaryEditorProps =
  | { mode: "create"; entry?: undefined }
  | { mode: "edit"; entry: Diary };

export function DiaryEditor({ mode, entry }: DiaryEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  // 저장 대상 id. 신규는 클라이언트가 UUID를 미리 만든다 —
  // 서버가 upsert하므로 재전송해도 같은 행(멱등) → 드래프트 재시도가 일기를 복제하지 않는다.
  const [diaryId] = useState(() => entry?.id ?? crypto.randomUUID());

  // 편집 모드는 기존 값으로 초기화
  const contentRef = useRef<string>(entry?.content ?? "");
  const plainTextRef = useRef<string>(entry?.plain_text ?? "");

  // 변경 감지 기준선. TipTap onUpdate는 초기 content 설정 시 발화하지 않으므로
  // 사용자가 실제로 수정해야만 ref가 바뀐다 → 미수정이면 isDirty=false가 보장된다.
  const baselineContentRef = useRef<string>(entry?.content ?? "");
  const [isDirty, setIsDirty] = useState(false);

  // 헤더 날짜: 편집은 작성일, 작성은 현재 시각(마운트 시점 고정)
  const [dateLabel] = useState(() => formatDateLabel(entry?.created_at ?? new Date().toISOString()));

  function handleChange(html: string, text: string) {
    contentRef.current = html;
    plainTextRef.current = text;

    const next =
      mode === "create" ? text.trim().length > 0 : html !== baselineContentRef.current;
    // 값이 같으면 같은 참조를 반환 → React가 리렌더를 bail out (타이핑마다 리렌더 없음)
    setIsDirty((prev) => (prev === next ? prev : next));
  }

  function handleSave() {
    const plainText = plainTextRef.current.trim();
    if (!plainText) {
      toast(DIARY_ERRORS.CONTENT_REQUIRED, "error");
      return;
    }

    const content = contentRef.current;
    const savedAt = new Date().toISOString();

    // ① 로컬에 먼저 확정 기록 — 이후 단계가 실패하거나 탭이 닫혀도 유실되지 않는다.
    saveDiaryDraft({ id: diaryId, content, plainText, savedAt });

    // ② 낙관적 캐시 갱신 (재페치 0)
    if (mode === "edit") {
      queryClient.setQueryData<Diary | null>(["diary", "entry", diaryId], (old) =>
        old ? { ...old, content, plain_text: plainText, updated_at: savedAt } : old
      );
      queryClient.setQueryData<DiaryListItem[]>(["diary", "list"], (old) =>
        old?.map((item) =>
          item.id === diaryId
            ? { ...item, title: deriveDiaryTitle(plainText), preview: derivePreview(plainText) }
            : item
        )
      );
    } else {
      // 신규는 목록 맨 앞에 추가 (최신순)
      queryClient.setQueryData<DiaryListItem[]>(["diary", "list"], (old) =>
        old
          ? [toDiaryListItem({ id: diaryId, plain_text: plainText, created_at: savedAt }), ...old]
          : old
      );
    }

    // ③ 즉시 이동 — 서버 쓰기를 기다리지 않는다 (체감 0ms).
    //    성공 토스트는 없다: 목록이 즉시 갱신되는 것 자체가 피드백.
    router.push("/diary");

    // ④ 백그라운드 flush. queryClient/toast는 루트 프로바이더 소속이라
    //    이 컴포넌트가 언마운트된 뒤에도 안전하게 동작한다.
    void saveDiaryAction({ id: diaryId, content, plainText }).then((result) => {
      if (result.success) {
        clearDiaryDraft(diaryId);
        return;
      }
      // 실패해도 유실이 아니다 — 드래프트가 남아 목록 재진입 시 자동 재전송된다.
      toast("저장 동기화가 지연되고 있어요 — 일기를 다시 열면 자동으로 재시도합니다", "error");
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
      // 목록에서 즉시 제거 + 삭제된 항목 캐시 폐기(재페치 방지)
      queryClient.setQueryData<DiaryListItem[]>(["diary", "list"], (old) =>
        old?.filter((item) => item.id !== entry.id)
      );
      queryClient.removeQueries({ queryKey: ["diary", "entry", entry.id] });
      router.push("/diary");
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
            {/* 변경이 있을 때만 노출 — 미수정 상태에선 저장할 게 없으므로 숨긴다.
                (이탈은 SubPageHeader의 뒤로가기가 담당) */}
            {/* 낙관적 저장이라 대기가 없다 → 스피너 없음(isPending은 삭제 전용) */}
            {isDirty && (
              <Button variant="ghost" size="sm" onClick={handleSave}>
                완료
              </Button>
            )}
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
