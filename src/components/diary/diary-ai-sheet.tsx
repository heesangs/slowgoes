"use client";

// 일기 AI 분석 시트 — 현재 일기 1건을 요약하거나 자유 질문으로 조언을 받는다.
// 드래그로 선택한 부분이 있으면 그 맥락을 함께 전달한다. 저장하지 않는 읽기 전용.

import { useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { analyzeDiaryAction } from "@/app/(main)/diary/actions";

interface DiaryAiSheetProps {
  open: boolean;
  onClose: () => void;
  /** 분석 대상 일기 본문(순수 텍스트) */
  content: string;
  /** 사용자가 드래그로 선택한 부분(있으면 컨텍스트로 첨부) */
  selection: string;
}

export function DiaryAiSheet({ open, onClose, content, selection }: DiaryAiSheetProps) {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // 초기화는 부모가 열 때마다 key로 리마운트해 처리(effect 내 setState 회피).

  async function run(q: string) {
    if (loading) return;
    setLoading(true);
    setResult(null);
    const res = await analyzeDiaryAction({ content, question: q, selection });
    setLoading(false);
    if (res.success) {
      setResult(res.text);
    } else {
      toast(res.error, "error");
    }
  }

  const selectionPreview = selection.trim().replace(/\s+/g, " ").slice(0, 80);

  return (
    <BottomSheet open={open} onClose={onClose} title="AI에게 물어보기" size="large">
      {selectionPreview && (
        <div className="mb-3 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2">
          <p className="text-[11px] font-medium text-foreground/45">선택한 부분</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-foreground/70">“{selectionPreview}”</p>
        </div>
      )}

      {/* 빠른 액션 + 자유 질문 */}
      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          onClick={() => run("이 일기를 3~4문장으로 부드럽게 요약해줘.")}
          disabled={loading}
          className="w-full"
        >
          {selectionPreview ? "선택한 부분 요약해줘" : "요약해줘"}
        </Button>

        <textarea
          ref={textareaRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="궁금한 점이나 받고 싶은 조언을 적어보세요 (예: 오늘 나에게 어떤 말을 해주면 좋을까?)"
          rows={3}
          className="w-full resize-none rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/35 focus:border-foreground/40"
        />
        <Button
          onClick={() => run(question.trim())}
          disabled={loading || question.trim().length === 0}
          className="w-full"
        >
          {loading ? "생각 중…" : "물어보기"}
        </Button>
      </div>

      {/* 결과 */}
      {loading && (
        <p className="mt-4 animate-pulse text-center text-sm text-foreground/50">
          일기를 곱씹어보는 중이에요…
        </p>
      )}
      {result && !loading && (
        <div className="mt-4 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{result}</p>
          <p className="mt-3 text-[11px] text-foreground/40">
            AI의 제안이에요 — 참고만 하고, 판단은 당신의 몫이에요.
          </p>
        </div>
      )}
    </BottomSheet>
  );
}
