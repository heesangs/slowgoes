"use client";

// 메인 라우트 그룹의 상단 헤더 — 로고 + 우측 아이콘 액션.
//
// IA v2 목표 6: 헤더 우측의 로그아웃 버튼은 제거하고 /profile 페이지로 일원화.
// 모바일 우측 상단은 뒤로가기/닫기와 가까워 오탭 빈도가 높기 때문.

import Link from "next/link";
import { APP, FEATURE_NAMES } from "@/lib/constants";

export function MainHeader() {
  return (
    <header className="border-b border-foreground/10 px-4 py-3">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <Link href="/dashboard" className="text-lg font-bold">
          {APP.NAME}
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/diary"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-foreground/5"
            aria-label={FEATURE_NAMES.DIARY}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
              />
            </svg>
          </Link>
          <Link
            href="/review"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-foreground/5"
            aria-label={FEATURE_NAMES.REVIEW}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 9.75h6.75m-6.75 3h4.5M3.75 6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25v8.25A2.25 2.25 0 0118 17.25H10.5l-3.75 2.25v-2.25H6A2.25 2.25 0 013.75 15V6.75z"
              />
            </svg>
          </Link>
          <Link
            href="/profile"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-foreground/5"
            aria-label={FEATURE_NAMES.PROFILE}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
