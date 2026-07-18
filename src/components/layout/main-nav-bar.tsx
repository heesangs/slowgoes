"use client";

// 메인 헤더 하단 네비 — R1 이후 "나의 시간" 바 전용.
//
// R1: 버킷칩 스크롤(BucketSwitcher)은 단일 버킷 중심 UI 전환으로 제거됨.
// 버킷 전환/추가는 대시보드 본문의 버킷 카드(BucketCard) 시트가 담당한다
// (앱의 목적 = 하나의 버킷에 집중해 행동력을 높이는 것 — CLAUDE.md Philosophy).
//
// 노출 라우트: /dashboard 에서만 (그 외 라우트는 헤더 하단 공간을 줄이기 위해 null).

import { usePathname } from "next/navigation";
import { MyTimeBar } from "@/components/layout/my-time-bar";

interface MainNavBarProps {
  /** 나의 시간 바 — age 유효할 때만 노출 */
  lifeClock: { age: number; displayName: string } | null;
}

const NAV_SCOPED_PATHS = ["/dashboard"];

export function MainNavBar({ lifeClock }: MainNavBarProps) {
  const pathname = usePathname();
  const show = NAV_SCOPED_PATHS.some((p) => pathname?.startsWith(p));

  if (!show || !lifeClock) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <MyTimeBar age={lifeClock.age} displayName={lifeClock.displayName} />
    </div>
  );
}
