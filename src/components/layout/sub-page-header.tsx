"use client";

// 서브페이지(상세/작성 등) 전용 슬림 상단 네비.
//
// 글로벌 MainHeader(로고 + 우측 아이콘) 대신 사용해 본문 세로 공간을 확보한다.
// 좌측: 뒤로가기 + 제목 / 우측: actions 슬롯. 로고·우측 아이콘 없음.
// 재사용 가능: backHref(있으면 Link) / onBack(커스텀) / 기본 router.back().

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface SubPageHeaderProps {
  /** 좌측 제목 (예: 날짜) */
  title?: ReactNode;
  /** 우측 액션 슬롯 (예: 완료 버튼, 더보기) */
  actions?: ReactNode;
  /** 지정 시 뒤로가기가 해당 경로로 이동 (Link) */
  backHref?: string;
  /** 커스텀 뒤로가기 핸들러 (backHref 미지정 시) */
  onBack?: () => void;
  /** 뒤로가기 버튼 숨김 */
  hideBack?: boolean;
  /**
   * 헤더 내용의 최대 폭. **본문과 같은 값을 줘야** ‹ 버튼과 본문 좌측선이 맞는다.
   * 기본값은 앱 표준(max-w-2xl) — 본문이 더 좁은 화면(체험판)만 따로 넘긴다.
   */
  contentWidthClassName?: string;
}

const BACK_BUTTON_CLASS =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-foreground/5";

function BackIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  );
}

export function SubPageHeader({
  title,
  actions,
  backHref,
  onBack,
  hideBack,
  contentWidthClassName = "max-w-2xl",
}: SubPageHeaderProps) {
  const router = useRouter();

  return (
    <header
      // sticky top-0 — standalone에선 상태바가 이 위에 겹치므로 안전영역만큼 밀어준다
      className="sticky top-0 z-20 border-b border-foreground/10 bg-background px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]"
    >
      {/* min-h로 우측 actions(완료/저장 표시 등)의 등장·교체에도 헤더 높이가 흔들리지 않게 고정 */}
      <div
        className={cn(
          "mx-auto flex min-h-[44px] items-center justify-between gap-2",
          contentWidthClassName
        )}
      >
        <div className="flex min-w-0 items-center gap-1">
          {!hideBack &&
            (backHref ? (
              <Link href={backHref} aria-label="뒤로" className={BACK_BUTTON_CLASS}>
                <BackIcon />
              </Link>
            ) : (
              <button
                type="button"
                aria-label="뒤로"
                onClick={onBack ?? (() => router.back())}
                className={BACK_BUTTON_CLASS}
              >
                <BackIcon />
              </button>
            ))}
          {title != null && (
            <span className="min-w-0 truncate text-base font-medium text-foreground/70">{title}</span>
          )}
        </div>
        {actions != null && <div className="flex items-center gap-1">{actions}</div>}
      </div>
    </header>
  );
}
