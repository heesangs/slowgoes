"use client";

// 일기 organize 시트 — 현재 일기 1건을 요약하거나 글쓰기 관점에서 개선점을 받는다.
// 드래그로 선택한 부분이 있으면 그 맥락을 함께 전달한다.
// 응답은 [comment] 버튼으로 일기 아래에 코멘트로 붙일 수 있다(제목=선택한 버튼명/질문).

import { useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/ui/error-box";
import { useToast } from "@/components/ui/toast";
import { analyzeDiaryAction } from "@/app/(main)/diary/actions";
import { AI_ERRORS, DIARY_ERRORS } from "@/lib/constants";
import {
  DIARY_ORGANIZE_MODES,
  type DiaryOrganizeMode,
} from "@/lib/ai/diary-prompts";
import { cn } from "@/lib/utils";

interface DiaryAiSheetProps {
  open: boolean;
  onClose: () => void;
  /** organize 대상 일기 본문(순수 텍스트) */
  content: string;
  /** 사용자가 드래그로 선택한 부분(있으면 컨텍스트로 첨부) */
  selection: string;
  /** [comment] — 응답을 일기 아래 코멘트로 저장. 성공하면 resolve. */
  onAddComment: (title: string, body: string) => Promise<boolean>;
}

/** 한 번의 생성 요청 — [다시 시도]로 그대로 재전송할 수 있게 묶어 둔다 */
interface RunOptions {
  mode?: DiaryOrganizeMode;
  question?: string;
  /** 결과/코멘트 제목 (버튼명 또는 질문) */
  title: string;
}

// 버튼 노출 순서 (요약 먼저, 이후 글쓰기 개선 4종)
const MODE_ORDER: DiaryOrganizeMode[] = [
  "summary",
  "essay",
  "flow",
  "vocabulary",
  "logic",
];

export function DiaryAiSheet({ open, onClose, content, selection, onAddComment }: DiaryAiSheetProps) {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultTitle, setResultTitle] = useState("");
  const [committing, setCommitting] = useState(false);
  // 실패 사유를 **시트 안에** 남긴다. 토스트만으로는 안 된다 — 사라지기도 하고,
  // 무엇보다 "눌렀는데 아무 반응 없다"로 체감되던 원인이 실패의 비가시성이었다.
  const [error, setError] = useState<string | null>(null);
  // 마지막 실행 옵션 — [다시 시도]가 같은 요청을 그대로 재전송한다.
  const [lastRun, setLastRun] = useState<RunOptions | null>(null);
  // 초기화는 부모가 열 때마다 key로 리마운트해 처리(effect 내 setState 회피).

  async function run(opts: RunOptions) {
    if (loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setLastRun(opts);
    try {
      const res = await analyzeDiaryAction({
        content,
        mode: opts.mode,
        question: opts.question,
        selection,
      });
      if (res.success) {
        setResult(res.text);
        setResultTitle(opts.title);
      } else {
        setError(res.error);
        toast(res.error, "error");
      }
    } catch {
      // 서버액션 호출 자체가 실패한 경우(네트워크 끊김·함수 시간 초과).
      // 여기서 잡지 않으면 finally에 닿지 못해 loading이 영구 true로 고착되고,
      // 모드 버튼이 전부 disabled가 되어 "다시 눌러도 안 된다"가 된다.
      setError(AI_ERRORS.NO_RESPONSE);
      toast(AI_ERRORS.NO_RESPONSE, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleComment() {
    if (!result || committing) return;
    setCommitting(true);
    try {
      const ok = await onAddComment(resultTitle, result);
      if (ok) onClose();
    } catch {
      toast(DIARY_ERRORS.UPDATE_FAILED, "error");
    } finally {
      setCommitting(false);
    }
  }

  const selectionPreview = selection.trim().replace(/\s+/g, " ").slice(0, 80);
  const trimmedQuestion = question.trim();

  return (
    <BottomSheet open={open} onClose={onClose} size="large" hideHeader>
      {selectionPreview && (
        <div className="mb-3 rounded-lg border border-line-alt bg-fill-alt px-3 py-2">
          <p className="text-2xs font-medium text-label-alt">선택한 부분</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-label-alt">“{selectionPreview}”</p>
        </div>
      )}

      {/* organize 모드 버튼 — 요약 + 글쓰기 개선 4종 */}
      <div className="grid grid-cols-2 gap-2">
        {MODE_ORDER.map((mode) => {
          const label = DIARY_ORGANIZE_MODES[mode].label;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => run({ mode, title: label })}
              disabled={loading}
              className={cn(
                "rounded-lg border border-line-normal px-3 py-2.5 text-sm font-medium text-label-neutral transition-colors",
                "hover:bg-fill-alt disabled:opacity-40",
                mode === "summary" && "col-span-2"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 자유 질문 */}
      <div className="mt-3 flex flex-col gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="직접 물어보기 (예: 이 글에서 가장 인상적인 문장은?)"
          rows={2}
          className="w-full resize-none rounded-lg border border-line-normal bg-transparent px-3 py-2 text-sm text-label-normal outline-none placeholder:text-label-disable focus:border-line-strong"
        />
        <Button
          variant="secondary"
          onClick={() => run({ question: trimmedQuestion, title: trimmedQuestion.slice(0, 60) })}
          disabled={loading || trimmedQuestion.length === 0}
          className="w-full"
        >
          {loading ? "생각 중…" : "직접 물어보기"}
        </Button>
      </div>

      {/* 결과 */}
      {loading && (
        <p className="mt-4 animate-pulse text-center text-sm text-label-alt">
          일기를 곱씹어보는 중이에요…
        </p>
      )}
      {error && !loading && (
        <ErrorBox as="div" className="mt-4">
          <p className="text-2xs font-medium">생성하지 못했어요</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-label-neutral">{error}</p>
          {lastRun && (
            <Button variant="secondary" onClick={() => run(lastRun)} className="mt-3 w-full">
              다시 시도
            </Button>
          )}
        </ErrorBox>
      )}
      {result && !loading && (
        <div className="mt-4 rounded-lg border border-line-alt bg-fill-alt px-4 py-3">
          <p className="text-2xs font-medium text-label-alt">{resultTitle}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-label-neutral">{result}</p>
          <Button
            onClick={handleComment}
            disabled={committing}
            className="mt-3 w-full"
          >
            {committing ? "다는 중…" : "이 코멘트를 일기에 달기"}
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}
