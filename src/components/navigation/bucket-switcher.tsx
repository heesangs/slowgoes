"use client";

// IA v2 목표 2: 버킷 스위처 칩 공통화 (BucketSwitcher)
//
// 헤더 하단에 고정되는 가로 스크롤 칩 리스트. 모든 메인 화면(/dashboard, /actions 등)에서
// 동일한 UX로 버킷을 전환할 수 있게 한다.
//
// 선택된 버킷은 URL의 ?bucket= 또는 cookie(LAST_VIEWED_BUCKET_COOKIE_NAME) 기반으로
// 서버 컴포넌트에서 결정 → selectedBucketId prop 으로 주입받는다.
// (해석 우선순위: URL > cookie > buckets[0]?.id — dashboard/page.tsx 등 참조)
//
// 자세한 설계 배경은 docs/ia-v2.md "목표 2" 절 참조.

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Bucket } from "@/types";

export interface BucketSwitcherProps {
  /** 표시할 버킷 목록 — 최소 id, title 만 있으면 됨. */
  buckets: Pick<Bucket, "id" | "title">[];
  /** 현재 선택된 버킷 id (URL ?bucket= 또는 cookie 기반으로 부모가 해석해서 주입). */
  selectedBucketId: string | null;
  /**
   * 칩 클릭 시 router.replace 할 베이스 경로. (예: "/dashboard", "/actions")
   * 내부적으로 `${basePath}?bucket=${id}` 형태로 라우팅한다.
   */
  basePath: string;
  /**
   * `+` 칩 노출 여부 = 이 prop 유무.
   * 클릭 시 호출 — 부모에서 ExploreNewSceneSheet (IA v2 목표 3)를 오픈할 자리.
   */
  onAddBucket?: () => void;
  /** 추가 클래스. (헤더 하단 고정 등 레이아웃 컨테이너 측에서 제어) */
  className?: string;
}

export function BucketSwitcher({
  buckets,
  selectedBucketId,
  basePath,
  onAddBucket,
  className,
}: BucketSwitcherProps) {
  const router = useRouter();
  // 버킷 전환 즉각 시각 피드백 (actions-content.tsx의 PR 32 패턴 계승)
  const [isSwitching, startSwitch] = useTransition();

  // 활성 칩 자동 scrollIntoView — 모바일 가로 스크롤에서 선택된 칩이 화면 밖에 있어도 보이게.
  const activeChipRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!activeChipRef.current) return;
    activeChipRef.current.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedBucketId]);

  if (buckets.length === 0 && !onAddBucket) return null;

  return (
    <nav
      aria-label={`${FEATURE_NAMES.BUCKET} 전환`}
      className={cn(
        // 헤더 하단 가로 스크롤 컨테이너 — 모바일 first, 디자인 토큰 기반 색상.
        "flex w-full items-center gap-2 overflow-x-auto bg-background px-4 py-2",
        // 스크롤바는 숨기되 가로 스크롤은 유지 (모바일 터치 스크롤).
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {buckets.map((bucket) => {
        const isCurrent = selectedBucketId === bucket.id;
        return (
          <button
            key={bucket.id}
            ref={isCurrent ? activeChipRef : null}
            type="button"
            onClick={() => {
              if (isCurrent || isSwitching) return;
              startSwitch(() => {
                router.replace(`${basePath}?bucket=${bucket.id}`);
              });
            }}
            disabled={isSwitching}
            aria-current={isCurrent ? "true" : undefined}
            aria-busy={isSwitching && !isCurrent}
            className={cn(
              "inline-flex min-h-[36px] shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-xs transition-all",
              isCurrent
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/20 text-foreground hover:bg-foreground/5",
              isSwitching && !isCurrent && "opacity-50",
            )}
          >
            {bucket.title}
          </button>
        );
      })}

      {/* IA v2 목표 3: `+` 칩 — ExploreNewSceneSheet 진입점.
          현재는 placeholder. 부모에서 onAddBucket으로 시트를 오픈한다.
          TODO(ia-v2 goal 3): ExploreNewSceneSheet 도입 후 부모에서 sheet 오픈 핸들러 연결. */}
      {onAddBucket && (
        <button
          type="button"
          onClick={onAddBucket}
          aria-label={`${FEATURE_NAMES.BUCKET} 추가`}
          className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-full border border-dashed border-foreground/30 px-3 text-xs text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          +
        </button>
      )}
    </nav>
  );
}
