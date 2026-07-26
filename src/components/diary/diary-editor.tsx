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
import type { Diary, DiaryListItem } from "@/types";
import { deriveDiaryTitle, derivePreview, toDiaryListItem } from "@/lib/diary/format";
import { saveDiaryDraft, clearDiaryDraft } from "@/lib/diary/draft";
import { saveDiaryAction, deleteDiaryAction } from "@/app/(main)/diary/actions";
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

type DiaryEditorProps =
  | { mode: "create"; entry?: undefined }
  | { mode: "edit"; entry: Diary };

export function DiaryEditor({ mode, entry }: DiaryEditorProps) {
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
      return [toDiaryListItem({ id: diaryId, plain_text: plainText, created_at: savedAt }), ...old];
    });

    // ③ 백그라운드 서버 flush. queryClient/toast는 루트 프로바이더 소속이라
    //    이 컴포넌트가 언마운트된 뒤에도 안전하게 동작한다.
    void saveDiaryAction({ id: diaryId, content, plainText }).then((result) => {
      if (result.success) {
        clearDiaryDraft(diaryId);
      }
      // 실패해도 드래프트가 남아 목록 재진입 시 자동 재전송 → 유실 아님. 표시는 저장됨 유지.
      setSaveStatus("saved");
    });
  }, [diaryId, queryClient]);

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
      router.push("/diary");
    });
  }

  return (
    <>
      {/* 서브페이지 상단 네비 — 뒤로가기 + 날짜 + (더보기) + 저장 상태(패시브) */}
      <SubPageHeader
        backHref="/diary"
        title={dateLabel}
        actions={
          <>
            {/* AI에게 물어보기 — 본문이 있을 때(편집 모드이거나 입력을 시작한 뒤) 노출.
                pointerdown에서 선택 텍스트를 캡처(클릭 시 blur로 선택이 사라지므로). */}
            {(mode === "edit" || saveStatus !== "idle") && (
              <button
                type="button"
                aria-label="AI에게 물어보기"
                onPointerDown={() => {
                  pendingSelectionRef.current = window.getSelection()?.toString().trim() ?? "";
                }}
                onClick={openAiSheet}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-foreground/15 px-2.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
                </svg>
                AI
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
        <MarkdownEditor initialContent={entry?.content ?? ""} onChange={handleChange} />
      </div>

      <DiaryAiSheet
        key={aiOpenCount}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        content={aiContent}
        selection={aiSelection}
      />
    </>
  );
}
