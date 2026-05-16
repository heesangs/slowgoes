"use client";

// 인사이트 섹션 — 발걸음 3섹션 중 첫 번째 (PR 8 신설, PR 29~30 정리, PR 35 드롭다운)
//
// 표시 내용:
// - 현재 버킷 타이틀 (구 StrideSection의 헤더 역할 흡수)
//   - PR 35: 텍스트 → 드롭다운 버튼 UI. 클릭 시 FindMeSheet '내 버킷' 탭 오픈.
// - 우측 작은 "대화" 아이콘 (placeholder, 추후 실제 대화 기능으로 활성화 예정)
//
// PR 29: AI 공감 메시지(empathy_message) 본문을 대시보드에서 숨김.
// PR 30: empathy_message 발생/저장/표시/DB 전 라인에서 완전 제거. 토큰 절약.

import { FEATURE_NAMES } from "@/lib/constants";

interface InsightSectionProps {
  bucketTitle: string | null;
  /** PR 35: 드롭다운 클릭 시 호출 — 부모가 FindMeSheet를 select 탭으로 오픈 */
  onClickBucket?: () => void;
}

export function InsightSection({ bucketTitle, onClickBucket }: InsightSectionProps) {
  const isInteractive = Boolean(onClickBucket);
  const displayTitle = bucketTitle ?? `선택된 ${FEATURE_NAMES.BUCKET}이 없어요`;

  return (
    <section className="rounded-xl border border-foreground/10 px-4 py-4">
      {/* 헤더: 현재 버킷(드롭다운) + 우측 "대화" 아이콘 */}
      <div className="flex items-start justify-between gap-2">
        {isInteractive ? (
          <button
            type="button"
            onClick={onClickBucket}
            aria-label={`${FEATURE_NAMES.BUCKET} 전환`}
            className="flex min-w-0 flex-col gap-0.5 text-left transition-colors rounded-md -mx-1 px-1 py-0.5 hover:bg-foreground/[0.04]"
          >
            <p className="text-xs text-foreground/60">현재 {FEATURE_NAMES.BUCKET}</p>
            <div className="flex items-center gap-1 min-w-0">
              <p className="truncate text-base font-semibold">{displayTitle}</p>
              <svg
                className="h-4 w-4 shrink-0 text-foreground/50"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </button>
        ) : (
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-xs text-foreground/60">현재 {FEATURE_NAMES.BUCKET}</p>
            <p className="truncate text-base font-semibold">{displayTitle}</p>
          </div>
        )}

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
    </section>
  );
}
