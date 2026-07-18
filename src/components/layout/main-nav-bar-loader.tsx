// MainNavBar 데이터 로더 (async 서버 컴포넌트).
//
// buckets/profile 페치를 layout의 크리티컬 패스에서 분리하기 위해 Suspense로 감싸
// 스트리밍한다. 페이지 콘텐츠는 이 데이터를 기다리지 않고 즉시 렌더된다.
// (MainNavBar 자체는 /dashboard에서만 노출되고 그 외엔 null을 반환한다.)

import { cookies } from "next/headers";
import { getUserBucketsForRequest, getProfileForRequest } from "@/lib/dashboard";
import { LAST_VIEWED_BUCKET_COOKIE_NAME } from "@/hooks/use-track-last-viewed-bucket";
import { MainNavBar } from "@/components/layout/main-nav-bar";
import { APP } from "@/lib/constants";
import type { Gender, PaceType, PersonalityType } from "@/types";

export async function MainNavBarLoader({ userId }: { userId: string }) {
  const [buckets, profile] = await Promise.all([
    getUserBucketsForRequest(userId),
    getProfileForRequest(userId),
  ]);

  const bucketsForNav = buckets.map((b) => ({ id: b.id, title: b.title }));

  let prefillProfile:
    | { age: number; gender: Gender; personalityType: PersonalityType; paceType?: PaceType }
    | null = null;
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

  // 나의 시간 바 — 프로필이 부분완성이어도 age만 유효하면 노출
  const lifeClock =
    profile && profile.life_clock_age != null && profile.life_clock_age >= 0 && profile.life_clock_age <= 100
      ? {
          age: profile.life_clock_age,
          displayName: profile.display_name ?? APP.DEFAULT_USER_NAME,
        }
      : null;

  const cookieStore = await cookies();
  const cookieSelectedBucketId =
    cookieStore.get(LAST_VIEWED_BUCKET_COOKIE_NAME)?.value ?? null;

  return (
    <MainNavBar
      buckets={bucketsForNav}
      cookieSelectedBucketId={cookieSelectedBucketId}
      prefillProfile={prefillProfile}
      lifeClock={lifeClock}
    />
  );
}
