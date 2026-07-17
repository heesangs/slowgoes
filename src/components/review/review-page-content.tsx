import Link from "next/link";
import { RoutineCompletionRing } from "@/components/review/routine-completion-ring";
import { WeekdayPatternChart } from "@/components/review/weekday-pattern-chart";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { LifeBalanceInsight, ReviewPageData, ReviewTimeBand } from "@/types";

interface ReviewPageContentProps {
  displayName: string | null;
  data: ReviewPageData | null;
  lifeBalance?: LifeBalanceInsight | null;
  fetchError?: string;
}

const STRONGEST_BAND_LABEL: Record<ReviewTimeBand, string> = {
  morning: "오전형",
  afternoon: "오후형",
  evening: "저녁형",
  night: "야행형",
};

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
}

function itemTypeLabel(type: "daily_todo" | "routine" | "todo" | undefined) {
  // Phase B 통합 이후 새 로그는 'todo'. 과거 로그(daily_todo/routine) 라벨은 보존.
  if (type === "todo") return "할 일";
  if (type === "daily_todo") return FEATURE_NAMES.DAILY_TODO;
  if (type === "routine") return FEATURE_NAMES.ROUTINE;
  return "행동";
}

export function ReviewPageContent({
  displayName,
  data,
  lifeBalance,
  fetchError,
}: ReviewPageContentProps) {
  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">회고 / 학습</h1>
          <p className="mt-1 text-sm text-foreground/60">
            완료한 한 걸음이 쌓이면 나만의 실행 패턴을 보여드릴게요.
          </p>
        </div>

        {fetchError && (
          <section className="rounded-xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700">
            {fetchError}
          </section>
        )}

        <section className="rounded-xl border border-dashed border-foreground/20 px-4 py-6 text-center">
          <p className="text-sm text-foreground/70">
            아직 행동 기록이 없어요. 오늘의 한 걸음을 완료하면 회고 화면이 채워집니다.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              대시보드로
            </Link>
            <Link
              href="/onboarding?step=2"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
            >
              버킷 추가
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const maxBandCount = Math.max(...data.timeBandStats.map((item) => item.count), 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">회고 / 학습</h1>
        <p className="text-sm text-foreground/60">
          {displayName ? `${displayName}님의` : "나의"} 실행 패턴을 돌아보고 다음 한 걸음을 더 잘 준비해요.
        </p>
      </div>

      {fetchError && (
        <section className="rounded-xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </section>
      )}

      {lifeBalance && (
        <section className="rounded-xl border border-foreground/10 px-4 py-4">
          <p className="text-sm text-foreground/60">인생균형흐름</p>
          <p className="mt-2 text-sm text-foreground/85">{lifeBalance.message}</p>
          <p className="mt-2 text-xs text-foreground/55">
            집중 영역: {lifeBalance.focusArea ?? "-"}
            {" · "}
            비어있는 영역: {lifeBalance.neglectedArea ?? "-"}
          </p>
        </section>
      )}

      {/* PR 23: 평균 예상/실제 시간 위젯 제거 (DB에 측정 데이터 없음 → 항상 '-') */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-foreground/10 px-4 py-4">
          <p className="text-xs text-foreground/60">누적 완료 행동</p>
          <p className="mt-1 text-xl font-semibold">{data.completedCount}개</p>
        </div>
        <div className="rounded-xl border border-foreground/10 px-4 py-4">
          <p className="text-xs text-foreground/60">최근 14일 완료</p>
          <p className="mt-1 text-xl font-semibold">{data.completedInLast14Days}개</p>
        </div>
      </section>

      {/* PR 24: 루틴 달성률 링 (Apple Watch 스타일) */}
      <RoutineCompletionRing rate={data.weeklyRoutineRate} />

      {/* PR 24: 요일별 수행 패턴 (최근 4주) */}
      <WeekdayPatternChart data={data.weekdayCompletions} />

      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <p className="mb-2 text-sm text-foreground/60">이번 회고 인사이트</p>
        <p className={cn("text-sm", data.insight ? "text-foreground/85" : "text-foreground/60")}>
          {data.insight ?? "완료 데이터가 쌓이면 개인화 인사이트가 생성됩니다."}
        </p>
        <p className="mt-3 text-xs text-foreground/50">
          대표 시간대: {data.strongestBand ? STRONGEST_BAND_LABEL[data.strongestBand] : "데이터 수집 중"}
        </p>
      </section>

      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <p className="mb-3 text-sm text-foreground/60">시간대 리듬</p>
        <div className="flex flex-col gap-3">
          {data.timeBandStats.map((item) => (
            <div key={item.band} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-foreground/60">{item.label}</span>
              <div className="h-2.5 flex-1 rounded-full bg-foreground/10">
                <div
                  className="h-2.5 rounded-full bg-foreground/70"
                  style={{ width: `${Math.round((item.count / maxBandCount) * 100)}%` }}
                />
              </div>
              <span className="w-7 shrink-0 text-right text-xs text-foreground/60">{item.count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* PR 23: 난이도 학습 섹션 제거 (DB에 난이도 측정 데이터 없음 → 항상 neutral) */}

      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <p className="mb-3 text-sm text-foreground/60">최근회고 기록</p>
        <div className="flex flex-col gap-3">
          {data.recent.map((item) => (
            <article key={item.id} className="rounded-lg border border-foreground/10 px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs text-foreground/55">{shortDate(item.completedAt)}</p>
                </div>
                <span className="inline-flex min-h-[28px] items-center rounded-full border border-foreground/20 px-2.5 text-[11px] text-foreground/65">
                  {itemTypeLabel(item.itemType)}
                </span>
              </div>

              {(item.bucketTitle || item.lifeAreaName) && (
                <p className="mt-1 text-xs text-foreground/55">
                  {item.lifeAreaName ? `${item.lifeAreaName} · ` : ""}
                  {item.bucketTitle ?? `${FEATURE_NAMES.BUCKET} 미연결`}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
