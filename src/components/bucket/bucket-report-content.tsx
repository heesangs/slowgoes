"use client";

// 완료 리포트 — 완료한 버킷 목록에서 행을 누르면 들어온다.
//
// "그 버킷에서 무엇을 했나"를 한 화면에 모은다. 새로 저장하는 데이터는 없고,
// 이미 쌓여 있던 것(완료 기록·계획 변경 이력·그때 쓴 주간 기록)을 읽어 보여줄 뿐이다.
//
// 없는 블록은 섹션째 숨긴다 — 빈 제목만 늘어서면 아무것도 안 한 것처럼 읽힌다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { SubPageHeader } from "@/components/layout/sub-page-header";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/ui/error-box";
import { useToast } from "@/components/ui/toast";
import { restoreBucketAction } from "@/app/(main)/dashboard/actions";
import { useBucketReport } from "@/hooks/use-bucket-report";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { splitStridesByGroup, STRIDE_LABELS } from "@/lib/ai/analyze";
import { FEATURE_NAMES } from "@/lib/constants";
import { CONTENT_WIDTH } from "@/lib/constants/layout";
import { josa } from "@/lib/utils";
import { daysSince } from "@/lib/utils/period";
import type { BucketReport, StrideItem, StrideLevel } from "@/types";

const SKELETON = "rounded bg-fill-normal";
/** 해낸 일 기본 노출 개수 — 오래 굴린 버킷은 수백 건이 될 수 있다 */
const DONE_PREVIEW = 10;

/** "2026-09-05" → "9.5" (목록 좌측 시점 컬럼용) */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

/** "2026-09-05T…" → "9월 5일" */
function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 리포트에서 쓰는 발걸음 라벨.
 * this_month 만 "마지막 달"로 바꾼다 — 몇 달 전에 끝낸 버킷에 "이번 달"은 거짓말이다.
 */
function reportStrideLabel(level: StrideLevel): string {
  return level === "this_month" ? "마지막 달" : STRIDE_LABELS[level];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold text-label-alt">{title}</h2>
      {children}
    </section>
  );
}

