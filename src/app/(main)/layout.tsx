// (main) 라우트 그룹 레이아웃 — 상단 헤더 + 본문 + 헤더 하단 BucketSwitcher.
//
// IA v2 목표 3: 모든 (main) 화면에서 동일한 위치에 BucketSwitcher를 노출하기 위해
// 레이아웃 단에서 마운트한다. 노출 여부는 MainNavBar 내부에서 라우트로 분기.
//
// 서버 컴포넌트에서 buckets / profile / cookie를 한 번만 조회 → MainNavBar 로 주입.
// 각 페이지의 selectedBucket 해석 로직(URL > cookie > buckets[0])과 동일한 입력을 공유.

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getUserBuckets } from "@/lib/dashboard";
import { LAST_VIEWED_BUCKET_COOKIE_NAME } from "@/hooks/use-track-last-viewed-bucket";
import { MainShell } from "@/components/layout/main-shell";
import type { Gender, PaceType, PersonalityType } from "@/types";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 미로그인 시 페이지에서 redirect 처리 — 여기서는 헤더만 노출하고 NavBar는 건너뜀.
  let bucketsForNav: { id: string; title: string }[] = [];
  let prefillProfile:
    | {
        age: number;
        gender: Gender;
        personalityType: PersonalityType;
        paceType?: PaceType;
      }
    | null = null;
  let cookieSelectedBucketId: string | null = null;

  if (user) {
    const [buckets, profile] = await Promise.all([
      getUserBuckets(supabase, user.id),
      getProfile(supabase, user.id),
    ]);
    bucketsForNav = buckets.map((b) => ({ id: b.id, title: b.title }));

    if (
      profile &&
      profile.life_clock_age != null &&
      (profile.gender === "male" || profile.gender === "female") &&
      profile.personality_type != null
    ) {
      prefillProfile = {
        age: profile.life_clock_age,
        gender: profile.gender as Gender,
        personalityType: profile.personality_type as PersonalityType,
        paceType: (profile.pace_type ?? undefined) as PaceType | undefined,
      };
    }

    const cookieStore = await cookies();
    cookieSelectedBucketId =
      cookieStore.get(LAST_VIEWED_BUCKET_COOKIE_NAME)?.value ?? null;
  }

  return (
    <MainShell
      navProps={{ buckets: bucketsForNav, cookieSelectedBucketId, prefillProfile }}
    >
      {children}
    </MainShell>
  );
}
