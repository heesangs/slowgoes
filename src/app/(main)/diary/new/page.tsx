// 일기 작성 페이지 (Server Component)
//
// ?week=YYYY-MM-DD&bucket=<id>&kind=goal|review 로 들어오면 **주간 기록**이 된다
// (52주 캘린더 셀 탭 → 주간 시트 → 목표/회고 카드). week이 없으면 일반 일기.

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { DiaryEditor } from "@/components/diary/diary-editor";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface NewDiaryPageProps {
  searchParams?: Promise<{
    week?: string;
    /** "goal"이면 주간 목표, 그 외/없으면 주간 회고 */
    kind?: string;
    bucket?: string;
    bucketTitle?: string;
    /** "week"이면 뒤로가기가 주간 시트로 돌아간다 */
    from?: string;
    /** 복귀할 주 — week(회고 대상 주)과 별개다 */
    backWeek?: string;
  }>;
}

export default async function NewDiaryPage({ searchParams }: NewDiaryPageProps) {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const resolved = (await searchParams) ?? {};
  // 형식이 어긋나면 무시하고 일반 일기로 — 잘못된 값이 DB까지 가지 않게 한다
  const weekStart = resolved.week && DATE_RE.test(resolved.week) ? resolved.week : null;

  // 주간 시트에서 왔으면 그 주 시트로 복귀 (backWeek — 회고 대상 주와 별개)
  const backWeek =
    resolved.backWeek && DATE_RE.test(resolved.backWeek) ? resolved.backWeek : null;
  const backHref =
    resolved.from === "week"
      ? backWeek
        ? `/dashboard?week=${backWeek}`
        : "/dashboard"
      : undefined;

  return (
    <DiaryEditor
      mode="create"
      weekStart={weekStart}
      weekKind={weekStart ? (resolved.kind === "goal" ? "goal" : "review") : null}
      bucketId={weekStart ? (resolved.bucket ?? null) : null}
      bucketTitle={weekStart ? (resolved.bucketTitle ?? null) : null}
      backHref={backHref}
    />
  );
}
