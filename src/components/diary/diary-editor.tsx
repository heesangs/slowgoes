"use client";

// 일기 작성/편집 화면.
// 상단: SubPageHeader(뒤로가기 + 날짜 + 더보기 + 저장 상태). 글로벌 헤더는 MainShell이 숨김.
// 본문: MarkdownEditor(TipTap).
// 컬러는 앱 블랙 계열 토큰만 사용 (하늘색 미사용).
//
// 저장 모델(자동저장):
//   타이핑 → ① 로컬 드래프트 즉시 기록 → ② 디바운스(idle 800ms) 후 낙관적 캐시 갱신 +
//   서버 flush(멱등 upsert) → 성공 시 드래프트 삭제. 화면 이동은 하지 않는다(뒤로가기로 나감).
//   나가기/탭 숨김/언마운트 시 남은 변경을 즉시 flush. flush가 늦거나 실패해도 드래프트가
//   남아 목록 재진입 시 자동 재전송되므로 유실이 없다.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { MoreActionsMenu } from "@/components/ui/more-actions-menu";
import { SubPageHeader } from "@/components/layout/sub-page-header";
import { useToast } from "@/components/ui/toast";
import { DIARY_ERRORS } from "@/lib/constants";
import type { Diary, DiaryComment, DiaryListItem } from "@/types";
import { deriveDiaryTitle, derivePreview, toDiaryListItem } from "@/lib/diary/format";
import { formatWeekLabel } from "@/lib/date/week";
import { saveDiaryDraft, clearDiaryDraft } from "@/lib/diary/draft";
import {
  saveDiaryAction,
  deleteDiaryAction,
  addDiaryCommentAction,
  deleteDiaryCommentAction,
} from "@/app/(main)/diary/actions";
import { MarkdownEditor } from "./markdown-editor";
import { DiaryAiSheet } from "./diary-ai-sheet";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const AUTOSAVE_DEBOUNCE_MS = 800;

// "26.7.13 (월)" — 시간은 목록에 있으므로 생략
function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  const yy = date.getFullYear() % 100;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = WEEKDAY_LABELS[date.getDay()];
  return `${yy}.${month}.${day} (${weekday})`;
}

type SaveStatus = "idle" | "saving" | "saved";

/**
 * 주간 회고 컨텍스트 — /diary/new?week=...&bucket=... 로 진입했을 때만 채워진다.
 * 값이 있으면 저장 시 week_start/bucket_id로 실려 가고, 헤더에 #버킷명이 표시된다.
 */
interface WeeklyContext {
  weekStart?: string | null;
  bucketId?: string | null;
  bucketTitle?: string | null;
  /**
   * 뒤로가기 목적지. 주간 시트에서 들어온 경우 대시보드의 그 주 시트로 돌아간다.
   * 미지정이면 일기 목록(/diary).
   */
  backHref?: string;
}

type DiaryEditorProps = WeeklyContext &
  ({ mode: "create"; entry?: undefined } | { mode: "edit"; entry: Diary });

