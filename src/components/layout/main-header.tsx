"use client";

// 메인 라우트 그룹의 상단 헤더
// - 기본 경로 (/dashboard, /actions, /review, /profile 등): 로고 + 우측 아이콘 액션
// - /buckets 계열: 뒤로가기 + 페이지 제목 (집중 모드)
//
// 페이지 단위 헤더 분기를 위해 client component 로 분리.
// (main)/layout.tsx 는 server component 로 유지하면서 헤더만 client 로 위임.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function MainHeader() {
  const pathname = usePathname();
  const router = useRouter();

  const isBucketsRoute =
    pathname === "/buckets" || pathname.startsWith("/buckets/");

  if (isBucketsRoute) {
    // 뒤로가기 헤더 — /buckets 와 /buckets/[id] 모두 적용
    const title = pathname === "/buckets" ? "버킷 관리" : "버킷 상세";
    return (
      <header className="border-b border-foreground/10 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-foreground/5"
            aria-label="뒤로가기"
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
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
          </button>
          <p className="text-base font-semibold">{title}</p>
        </div>
      </header>
    );
  }

  // 기본 헤더 — 로고 + 우측 아이콘
  return (
    <header className="border-b border-foreground/10 px-4 py-3">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <Link href="/dashboard" className="text-lg font-bold">
          slowgoes
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/review"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-foreground/5"
            aria-label="회고"
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
            aria-label="프로필"
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
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
