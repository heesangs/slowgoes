"use client";

// 메인 라우트 그룹의 상단 헤더 — 로고 + 프로필(설정).
//
// IA v2 목표 6: 헤더 우측의 로그아웃 버튼은 제거하고 /profile 페이지로 일원화.
// 모바일 우측 상단은 뒤로가기/닫기와 가까워 오탭 빈도가 높기 때문.
//
// 일기·회고는 하단 탭(BottomNavBar)으로 내렸다 — 엄지가 닿는 곳에 두고
// 헤더에는 로고와 설정만 남겨 상단을 가볍게 유지한다.

import Link from "next/link";
import { ProfileIcon } from "@/components/ui/icons";
import { APP, FEATURE_NAMES } from "@/lib/constants";
import { SURFACE_SHADOW } from "@/lib/constants/ui";
import { cn } from "@/lib/utils";

export function MainHeader() {
  return (
    <header
      // sticky + bg-background — 스크롤해도 상단에 남고, **상태바 영역까지 헤더 배경이
      // 칠해진다**(safe-area 패딩이 헤더 안쪽에 있으므로). 배경이 없던 시절엔 상태바
      // 아래를 칠할 주체가 없어, 오버레이가 지나간 뒤 그 자리가 어둡게 남았다.
      // z-30: 바텀 네비와 같은 층. 시트/입력창(50)보다는 아래.
      className={cn(
        "sticky top-0 z-30 border-b border-foreground/10 bg-background px-4",
        "pt-[env(safe-area-inset-top)]",
        SURFACE_SHADOW
      )}
    >
      <div className="mx-auto flex h-[var(--top-header-h)] max-w-2xl items-center justify-between">
        <Link href="/dashboard" className="text-lg font-bold">
          {APP.NAME}
        </Link>
        <Link
          href="/profile"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-foreground/5"
          aria-label={FEATURE_NAMES.PROFILE}
        >
          <ProfileIcon className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}
