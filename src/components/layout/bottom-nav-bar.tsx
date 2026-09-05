"use client";

// 하단 탭 네비 — 캘린더 3단(1주 / 1년 / 1생).
//
// 시간 스케일을 오가는 것이 이 앱의 중심 동선이라 엄지가 닿는 하단에 둔다.
// 일기·회고는 상단 헤더 우측으로 올렸다(자주 오가는 목적지가 아니다).
//
// 다른 탭과 달리 **라우트가 아니라 대시보드 안의 뷰**다. URL 쿼리(?view=)로
// 표현해 레이아웃에 있는 이 네비와 페이지 하위의 CalendarSection을 잇는다.
// 전환 연출(응축→비행→다이얼)은 CalendarSection이 제스처와 같은 함수로 재생한다.
//
// 높이는 --bottom-nav-h(globals.css)로 공유한다 — FAB·토스트·본문 하단 여백이
// 같은 값을 참조해야 네비에 가리는 요소가 생기지 않는다.
// 포커스 라우트(/diary/new, /diary/[id])에서는 MainShell이 아예 렌더하지 않는다.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LifeTabIcon, WeekTabIcon, YearTabIcon } from "@/components/ui/icons";
import {
  CALENDAR_VIEW_PARAM,
  calendarViewHref,
  parseCalendarView,
  type CalendarView,
} from "@/lib/dashboard/calendar-view";
import { cn } from "@/lib/utils";

const TABS: { view: CalendarView; label: string; Icon: typeof WeekTabIcon }[] = [
  { view: "week", label: "1주", Icon: WeekTabIcon },
  { view: "life", label: "1년", Icon: YearTabIcon },
  { view: "clock", label: "1생", Icon: LifeTabIcon },
];

export function BottomNavBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 대시보드 밖(일기·회고·프로필)에서는 어떤 탭도 활성이 아니다 — 누르면 그 뷰로 이동.
  const activeView =
    pathname === "/dashboard" ? parseCalendarView(searchParams.get(CALENDAR_VIEW_PARAM)) : null;

  return (
    <nav
      aria-label="캘린더 화면"
      // z-30: FAB(40) · 시트/토스트/입력창(50)보다 아래 — 이들이 네비에 가리면 안 된다
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line-alt bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex h-[var(--bottom-nav-h)] max-w-2xl items-stretch">
        {TABS.map(({ view, label, Icon }) => {
          const active = activeView === view;
          return (
            <li key={view} className="flex-1">
              <Link
                href={calendarViewHref(view)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 transition-colors",
                  active ? "text-label-normal" : "text-label-alt hover:text-label-neutral"
                )}
              >
                {/* 활성은 면(fill), 비활성은 라인(stroke) */}
                <Icon className="h-5 w-5" active={active} />
                <span className={cn("text-2xs", active && "font-medium")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
