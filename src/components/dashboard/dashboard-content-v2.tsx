"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AllTasksView } from "@/components/dashboard/all-tasks-view";
import { useToast } from "@/components/ui/toast";
import { cn, formatMinutes, getDifficultyConfig } from "@/lib/utils";
import type { DashboardV2Data, Difficulty, Subtask, TaskWithSubtasks } from "@/types";

interface DashboardContentV2Props {
  data: DashboardV2Data;
  allTasks: TaskWithSubtasks[];
  fetchError?: string;
}

function getLifeClockLabel(age: number | null | undefined) {
  if (age == null || age < 0 || age > 100) {
    return "탐색 중";
  }

  const totalHours = (age / 100) * 24;
  const hour24 = Math.floor(totalHours);
  const minute = Math.floor((totalHours - hour24) * 60);
  const meridiem = hour24 < 12 ? "오전" : "오후";
  const hour12Raw = hour24 % 12;
  const hour12 = hour12Raw === 0 ? 12 : hour12Raw;
  return `${meridiem} ${hour12}:${String(minute).padStart(2, "0")}`;
}

function isLeafSubtask(target: Subtask, all: Subtask[]) {
  return !all.some((item) => item.parent_subtask_id === target.id);
}

function getTaskDifficulty(task: TaskWithSubtasks): Difficulty {
  const subtasks = task.subtasks ?? [];
  const leafs = subtasks.filter((item) => isLeafSubtask(item, subtasks));
  const base = leafs.length > 0 ? leafs : subtasks;

  const count: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const item of base) {
    count[item.difficulty] += 1;
  }

  const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  if (!top || top[1] === 0) return "medium";
  return top[0] as Difficulty;
}

function getTaskMinutes(task: TaskWithSubtasks) {
  if (typeof task.total_estimated_minutes === "number" && task.total_estimated_minutes > 0) {
    return task.total_estimated_minutes;
  }

  const subtasks = task.subtasks ?? [];
  const leafs = subtasks.filter((item) => isLeafSubtask(item, subtasks));
  const base = leafs.length > 0 ? leafs : subtasks;
  const sum = base.reduce((acc, cur) => acc + (cur.estimated_minutes ?? 0), 0);
  return sum > 0 ? sum : 5;
}

function getHorizonLabel(horizon: "someday" | "this_year" | "this_season") {
  if (horizon === "this_year") return "1년 안";
  if (horizon === "this_season") return "이번 시즌";
  return "언젠가";
}

function buildStartPointSuggestion(bucketTitle: string) {
  const text = bucketTitle.trim();
  if (!text) return "관련해서 오늘 할 수 있는 가장 작은 행동 1개 정하기";
  if (text.includes("여행")) return "여행지 후보 3개 적기";
  if (text.includes("운동")) return "이번 주 가능한 운동 시간 10분 확보하기";
  if (text.includes("독서")) return "읽고 싶은 책 1권을 골라 첫 페이지 펼치기";
  return `${text} 관련 첫 행동 1개 정하기`;
}

