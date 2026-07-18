// MainNavBar 데이터 로더 (async 서버 컴포넌트).
//
// profile 페치를 layout의 크리티컬 패스에서 분리하기 위해 Suspense로 감싸 스트리밍한다.
// R1: 버킷칩 제거로 buckets/cookie 조회가 사라지고 나의 시간(lifeClock)만 남음.

import { getProfileForRequest } from "@/lib/dashboard";
import { MainNavBar } from "@/components/layout/main-nav-bar";
import { APP } from "@/lib/constants";

export async function MainNavBarLoader({ userId }: { userId: string }) {
  const profile = await getProfileForRequest(userId);

  // 나의 시간 바 — 프로필이 부분완성이어도 age만 유효하면 노출
  const lifeClock =
    profile && profile.life_clock_age != null && profile.life_clock_age >= 0 && profile.life_clock_age <= 100
      ? {
          age: profile.life_clock_age,
          displayName: profile.display_name ?? APP.DEFAULT_USER_NAME,
        }
      : null;

  return <MainNavBar lifeClock={lifeClock} />;
}
