// 일기 목록 — 월별 그룹 리스트 + 우하단 플로팅 작성 버튼.
// 컬러는 앱 블랙 계열 토큰만 사용 (하늘색 미사용).

import Link from "next/link";
import { FEATURE_NAMES } from "@/lib/constants";
import type { DiaryListItem } from "@/types";
import { groupDiariesByMonth } from "@/lib/diary/format";

interface DiaryListContentProps {
  entries: DiaryListItem[];
  loadError?: string;
}

export function DiaryListContent({ entries, loadError }: DiaryListContentProps) {
  const groups = groupDiariesByMonth(entries);

  return (
    <div className="relative mx-auto min-h-[70vh] max-w-2xl px-4 py-5 pb-24">
      <h1 className="mb-4 text-2xl font-bold text-foreground">{FEATURE_NAMES.DIARY}</h1>

      {loadError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {loadError}
        </p>
      )}

      {entries.length === 0 && !loadError ? (
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
          <p className="text-base font-medium text-foreground/70">아직 작성한 일기가 없어요</p>
          <p className="text-sm text-foreground/50">
            우측 하단의 + 버튼으로 첫 일기를 남겨보세요.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-2 text-sm font-semibold text-foreground/50">{group.label}</h2>
              <ul className="flex flex-col divide-y divide-foreground/10 border-y border-foreground/10">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/diary/${item.id}`}
                      className="flex gap-3 py-3 transition-colors hover:bg-foreground/[0.03]"
                    >
                      {/* 날짜 컬럼 */}
                      <div className="w-9 shrink-0 pt-0.5 text-center">
                        <div className="text-xs text-foreground/45">{item.weekday}</div>
                        <div className="text-lg font-semibold leading-tight text-foreground">
                          {String(item.day).padStart(2, "0")}
                        </div>
                      </div>
                      {/* 본문 컬럼 */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-foreground">
                          {item.title}
                        </p>
                        {item.preview && (
                          <p className="mt-0.5 line-clamp-2 text-[14px] text-foreground/60">
                            {item.preview}
                          </p>
                        )}
                        <p className="mt-1 text-[12px] text-foreground/45">{item.time}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* 플로팅 작성 버튼 (블랙) */}
      <Link
        href="/diary/new"
        aria-label="일기 작성"
        className="fixed bottom-6 right-6 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-opacity hover:opacity-90 active:opacity-80"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
      </Link>
    </div>
  );
}
