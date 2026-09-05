"use client";

// 완료한 버킷 목록 — 버킷 시트 하단 "완료한 버킷 N ›" 에서 들어온다.
//
// 한 줄에 제목 · 걸린 기간(시작~완료) · 완료한 할 일 수. 오래 붙들었던 일일수록
// 기간이 말해 주는 게 많아서, 완료일만이 아니라 시작일부터 함께 보여준다.
// 목록 결은 일기(divide-y + 좌측 시점 컬럼)를 따른다 — 같은 "지나간 기록"이라서.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { SubPageHeader } from "@/components/layout/sub-page-header";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/ui/error-box";
import { useToast } from "@/components/ui/toast";
import { restoreBucketAction } from "@/app/(main)/dashboard/actions";
import { useCompletedBuckets } from "@/hooks/use-completed-buckets";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { FEATURE_NAMES } from "@/lib/constants";
import { CONTENT_WIDTH } from "@/lib/constants/layout";
import { josa } from "@/lib/utils";
import { daysSince } from "@/lib/utils/period";
import type { CompletedBucketSummary } from "@/types";

const SKELETON = "rounded bg-fill-normal";

/** "2026-04-16" ~ "2026-09-06" → "4월 16일 – 9월 6일 · 144일" */
function formatSpan(bucket: CompletedBucketSummary): string | null {
  if (!bucket.completed_at) return null;
  const end = new Date(bucket.completed_at);
  if (Number.isNaN(end.getTime())) return null;
  const endLabel = `${end.getMonth() + 1}월 ${end.getDate()}일`;

  if (!bucket.created_at) return `${endLabel} 완료`;
  const start = new Date(bucket.created_at);
  if (Number.isNaN(start.getTime())) return `${endLabel} 완료`;

  // 시작일 포함 일수 — daysSince 를 완료 시점 기준으로 쓴다
  const days = daysSince(bucket.created_at, end);
  return `${start.getMonth() + 1}월 ${start.getDate()}일 – ${endLabel} · ${days}일`;
}

export function CompletedBucketsContent() {
  const { data: buckets, isLoading, isError } = useCompletedBuckets();
  const showSkeleton = useDelayedFlag(isLoading);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function handleRestore(bucket: CompletedBucketSummary) {
    if (restoringId) return;
    setRestoringId(bucket.id);
    try {
      const result = await restoreBucketAction(bucket.id);
      if (!result.success) {
        // 이름이 겹쳐 막힌 경우 — 이 화면에 머물러야 사용자가 이어서 손볼 수 있다
        toast(result.error ?? `${FEATURE_NAMES.BUCKET}을 다시 시작하지 못했어요.`, "error");
        return;
      }
      toast(`'${bucket.title}'${josa(bucket.title, "을", "를")} 다시 시작해요.`, "success");
      // 이 목록과 대시보드 양쪽이 바뀐다
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["buckets", "completed"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      router.replace(`/dashboard?bucket=${bucket.id}`);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <>
      <SubPageHeader backHref="/dashboard" title={`완료한 ${FEATURE_NAMES.BUCKET}`} />

      <div className={`mx-auto w-full px-4 pb-8 pt-4 ${CONTENT_WIDTH}`}>
        {isError && (
          <ErrorBox className="mb-4">
            완료한 {FEATURE_NAMES.BUCKET}을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
          </ErrorBox>
        )}

        {isLoading ? (
          showSkeleton ? (
            <div className="animate-pulse" aria-label="목록 로딩 중">
              <div className="flex flex-col divide-y divide-line-alt border-y border-line-alt">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-4">
                    <div className="min-w-0 flex-1">
                      <div className={`${SKELETON} h-4 w-2/3`} />
                      <div className={`${SKELETON} mt-2 h-3 w-40`} />
                    </div>
                    <div className={`${SKELETON} h-8 w-20 shrink-0`} />
                  </div>
                ))}
              </div>
            </div>
          ) : null
        ) : !isError && (buckets?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
            <p className="text-base font-medium text-label-alt">
              아직 완료한 {FEATURE_NAMES.BUCKET}이 없어요
            </p>
            <p className="text-sm text-label-alt">
              하나를 끝내면 여기 쌓여요. 언제든 다시 시작할 수도 있고요.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line-alt border-y border-line-alt">
            {buckets?.map((bucket) => {
              const span = formatSpan(bucket);
              return (
                <li key={bucket.id} className="flex items-center gap-3 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-bold text-label-normal">
                      {bucket.title}
                    </p>
                    <p className="mt-1 text-xs text-label-alt">
                      {span}
                      {span && bucket.completedTodoCount > 0 ? " · " : ""}
                      {bucket.completedTodoCount > 0
                        ? `완료한 할 일 ${bucket.completedTodoCount}개`
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant="line"
                    size="sm"
                    className="shrink-0"
                    onClick={() => handleRestore(bucket)}
                    isLoading={restoringId === bucket.id}
                    disabled={restoringId !== null}
                  >
                    다시 시작하기
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
