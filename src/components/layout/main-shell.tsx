"use client";

// (main) 크롬 분기 셸 — 경로에 따라 글로벌 헤더 노출 여부를 결정.
//
// 일반 라우트: MainHeader + MainNavBar + 패딩 main (기존 레이아웃 그대로).
// 포커스(서브페이지) 라우트: 글로벌 크롬 제거 → 페이지가 자체 SubPageHeader로 상단을 채워
//   본문 세로 공간을 최대화. (예: /diary/new, /diary/[id])
//
// MainNavBar의 usePathname self-hide 패턴과 동일한 접근.

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MainHeader } from "@/components/layout/main-header";
import { MainNavBar } from "@/components/layout/main-nav-bar";
import type { Gender, PaceType, PersonalityType } from "@/types";

interface MainShellNavProps {
  buckets: { id: string; title: string }[];
  cookieSelectedBucketId: string | null;
  prefillProfile: {
    age: number;
    gender: Gender;
    personalityType: PersonalityType;
    paceType?: PaceType;
  } | null;
}

interface MainShellProps {
  navProps: MainShellNavProps;
  children: ReactNode;
}

// 서브페이지(포커스) 라우트 판별.
// "/diary/" prefix → /diary/new, /diary/[id] 매칭 (목록 "/diary"는 제외).
function isFocusRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname.startsWith("/diary/");
}

export function MainShell({ navProps, children }: MainShellProps) {
  const pathname = usePathname();

  if (isFocusRoute(pathname)) {
    // 포커스 라우트: 글로벌 헤더/네비 없이 페이지가 상단을 관리.
    // 블록 컨테이너 사용 — flex-col로 감싸면 자식의 mx-auto가 shrink-to-fit 되어
    // 본문 폭이 무너진다(콘텐츠 폭으로 축소). 일반 블록 흐름 + sticky 헤더로 처리.
    return <div className="min-h-dvh">{children}</div>;
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <MainHeader />
      <MainNavBar
        buckets={navProps.buckets}
        cookieSelectedBucketId={navProps.cookieSelectedBucketId}
        prefillProfile={navProps.prefillProfile}
      />
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-2xl">{children}</div>
      </main>
    </div>
  );
}
