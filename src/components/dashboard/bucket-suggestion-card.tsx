"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FEATURE_NAMES } from "@/lib/constants";
import type { Bucket, StrideScope } from "@/types";

interface BucketSuggestionCardProps {
  suggestedBucket: Bucket | null;
  shouldShow: boolean;
}

function getStrideScopeLabel(scope: StrideScope) {
  switch (scope) {
    case "today": return "오늘";
    case "this_week": return "이번 주";
    case "this_month": return "이번 달";
    case "this_season": return "이번 시즌";
    case "this_year": return "1년 안";
    case "five_years": return "5년 안";
    case "decade": return "10년 안";
    case "someday": return "언젠가";
    default: return scope;
  }
}

function buildStartPointSuggestion(bucketTitle: string) {
  const text = bucketTitle.trim();
  if (!text) return "관련해서 오늘 할 수 있는 가장 작은 행동 1개 정하기";
  if (text.includes("여행")) return "여행지 후보 3개 적기";
  if (text.includes("운동")) return "이번 주 가능한 운동 시간 10분 확보하기";
  if (text.includes("독서")) return "읽고 싶은 책 1권을 골라 첫 페이지 펼치기";
  return `${text} 관련 첫 행동 1개 정하기`;
}

export function BucketSuggestionCard({
  suggestedBucket,
  shouldShow,
}: BucketSuggestionCardProps) {
  if (!shouldShow) return null;

  return (
    <section className="rounded-xl border border-foreground/10 px-4 py-4">
      <p className="text-sm text-foreground/60 mb-2">아직 시작하지 않은 장면</p>
      {suggestedBucket ? (
        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3">
          <p className="text-sm font-semibold">{suggestedBucket.title}</p>
          <p className="text-xs text-foreground/60 mt-1">
            {getStrideScopeLabel(suggestedBucket.stride_scope)} · 시작 전
          </p>
          <p className="text-sm text-foreground/80 mt-3">
            오늘 시작점 제안: {buildStartPointSuggestion(suggestedBucket.title)}
          </p>
          <Link href="/tasks/new" className="inline-block mt-3">
            <Button size="sm" variant="secondary">
              시작하기
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-foreground/20 px-3 py-4">
          <p className="text-sm text-foreground/70">새로운 {FEATURE_NAMES.BUCKET}을 추가해보세요.</p>
          <Link href="/tasks/new" className="inline-block mt-3">
            <Button size="sm" variant="secondary">
              한 걸음 추가하기
            </Button>
          </Link>
        </div>
      )}
    </section>
  );
}
