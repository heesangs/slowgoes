"use client";

// 버킷 상세 페이지 — 버킷 메타정보 + stride_plan 뷰어
//
// 이전에는 "챕터" 시스템(직접 추가 / AI 챕터 제안 / 기간 설정)이 있었으나,
// stride_plan(나의 발걸음)과 개념이 충돌하고 대시보드와 연결되지 않은 dead-end 였기에 제거.
// stride 인터랙션(재추천 등)은 모두 대시보드의 "나의 발걸음" 섹션이 담당.

import Link from "next/link";
import { useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { partitionStrides, STRIDE_LABELS } from "@/lib/ai/analyze";
import type { Bucket, BucketStatus, LifeArea, StridePlan, StrideScope } from "@/types";

type BucketRow = Bucket & {
  life_area?: Pick<LifeArea, "id" | "name"> | null;
};

interface BucketDetailContentProps {
  bucket: BucketRow;
  stridePlan: StridePlan | null;
  fetchError?: string;
}

function strideScopeLabel(value: StrideScope) {
  return STRIDE_LABELS[value] ?? value;
}

function bucketStatusLabel(value: BucketStatus) {
  if (value === "not_started") return "시작 전";
  if (value === "in_progress") return "진행 중";
  if (value === "completed") return "완료";
  return "보류";
}

function shortDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function BucketDetailContent({
  bucket,
  stridePlan,
  fetchError,
}: BucketDetailContentProps) {
  const { toast } = useToast();

  useEffect(() => {
    if (fetchError) {
      toast(fetchError, "error");
    }
  }, [fetchError, toast]);

  const dashboardHref = `/dashboard?bucket=${bucket.id}`;
  const partitioned = stridePlan ? partitionStrides(stridePlan.strides ?? []) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* 뒤로가기 — 버킷 목록 */}
      <Link
        href="/buckets"
        className="inline-flex items-center gap-1 text-sm text-foreground/60 hover:text-foreground transition-colors w-fit"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 12L6 8L10 4" />
        </svg>
        버킷 목록
      </Link>

      {/* 버킷 메타정보 */}
      <section className="rounded-xl border border-foreground/10 p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{bucket.title}</h1>
          <p className="text-sm text-foreground/60">
            영역: {bucket.life_area?.name ?? "미연결"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-foreground/20 px-2 py-1">
            {strideScopeLabel(bucket.stride_scope)}
          </span>
          <span className="rounded-full border border-foreground/20 px-2 py-1">
            {bucketStatusLabel(bucket.status)}
          </span>
          <span className="rounded-full border border-foreground/20 px-2 py-1">
            생성일 {shortDate(bucket.created_at)}
          </span>
        </div>

        <Link
          href={dashboardHref}
          className="inline-flex items-center justify-center rounded-lg border border-foreground/20 px-4 py-2 text-sm font-medium min-h-[44px] hover:bg-foreground/5 transition-colors w-full sm:w-fit"
        >
          이 버킷의 발걸음 보기
        </Link>
      </section>

      {/* stride_plan 뷰어 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground/70">나의 발걸음</h2>
          {stridePlan && (
            <Link
              href={dashboardHref}
              className="text-xs text-foreground/55 hover:text-foreground transition-colors"
            >
              대시보드에서 관리 →
            </Link>
          )}
        </div>

        {!stridePlan && (
          <div className="rounded-xl border border-dashed border-foreground/20 px-4 py-6 text-sm text-foreground/70 text-center flex flex-col gap-3 items-center">
            <p>아직 이 버킷의 발걸음이 만들어지지 않았어요.</p>
            <Link
              href={dashboardHref}
              className="inline-flex items-center justify-center rounded-lg border border-foreground/20 px-3 py-2 text-xs min-h-[40px] hover:bg-foreground/5 transition-colors"
            >
              대시보드에서 만들기
            </Link>
          </div>
        )}

        {stridePlan && partitioned && (
          <div className="flex flex-col gap-3">
            {stridePlan.empathy_message && (
              <p className="rounded-lg bg-foreground/[0.04] px-3 py-2 text-xs leading-relaxed text-foreground/70">
                {stridePlan.empathy_message}
              </p>
            )}

            {partitioned.displayStrides.length === 0 &&
              partitioned.bucketTodos.length === 0 && (
                <p className="text-sm text-foreground/60">
                  발걸음 항목이 비어 있어요.
                </p>
              )}

            {partitioned.displayStrides.length > 0 && (
              <div className="flex flex-col gap-2">
                {partitioned.displayStrides.map((item, index) => (
                  <article
                    key={`stride-${item.level}-${index}`}
                    className="rounded-xl border border-foreground/10 px-4 py-3 flex flex-col gap-1"
                  >
                    <p className="text-xs font-medium text-foreground/55">
                      {item.label}
                    </p>
                    <p className="text-sm text-foreground/85">{item.action}</p>
                  </article>
                ))}
              </div>
            )}

            {partitioned.bucketTodos.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-foreground/55">짧은 발걸음</p>
                {partitioned.bucketTodos.map((item, index) => (
                  <article
                    key={`todo-${item.level}-${index}`}
                    className="rounded-xl border border-foreground/10 bg-foreground/[0.02] px-4 py-3 flex flex-col gap-1"
                  >
                    <p className="text-xs font-medium text-foreground/55">
                      {item.label}
                    </p>
                    <p className="text-sm text-foreground/85">{item.action}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
