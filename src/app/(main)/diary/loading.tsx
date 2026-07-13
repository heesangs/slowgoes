// 일기 목록 로딩 스켈레톤 — 클릭 직후 흰 화면 대기를 0초로.

const SKELETON = "rounded bg-foreground/10";

export default function DiaryLoading() {
  return (
    <div className="animate-pulse pb-24" aria-label="일기 로딩 중">
      {/* 타이틀 */}
      <div className={`${SKELETON} h-7 w-16`} />

      {/* 월 헤더 */}
      <div className={`${SKELETON} mt-5 h-4 w-24`} />

      {/* 목록 항목 */}
      <div className="mt-3 flex flex-col divide-y divide-foreground/10 border-y border-foreground/10">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 py-3">
            <div className="w-9 shrink-0 pt-0.5">
              <div className={`${SKELETON} mx-auto h-3 w-5`} />
              <div className={`${SKELETON} mx-auto mt-1 h-5 w-6`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className={`${SKELETON} h-4 w-2/3`} />
              <div className={`${SKELETON} mt-2 h-3 w-full`} />
              <div className={`${SKELETON} mt-1.5 h-3 w-16`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