export function BucketReportContent({ bucketId }: { bucketId: string }) {
  const { data, isLoading, isError } = useBucketReport(bucketId);
  const showSkeleton = useDelayedFlag(isLoading);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();
  const [isRestoring, setIsRestoring] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);

  // 진행 중인 버킷이면 대시보드가 곧 그 화면이다 — 리포트는 끝난 것만 다룬다.
  const isActiveBucket = !!data && data.bucket.status !== "completed";
  useEffect(() => {
    if (isActiveBucket) router.replace(`/dashboard?bucket=${bucketId}`);
  }, [isActiveBucket, bucketId, router]);

  async function handleRestore(report: BucketReport) {
    if (isRestoring) return;
    setIsRestoring(true);
    try {
      const result = await restoreBucketAction(report.bucket.id);
      if (!result.success) {
        toast(result.error ?? `${FEATURE_NAMES.BUCKET}을 다시 시작하지 못했어요.`, "error");
        return;
      }
      const title = report.bucket.title;
      toast(`'${title}'${josa(title, "을", "를")} 다시 시작해요.`, "success");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["buckets"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      router.replace(`/dashboard?bucket=${report.bucket.id}`);
    } finally {
      setIsRestoring(false);
    }
  }

  if (isLoading || isActiveBucket) {
    return (
      <>
        <SubPageHeader backHref="/buckets/completed" />
        <div className={`mx-auto w-full px-4 pt-4 ${CONTENT_WIDTH}`}>
          {showSkeleton && (
            <div className="flex flex-col gap-4 animate-pulse" aria-label="리포트 로딩 중">
              <div className={`${SKELETON} h-6 w-2/3`} />
              <div className={`${SKELETON} h-4 w-1/2`} />
              <div className={`${SKELETON} mt-4 h-24 w-full`} />
              <div className={`${SKELETON} h-24 w-full`} />
            </div>
          )}
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <SubPageHeader backHref="/buckets/completed" />
        <div className={`mx-auto w-full px-4 pt-4 ${CONTENT_WIDTH}`}>
          <ErrorBox>
            {isError
              ? "기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
              : `${FEATURE_NAMES.BUCKET}을 찾을 수 없어요.`}
          </ErrorBox>
        </div>
      </>
    );
  }

  const { bucket, lifeArea, strides, titleHistory, doneTodos, unfinishedTodos, weeklyNotes } = data;
  const groups = splitStridesByGroup(strides);
  const planItems: StrideItem[] = [...groups.direction, ...groups.execution];

  // 이력이 있는 레벨만, 계획과 같은 순서로
  const historyLevels = planItems
    .map((item) => item.level)
    .filter((level) => (titleHistory[level]?.length ?? 0) > 0);

  const visibleDone = showAllDone ? doneTodos : doneTodos.slice(0, DONE_PREVIEW);
  const span =
    bucket.completed_at && bucket.created_at
      ? `${longDate(bucket.created_at)} – ${longDate(bucket.completed_at)} · ${daysSince(
          bucket.created_at,
          new Date(bucket.completed_at)
        )}일`
      : bucket.completed_at
        ? `${longDate(bucket.completed_at)} 완료`
        : null;

  return (
    <>
      {/* 헤더에는 제목을 넣지 않는다 — 바로 아래 h1이 같은 제목을 크게 들고 있어
          두 번 읽힌다. 어디로 돌아가는지는 ‹ 하나로 충분하다. */}
      <SubPageHeader backHref="/buckets/completed" />

      <div className={`mx-auto flex w-full flex-col gap-7 px-4 pb-10 pt-4 ${CONTENT_WIDTH}`}>
        {/* 요약 — 이 화면의 첫 줄이 곧 "무엇을 얼마나 했나"여야 한다 */}
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-bold leading-snug text-label-normal">{bucket.title}</h1>
          <p className="text-sm text-label-alt">
            {[lifeArea, span].filter(Boolean).join(" · ")}
          </p>
          <p className="text-sm text-label-alt">
            해낸 일 {data.completionCount}개
            {unfinishedTodos.length > 0 ? ` · 남긴 일 ${unfinishedTodos.length}개` : ""}
          </p>
        </header>

        {planItems.length > 0 && (
          <Section title="계획">
            <div className="flex flex-col border-t border-line-strong">
              {planItems.map((item, index) => (
                <div
                  key={`${item.level}-${index}`}
                  className="border-t border-line-normal pb-2 pt-4"
                >
                  <p className="text-sm text-label-assistive">
                    {reportStrideLabel(item.level)}
                  </p>
                  <p className="mt-1 text-sm leading-normal text-label-alt">{item.action}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {historyLevels.length > 0 && (
          <Section title="계획이 바뀐 이력">
            <ul className="flex flex-col divide-y divide-line-alt border-y border-line-alt">
              {historyLevels.flatMap((level) =>
                (titleHistory[level] ?? []).map((entry, index) => (
                  <li key={`${level}-${index}`} className="flex gap-3 py-3">
                    <span className="w-14 shrink-0 pt-0.5 text-xs tabular-nums text-label-assistive">
                      {longDate(entry.generated_at)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-label-alt">{entry.title}</p>
                      <p className="mt-0.5 text-xs text-label-assistive">
                        {reportStrideLabel(level)} ·{" "}
                        {entry.source === "ai" ? "AI 제안으로 교체" : "직접 수정"}
                      </p>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </Section>
        )}

        {doneTodos.length > 0 && (
          <Section title="해낸 일">
            <ul className="flex flex-col divide-y divide-line-alt border-y border-line-alt">
              {visibleDone.map((todo) => (
                <li key={todo.id} className="flex gap-3 py-3">
                  <span className="w-14 shrink-0 pt-0.5 text-xs tabular-nums text-label-assistive">
                    {shortDate(todo.dates[0] ?? "")}
                  </span>
                  <p className="min-w-0 flex-1 text-sm leading-relaxed text-label-alt">
                    {todo.title}
                    {/* 반복 할 일은 날짜를 다 나열하지 않고 횟수로 묶는다 */}
                    {todo.dates.length > 1 && (
                      <span className="ml-1.5 text-xs text-label-assistive">
                        ×{todo.dates.length}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
            {doneTodos.length > DONE_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllDone((prev) => !prev)}
                className="mx-auto rounded px-3 py-2 text-xs text-label-assistive transition-colors hover:bg-fill-alt hover:text-label-neutral"
              >
                {showAllDone ? "접기" : `${doneTodos.length - DONE_PREVIEW}개 더 보기`}
              </button>
            )}
          </Section>
        )}

        {unfinishedTodos.length > 0 && (
          <Section title="끝내지 못한 일">
            <ul className="flex flex-col divide-y divide-line-alt border-y border-line-alt">
              {unfinishedTodos.map((todo) => (
                <li key={todo.id} className="py-3">
                  <p className="text-sm leading-relaxed text-label-assistive">{todo.title}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {weeklyNotes.length > 0 && (
          <Section title="그때 쓴 기록">
            <ul className="flex flex-col divide-y divide-line-alt border-y border-line-alt">
              {weeklyNotes.map((note) => (
                <li key={note.id}>
                  <Link
                    href={`/diary/${note.id}`}
                    className="flex gap-3 py-3 transition-colors hover:bg-fill-alt"
                  >
                    <span className="w-14 shrink-0 pt-0.5 text-xs tabular-nums text-label-assistive">
                      {longDate(note.created_at)}
                    </span>
                    <div className="min-w-0 flex-1">
                      {note.week_kind && (
                        <p className="mb-0.5 text-2xs font-medium text-label-alt">
                          {note.week_kind === "goal" ? "주간 목표" : "주간 회고"}
                        </p>
                      )}
                      <p className="truncate text-sm font-medium text-label-normal">
                        {note.title}
                      </p>
                      {note.preview && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-label-alt">
                          {note.preview}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Button variant="outline" onClick={() => handleRestore(data)} isLoading={isRestoring}>
          다시 시작하기
        </Button>
      </div>
    </>
  );
}
