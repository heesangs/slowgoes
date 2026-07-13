"use server";

// 회고 화면 데이터 읽기 액션 (React Query queryFn).

import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getLifeBalance } from "@/lib/dashboard";
import { getReviewPageData } from "@/lib/stats";
import { AUTH_ERRORS } from "@/lib/constants";
import type { LifeBalanceInsight, ReviewPageData } from "@/types";

export interface ReviewViewData {
  displayName: string | null;
  reviewData: ReviewPageData | null;
  lifeBalance: LifeBalanceInsight | null;
}

export async function fetchReviewDataAction(): Promise<ReviewViewData> {
  const user = await getAuthUser();
  if (!user) throw new Error(AUTH_ERRORS.LOGIN_REQUIRED);

  const supabase = await createClient();
  const [profileRes, reviewData, lifeBalance] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    getReviewPageData(supabase, user.id),
    getLifeBalance(supabase, user.id),
  ]);

  const displayName =
    (profileRes.data as { display_name?: string | null } | null)?.display_name ?? null;

  return { displayName, reviewData, lifeBalance };
}
