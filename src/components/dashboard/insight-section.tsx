"use client";

// 인사이트 섹션 — 발걸음 3섹션 중 첫 번째 (PR 8 신설)
//
// 표시 내용:
// - 현재 버킷 타이틀 (구 StrideSection의 헤더 역할 흡수)
// - 공감 메시지 (stride_plan.empathy_message)
// - 우측 작은 "대화" 아이콘 (placeholder, PR 8 시점엔 비활성)
//
// 사용자 결정 ③ — 헤더 우측 작은 아이콘. 부담 낮은 힌트.

import { FEATURE_NAMES } from "@/lib/constants";

interface InsightSectionProps {
  bucketTitle: string | null;
  empathyMessage: string | null;
}

export function InsightSection({ bucketTitle, empathyMessage }: InsightSectionProps) {
  return (
    <section className="rounded-xl border border-foreground/10 px-4 py-4">
      {/* 헤더: 현재 버킷 + 우측 "대화" 아이콘 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-xs text-foreground/60">현재 {FEATURE_NAMES.BUCKET}</p>
          <p className="truncate text-base font-semibold">
            {bucketTitle ?? `선택된 ${FEATURE_NAMES.BUCKET}이 없어요`}
          </p>
        </div>

        {/* 대화 버튼 placeholder — 실제 기능은 추후 PR */}
        <button
          type="button"
          disabled
          aria-label="대화 (준비 중)"
          title="대화 기능은 곧 만나요"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/35 disabled:cursor-not-allowed"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.625 9.75h6.75m-6.75 3h4.5M3.75 6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25v8.25A2.25 2.25 0 0118 17.25H10.5l-3.75 2.25v-2.25H6A2.25 2.25 0 013.75 15V6.75z"
            />
          </svg>
        </button>
      </div>

      {/* 공감 메시지 = 인사이트 본문 */}
      {empathyMessage && (
        <div className="mt-3 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2.5">
          <p className="text-xs text-foreground/55">{FEATURE_NAMES.INSIGHT}</p>
          <p className="mt-1 text-sm leading-relaxed">{empathyMessage}</p>
        </div>
      )}
    </section>
  );
}
