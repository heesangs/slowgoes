// (main) 라우트 그룹 레이아웃 — 크롬 셸(MainShell).
//
// 인증 확인(getAuthUser: 쿠키 기반, 네트워크 왕복 없음)만 하고 즉시 children을 렌더한다.
// 구 '나의 시간' nav 바는 제거됨 — 인생시계는 대시보드 일생보기(스와이프 → 인생시계)로 통합.

import { getAuthUser } from "@/lib/supabase/auth";
import { MainShell } from "@/components/layout/main-shell";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 미로그인 시 각 페이지에서 redirect 처리 — 여기서는 인증 상태만 확인.
  await getAuthUser();

  return <MainShell>{children}</MainShell>;
}
