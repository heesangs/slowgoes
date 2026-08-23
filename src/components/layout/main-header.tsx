"use client";

// 메인 라우트 그룹의 상단 헤더 — 로고 + 일기·회고·프로필.
//
// 하단 탭은 캘린더 3단(1주/1년/1생)이 가져갔다. 시간 스케일을 오가는 것이 이 앱의
// 중심 동선이라 엄지 자리를 내주고, 일기·회고는 여기 우측으로 올렸다.
// (로그아웃은 여전히 /profile 안에 있다 — 우측 상단은 오탭이 잦은 자리라서.)

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DiaryIcon, ProfileIcon, ReviewIcon } from "@/components/ui/icons";
import { APP, FEATURE_NAMES } from "@/lib/constants";
import { SURFACE_SHADOW } from "@/lib/constants/ui";
import { cn } from "@/lib/utils";

// 우측 아이콘 — 일기 · 회고 · 프로필(설정)
const RIGHT_LINKS = [
  { href: "/diary", label: FEATURE_NAMES.DIARY, Icon: DiaryIcon },
  { href: "/review", label: FEATURE_NAMES.REVIEW, Icon: ReviewIcon },
  { href: "/profile", label: FEATURE_NAMES.PROFILE, Icon: ProfileIcon },
] as const;

export function MainHeader() {
  const pathname = usePathname();

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
        <nav aria-label="보조 메뉴" className="flex items-center">
          {RIGHT_LINKS.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-foreground/5",
                  active ? "text-label-normal" : "text-label-assistive"
                )}
              >
                <Icon className="h-5 w-5" />
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
