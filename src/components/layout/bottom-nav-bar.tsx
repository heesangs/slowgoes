"use client";

// 하단 탭 네비 — 버킷(대시보드) / 일기 / 회고.
//
// 헤더 우측 아이콘에만 있던 목적지를 엄지가 닿는 하단으로 내렸다.
// 프로필(설정)은 자주 쓰지 않으므로 헤더에 남긴다.
//
// 높이는 --bottom-nav-h(globals.css)로 공유한다 — FAB·토스트·본문 하단 여백이
// 같은 값을 참조해야 네비에 가리는 요소가 생기지 않는다.
// 포커스 라우트(/diary/new, /diary/[id])에서는 MainShell이 아예 렌더하지 않는다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BucketIcon, DiaryIcon, ReviewIcon } from "@/components/ui/icons";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard", label: FEATURE_NAMES.BUCKET, Icon: BucketIcon },
  { href: "/diary", label: FEATURE_NAMES.DIARY, Icon: DiaryIcon },
  { href: "/review", label: FEATURE_NAMES.REVIEW, Icon: ReviewIcon },
] as const;

export function BottomNavBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주요 메뉴"
      // z-30: FAB(40) · 시트/토스트/입력창(50)보다 아래 — 이들이 네비에 가리면 안 된다
      className="fixed inset-x-0 bottom-0 z-30 border-t border-foreground/10 bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex h-[var(--bottom-nav-h)] max-w-2xl items-stretch">
        {TABS.map(({ href, label, Icon }) => {
          // 하위 경로도 활성으로 (예: /diary/... — 다만 상세는 네비 자체가 안 뜬다)
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 transition-colors",
                  active ? "text-foreground" : "text-foreground/40 hover:text-foreground/70"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className={cn("text-[11px]", active && "font-medium")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
