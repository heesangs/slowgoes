// 한걸음 상세 로딩 스켈레톤 (PR 26 신설)
//
// /actions SSR + 버킷 이동 시 즉시 표시.
// 매칭: 헤더 + 버킷 선택기 + 탭 + 데일리/루틴 섹션

import { FEATURE_NAMES } from "@/lib/constants";

const SKELETON = "rounded bg-foreground/10";

export default function ActionsLoading() {
  return (
    <div className="flex flex-col gap-5 animate-pulse" aria-label={`${FEATURE_NAMES.STRIDE_DETAIL} 로딩 중`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={`${SKELETON} h-6 w-32`} />
          <div className={`${SKELETON} mt-2 h-4 w-40`} />
        </div>
        <div className={`${SKELETON} h-11 w-24`} />
      </div>

      {/* 버킷 선택기 (다중 버킷일 때만 보이지만 placeholder는 유지) */}
      <div className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className={`${SKELETON} h-3 w-10`} />
        <div className="mt-2 flex flex-wrap gap-2">
          <div className={`${SKELETON} h-9 w-20`} />
          <div className={`${SKELETON} h-9 w-24`} />
          <div className={`${SKELETON} h-9 w-16`} />
        </div>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-foreground/10">
        <div className="flex-1 py-3">
          <div className={`${SKELETON} mx-auto h-4 w-16`} />
        </div>
        <div className="flex-1 py-3">
          <div className={`${SKELETON} mx-auto h-4 w-12`} />
        </div>
      </div>

      {/* 데일리 투두 섹션 */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className={`${SKELETON} h-4 w-20`} />
        <div className="mt-3 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3"
            >
              <div className={`${SKELETON} mt-0.5 h-4 w-4`} />
              <div className={`${SKELETON} h-4 w-2/3`} />
            </div>
          ))}
        </div>
      </section>

      {/* 루틴 섹션 */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className={`${SKELETON} h-4 w-12`} />
        <div className="mt-3 flex flex-col gap-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3"
            >
              <div className={`${SKELETON} mt-0.5 h-5 w-5`} />
              <div className="flex-1">
                <div className={`${SKELETON} h-4 w-3/5`} />
                <div className={`${SKELETON} mt-2 h-3 w-1/3`} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
