"use client";

// (main) 크롬 분기 셸 — 경로에 따라 글로벌 헤더 노출 여부를 결정.
//
// 일반 라우트: MainHeader + 패딩 main.
// 포커스(서브페이지) 라우트: 글로벌 크롬 제거 → 페이지가 자체 SubPageHeader로 상단을 채워
//   본문 세로 공간을 최대화. (예: /diary/new, /diary/[id])
//
// 구 '나의 시간' nav 바는 제거됨 — 인생시계는 대시보드 일생보기로 통합.
// 대시보드는 버킷 상단바(BucketBar)가 헤더 바로 아래 flush로 붙도록 pt-0.

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNavBar } from "@/components/layout/bottom-nav-bar";
import { MainHeader } from "@/components/layout/main-header";
import { cn } from "@/lib/utils";

// 좌우 패딩을 없애 콘텐츠를 화면 끝까지 채우는 라우트(대시보드/일기 목록).
// 그 외(회고/프로필)는 공통 px-4 유지.
const FULL_WIDTH_PATHS = ["/dashboard", "/diary"];

interface MainShellProps {
  children: ReactNode;
}

// 서브페이지(포커스) 라우트 판별.
// "/diary/" prefix → /diary/new, /diary/[id] 매칭 (목록 "/diary"는 제외).
function isFocusRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname.startsWith("/diary/");
}

export function MainShell({ children }: MainShellProps) {
  const pathname = usePathname();
  const focus = isFocusRoute(pathname);

  // 포커스 라우트에는 바텀 네비가 없다 → --bottom-nav-h를 0으로 덮는다.
  // 이 변수를 토스트·FAB·본문 하단 여백이 함께 참조하므로, 안 덮으면 없는 네비
  // 높이(56px)만큼 붕 떠서 뜬다("코멘트를 달았어요" 토스트 위치가 이상했던 이유).
  useEffect(() => {
    const el = document.documentElement;
    if (focus) el.style.setProperty("--bottom-nav-h", "0px");
    else el.style.removeProperty("--bottom-nav-h");
    return () => {
      el.style.removeProperty("--bottom-nav-h");
    };
  }, [focus]);

  if (focus) {
    // 포커스 라우트: 글로벌 헤더/네비 없이 페이지가 상단을 관리.
    // 블록 컨테이너 사용 — flex-col로 감싸면 자식의 mx-auto가 shrink-to-fit 되어
    // 본문 폭이 무너진다. 일반 블록 흐름 + sticky 헤더로 처리.
    return <div className="min-h-dvh">{children}</div>;
  }

  // 대시보드/일기 목록은 좌우 여백 0(full-width) + 상단 flush, 그 외는 px-4/py-6
  const fullWidth = FULL_WIDTH_PATHS.some((p) => pathname === p);

  return (
    <div className="min-h-dvh flex flex-col">
      <MainHeader />
      {/* 하단 여백 = 네비 높이 + safe-area + 여유. 페이지별로 흩어놓지 않고 여기서 일괄 —
          하단 패딩이 없던 /review·/profile도 마지막 카드가 네비에 가리지 않는다. */}
      <main
        className={cn(
          "flex-1 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+1.5rem)]",
          fullWidth ? "pt-0" : "px-4 pt-6"
        )}
      >
        <div className="mx-auto max-w-2xl">{children}</div>
      </main>
      <BottomNavBar />
    </div>
  );
}
