// 일기 편집 로딩 스켈레톤 — 포커스 라우트(MainShell focus 브랜치, 자체 상단바).

const SKELETON = "rounded bg-foreground/10";

export default function DiaryDetailLoading() {
  return (
    <div className="animate-pulse" aria-label="일기 로딩 중">
      {/* 서브헤더 바 (뒤로가기 + 날짜 + 완료) */}
      <div className="sticky top-0 z-20 border-b border-foreground/10 bg-background px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`${SKELETON} h-6 w-6`} />
            <div className={`${SKELETON} h-4 w-24`} />
          </div>
          <div className={`${SKELETON} h-7 w-12`} />
        </div>
      </div>

      {/* 본문 라인 */}
      <div className="mx-auto max-w-2xl px-4 py-4">
        <div className="flex flex-col gap-2">
          <div className={`${SKELETON} h-4 w-1/2`} />
          <div className={`${SKELETON} h-4 w-11/12`} />
          <div className={`${SKELETON} h-4 w-4/5`} />
          <div className={`${SKELETON} h-4 w-3/4`} />
        </div>
      </div>
    </div>
  );
}