export function DashboardContentV2({ data, allTasks, fetchError }: DashboardContentV2Props) {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const lifeClockLabel = getLifeClockLabel(data.profile.life_clock_age);
  const activeChapter = data.activeChapters[0] ?? null;
  const dailyStep = data.dailyStep;
  const shouldShowUnstartedSection =
    Boolean(data.suggestedBucket) || (data.profile.onboarding_version ?? 1) <= 1;
  const shouldShowReviewSection = Boolean(data.review);
  const isReviewMature = (data.review?.completedCount ?? 0) >= 6;

  useEffect(() => {
    if (searchParams.get("onboarding_saved") === "1") {
      toast("첫 한 걸음이 준비되었어요 ✨", "success");
      window.history.replaceState(null, "", "/dashboard");
      return;
    }

    if (searchParams.get("saved") === "1") {
      toast("저장되었습니다 ✓", "success");
      window.history.replaceState(null, "", "/dashboard");
    }
  }, [searchParams, toast]);

  useEffect(() => {
    if (fetchError) {
      toast(fetchError, "error");
    }
  }, [fetchError, toast]);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-4">
        <p className="text-sm text-foreground/60">당신의 인생 시계</p>
        <p className="text-xl font-semibold mt-1">당신의 인생 시계: {lifeClockLabel}</p>
        <p className="text-sm text-foreground/70 mt-3">
          이번 시즌의 주제: {activeChapter?.title ?? "지금은 탐색의 챕터"}
        </p>
      </section>

      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <p className="text-sm text-foreground/60 mb-2">오늘의 한 걸음</p>

        {dailyStep ? (
          <Link href={`/tasks/${dailyStep.id}`} className="block">
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3 transition-colors hover:bg-foreground/[0.05]">
              <p className="text-base font-semibold">{dailyStep.title}</p>
              <p className="text-xs text-foreground/60 mt-1">
                예상 {formatMinutes(getTaskMinutes(dailyStep))} ·{" "}
                {getDifficultyConfig(getTaskDifficulty(dailyStep)).label}
              </p>
              <p className="text-xs text-foreground/60 mt-3">
                {dailyStep.bucket?.title
                  ? `이 일은 '${dailyStep.bucket.title}'라는 삶의 장면과 연결돼 있어요.`
                  : "이 일은 당신의 삶의 장면과 연결돼 있어요."}
              </p>
            </div>
          </Link>
        ) : (
          <div className="rounded-lg border border-dashed border-foreground/20 px-3 py-4">
            <p className="text-sm text-foreground/70">오늘의 한 걸음을 만들어볼까요?</p>
            <Link href="/tasks/new" className="inline-block mt-3">
              <Button size="sm">한 걸음 만들기</Button>
            </Link>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <p className="text-sm text-foreground/60 mb-2">인생균형 진행</p>
        {data.balance?.focusArea && (
          <p className="text-sm text-foreground/80">
            이번 시즌 손이 많이 가는 영역: {data.balance.focusArea}
          </p>
        )}
        {data.balance?.neglectedArea && (
          <p className="text-sm text-foreground/80 mt-1">
            최근 놓치고 있는 영역: {data.balance.neglectedArea}
          </p>
        )}
        {data.balance?.steadyArea && (
          <p className="text-sm text-foreground/80 mt-1">
            작게라도 계속 이어가는 영역: {data.balance.steadyArea}
          </p>
        )}
        <p className="text-sm text-foreground/80">
          {data.balance?.message ??
            "아직 데이터가 모이고 있어요. 조금만 더 사용하면 패턴이 보일 거예요."}
        </p>
      </section>

      {shouldShowUnstartedSection && (
        <section className="rounded-xl border border-foreground/10 px-4 py-4">
          <p className="text-sm text-foreground/60 mb-2">아직 시작하지 않은 장면</p>
          {data.suggestedBucket ? (
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3">
              <p className="text-sm font-semibold">{data.suggestedBucket.title}</p>
              <p className="text-xs text-foreground/60 mt-1">
                {getHorizonLabel(data.suggestedBucket.horizon)} · 시작 전
              </p>
              <p className="text-sm text-foreground/80 mt-3">
                오늘 시작점 제안: {buildStartPointSuggestion(data.suggestedBucket.title)}
              </p>
              <Link href="/tasks/new" className="inline-block mt-3">
                <Button size="sm" variant="secondary">
                  시작하기
                </Button>
              </Link>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-foreground/20 px-3 py-4">
              <p className="text-sm text-foreground/70">삶의 장면을 추가해보세요.</p>
              <Link href="/tasks/new" className="inline-block mt-3">
                <Button size="sm" variant="secondary">
                  한 걸음 추가하기
                </Button>
              </Link>
            </div>
          )}
        </section>
      )}

      {shouldShowReviewSection && (
        <section className="rounded-xl border border-foreground/10 px-4 py-4">
          <p className="text-sm text-foreground/60 mb-2">회고 / 학습</p>

          {!isReviewMature && data.review && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">최근 회고</p>
              <p className="text-sm text-foreground/80">
                예상 {formatMinutes(data.review.recentEstimatedMinutes)} → 실제{" "}
                {formatMinutes(data.review.recentActualMinutes)}
              </p>
              {(data.review.recentDifficultyBefore || data.review.recentDifficultyAfter) && (
                <p className="text-sm text-foreground/80">
                  체감 난이도:{" "}
                  {data.review.recentDifficultyBefore
                    ? getDifficultyConfig(data.review.recentDifficultyBefore).label
                    : "-"}{" "}
                  →{" "}
                  {data.review.recentDifficultyAfter
                    ? getDifficultyConfig(data.review.recentDifficultyAfter).label
                    : "-"}
                </p>
              )}
              {data.review.recentMemo && (
                <p className="text-sm text-foreground/70">
                  메모: &quot;{data.review.recentMemo}&quot;
                </p>
              )}
            </div>
          )}

          {isReviewMature && data.review && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">당신에 대해 알게 된 것</p>
              <p
                className={cn(
                  "text-sm",
                  data.review.insight ? "text-foreground/80" : "text-foreground/60"
                )}
              >
                {data.review.insight ??
                  "아직 회고 데이터가 충분하지 않아요. 몇 번 더 완료해보세요."}
              </p>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <p className="text-sm text-foreground/60 mb-2">전체 할 일</p>
        <AllTasksView
          tasks={allTasks}
          displayName={data.profile.display_name ?? null}
          showHeader={false}
        />
      </section>
    </div>
  );
}
