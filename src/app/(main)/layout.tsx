// (main) 라우트 그룹 레이아웃 — 크롬 셸(MainShell) + 스트리밍 nav.
//
// 성능: 레이아웃은 인증 확인(getAuthUser: 쿠키 기반, 네트워크 왕복 없음)만 await하고
// 즉시 children을 렌더한다. nav의 buckets/profile 페치는 Suspense로 감싼
// MainNavBarLoader로 분리해 페이지 콘텐츠를 막지 않는다.

import { Suspense } from "react";
import { getAuthUser } from "@/lib/supabase/auth";
import { MainShell } from "@/components/layout/main-shell";
import { MainNavBarLoader } from "@/components/layout/main-nav-bar-loader";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 미로그인 시 각 페이지에서 redirect 처리 — 여기서는 nav만 건너뜀.
  const user = await getAuthUser();

  const navSlot = user ? (
    <Suspense fallback={null}>
      <MainNavBarLoader userId={user.id} />
    </Suspense>
  ) : null;

  return <MainShell navSlot={navSlot}>{children}</MainShell>;
}
