"use client";

// "다음 목표" 시트 — 계획 드롭다운의 이번 달 카드 우측 [다음 목표 ≫].
//
// 한 달이 끝나갈 때 다음 달 목표를 세우는 자리다. 두 가지를 함께 보여준다:
//   ① 지금까지 완료한 할 일을 근거로 AI가 초안을 제안 (확정은 사용자가)
//   ② 지난 목표 목록 — 같은 자리를 어떻게 고쳐 왔는지 보면 다음이 잘 잡힌다
//
// 지난 목록은 새 데이터가 아니라 stride_plans.title_history 다. 목표를 바꿀 때마다
// 이전 값이 쌓이고 있었지만 읽는 화면이 없었다.

import { useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/ui/error-box";
import { cn } from "@/lib/utils";
import type { StrideTitleHistoryEntry } from "@/types";

interface NextGoalSheetProps {
  open: boolean;
  onClose: () => void;
  /** 다시 세울 대상 라벨 (예: "9월") */
  targetLabel: string;
  /** 지금 걸려 있는 목표 — 무엇을 바꾸는지 보여준다 */
  currentAction: string;
  /** 이 레벨의 지난 목표들 (최근순) */
  history: StrideTitleHistoryEntry[];
  /** [새 목표 제안받기] — AI 초안을 만들어 입력창에 채운다. 부모가 시트를 닫는다 */
  onSuggest: () => void;
  isSuggesting?: boolean;
  /** AI 실패 메시지. 있으면 재시도 버튼과 함께 보여준다 */
  error?: string | null;
}

// "2026-03-14T…" → "3월" (같은 달이 여러 번이면 "3월 14일"로 늘린다)
function formatEntryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}월`;
}

export function NextGoalSheet({
  open,
  onClose,
  targetLabel,
  currentAction,
  history,
  onSuggest,
  isSuggesting = false,
  error = null,
}: NextGoalSheetProps) {
  // 지난 목록이 길면 처음엔 3개만 — 시트의 주인공은 위쪽 제안 버튼이다
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? history : history.slice(0, 3);

  return (
    <BottomSheet open={open} onClose={onClose} title="다음 목표" size="large">
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-base font-bold">
              지금까지 완료한 할 일을 근거로 새 목표를 세울까요?
            </p>
            <p className="text-sm leading-relaxed text-label-alt">
              AI가 초안을 제안하면 고쳐서 확정할 수 있어요.
            </p>
          </div>

          {/* 무엇을 바꾸는 건지 — 지금 목표 */}
          <div className="rounded-lg border border-line-alt bg-fill-alt px-3 py-2.5">
            <p className="text-xs text-label-assistive">지금 {targetLabel} 목표</p>
            <p className="mt-1 text-sm leading-snug text-label-alt">{currentAction}</p>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <Button variant="fill" onClick={onSuggest} isLoading={isSuggesting}>
            {error ? "다시 제안받기" : "새 목표 제안받기"}
          </Button>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-label-alt">지난 목표</h3>
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-label-assistive">
              아직 지난 목표가 없어요.
            </p>
          ) : (
            <>
              {/* 일기 목록과 같은 결 — 좌측 시점, 우측 본문 */}
              <ul className="flex flex-col divide-y divide-line-alt border-y border-line-alt">
                {visible.map((entry, index) => (
                  <li key={`${entry.generated_at}-${index}`} className="flex gap-3 py-3">
                    <span className="w-9 shrink-0 pt-0.5 text-center text-xs text-label-assistive">
                      {formatEntryDate(entry.generated_at)}
                    </span>
                    <p className="min-w-0 flex-1 text-sm leading-relaxed text-label-alt">
                      {entry.title}
                    </p>
                  </li>
                ))}
              </ul>
              {history.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAll((prev) => !prev)}
                  className={cn(
                    "mx-auto rounded px-3 py-2 text-xs text-label-assistive",
                    "transition-colors hover:bg-fill-alt hover:text-label-neutral"
                  )}
                >
                  {showAll ? "접기" : `${history.length - 3}개 더 보기`}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </BottomSheet>
  );
}