export function DiaryEditor({
  mode,
  entry,
  weekStart = null,
  bucketId = null,
  bucketTitle = null,
  backHref = "/diary",
}: DiaryEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  // 저장 대상 id. 신규는 클라이언트가 UUID를 미리 만든다 —
  // 서버가 upsert하므로 재전송해도 같은 행(멱등) → 자동저장이 일기를 복제하지 않는다.
  const [diaryId] = useState(() => entry?.id ?? crypto.randomUUID());

  // 편집 모드는 기존 값으로 초기화
  const contentRef = useRef<string>(entry?.content ?? "");
  const plainTextRef = useRef<string>(entry?.plain_text ?? "");
  // 마지막으로 flush(서버 반영 시도)한 content — 변경 없으면 flush를 건너뛴다.
  const savedContentRef = useRef<string>(entry?.content ?? "");
  const debounceRef = useRef<number | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // AI 분석 시트 — 열 때의 본문/선택을 스냅샷으로 넘긴다.
  // 선택 텍스트는 버튼 blur로 사라지기 전(pointerdown)에 캡처해 둔다.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiContent, setAiContent] = useState("");
  const [aiSelection, setAiSelection] = useState("");
  const [aiOpenCount, setAiOpenCount] = useState(0); // 열 때마다 시트 리마운트(초기화)
  const pendingSelectionRef = useRef("");

  function openAiSheet() {
    const content = plainTextRef.current.trim();
    if (!content) {
      toast("먼저 일기를 작성해주세요.", "error");
      return;
    }
    setAiContent(content);
    setAiSelection(pendingSelectionRef.current);
    setAiOpenCount((n) => n + 1);
    setAiOpen(true);
  }

  // organize 코멘트 — 일기 아래에 붙는다(제목=버튼명/질문). 본문과 분리 저장이라 재-organize에 미포함.
  const [comments, setComments] = useState<DiaryComment[]>(entry?.comments ?? []);

  // [comment] → 저장 보장 후 서버에 append. 성공 여부를 시트에 반환(시트가 닫힘 판단).
  async function handleAddComment(title: string, body: string): Promise<boolean> {
    // 코멘트를 달려면 일기 행이 있어야 한다(신규는 아직 flush 전일 수 있음) →
    // 최신 본문을 먼저 확정 저장(멱등 upsert)하고, 대기 중 디바운스는 취소한다.
    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const content = contentRef.current;
    const plainText = plainTextRef.current.trim();
    if (plainText && content !== savedContentRef.current) {
      savedContentRef.current = content;
      const saveRes = await saveDiaryAction({ id: diaryId, content, plainText, weekStart, bucketId });
      if (!saveRes.success) {
        toast(saveRes.error ?? DIARY_ERRORS.UPDATE_FAILED, "error");
        return false;
      }
      clearDiaryDraft(diaryId);
    }

    const res = await addDiaryCommentAction(diaryId, { title, body });
    if (!res.success) {
      toast(res.error, "error");
      return false;
    }
    setComments((prev) => [...prev, res.comment]);
    // 편집 캐시도 갱신(재방문 즉시 반영)
    queryClient.setQueryData<Diary | null>(["diary", "entry", diaryId], (old) =>
      old ? { ...old, comments: [...(old.comments ?? []), res.comment] } : old
    );
    toast("코멘트를 달았어요.", "success");
    return true;
  }

  async function handleDeleteComment(commentId: string) {
    const prev = comments;
    setComments((cur) => cur.filter((c) => c.id !== commentId)); // 낙관적 제거
    const res = await deleteDiaryCommentAction(diaryId, commentId);
    if (!res.success) {
      setComments(prev); // 롤백
      toast(res.error ?? DIARY_ERRORS.DELETE_FAILED, "error");
      return;
    }
    queryClient.setQueryData<Diary | null>(["diary", "entry", diaryId], (old) =>
      old ? { ...old, comments: (old.comments ?? []).filter((c) => c.id !== commentId) } : old
    );
  }

  // 헤더 날짜: 편집은 작성일, 작성은 현재 시각(마운트 시점 고정)
  const [dateLabel] = useState(() => formatDateLabel(entry?.created_at ?? new Date().toISOString()));

  // 지금까지의 내용을 로컬·캐시·서버에 확정 반영 (디바운스 만료·나가기·언마운트에서 호출).
  // 참조가 안정적이어야 이벤트 리스너/effect가 재등록되지 않는다.
  const flushNow = useCallback(() => {
    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const content = contentRef.current;
    const plainText = plainTextRef.current.trim();
    // 빈 내용이거나 직전 flush 이후 변경이 없으면 아무것도 하지 않는다.
    if (!plainText || content === savedContentRef.current) return;
    savedContentRef.current = content;

    const savedAt = new Date().toISOString();

    // ① 로컬 드래프트 확정 (유실 방지 — 서버 flush가 실패/지연해도 목록 진입 시 재전송)
    saveDiaryDraft({ id: diaryId, content, plainText, savedAt });

    // ② 낙관적 캐시 갱신 (재페치 0). 목록은 멱등: 있으면 갱신, 없으면(신규 첫 저장) 앞에 추가.
    queryClient.setQueryData<Diary | null>(["diary", "entry", diaryId], (old) =>
      old ? { ...old, content, plain_text: plainText, updated_at: savedAt } : old
    );
    queryClient.setQueryData<DiaryListItem[]>(["diary", "list"], (old) => {
      if (!old) return old;
      const exists = old.some((item) => item.id === diaryId);
      if (exists) {
        return old.map((item) =>
          item.id === diaryId
            ? { ...item, title: deriveDiaryTitle(plainText), preview: derivePreview(plainText) }
            : item
        );
      }
      return [
        toDiaryListItem({
          id: diaryId,
          plain_text: plainText,
          created_at: savedAt,
          week_start: weekStart,
          bucket_title: bucketTitle,
        }),
        ...old,
      ];
    });

    // ③ 백그라운드 서버 flush. queryClient/toast는 루트 프로바이더 소속이라
    //    이 컴포넌트가 언마운트된 뒤에도 안전하게 동작한다.
    void saveDiaryAction({ id: diaryId, content, plainText, weekStart, bucketId }).then((result) => {
      if (result.success) {
        clearDiaryDraft(diaryId);
      }
      // 실패해도 드래프트가 남아 목록 재진입 시 자동 재전송 → 유실 아님. 표시는 저장됨 유지.
      setSaveStatus("saved");
    });
  }, [diaryId, queryClient, weekStart, bucketId, bucketTitle]);

  // TipTap onUpdate → 안정 참조(memo된 에디터가 리렌더되지 않도록 useCallback).
  const handleChange = useCallback(
    (html: string, text: string) => {
      contentRef.current = html;
      plainTextRef.current = text;
      if (text.trim().length === 0) return;

      // 로컬 즉시 기록(체감 유실 0) + 디바운스 서버 flush 예약
      saveDiaryDraft({ id: diaryId, content: html, plainText: text, savedAt: new Date().toISOString() });
      // "saving"으로만 바꾸고(이미 saving이면 bail) 키 입력마다 리렌더가 쌓이지 않게 한다.
      setSaveStatus((prev) => (prev === "saving" ? prev : "saving"));

      if (debounceRef.current != null) clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        flushNow();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [diaryId, flushNow]
  );

  // 나가기/탭 숨김/언마운트 시 남은 변경 즉시 flush (뒤로가기 = 나가기).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
      flushNow(); // 언마운트(뒤로가기) 시 최종 flush
    };
  }, [flushNow]);

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
      // 삭제 대상이라 남은 자동저장이 되살리지 않도록 드래프트·pending 정리
      clearDiaryDraft(entry.id);
      if (debounceRef.current != null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      savedContentRef.current = contentRef.current;
      toast("일기를 삭제했어요.", "success");
      // 목록에서 즉시 제거 + 삭제된 항목 캐시 폐기(재페치 방지)
      queryClient.setQueryData<DiaryListItem[]>(["diary", "list"], (old) =>
        old?.filter((item) => item.id !== entry.id)
      );
      queryClient.removeQueries({ queryKey: ["diary", "entry", entry.id] });
      router.push(backHref);
    });
  }

  return (
    <>
      {/* 서브페이지 상단 네비 — 뒤로가기 + 날짜 + (더보기) + 저장 상태(패시브) */}
      <SubPageHeader
        backHref={backHref}
        title={dateLabel}
        actions={
          <>
            {/* organize — 본문이 있을 때(편집 모드이거나 입력을 시작한 뒤) 노출.
                크기는 우측 ⋮ 트리거(h-7)에 맞춘다. pointerdown에서 선택 텍스트를 캡처
                (클릭 시 blur로 선택이 사라지므로). */}
            {(mode === "edit" || saveStatus !== "idle") && (
              <button
                type="button"
                aria-label="정리하기"
                onPointerDown={() => {
                  pendingSelectionRef.current = window.getSelection()?.toString().trim() ?? "";
                }}
                onClick={openAiSheet}
                className="inline-flex h-7 items-center rounded-md border border-foreground/15 px-2.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5"
              >
                organize
              </button>
            )}
            {mode === "edit" && !isPending && (
              <MoreActionsMenu
                ariaLabel="일기 관리"
                triggerClassName="border border-foreground/15"
                actions={[{ label: "삭제", onClick: handleDelete, variant: "danger" }]}
              />
            )}
            {/* 자동저장 상태 — 저장 버튼 대신 표시만. 나가기는 뒤로가기가 담당.
                (메모된 에디터 밖 형제라 여기 리렌더가 본문 캐럿에 영향 없음) */}
            {saveStatus !== "idle" && (
              <span className="min-w-[3.5rem] text-right text-xs text-foreground/45" aria-live="polite">
                {saveStatus === "saving" ? "저장 중…" : "저장됨"}
              </span>
            )}
          </>
        }
      />

      {/* 본문 에디터 — 좌우 여백 최소화로 작성 폭 확보 */}
      <div className="mx-auto max-w-2xl px-3 py-4">
        {/* 주간 회고 컨텍스트 — 어느 주/버킷에 대한 기록인지 본문 위에 밝힌다 */}
        {weekStart && (
          <p className="mb-2 text-xs text-foreground/45">
            {formatWeekLabel(weekStart)} 회고
            {bucketTitle ? ` · #${bucketTitle}` : ""}
          </p>
        )}
        <MarkdownEditor initialContent={entry?.content ?? ""} onChange={handleChange} />

        {/* organize 코멘트 — 일기 아래. 제목=버튼명/질문, 본문=AI 응답. (본문과 분리 저장) */}
        {comments.length > 0 && (
          <div className="mt-6 border-t border-foreground/10 pt-4">
            <p className="mb-2 text-xs font-medium text-foreground/45">코멘트</p>
            <ul className="flex flex-col gap-3">
              {comments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground/70">{c.title}</p>
                    <button
                      type="button"
                      aria-label="코멘트 삭제"
                      onClick={() => handleDeleteComment(c.id)}
                      className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-foreground/35 transition-colors hover:bg-foreground/5 hover:text-foreground/70"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{c.body}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <DiaryAiSheet
        key={aiOpenCount}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        content={aiContent}
        selection={aiSelection}
        onAddComment={handleAddComment}
      />
    </>
  );
}
