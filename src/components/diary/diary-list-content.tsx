"use client";

// 일기 목록 — 월별 그룹 리스트 + 우하단 플로팅 작성 버튼.
// React Query로 자체 페치 → 재방문 시 캐시 즉시 표시(스켈레톤 없이).
// 컬러는 앱 블랙 계열 토큰만 사용.

import { useEffect } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { FEATURE_NAMES } from "@/lib/constants";
import { ErrorBox } from "@/components/ui/error-box";
import { groupDiariesByMonth } from "@/lib/diary/format";
import { getDiaryDrafts, clearDiaryDraft } from "@/lib/diary/draft";
import { saveDiaryAction } from "@/app/(main)/diary/actions";
import { useDiaryEntries } from "@/hooks/use-diary";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { preloadMarkdownEditor } from "./markdown-editor-lazy";

const SKELETON = "rounded bg-fill-normal";

export function DiaryListContent() {
  const { data: entries, isLoading, isError } = useDiaryEntries();
  const queryClient = useQueryClient();
  // 300ms 미만 로딩엔 스켈레톤 미표시(깜빡임 방지)
  const showSkeleton = useDelayedFlag(isLoading);
  const groups = groupDiariesByMonth(entries ?? []);

  // 목록에 들어왔다면 곧 일기를 열거나 쓴다 — 에디터 청크를 미리 받아 둔다.
  useEffect(() => {
    preloadMarkdownEditor();
  }, []);

  // 백그라운드 flush가 실패했거나 탭이 닫혀 남은 드래프트를 자동 재전송한다.
  // saveDiaryAction은 클라 UUID + upsert라 멱등 → 여러 번 보내도 중복 생성 없음.
  useEffect(() => {
    const drafts = getDiaryDrafts();
    if (drafts.length === 0) return;

    let cancelled = false;
    (async () => {
      let synced = false;
      for (const draft of drafts) {
        const result = await saveDiaryAction({
          id: draft.id,
          content: draft.content,
          plainText: draft.plainText,
        });
        if (result.success) {
          clearDiaryDraft(draft.id);
          synced = true;
        }
      }
      // 재전송된 게 있으면 서버 최신값으로 목록을 맞춘다
      if (synced && !cancelled) {
        queryClient.invalidateQueries({ queryKey: ["diary", "list"] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  return (
    <div className="relative mx-auto min-h-[70vh] max-w-2xl px-3 py-5 pb-24">
      <h1 className="mb-4 text-2xl font-bold text-label-normal">{FEATURE_NAMES.DIARY}</h1>

      {isError && (
        <ErrorBox className="mb-4">
          일기를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </ErrorBox>
      )}

      {isLoading ? (
        showSkeleton ? (
        <div className="animate-pulse" aria-label="일기 로딩 중">
          <div className={`${SKELETON} h-4 w-24`} />
          <div className="mt-3 flex flex-col divide-y divide-line-alt border-y border-line-alt">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 py-3">
                <div className="w-9 shrink-0 pt-0.5">
                  <div className={`${SKELETON} mx-auto h-3 w-5`} />
                  <div className={`${SKELETON} mx-auto mt-1 h-5 w-6`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`${SKELETON} h-4 w-2/3`} />
                  <div className={`${SKELETON} mt-2 h-3 w-full`} />
                  <div className={`${SKELETON} mt-1.5 h-3 w-16`} />
                </div>
              </div>
            ))}
          </div>
        </div>
        ) : null
      ) : !isError && (entries?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
          <p className="text-base font-medium text-label-alt">아직 작성한 일기가 없어요</p>
          <p className="text-sm text-label-alt">
            우측 하단의 + 버튼으로 첫 일기를 남겨보세요.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-2 text-sm font-bold text-label-alt">{group.label}</h2>
              {/* 월 안에서 다시 주 단위로 묶는다 — 주간 회고는 대상 주에 붙는다 */}
              <div className="flex flex-col gap-3">
                {group.weeks.map((week) => (
                  <div key={week.key}>
                    <h3 className="mb-1 text-xs font-medium text-label-alt">{week.label}</h3>
                    <ul className="flex flex-col divide-y divide-line-alt border-y border-line-alt">
                      {week.items.map((item) => (
                        <li key={item.id}>
                          <Link
                            href={`/diary/${item.id}`}
                            className="flex gap-3 py-3 transition-colors hover:bg-fill-alt"
                          >
                            {/* 날짜 컬럼 */}
                            <div className="w-9 shrink-0 pt-0.5 text-center">
                              <div className="text-xs text-label-alt">{item.weekday}</div>
                              <div className="text-lg font-bold leading-tight text-label-normal">
                                {String(item.day).padStart(2, "0")}
                              </div>
                            </div>
                            {/* 본문 컬럼 */}
                            <div className="min-w-0 flex-1">
                              {/* 주간 기록 표식 — 목표/회고 + #버킷명 (버킷이 지워졌으면 라벨만) */}
                              {item.isWeekly && (
                                <p className="mb-0.5 truncate text-2xs font-medium text-label-alt">
                                  {item.week_kind === "goal" ? "주간 목표" : "주간 회고"}
                                  {item.bucket_title ? ` · #${item.bucket_title}` : ""}
                                </p>
                              )}
                              <p className="truncate text-base font-bold text-label-normal">
                                {item.title}
                              </p>
                              {item.preview && (
                                <p className="mt-0.5 line-clamp-2 text-sm text-label-alt">
                                  {item.preview}
                                </p>
                              )}
                              <p className="mt-1 text-xs text-label-alt">{item.time}</p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* 플로팅 작성 버튼 (블랙) */}
      <Link
        href="/diary/new"
        aria-label="일기 작성"
        className="fixed bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+1rem)] right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-inverse-background text-inverse-label shadow-strong transition-opacity hover:opacity-90 active:opacity-80"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
      </Link>
    </div>
  );
}
